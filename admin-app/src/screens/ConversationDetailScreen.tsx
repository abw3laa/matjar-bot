import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConversationsStackParamList } from "@/navigation/AppNavigator";
import {
  fetchConversationMessages,
  sendAdminReply,
  closeConversation,
} from "@/api/conversations";
import { toApiErrorInfo } from "@/api/client";
import type { ConversationMessage } from "@/types";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<ConversationsStackParamList, "ConversationDetail">;

export function ConversationDetailScreen({ route, navigation }: Props) {
  const { conversationId, customerName, customerPhone } = route.params;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const listRef = useRef<FlatList<ConversationMessage>>(null);

  const load = useCallback(async () => {
    try {
      setErrorMessage(null);
      setMessages(await fetchConversationMessages(conversationId));
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    navigation.setOptions({
      title: customerName,
      headerRight: () => (
        <TouchableOpacity onPress={handleClose} disabled={closing}>
          <Text style={{ color: colors.success, fontWeight: "600" }}>
            {closing ? "..." : "إنهاء"}
          </Text>
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    if (!customerPhone) {
      Alert.alert("تعذّر الإرسال", "لا يوجد رقم هاتف مسجَّل لهذا العميل");
      return;
    }
    setSending(true);
    try {
      const result = await sendAdminReply(conversationId, customerPhone, text);
      if (!result.success) throw new Error(result.error ?? "فشل الإرسال");
      setDraft("");
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      Alert.alert("تعذّر إرسال الرد", toApiErrorInfo(err).message);
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    Alert.alert("إنهاء المحادثة", "سيُغلق هذا التصعيد. متأكد؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "إنهاء",
        style: "destructive",
        onPress: async () => {
          setClosing(true);
          try {
            await closeConversation(conversationId);
            navigation.goBack();
          } catch (err) {
            Alert.alert("تعذّر الإنهاء", toApiErrorInfo(err).message);
          } finally {
            setClosing(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => <MessageBubble message={item} />}
      />
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSend}
          disabled={sending || draft.trim().length === 0}
        >
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendButtonText}>إرسال</Text>}
        </TouchableOpacity>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="اكتب رداً..."
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
          textAlign="right"
          multiline
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  // العميل يسار، والبوت/الأدمن يمين — عكس اتجاه القراءة الطبيعي للمحادثة نفسها
  // (وليس نص كل رسالة الذي يبقى RTL بالكامل بحكم textAlign).
  const isCustomer = message.sender === "customer";
  return (
    <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRowLeft : styles.bubbleRowRight]}>
      <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleUs]}>
        {message.sender === "admin" && <Text style={styles.senderLabel}>أنت (الأدمن)</Text>}
        {message.sender === "bot" && <Text style={styles.senderLabel}>البوت</Text>}
        <Text style={styles.bubbleText}>{message.content ?? "[مرفق]"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  errorBanner: { margin: 16, marginBottom: 0, padding: 10, borderRadius: 8, backgroundColor: colors.danger + "22" },
  errorBannerText: { color: colors.danger, textAlign: "right" },
  bubbleRow: { flexDirection: "row" },
  bubbleRowLeft: { justifyContent: "flex-start" },
  bubbleRowRight: { justifyContent: "flex-end" },
  bubble: { maxWidth: "78%", borderRadius: 14, padding: 10, paddingHorizontal: 14 },
  bubbleCustomer: { backgroundColor: colors.surfaceElevated, borderBottomLeftRadius: 2 },
  bubbleUs: { backgroundColor: colors.primaryMuted, borderBottomRightRadius: 2 },
  senderLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 2, textAlign: "right" },
  bubbleText: { color: colors.textPrimary, fontSize: 15, textAlign: "right" },
  inputRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: { color: "#FFFFFF", fontWeight: "700" },
});
