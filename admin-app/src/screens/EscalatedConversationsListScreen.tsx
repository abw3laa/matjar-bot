import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConversationsStackParamList } from "@/navigation/AppNavigator";
import { fetchConversations } from "@/api/conversations";
import { toApiErrorInfo } from "@/api/client";
import type { Conversation } from "@/types";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<ConversationsStackParamList, "ConversationsList">;

export function EscalatedConversationsListScreen({ navigation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErrorMessage(null);
      setConversations(await fetchConversations("escalated_to_human"));
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateEmoji}>✅</Text>
              <Text style={styles.emptyStateText}>لا توجد محادثات بانتظار تدخل بشري حالياً</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate("ConversationDetail", {
                conversationId: item.id,
                customerName: item.customer.full_name ?? "عميل",
                customerPhone: item.customer.phone ?? "",
              })
            }
          >
            <View style={styles.rowBetween}>
              <Text style={styles.channelBadge}>{item.channel === "whatsapp" ? "WhatsApp" : "Messenger"}</Text>
              <Text style={styles.customerName}>{item.customer.full_name ?? "عميل بلا اسم"}</Text>
            </View>
            {item.last_message_preview && (
              <Text style={styles.preview} numberOfLines={2}>
                {item.last_message_preview}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  errorBanner: { margin: 16, marginBottom: 0, padding: 10, borderRadius: 8, backgroundColor: colors.danger + "22" },
  errorBannerText: { color: colors.danger, textAlign: "right" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning + "55",
    gap: 6,
  },
  rowBetween: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  customerName: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  channelBadge: { color: colors.textMuted, fontSize: 12 },
  preview: { color: colors.textSecondary, fontSize: 14, textAlign: "right" },
  emptyState: { paddingTop: 80, alignItems: "center", gap: 8 },
  emptyStateEmoji: { fontSize: 32 },
  emptyStateText: { color: colors.textMuted, fontSize: 15 },
});
