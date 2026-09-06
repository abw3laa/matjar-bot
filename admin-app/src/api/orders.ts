import { apiClient } from "./client";
import type { OrderDetail, OrdersListResponse, SubmitDecisionRequest } from "@/types";

export async function fetchOrders(params?: {
  status?: string;
  cursor?: string;
}): Promise<OrdersListResponse> {
  const { data } = await apiClient.get<OrdersListResponse>("/orders", { params });
  return data;
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const { data } = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
  return data;
}

// يمرّ عبر Webhook الخاص بـ n8n ('06 - Order Status Updates') وليس مباشرة إلى الـ Backend —
// لأن n8n هو من يرسل رسالة النتيجة للعميل عبر WhatsApp بعد تسجيل القرار.
// اضبط N8N_ADMIN_WEBHOOK_BASE_URL عبر متغير بيئة، منفصلاً عن API_BASE_URL.
const N8N_ADMIN_WEBHOOK_BASE_URL =
  process.env.EXPO_PUBLIC_N8N_ADMIN_WEBHOOK_BASE_URL ?? "https://n8n.internal.example.com";

export async function submitOrderDecision(
  orderId: string,
  decision: SubmitDecisionRequest
): Promise<{ success: boolean; order: { id: string; status: string } }> {
  const idempotencyKey = `admin-app-${orderId}-${decision.decision}-${Date.now()}`;
  const { data } = await apiClient.post(
    `${N8N_ADMIN_WEBHOOK_BASE_URL}/webhook/admin/order-decision`,
    { order_id: orderId, ...decision },
    { headers: { "Idempotency-Key": idempotencyKey } }
  );
  return data;
}
