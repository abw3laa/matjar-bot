// أنواع مطابقة تماماً لمخططات api/openapi.yaml — عدّلها هناك أولاً ثم هنا لو تغيّر العقد.

export type OrderStatus =
  | "NEW"
  | "PRODUCT_SELECTED"
  | "WAITING_FOR_CUSTOMER_DATA"
  | "WAITING_FOR_PAYMENT"
  | "WAITING_FOR_PAYMENT_PROOF"
  | "PENDING_ADMIN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "OUT_OF_STOCK"
  | "SHIPPED";

export interface Customer {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
}

export interface OrderItem {
  id: string;
  variant_id: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

export interface PaymentProof {
  id: string;
  order_id: string;
  file_url: string;
  file_type: "pdf" | "image";
}

export interface OrderTracking {
  tracking_number: string;
  carrier?: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  shipping_address: string | null;
  customer: Customer;
  items: OrderItem[];
  payment_proof: PaymentProof | null;
  tracking: OrderTracking | null;
}

export type OrderDecision = "approve" | "reject" | "out_of_stock";

export interface SubmitDecisionRequest {
  decision: OrderDecision;
  tracking_number?: string;
  carrier?: string;
  admin_id?: string;
}

export interface OrdersListResponse {
  orders: OrderDetail[];
  next_cursor: string | null;
}

// ============ Social Publishing ============

export interface Product {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  is_active: boolean;
}

export type MediaType = "image" | "video";

export interface PickedMedia {
  localUri: string;
  type: MediaType;
  fileExtension: string;
}

export type SocialPostStatus = "draft" | "scheduled" | "published" | "failed";

export interface SocialPost {
  id: string;
  status: SocialPostStatus;
  final_caption: string | null;
  target_platforms: string[];
  created_at: string;
}

export interface CreateSocialPostRequest {
  product_id?: string;
  media_urls: string[];
  admin_notes?: string;
}

// facebook وinstagram يدعمان نشراً + رداً على تعليقات + تحويلاً لـ WhatsApp بالكامل.
// tiktok يدعم النشر فقط حالياً — راجع docs/tiktok-integration.md في جذر المشروع لسبب عدم
// تفعيل الرد على التعليقات/الرسائل الخاصة له بعد (قيود وصول حقيقية من تيك توك نفسها).
export const AVAILABLE_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
] as const;

// ============ Escalated Conversations ============

export type ConversationStatus = "active" | "escalated_to_human" | "closed";
export type MessageSender = "customer" | "bot" | "admin";

export interface Conversation {
  id: string;
  channel: "whatsapp" | "messenger";
  status: ConversationStatus;
  customer: Customer;
  last_message_preview: string | null;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: MessageSender;
  content: string | null;
  message_type: "text" | "image" | "document";
  media_url: string | null;
  created_at: string;
}

