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
import { fetchSocialPosts } from "@/api/socialPosts";
import { toApiErrorInfo } from "@/api/client";
import type { SocialPost, SocialPostStatus } from "@/types";
import { colors } from "@/theme/colors";

const FILTERS: { label: string; status?: SocialPostStatus }[] = [
  { label: "الكل", status: undefined },
  { label: "مسودة", status: "draft" },
  { label: "مجدولة", status: "scheduled" },
  { label: "منشورة", status: "published" },
  { label: "فاشلة", status: "failed" },
];

const statusLabels: Record<SocialPostStatus, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  published: "منشورة",
  failed: "فاشلة",
};

const statusColors: Record<SocialPostStatus, string> = {
  draft: colors.textMuted,
  scheduled: colors.warning,
  published: colors.success,
  failed: colors.danger,
};

export function PostsListScreen() {
  const [activeFilter, setActiveFilter] = useState<SocialPostStatus | undefined>(undefined);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (status?: SocialPostStatus) => {
    try {
      setErrorMessage(null);
      setPosts(await fetchSocialPosts(status));
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(activeFilter).finally(() => setLoading(false));
  }, [activeFilter, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeFilter);
    setRefreshing(false);
  }, [activeFilter, load]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, paddingVertical: 12 }}
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
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>لا توجد منشورات هنا</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] + "22" }]}>
                <Text style={[styles.statusBadgeText, { color: statusColors[item.status] }]}>
                  {statusLabels[item.status]}
                </Text>
              </View>
              <Text style={styles.platforms}>
                {item.target_platforms.length > 0 ? item.target_platforms.join("، ") : "كل المنصات"}
              </Text>
            </View>
            <Text style={styles.caption} numberOfLines={3}>
              {item.final_caption ?? "بلا وصف"}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  errorBanner: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 8, backgroundColor: colors.danger + "22" },
  errorBannerText: { color: colors.danger, textAlign: "right" },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  rowBetween: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  platforms: { color: colors.textMuted, fontSize: 12 },
  caption: { color: colors.textPrimary, fontSize: 14, textAlign: "right", lineHeight: 20 },
  emptyState: { paddingTop: 80, alignItems: "center" },
  emptyStateText: { color: colors.textMuted, fontSize: 15 },
});
