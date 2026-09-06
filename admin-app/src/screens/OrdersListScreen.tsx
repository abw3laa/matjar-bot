import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ScrollView,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { OrdersStackParamList } from "@/navigation/AppNavigator";
import { fetchOrders } from "@/api/orders";
import { toApiErrorInfo } from "@/api/client";
import type { OrderDetail, OrderStatus } from "@/types";
import { colors, statusLabelsArabic } from "@/theme/colors";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrdersList">;

// بانتظار المراجعة هي الفلتر الافتراضي — هذا ما يحتاج الأدمن رؤيته أولاً كل مرة يفتح التطبيق.
const FILTERS: { label: string; status?: OrderStatus }[] = [
  { label: "بانتظار المراجعة", status: "PENDING_ADMIN_REVIEW" },
  { label: "بانتظار الدفع", status: "WAITING_FOR_PAYMENT_PROOF" },
  { label: "مقبولة", status: "APPROVED" },
  { label: "الكل", status: undefined },
];

export function OrdersListScreen({ navigation }: Props) {
  const [activeFilter, setActiveFilter] = useState<OrderStatus | undefined>(
    "PENDING_ADMIN_REVIEW"
  );
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async (status?: OrderStatus) => {
    try {
      setErrorMessage(null);
      const result = await fetchOrders({ status });
      setOrders(result.orders);
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadOrders(activeFilter).finally(() => setLoading(false));
  }, [activeFilter, loadOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders(activeFilter);
    setRefreshing(false);
  }, [activeFilter, loadOrders]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {FILTERS.map((f) => {
          const isActive = f.status === activeFilter;
          return (
            <TouchableOpacity
              key={f.label}
              onPress={() => setActiveFilter(f.status)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>لا توجد طلبات هنا حالياً</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.orderNumber}>#{item.order_number}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.statusColors[item.status] + "22" },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: colors.statusColors[item.status] }]}>
                  {statusLabelsArabic[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.customerName}>{item.customer.full_name ?? "بلا اسم بعد"}</Text>
            <Text style={styles.itemsSummary} numberOfLines={1}>
              {item.items.map((i) => i.variant_name).join("، ") || "بلا عناصر"}
            </Text>
            <Text style={styles.amount}>{item.total_amount} </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: { paddingVertical: 12, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#FFFFFF" },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.danger + "22",
  },
  errorBannerText: { color: colors.danger, textAlign: "right" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  orderNumber: { color: colors.textMuted, fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  customerName: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 2,
  },
  itemsSummary: { color: colors.textSecondary, fontSize: 14, textAlign: "right", marginBottom: 6 },
  amount: { color: colors.textPrimary, fontSize: 15, fontWeight: "600", textAlign: "right" },
  emptyState: { paddingTop: 80, alignItems: "center" },
  emptyStateText: { color: colors.textMuted, fontSize: 15 },
});
