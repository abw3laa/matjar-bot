from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ResolveConversationRequest(BaseModel):
    channel: Literal["whatsapp", "messenger"]
    channel_user_id: str = Field(min_length=1, max_length=255)
    customer_phone: str | None = None
    customer_name: str | None = None


class ContextPatch(BaseModel):
    model_config = ConfigDict(extra="allow")

    def as_dict(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class CreateMessageRequest(BaseModel):
    conversation_id: UUID
    direction: Literal["inbound", "outbound"]
    sender: Literal["customer", "bot", "admin"]
    content: str | None = None
    message_type: Literal["text", "image", "document"] = "text"
    media_url: str | None = None


class CreateOrderItem(BaseModel):
    variant_id: UUID
    quantity: int = Field(gt=0)


class CreateOrderRequest(BaseModel):
    customer_id: UUID | None = None
    conversation_id: UUID | None = None
    items: list[CreateOrderItem] = Field(min_length=1)
    shipping_address: str | None = None


class CustomerDataPatch(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None


class PaymentProofRequest(BaseModel):
    file_url: str
    file_type: Literal["pdf", "image"]
    file_hash: str | None = None


class OrderDecisionRequest(BaseModel):
    decision: Literal["approve", "reject", "out_of_stock"]
    tracking_number: str | None = None
    carrier: str | None = None
    admin_id: UUID | None = None


class CreateSocialPostRequest(BaseModel):
    product_id: UUID | None = None
    media_urls: list[str] = []
    final_caption: str | None = None
    target_platforms: list[str] = ["facebook"]


class UploadPresignRequest(BaseModel):
    purpose: Literal["payment_proof", "social_media"]
    file_extension: str = Field(pattern=r"^[a-zA-Z0-9]{1,10}$")
    order_id: UUID | None = None


class IncomingFacebookComment(BaseModel):
    facebook_comment_id: str
    facebook_post_id: str | None = None
    platform: Literal["facebook", "instagram"] = "facebook"
    commenter_facebook_id: str
    commenter_name: str | None = None
    comment_text: str


class ScheduledPostPatch(BaseModel):
    status: Literal["executed", "failed"]
    executed_at: datetime | None = None


class AdminDeviceRequest(BaseModel):
    expo_push_token: str = Field(min_length=1, max_length=512)


class AdminNotificationRequest(BaseModel):
    type: str
    order_id: UUID | None = None
    title: str
    body: str
    data: dict[str, Any] = {}


class PaymentMethodPatch(BaseModel):
    is_enabled: bool | None = None
    details: dict[str, Any] | None = None
