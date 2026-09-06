import axios, { AxiosError } from "axios";

// اضبط هذه القيمة عبر متغير بيئة عند البناء (app.config.js / eas.json) بدل تعديلها هنا مباشرة.
// انظر .env.example في جذر المشروع.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api.internal.example.com/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// يُستدعى مرة واحدة بعد تسجيل دخول الأدمن (شاشة/آلية تسجيل الدخول خارج نطاق هذا المستند).
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export interface ApiErrorInfo {
  message: string;
  status?: number;
}

// يحوّل أي خطأ axios إلى رسالة عربية قابلة للعرض مباشرة للأدمن، بدل رمي كائن خطأ تقني.
export function toApiErrorInfo(error: unknown): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string }>;
    if (err.response) {
      const backendMessage = err.response.data?.message;
      if (err.response.status === 409) {
        return { message: "لا يمكن تنفيذ هذا الإجراء — حالة الطلب تغيّرت", status: 409 };
      }
      return {
        message: backendMessage ?? `حدث خطأ من الخادم (${err.response.status})`,
        status: err.response.status,
      };
    }
    return { message: "تعذّر الاتصال بالخادم — تحقق من الإنترنت" };
  }
  return { message: "حدث خطأ غير متوقع" };
}
