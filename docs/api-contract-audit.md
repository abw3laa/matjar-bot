# API Contract Audit

## Summary

The OpenAPI contract contains **35 operations** across the documented business paths. The initial FastAPI implementation contains **31 operations**. After normalizing path-parameter naming (`{productId}` versus `{product_id}`), **28 operations match the contract** and **7 documented operations are still missing**.

The implementation also exposes three intentional operational endpoints that are not currently listed in `api/openapi.yaml`: `/health`, `/ready`, and `/auth/login`.

## Missing contract operations

| Method | Path | Reason / next implementation area |
|---|---|---|
| POST | `/social-posts/{id}/publish` | Requires Facebook/Instagram/TikTok credentials and platform adapters; should not be a fake success. |
| PATCH | `/scheduled-posts/{id}` | Needed by the scheduled-post n8n workflow to mark execution as `executed` or `failed`. |
| POST | `/facebook-comments` | Inbound comment persistence from n8n. |
| POST | `/facebook-comments/{id}/reply` | Idempotent public reply with platform-specific Graph API integration. |
| POST | `/messenger/send-whatsapp-redirect` | Idempotent Messenger-to-WhatsApp redirect; requires Meta/WhatsApp integration. |
| POST | `/admin/devices` | Persist Expo push tokens for admin devices. |
| POST | `/admin/notifications` | Send push notifications through Expo Push API. |

## Implemented contract operations

The following areas match the contract: catalog search and lookup, variant availability, conversation resolution/list/detail/context/escalation/close, message creation and history, order list/create/detail/customer data/payment method/payment proof/decision, payment methods, upload presign guard, social post list/create/caption/schedule, and due scheduled posts.

## Important findings beyond route coverage

1. **`/auth/login` is implemented but absent from OpenAPI.** It should be added to the contract before production use so the admin app's authentication is documented.
2. **The OpenAPI server URL is a placeholder** (`https://api.internal.example.com/v1`). Deployment must replace it with the real HTTPS API URL.
3. **Upload presigning currently returns `501` intentionally** until S3-compatible storage credentials are configured.
4. **Caption generation currently returns a deterministic fallback** until the AI service is connected; it does not claim to have called an AI model.
5. **Social publishing is intentionally not implemented** until Meta/TikTok credentials and platform-specific adapters are configured.
6. **Route coverage is not the same as production readiness.** Database integration tests, idempotency persistence, webhook signature verification, rate limiting, and token refresh still need to be added before handling real customer or payment data.

## Verification

- Python compilation: passed.
- FastAPI `/health` smoke test: passed.
- n8n workflow JSON parsing: passed.
- Audit script: `/tmp/api_contract_audit.py`.
