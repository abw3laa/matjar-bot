import { apiClient } from "./client";
import type { Conversation, ConversationMessage, ConversationStatus } from "@/types";

export async function fetchConversations(status?: ConversationStatus): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>("/conversations", {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function fetchConversationMessages(
  conversationId: string
): Promise<ConversationMessage[]> {
  const { data } = await apiClient.get<ConversationMessage[]>(
    `/conversations/${conversationId}/messages`
  );
  return data;
}

export async function closeConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/conversations/${conversationId}/close`);
}

// نفس رابط n8n المستخدم في orders.ts وsocialPosts.ts — يرسل عبر WhatsApp Graph API
// (الـ Backend/n8n يحملان التوكن، وليس تطبيق الأدمن) ثم يسجّل الرسالة في الأرشيف.
const N8N_ADMIN_WEBHOOK_BASE_URL =
  process.env.EXPO_PUBLIC_N8N_ADMIN_WEBHOOK_BASE_URL ?? "https://n8n.internal.example.com";

export async function sendAdminReply(
  conversationId: string,
  waId: string,
  messageText: string
): Promise<{ success: boolean; error?: string }> {
  const { data } = await apiClient.post(
    `${N8N_ADMIN_WEBHOOK_BASE_URL}/webhook/admin/conversation-reply`,
    { conversation_id: conversationId, wa_id: waId, message_text: messageText }
  );
  return data;
}
