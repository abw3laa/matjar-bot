import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { toApiErrorInfo } from "@/api/client";
import { colors } from "@/theme/colors";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setErrorMessage("أدخل البريد الإلكتروني وكلمة المرور");
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // لا حاجة للتنقل يدوياً — App.tsx يراقب حالة admin ويبدّل الشاشة تلقائياً بعد نجاح الدخول.
    } catch (err) {
      setErrorMessage(toApiErrorInfo(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>تطبيق الأدمن</Text>
        <Text style={styles.subtitle}>سجّل الدخول لإدارة الطلبات والنشر</Text>

        <View style={{ gap: 12, marginTop: 32 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            textAlign="right"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="كلمة المرور"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            textAlign="right"
            secureTextEntry
          />
        </View>

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>تسجيل الدخول</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: "center", padding: 24 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 6 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { color: colors.danger, textAlign: "center", marginTop: 16 },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
