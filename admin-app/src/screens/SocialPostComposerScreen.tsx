import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SocialStackParamList } from "@/navigation/AppNavigator";
import { searchProducts } from "@/api/products";
import {
  uploadMedia,
  createSocialPost,
  generateCaption,
  schedulePost,
  publishPostNow,
} from "@/api/socialPosts";
import { toApiErrorInfo } from "@/api/client";
import type { Product, PickedMedia } from "@/types";
import { AVAILABLE_PLATFORMS } from "@/types";
import { colors } from "@/theme/colors";

type Phase = "compose" | "review";
type Props = NativeStackScreenProps<SocialStackParamList, "PostComposer">;

export function SocialPostComposerScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>("compose");

  // مرحلة التجهيز
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [preparing, setPreparing] = useState(false);

  // مرحلة المراجعة
  const [postId, setPostId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);
  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [pickerStep, setPickerStep] = useState<"date" | "time" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("الإذن مطلوب", "امنح إذن الوصول للصور والفيديوهات من إعدادات الجهاز");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const isVideo = asset.type === "video";
    const extension = (asset.fileName?.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
    setMedia({ localUri: asset.uri, type: isVideo ? "video" : "image", fileExtension: extension });
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  function onProductQueryChange(text: string) {
    setProductQuery(text);
    setSelectedProduct(null);
    clearTimeout(searchTimeout);
    if (text.trim().length < 2) {
      setProductResults([]);
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        setProductResults(await searchProducts(text));
      } catch {
        // بحث فاشل لا يستحق إزعاج الأدمن برسالة خطأ — فقط لا نعرض نتائج
        setProductResults([]);
      }
    }, 400);
  }

  async function handlePrepareDraft() {
    if (!media) {
      Alert.alert("الوسائط مطلوبة", "أضف صورة أو فيديو للمنتج أولاً");
      return;
    }
    if (!selectedProduct) {
      Alert.alert("المنتج مطلوب", "اختر المنتج المرتبط بهذا المنشور من نتائج البحث");
      return;
    }
    setPreparing(true);
    try {
      const fileUrl = await uploadMedia(media);
      const post = await createSocialPost({
        product_id: selectedProduct.id,
        media_urls: [fileUrl],
        admin_notes: adminNotes.trim() || undefined,
      });
      setPostId(post.id);
      const hints = adminNotes
        .split(/[،,]/)
        .map((h) => h.trim())
        .filter(Boolean);
      const generated = await generateCaption(post.id, hints);
      setCaption(generated);
      setPhase("review");
    } catch (err) {
      Alert.alert("تعذّر تجهيز المنشور", toApiErrorInfo(err).message);
    } finally {
      setPreparing(false);
    }
  }

  async function handleRegenerateCaption() {
    if (!postId) return;
    setRegeneratingCaption(true);
    try {
      const hints = adminNotes
        .split(/[،,]/)
        .map((h) => h.trim())
        .filter(Boolean);
      setCaption(await generateCaption(postId, hints));
    } catch (err) {
      Alert.alert("تعذّر توليد الوصف", toApiErrorInfo(err).message);
    } finally {
      setRegeneratingCaption(false);
    }
  }

  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function onPickerChange(event: unknown, value?: Date) {
    if (!value) {
      setPickerStep(null);
      return;
    }
    if (pickerStep === "date") {
      const base = scheduledAt ?? new Date();
      const merged = new Date(value);
      merged.setHours(base.getHours(), base.getMinutes());
      setScheduledAt(merged);
      setPickerStep(Platform.OS === "android" ? "time" : null);
    } else if (pickerStep === "time") {
      const merged = new Date(scheduledAt ?? new Date());
      merged.setHours(value.getHours(), value.getMinutes());
      setScheduledAt(merged);
      setPickerStep(null);
    }
  }

  async function handleFinalSubmit() {
    if (!postId) return;
    if (scheduleMode === "later" && !scheduledAt) {
      Alert.alert("التاريخ مطلوب", "اختر تاريخ ووقت النشر أولاً");
      return;
    }
    const platforms = targetMode === "all" ? [] : selectedPlatforms;
    if (targetMode === "specific" && platforms.length === 0) {
      Alert.alert("اختر منصة", "حدد منصة واحدة على الأقل، أو اختر النشر على جميع المنصات");
      return;
    }

    setSubmitting(true);
    try {
      if (scheduleMode === "later" && scheduledAt) {
        await schedulePost(postId, scheduledAt.toISOString());
        Alert.alert("تمت الجدولة ✅", undefined, [
          { text: "تمام", onPress: () => navigation.navigate("PostsList") },
        ]);
      } else {
        const result = await publishPostNow(postId, platforms);
        if (!result.success) {
          throw new Error(result.error ?? "فشل النشر");
        }
        Alert.alert("تم النشر ✅", undefined, [
          { text: "تمام", onPress: () => navigation.navigate("PostsList") },
        ]);
      }
    } catch (err) {
      Alert.alert("تعذّر إتمام العملية", toApiErrorInfo(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {phase === "compose" ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الوسائط</Text>
            {media ? (
              <View>
                {media.type === "image" ? (
                  <Image source={{ uri: media.localUri }} style={styles.mediaPreview} />
                ) : (
                  <View style={[styles.mediaPreview, styles.videoPlaceholder]}>
                    <Text style={{ color: colors.textSecondary }}>فيديو مُختار ✓</Text>
                  </View>
                )}
                <TouchableOpacity onPress={pickMedia} style={{ marginTop: 8 }}>
                  <Text style={styles.linkText}>تغيير الوسائط</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pickButton} onPress={pickMedia}>
                <Text style={styles.pickButtonText}>+ إضافة صورة أو فيديو</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>المنتج المرتبط</Text>
            <TextInput
              value={productQuery}
              onChangeText={onProductQueryChange}
              placeholder="ابحث عن اسم المنتج..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              textAlign="right"
            />
            {selectedProduct ? (
              <View style={styles.selectedProductChip}>
                <Text style={styles.selectedProductText}>✓ {selectedProduct.name}</Text>
              </View>
            ) : (
              productResults.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.productResultRow}
                  onPress={() => {
                    setSelectedProduct(p);
                    setProductQuery(p.name);
                    setProductResults([]);
                  }}
                >
                  <Text style={styles.productResultText}>{p.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>معلومات تسويقية (اختياري)</Text>
            <TextInput
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder="مثال: منتج جديد، عليه تنزيلات 20%"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              multiline
              textAlign="right"
            />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePrepareDraft}
            disabled={preparing}
          >
            {preparing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>التالي: توليد الوصف بالذكاء الاصطناعي</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <TouchableOpacity onPress={handleRegenerateCaption} disabled={regeneratingCaption}>
                <Text style={styles.linkText}>
                  {regeneratingCaption ? "جارٍ التوليد..." : "🔄 إعادة التوليد"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>وصف المنشور</Text>
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              multiline
              style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
              textAlign="right"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>النشر على</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.toggleChip, targetMode === "all" && styles.toggleChipActive]}
                onPress={() => setTargetMode("all")}
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    targetMode === "all" && styles.toggleChipTextActive,
                  ]}
                >
                  جميع المنصات
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleChip, targetMode === "specific" && styles.toggleChipActive]}
                onPress={() => setTargetMode("specific")}
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    targetMode === "specific" && styles.toggleChipTextActive,
                  ]}
                >
                  منصة محددة
                </Text>
              </TouchableOpacity>
            </View>
            {targetMode === "specific" && (
              <View style={[styles.actionsRow, { marginTop: 8 }]}>
                {AVAILABLE_PLATFORMS.map((p) => {
                  const active = selectedPlatforms.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.toggleChip, active && styles.toggleChipActive]}
                      onPress={() => togglePlatform(p.id)}
                    >
                      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>التوقيت</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.toggleChip, scheduleMode === "now" && styles.toggleChipActive]}
                onPress={() => setScheduleMode("now")}
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    scheduleMode === "now" && styles.toggleChipTextActive,
                  ]}
                >
                  نشر الآن
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleChip, scheduleMode === "later" && styles.toggleChipActive]}
                onPress={() => setScheduleMode("later")}
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    scheduleMode === "later" && styles.toggleChipTextActive,
                  ]}
                >
                  جدولة لاحقاً
                </Text>
              </TouchableOpacity>
            </View>
            {scheduleMode === "later" && (
              <TouchableOpacity
                style={styles.pickButton}
                onPress={() => setPickerStep("date")}
              >
                <Text style={styles.pickButtonText}>
                  {scheduledAt
                    ? scheduledAt.toLocaleString("ar")
                    : "اختر تاريخ ووقت النشر"}
                </Text>
              </TouchableOpacity>
            )}
            {pickerStep && (
              <DateTimePicker
                value={scheduledAt ?? new Date()}
                mode={pickerStep}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onPickerChange}
                minimumDate={new Date()}
              />
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleFinalSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {scheduleMode === "later" ? "تأكيد الجدولة" : "نشر الآن"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setPhase("compose")} disabled={submitting}>
            <Text style={[styles.linkText, { textAlign: "center" }]}>رجوع للتعديل</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  doneText: { color: colors.success, fontSize: 18, fontWeight: "700" },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", textAlign: "right" },
  rowBetween: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  mediaPreview: { width: "100%", height: 200, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  videoPlaceholder: { alignItems: "center", justifyContent: "center" },
  pickButton: {
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  pickButtonText: { color: colors.primary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  selectedProductChip: {
    backgroundColor: colors.success + "22",
    padding: 10,
    borderRadius: 8,
  },
  selectedProductText: { color: colors.success, fontWeight: "600", textAlign: "right" },
  productResultRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  productResultText: { color: colors.textPrimary, textAlign: "right" },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  toggleChipTextActive: { color: "#FFFFFF" },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
