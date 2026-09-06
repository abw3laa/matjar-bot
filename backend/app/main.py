from datetime import datetime, timezone
import json
from typing import Any, Annotated
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import create_access_token, login as authenticate
from .config import get_settings
from .db import close_pool, connection
from .idempotency import claim_or_replay, complete as complete_idempotency
from .schemas import (
    ContextPatch, CreateMessageRequest, CreateOrderRequest, CreateSocialPostRequest,
    CustomerDataPatch, LoginRequest, LoginResponse, OrderDecisionRequest,
    PaymentMethodPatch, PaymentProofRequest, ResolveConversationRequest,
    UploadPresignRequest, IncomingFacebookComment, ScheduledPostPatch,
    AdminDeviceRequest, AdminNotificationRequest,
)
from .auth import require_auth, require_service_or_user

settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", description="Matjar Bot backend API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Internal-Token"],
)

Auth = Annotated[dict, Depends(require_auth)]
ServiceAuth = Annotated[dict, Depends(require_service_or_user)]


@app.on_event("shutdown")
def shutdown() -> None:
    close_pool()


@app.get("/health", tags=["System"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/ready", tags=["System"])
def readiness() -> dict[str, str]:
    try:
        with connection() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ready"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@app.post("/v1/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(payload: LoginRequest) -> LoginResponse:
    token = authenticate(payload.email, payload.password)
    return LoginResponse(access_token=token, expires_in=settings.jwt_expire_minutes * 60)


@app.get("/v1/products/search", dependencies=[Depends(require_service_or_user)], tags=["Catalog"])
def search_products(q: str = Query(min_length=1), limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    with connection() as conn:
        return conn.execute(
            """SELECT id, name, description, base_price, is_active, created_at, updated_at
               FROM products WHERE is_active = TRUE AND (name ILIKE %s OR description ILIKE %s)
               ORDER BY name LIMIT %s""",
            (f"%{q}%", f"%{q}%", limit),
        ).fetchall()


@app.get("/v1/products/{product_id}", dependencies=[Depends(require_service_or_user)], tags=["Catalog"])
def get_product(product_id: UUID) -> dict:
    with connection() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = %s", (product_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Product not found")
    return row


@app.get("/v1/products/{product_id}/variants", dependencies=[Depends(require_service_or_user)], tags=["Catalog"])
def get_variants(product_id: UUID) -> list[dict]:
    with connection() as conn:
        return conn.execute(
            """SELECT v.*, COALESCE(i.quantity_available - i.reserved_quantity, 0) AS quantity_available
               FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
               WHERE v.product_id = %s AND v.is_active = TRUE ORDER BY v.created_at""",
            (product_id,),
        ).fetchall()


@app.get("/v1/variants/{variant_id}/availability", dependencies=[Depends(require_service_or_user)], tags=["Catalog"])
def variant_availability(variant_id: UUID) -> dict:
    with connection() as conn:
        row = conn.execute(
            """SELECT v.id AS variant_id, v.is_active,
                      GREATEST(COALESCE(i.quantity_available, 0) - COALESCE(i.reserved_quantity, 0), 0) AS quantity_available
               FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.id = %s""",
            (variant_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Variant not found")
    row["available"] = bool(row["is_active"] and row["quantity_available"] > 0)
    return row


@app.post("/v1/conversations/resolve", dependencies=[Depends(require_service_or_user)], tags=["Conversation"])
def resolve_conversation(payload: ResolveConversationRequest) -> dict:
    with connection() as conn:
        with conn.transaction():
            identity = conn.execute(
                """SELECT id, customer_id FROM customer_channel_identities
                   WHERE channel = %s AND channel_user_id = %s""",
                (payload.channel, payload.channel_user_id),
            ).fetchone()
            if not identity:
                customer = conn.execute(
                    """INSERT INTO customers (phone, full_name) VALUES (%s, %s)
                       ON CONFLICT (phone) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, customers.full_name)
                       RETURNING id""",
                    (payload.customer_phone, payload.customer_name),
                ).fetchone()
                identity = conn.execute(
                    """INSERT INTO customer_channel_identities (customer_id, channel, channel_user_id)
                       VALUES (%s, %s, %s) RETURNING id, customer_id""",
                    (customer["id"], payload.channel, payload.channel_user_id),
                ).fetchone()
            conversation = conn.execute(
                """SELECT id, current_context FROM conversations
                   WHERE customer_channel_identity_id = %s AND status != 'closed'
                   ORDER BY updated_at DESC LIMIT 1""",
                (identity["id"],),
            ).fetchone()
            if not conversation:
                conversation = conn.execute(
                    """INSERT INTO conversations (customer_channel_identity_id, channel)
                       VALUES (%s, %s) RETURNING id, current_context""",
                    (identity["id"], payload.channel),
                ).fetchone()
    return {"conversation_id": conversation["id"], "customer_id": identity["customer_id"], "current_context": conversation["current_context"]}


@app.get("/v1/conversations", dependencies=[Depends(require_auth)], tags=["Conversation"])
def list_conversations(status_filter: str | None = Query(None, alias="status"), limit: int = Query(50, ge=1, le=100)) -> list[dict]:
    with connection() as conn:
        if status_filter:
            return conn.execute(
                """SELECT c.*, cu.full_name, cu.phone, cci.channel_user_id
                   FROM conversations c JOIN customer_channel_identities cci ON cci.id = c.customer_channel_identity_id
                   JOIN customers cu ON cu.id = cci.customer_id WHERE c.status = %s
                   ORDER BY c.updated_at DESC LIMIT %s""", (status_filter, limit)
            ).fetchall()
        return conn.execute(
            """SELECT c.*, cu.full_name, cu.phone, cci.channel_user_id
               FROM conversations c JOIN customer_channel_identities cci ON cci.id = c.customer_channel_identity_id
               JOIN customers cu ON cu.id = cci.customer_id ORDER BY c.updated_at DESC LIMIT %s""", (limit,)
        ).fetchall()


@app.get("/v1/conversations/{conversation_id}", dependencies=[Depends(require_auth)], tags=["Conversation"])
def get_conversation(conversation_id: UUID) -> dict:
    with connection() as conn:
        row = conn.execute(
            """SELECT c.*, cu.full_name, cu.phone, cci.channel_user_id
               FROM conversations c JOIN customer_channel_identities cci ON cci.id = c.customer_channel_identity_id
               JOIN customers cu ON cu.id = cci.customer_id WHERE c.id = %s""", (conversation_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row


@app.get("/v1/conversations/{conversation_id}/context", dependencies=[Depends(require_service_or_user)], tags=["Conversation"])
def get_context(conversation_id: UUID) -> dict:
    with connection() as conn:
        row = conn.execute("SELECT current_context FROM conversations WHERE id = %s", (conversation_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row["current_context"]


@app.post("/v1/conversations/{conversation_id}/context", dependencies=[Depends(require_service_or_user)], tags=["Conversation"])
def merge_context(conversation_id: UUID, payload: ContextPatch) -> dict:
    with connection() as conn:
        row = conn.execute(
            """UPDATE conversations SET current_context = current_context || %s::jsonb
               WHERE id = %s RETURNING current_context""", (payload.model_dump_json(), conversation_id)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row["current_context"]


@app.post("/v1/conversations/{conversation_id}/escalate", dependencies=[Depends(require_service_or_user)], tags=["Conversation"])
def escalate_conversation(conversation_id: UUID, reason: dict[str, Any] | None = None) -> dict:
    with connection() as conn:
        row = conn.execute(
            "UPDATE conversations SET status = 'escalated_to_human', current_context = current_context || %s::jsonb WHERE id = %s RETURNING *",
            ({"escalation_reason": (reason or {}).get("reason")}, conversation_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row


@app.post("/v1/conversations/{conversation_id}/close", dependencies=[Depends(require_auth)], tags=["Conversation"])
def close_conversation(conversation_id: UUID) -> dict:
    with connection() as conn:
        row = conn.execute("UPDATE conversations SET status = 'closed' WHERE id = %s RETURNING *", (conversation_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row


@app.post("/v1/messages", status_code=201, dependencies=[Depends(require_service_or_user)], tags=["Conversation"])
def create_message(payload: CreateMessageRequest) -> dict:
    with connection() as conn:
        with conn.transaction():
            row = conn.execute(
                """INSERT INTO messages (conversation_id, direction, sender, content, message_type, media_url)
                   VALUES (%(conversation_id)s, %(direction)s, %(sender)s, %(content)s, %(message_type)s, %(media_url)s)
                   RETURNING *""", payload.model_dump(mode="json")
            ).fetchone()
            if not row:
                raise HTTPException(404, "Conversation not found")
            conn.execute("UPDATE conversations SET updated_at = now() WHERE id = %s", (payload.conversation_id,))
    return row


@app.get("/v1/conversations/{conversation_id}/messages", dependencies=[Depends(require_auth)], tags=["Conversation"])
def list_messages(conversation_id: UUID, limit: int = Query(200, ge=1, le=500)) -> list[dict]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM messages WHERE conversation_id = %s ORDER BY created_at ASC LIMIT %s",
            (conversation_id, limit),
        ).fetchall()


def _order_detail(conn, order_id: UUID) -> dict | None:
    order = conn.execute(
        """SELECT o.*, c.full_name, c.phone, c.address AS customer_address,
                  pm.type AS payment_method_type, pm.details AS payment_method_details
           FROM orders o JOIN customers c ON c.id = o.customer_id
           LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id WHERE o.id = %s""", (order_id,)
    ).fetchone()
    if not order:
        return None
    order["items"] = conn.execute(
        """SELECT oi.*, pv.sku, pv.color, pv.size, p.name AS product_name
           FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id
           JOIN products p ON p.id = pv.product_id WHERE oi.order_id = %s""", (order_id,)
    ).fetchall()
    order["payment_proofs"] = conn.execute("SELECT * FROM payment_proofs WHERE order_id = %s ORDER BY created_at DESC", (order_id,)).fetchall()
    order["tracking"] = conn.execute("SELECT * FROM tracking_numbers WHERE order_id = %s", (order_id,)).fetchone()
    return order


@app.get("/v1/orders", dependencies=[Depends(require_auth)], tags=["Orders"])
def list_orders(status_filter: str | None = Query(None, alias="status"), limit: int = Query(50, ge=1, le=100), cursor: str | None = None) -> dict:
    with connection() as conn:
        query = "SELECT id FROM orders"
        params: list[Any] = []
        if status_filter:
            query += " WHERE status = %s"
            params.append(status_filter)
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        ids = conn.execute(query, params).fetchall()
        return {"orders": [detail for row in ids if (detail := _order_detail(conn, row["id"]))], "next_cursor": None}


@app.get("/v1/orders/{order_id}", dependencies=[Depends(require_auth)], tags=["Orders"])
def get_order(order_id: UUID) -> dict:
    with connection() as conn:
        order = _order_detail(conn, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return order


@app.post("/v1/orders", status_code=201, dependencies=[Depends(require_service_or_user)], tags=["Orders"])
def create_order(payload: CreateOrderRequest, response: Response) -> dict:
    with connection() as conn:
        with conn.transaction():
            customer_id = payload.customer_id
            if not customer_id and payload.conversation_id:
                row = conn.execute(
                    """SELECT cci.customer_id FROM conversations c JOIN customer_channel_identities cci ON cci.id = c.customer_channel_identity_id WHERE c.id = %s""",
                    (payload.conversation_id,),
                ).fetchone()
                customer_id = row["customer_id"] if row else None
            if not customer_id:
                raise HTTPException(422, "customer_id or conversation_id is required")
            total = 0
            for item in payload.items:
                variant = conn.execute(
                    """SELECT v.price, GREATEST(COALESCE(i.quantity_available, 0) - COALESCE(i.reserved_quantity, 0), 0) AS available
                       FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.id = %s AND v.is_active = TRUE""", (item.variant_id,)
                ).fetchone()
                if not variant or variant["available"] < item.quantity:
                    raise HTTPException(409, "Variant unavailable")
                total += variant["price"] * item.quantity
            order = conn.execute(
                """INSERT INTO orders (order_number, customer_id, conversation_id, total_amount, shipping_address)
                   VALUES ('MB-' || to_char(now(), 'YYYYMMDDHH24MISSMS'), %s, %s, %s, %s) RETURNING *""",
                (customer_id, payload.conversation_id, total, payload.shipping_address),
            ).fetchone()
            for item in payload.items:
                variant = conn.execute("SELECT price FROM product_variants WHERE id = %s", (item.variant_id,)).fetchone()
                conn.execute("INSERT INTO order_items (order_id, variant_id, quantity, unit_price) VALUES (%s, %s, %s, %s)", (order["id"], item.variant_id, item.quantity, variant["price"]))
            conn.execute("INSERT INTO order_status_history (order_id, to_status, changed_by) VALUES (%s, 'NEW', 'system')", (order["id"],))
    response.status_code = 201
    return order


@app.patch("/v1/orders/{order_id}/customer-data", dependencies=[Depends(require_auth)], tags=["Orders"])
def update_customer_data(order_id: UUID, payload: CustomerDataPatch) -> dict:
    with connection() as conn:
        with conn.transaction():
            order = conn.execute("SELECT customer_id FROM orders WHERE id = %s", (order_id,)).fetchone()
            if not order:
                raise HTTPException(404, "Order not found")
            data = payload.model_dump(exclude_none=True)
            fields = [("full_name", data.get("full_name")), ("phone", data.get("phone"))]
            assignments = ", ".join(f"{name} = %s" for name, value in fields if value is not None)
            values = [value for _, value in fields if value is not None]
            if assignments:
                conn.execute(f"UPDATE customers SET {assignments} WHERE id = %s", (*values, order["customer_id"]))
            if data.get("address"):
                conn.execute("UPDATE orders SET shipping_address = %s WHERE id = %s", (data["address"], order_id))
            result = _order_detail(conn, order_id)
    return result


@app.patch("/v1/orders/{order_id}/payment-method", dependencies=[Depends(require_service_or_user)], tags=["Orders"])
def update_payment_method(order_id: UUID, payload: dict[str, UUID]) -> dict:
    with connection() as conn:
        row = conn.execute("UPDATE orders SET payment_method_id = %s WHERE id = %s RETURNING *", (payload.get("payment_method_id"), order_id)).fetchone()
    if not row:
        raise HTTPException(404, "Order not found")
    return row


@app.post("/v1/orders/{order_id}/payment-proof", status_code=201, response_model=None, dependencies=[Depends(require_service_or_user)], tags=["Orders"])
def add_payment_proof(order_id: UUID, payload: PaymentProofRequest, idempotency_key: str | None = Header(None, alias="Idempotency-Key")) -> dict | JSONResponse:
    with connection() as conn:
        replay = claim_or_replay(conn, f"payment-proof:{order_id}", idempotency_key)
        if replay:
            return replay
        with conn.transaction():
            row = conn.execute(
                """INSERT INTO payment_proofs (order_id, file_url, file_type, file_hash)
                   VALUES (%s, %s, %s, %s) ON CONFLICT (order_id, file_hash) DO UPDATE SET file_url = EXCLUDED.file_url RETURNING *""",
                (order_id, payload.file_url, payload.file_type, payload.file_hash),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Order not found")
            conn.execute("UPDATE orders SET status = 'PENDING_ADMIN_REVIEW' WHERE id = %s", (order_id,))
            complete_idempotency(conn, f"payment-proof:{order_id}", idempotency_key, 201, row)
    return row


@app.post("/v1/orders/{order_id}/decision", response_model=None, dependencies=[Depends(require_auth)], tags=["Orders"])
def order_decision(order_id: UUID, payload: OrderDecisionRequest, idempotency_key: str | None = Header(None, alias="Idempotency-Key")) -> dict | JSONResponse:
    target = {"approve": "APPROVED", "reject": "REJECTED", "out_of_stock": "OUT_OF_STOCK"}[payload.decision]
    if payload.decision == "approve" and not payload.tracking_number:
        raise HTTPException(422, "tracking_number is required for approval")
    with connection() as conn:
        replay = claim_or_replay(conn, f"order-decision:{order_id}", idempotency_key)
        if replay:
            return replay
        with conn.transaction():
            order = conn.execute("SELECT status FROM orders WHERE id = %s FOR UPDATE", (order_id,)).fetchone()
            if not order:
                raise HTTPException(404, "Order not found")
            if order["status"] not in ("PENDING_ADMIN_REVIEW", "NEW", "WAITING_FOR_PAYMENT_PROOF"):
                raise HTTPException(409, "Order is not awaiting a decision")
            conn.execute("UPDATE orders SET status = %s WHERE id = %s", (target, order_id))
            conn.execute("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_id) VALUES (%s, %s, %s, 'admin', %s)", (order_id, order["status"], target, payload.admin_id))
            if payload.tracking_number:
                conn.execute("INSERT INTO tracking_numbers (order_id, tracking_number, carrier, entered_by_admin_id) VALUES (%s, %s, %s, %s) ON CONFLICT (order_id) DO UPDATE SET tracking_number = EXCLUDED.tracking_number, carrier = EXCLUDED.carrier", (order_id, payload.tracking_number, payload.carrier, payload.admin_id))
            result = conn.execute("SELECT id, status FROM orders WHERE id = %s", (order_id,)).fetchone()
            complete_idempotency(conn, f"order-decision:{order_id}", idempotency_key, 200, result)
            return result


@app.get("/v1/payment-methods", dependencies=[Depends(require_service_or_user)], tags=["Payments"])
def list_payment_methods() -> list[dict]:
    with connection() as conn:
        return conn.execute("SELECT * FROM payment_methods WHERE is_enabled = TRUE ORDER BY created_at").fetchall()


@app.patch("/v1/payment-methods/{method_id}", dependencies=[Depends(require_auth)], tags=["Payments"])
def update_payment_method_config(method_id: UUID, payload: PaymentMethodPatch) -> dict:
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(422, "No fields to update")
    assignments = ", ".join(f"{key} = %s" for key in data)
    with connection() as conn:
        row = conn.execute(f"UPDATE payment_methods SET {assignments} WHERE id = %s RETURNING *", (*data.values(), method_id)).fetchone()
    if not row:
        raise HTTPException(404, "Payment method not found")
    return row


@app.post("/v1/uploads/presign", dependencies=[Depends(require_auth)], tags=["Uploads"])
def presign_upload(payload: UploadPresignRequest) -> dict:
    # Storage integration is intentionally isolated; until configured, return a clear actionable error.
    raise HTTPException(501, "Object storage is not configured; set S3-compatible storage credentials first")


@app.get("/v1/social-posts", dependencies=[Depends(require_auth)], tags=["Social"])
def list_social_posts(status_filter: str | None = Query(None, alias="status")) -> list[dict]:
    with connection() as conn:
        if status_filter:
            return conn.execute("SELECT * FROM social_posts WHERE status = %s ORDER BY created_at DESC", (status_filter,)).fetchall()
        return conn.execute("SELECT * FROM social_posts ORDER BY created_at DESC").fetchall()


@app.post("/v1/social-posts", status_code=201, dependencies=[Depends(require_auth)], tags=["Social"])
def create_social_post(payload: CreateSocialPostRequest, user: Auth) -> dict:
    with connection() as conn:
        row = conn.execute("""INSERT INTO social_posts (product_id, media_urls, final_caption, target_platforms, created_by_admin_id)
            VALUES (%s, %s::jsonb, %s, %s::jsonb, NULL) RETURNING *""", (payload.product_id, json.dumps(payload.media_urls), payload.final_caption, json.dumps(payload.target_platforms))).fetchone()
    return row


@app.post("/v1/social-posts/{post_id}/generate-caption", dependencies=[Depends(require_auth)], tags=["Social"])
def generate_caption(post_id: UUID, marketing_hints: dict[str, Any] | None = None) -> dict:
    with connection() as conn:
        row = conn.execute("""SELECT sp.id, sp.final_caption, p.name, p.description FROM social_posts sp LEFT JOIN products p ON p.id = sp.product_id WHERE sp.id = %s""", (post_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Social post not found")
        caption = row["final_caption"] or f"{row['name'] or 'منتجنا'} — جودة تستحق التجربة."
        conn.execute("UPDATE social_posts SET ai_generated_caption = %s WHERE id = %s", (caption, post_id))
    return {"ai_generated_caption": caption}


@app.post("/v1/social-posts/{post_id}/schedule", dependencies=[Depends(require_auth)], tags=["Social"])
def schedule_post(post_id: UUID, body: dict[str, datetime]) -> dict:
    scheduled_at = body.get("scheduled_at")
    if not scheduled_at:
        raise HTTPException(422, "scheduled_at is required")
    with connection() as conn:
        with conn.transaction():
            post = conn.execute("UPDATE social_posts SET status = 'scheduled' WHERE id = %s RETURNING *", (post_id,)).fetchone()
            if not post:
                raise HTTPException(404, "Social post not found")
            return conn.execute("INSERT INTO scheduled_posts (social_post_id, scheduled_at) VALUES (%s, %s) RETURNING *", (post_id, scheduled_at)).fetchone()


@app.get("/v1/scheduled-posts/due", dependencies=[Depends(require_service_or_user)], tags=["Social"])
def due_posts() -> list[dict]:
    with connection() as conn:
        return conn.execute("SELECT * FROM scheduled_posts WHERE status = 'pending' AND scheduled_at <= now() ORDER BY scheduled_at").fetchall()


@app.patch("/v1/scheduled-posts/{scheduled_post_id}", dependencies=[Depends(require_service_or_user)], tags=["Social"])
def update_scheduled_post(scheduled_post_id: UUID, payload: ScheduledPostPatch) -> dict:
    executed_at = payload.executed_at or (datetime.now(timezone.utc) if payload.status == "executed" else None)
    with connection() as conn:
        with conn.transaction():
            row = conn.execute(
                """UPDATE scheduled_posts SET status = %s, executed_at = %s
                   WHERE id = %s RETURNING *""",
                (payload.status, executed_at, scheduled_post_id),
            ).fetchone()
            if not row:
                raise HTTPException(404, "Scheduled post not found")
            if payload.status == "executed":
                conn.execute(
                    "UPDATE social_posts SET status = 'published' WHERE id = %s",
                    (row["social_post_id"],),
                )
            elif payload.status == "failed":
                conn.execute(
                    "UPDATE social_posts SET status = 'failed' WHERE id = %s",
                    (row["social_post_id"],),
                )
    return row


@app.post("/v1/social-posts/{post_id}/publish", dependencies=[Depends(require_service_or_user)], tags=["Social"])
def publish_social_post(post_id: UUID, body: dict[str, Any] | None = None) -> dict:
    with connection() as conn:
        post = conn.execute("SELECT * FROM social_posts WHERE id = %s", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "Social post not found")
    # Never claim a post was published without a configured platform adapter and credentials.
    if not settings.social_publish_enabled:
        raise HTTPException(501, "Social publishing is not configured; enable the platform adapter first")
    raise HTTPException(501, "No social platform adapter is installed yet")


@app.post("/v1/facebook-comments", status_code=201, dependencies=[Depends(require_service_or_user)], tags=["FacebookComments"])
def create_facebook_comment(payload: IncomingFacebookComment) -> dict:
    with connection() as conn:
        social_post_id = None
        if payload.facebook_post_id:
            linked = conn.execute(
                "SELECT id FROM social_posts WHERE published_post_id = %s LIMIT 1",
                (payload.facebook_post_id,),
            ).fetchone()
            social_post_id = linked["id"] if linked else None
        row = conn.execute(
            """INSERT INTO facebook_comments
               (facebook_comment_id, platform, social_post_id, commenter_facebook_id, comment_text)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (facebook_comment_id) DO UPDATE SET comment_text = EXCLUDED.comment_text
               RETURNING *""",
            (payload.facebook_comment_id, payload.platform, social_post_id, payload.commenter_facebook_id, payload.comment_text),
        ).fetchone()
    return row


@app.post("/v1/facebook-comments/{comment_id}/reply", dependencies=[Depends(require_service_or_user)], tags=["FacebookComments"])
def reply_to_facebook_comment(comment_id: UUID, body: dict[str, Any] | None = None) -> dict:
    with connection() as conn:
        comment = conn.execute("SELECT * FROM facebook_comments WHERE id = %s", (comment_id,)).fetchone()
        if not comment:
            raise HTTPException(404, "Facebook comment not found")
        if comment["replied"]:
            return {"replied": False, "already_replied": True}
    raise HTTPException(501, "Meta Graph API reply adapter is not configured")


@app.post("/v1/messenger/send-whatsapp-redirect", dependencies=[Depends(require_service_or_user)], tags=["Messenger"])
def send_whatsapp_redirect(body: dict[str, Any]) -> dict:
    commenter_id = body.get("commenter_facebook_id")
    comment_id = body.get("facebook_comment_id")
    if not commenter_id or not comment_id:
        raise HTTPException(422, "commenter_facebook_id and facebook_comment_id are required")
    with connection() as conn:
        comment = conn.execute("SELECT id FROM facebook_comments WHERE id = %s", (comment_id,)).fetchone()
        if not comment:
            raise HTTPException(404, "Facebook comment not found")
        existing = conn.execute(
            "SELECT id FROM messenger_conversations WHERE commenter_facebook_id = %s AND facebook_comment_id = %s LIMIT 1",
            (commenter_id, comment_id),
        ).fetchone()
        if existing:
            return {"sent": False, "already_sent": True}
    raise HTTPException(501, "Messenger/WhatsApp redirect adapter is not configured")


@app.post("/v1/admin/devices", dependencies=[Depends(require_auth)], tags=["Admin"])
def register_admin_device(payload: AdminDeviceRequest, user: Auth) -> dict:
    admin_id = None
    try:
        admin_id = UUID(str(user["sub"]))
    except (ValueError, KeyError):
        pass
    with connection() as conn:
        row = conn.execute(
            """INSERT INTO admin_devices (admin_id, expo_push_token)
               VALUES (%s, %s)
               ON CONFLICT (expo_push_token) DO UPDATE SET admin_id = EXCLUDED.admin_id, is_active = TRUE, updated_at = now()
               RETURNING id, expo_push_token, is_active, created_at""",
            (admin_id, payload.expo_push_token),
        ).fetchone()
    return row


@app.post("/v1/admin/notifications", dependencies=[Depends(require_service_or_user)], tags=["Admin"])
def send_admin_notification(payload: AdminNotificationRequest) -> dict:
    with connection() as conn:
        devices = conn.execute("SELECT id, expo_push_token FROM admin_devices WHERE is_active = TRUE").fetchall()
    if not devices:
        return {"sent": 0, "failed": 0, "detail": "No active admin devices"}
    messages = [
        {"to": device["expo_push_token"], "title": payload.title, "body": payload.body,
         "data": {"type": payload.type, "order_id": str(payload.order_id) if payload.order_id else None, **payload.data}}
        for device in devices
    ]
    headers = {"Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    try:
        response = httpx.post("https://exp.host/--/api/v2/push/send", json=messages, headers=headers, timeout=15)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Expo Push API unavailable") from exc
    tickets = response.json().get("data", [])
    failed = sum(1 for ticket in tickets if ticket.get("status") == "error")
    return {"sent": len(tickets) - failed, "failed": failed}
