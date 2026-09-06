import { apiClient } from "./client";
import type { CreateSocialPostRequest, PickedMedia, SocialPost, SocialPostStatus } from "@/types";

export async function fetchSocialPosts(status?: SocialPostStatus): Promise<SocialPost[]> {
  const { data } = await apiClient.get<SocialPost[]>("/social-posts", {
    params: status ? { status } : undefined,
  });
  return data;
}

// نفس رابط n8n المستخدم في orders.ts لإرسال قرارات الأدمن — ذات المبدأ:
// النشر الفعلي عبر Graph API يمرّ بالـ Backend (يحمل التوكن مركزياً)، وn8n وسيط رقيق فقط.
const N8N_ADMIN_WEBHOOK_BASE_URL =
  process.env.EXPO_PUBLIC_N8N_ADMIN_WEBHOOK_BASE_URL ?? "https://n8n.internal.example.com";

// رفع مباشر إلى رابط presigned (S3-compatible) — نفس نمط إثبات التحويل في Workflow 04،
// لكن هنا الرافع هو تطبيق الأدمن مباشرة بدل n8n. يعيد الرابط الدائم للملف بعد نجاح الرفع.
export async function uploadMedia(media: PickedMedia): Promise<string> {
  const { data: presign } = await apiClient.post<{ upload_url: string; file_url: string }>(
    "/uploads/presign",
    { purpose: "social_media", file_extension: media.fileExtension }
  );

  const uploadResponse = await fetch(presign.upload_url, {
    method: "PUT",
    // شكل الـ body الخاص بـ React Native لرفع ملف من مسار محلي مباشرة (uri) —
    // مختلف عن shape الويب المعتاد (File/Blob)، وهذا هو النمط القياسي في RN.
    body: {
      uri: media.localUri,
      type: media.type === "video" ? "video/mp4" : "image/jpeg",
      name: `upload.${media.fileExtension}`,
    } as unknown as BodyInit,
  });

  if (!uploadResponse.ok) {
    throw new Error(`فشل رفع الملف إلى التخزين (${uploadResponse.status})`);
  }

  return presign.file_url;
}

export async function createSocialPost(req: CreateSocialPostRequest): Promise<SocialPost> {
  const { data } = await apiClient.post<SocialPost>("/social-posts", req);
  return data;
}

export async function generateCaption(
  postId: string,
  marketingHints: string[]
): Promise<string> {
  const { data } = await apiClient.post<{ ai_generated_caption: string }>(
    `/social-posts/${postId}/generate-caption`,
    { marketing_hints: marketingHints }
  );
  return data.ai_generated_caption;
}

export async function schedulePost(postId: string, scheduledAtIso: string): Promise<void> {
  await apiClient.post(`/social-posts/${postId}/schedule`, { scheduled_at: scheduledAtIso });
}

// يمرّ عبر n8n Workflow '07 - Facebook Publishing' — الأدمن يضغط "نشر الآن" فيستدعي هذا،
// ويردّ n8n بنتيجة النشر الفعلية (نجاح أو رسالة خطأ واضحة) خلال نفس الطلب.
export async function publishPostNow(
  postId: string,
  targetPlatforms: string[]
): Promise<{ success: boolean; error?: string }> {
  const { data } = await apiClient.post(
    `${N8N_ADMIN_WEBHOOK_BASE_URL}/webhook/admin/publish-post`,
    { social_post_id: postId, target_platforms: targetPlatforms }
  );
  return data;
}
