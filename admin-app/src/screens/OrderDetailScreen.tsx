import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { OrdersStackParamList } from "@/navigation/AppNavigator";
import { fetchOrderDetail, submitOrderDecision } from "@/api/orders";
import { toApiErrorInfo } from "@/api/client";
import type { OrderDetail, OrderDecision } from "@/types";
import { colors, statusLabelsArabic } from "@/theme/colors";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrderDetail">;

// الحالات التي يُسمح فيها فعلياً باتخاذ قرار — تطابق State Machine في التصميم.
const DECISION_ALLOWED_STATUSES = ["PENDING_ADMIN_REVIEW"];

export function OrderDetailScreen({ route }: Props) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pendingDecision, setPendingDecision] = useState<OrderDecision | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await fetchOrderDetail(orderId);
      setOrder(data);
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    loadOrder().finally(() => setLoading(false));
  }, [loadOrder]);

  const canDecide = order ? DECISION_ALLOWED_STATUSES.includes(order.status) : false;

  async function handleConfirmDecision(decision: OrderDecision) {
    if (decision === "approve" && trackingNumber.trim().length === 0) {
      Alert.alert("رقم التتبع مطلوب", "أدخل رقم التتبع قبل تأكيد قبول الطلب");
      return;
    }
    setSubmitting(true);
    try {
      await submitOrderDecision(orderId, {
        decision,
        tracking_number: decision === "approve" ? trackingNumber.trim() : undefined,
        carrier: decision === "approve" ? carrier.trim() || undefined : undefined,
      });
      setPendingDecision(null);
      await loadOrder();
      Alert.alert("تم", "تم تنفيذ القرار وإبلاغ العميل");
    } catch (err) {
      Alert.alert("تعذّر تنفيذ القرار", toApiErrorInfo(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmRejectOrOutOfStock(decision: "reject" | "out_of_stock") {
    const label = decision === "reject" ? "رفض الطلب" : "تسجيل نفاد الكمية";
    Alert.alert(label, "سيتم إبلاغ العميل بهذا القرار فوراً. متأكد؟", [
      { text: "تراجع", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: () => handleConfirmDecision(decision) },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (errorMessage || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage ?? "تعذّر تحميل الطلب"}</Text>
        <TouchableOpacity onPress={loadOrder} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* الحالة + رقم الطلب */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: colors.statusColors[order.status] + "22" },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: colors.statusColors[order.status] }]}>
              {statusLabelsArabic[order.status] ?? order.status}
            </Text>
          </View>
          <Text style={styles.orderNumber}>#{order.order_number}</Text>
        </View>
      </View>

      {/* بيانات العميل */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>معلومات العميل</Text>
        <InfoRow label="الاسم" value={order.customer.full_name ?? "—"} />
        <InfoRow label="الهاتف" value={order.customer.phone ?? "—"} />
        <InfoRow label="العنوان" value={order.shipping_address ?? "—"} />
      </View>

      {/* المنتجات */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>المنتجات</Text>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.variant_name}</Text>
            <Text style={styles.itemMeta}>
              {item.quantity} × {item.unit_price}
            </Text>
          </View>
        ))}
        <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
          <Text style={styles.itemName}>الإجمالي</Text>
          <Text style={[styles.itemMeta, { color: colors.textPrimary, fontWeight: "700" }]}>
            {order.total_amount}
          </Text>
        </View>
      </View>

      {/* إثبات التحويل */}
      {order.payment_proof && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>إثبات التحويل</Text>
          {order.payment_proof.file_type === "image" ? (
            <Image
              source={{ uri: order.payment_proof.file_url }}
              style={styles.proofImage}
              resizeMode="cover"
            />
          ) : (
            <TouchableOpacity
              style={styles.pdfButton}
              onPress={() => Linking.openURL(order.payment_proof!.file_url)}
            >
              <Text style={styles.pdfButtonText}>فتح ملف PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* رقم التتبع إن وُجد مسبقاً */}
      {order.tracking && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الشحن</Text>
          <InfoRow label="رقم التتبع" value={order.tracking.tracking_number} />
          {order.tracking.carrier && <InfoRow label="شركة الشحن" value={order.tracking.carrier} />}
        </View>
      )}

      {/* الإجراءات */}
      {canDecide && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>القرار</Text>

          {pendingDecision === "approve" ? (
            <View style={{ gap: 10 }}>
              <TextInput
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="رقم التتبع (إلزامي)"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                textAlign="right"
              />
              <TextInput
                value={carrier}
                onChangeText={setCarrier}
                placeholder="شركة الشحن (اختياري)"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                textAlign="right"
              />
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={() => setPendingDecision(null)}
                  disabled={submitting}
                >
                  <Text style={styles.secondaryButtonText}>تراجع</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.successButton]}
                  onPress={() => handleConfirmDecision("approve")}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.actionButtonText}>تأكيد القبول</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[styles.actionButton, styles.successButton]}
                onPress={() => setPendingDecision("approve")}
                disabled={submitting}
              >
                <Text style={styles.actionButtonText}>قبول الطلب</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.warningButton]}
                onPress={() => confirmRejectOrOutOfStock("out_of_stock")}
                disabled={submitting}
              >
                <Text style={styles.actionButtonText}>نفذت الكمية</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.dangerButton]}
                onPress={() => confirmRejectOrOutOfStock("reject")}
                disabled={submitting}
              >
                <Text style={styles.actionButtonText}>رفض الطلب</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { color: colors.danger, fontSize: 15 },
  retryButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 8 },
  retryButtonText: { color: colors.textPrimary },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  rowBetween: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  statusBadgeText: { fontSize: 13, fontWeight: "700" },
  orderNumber: { color: colors.textMuted, fontSize: 14 },
  infoRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  infoLabel: { color: colors.textMuted, fontSize: 14 },
  infoValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  itemRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 4 },
  itemName: { color: colors.textPrimary, fontSize: 15 },
  itemMeta: { color: colors.textSecondary, fontSize: 14 },
  proofImage: { width: "100%", height: 220, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  pdfButton: { backgroundColor: colors.surfaceElevated, padding: 12, borderRadius: 10, alignItems: "center" },
  pdfButtonText: { color: colors.primary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  actionButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  successButton: { backgroundColor: colors.success },
  dangerButton: { backgroundColor: colors.danger },
  warningButton: { backgroundColor: colors.warning },
  secondaryButton: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textSecondary, fontWeight: "600" },
});
