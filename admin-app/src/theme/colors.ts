// نظام ألوان واحد يُستخدم في كل الشاشات — لا ألوان hardcoded متفرقة داخل المكوّنات.

export const colors = {
  background: "#0F172A",
  surface: "#1E293B",
  surfaceElevated: "#293548",
  border: "#334155",

  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",

  primary: "#3B82F6",
  primaryMuted: "#1D4ED8",

  success: "#22C55E",
  danger: "#EF4444",
  warning: "#F59E0B",

  statusColors: {
    NEW: "#64748B",
    PRODUCT_SELECTED: "#64748B",
    WAITING_FOR_CUSTOMER_DATA: "#F59E0B",
    WAITING_FOR_PAYMENT: "#F59E0B",
    WAITING_FOR_PAYMENT_PROOF: "#F59E0B",
    PENDING_ADMIN_REVIEW: "#3B82F6",
    APPROVED: "#22C55E",
    REJECTED: "#EF4444",
    OUT_OF_STOCK: "#EF4444",
    SHIPPED: "#22C55E",
  } as Record<string, string>,
};

export const statusLabelsArabic: Record<string, string> = {
  NEW: "جديد",
  PRODUCT_SELECTED: "تم اختيار المنتج",
  WAITING_FOR_CUSTOMER_DATA: "بانتظار بيانات العميل",
  WAITING_FOR_PAYMENT: "بانتظار الدفع",
  WAITING_FOR_PAYMENT_PROOF: "بانتظار إثبات التحويل",
  PENDING_ADMIN_REVIEW: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  OUT_OF_STOCK: "نفدت الكمية",
  SHIPPED: "تم الشحن",
};
