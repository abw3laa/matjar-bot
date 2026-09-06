import React from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { LoginScreen } from "@/screens/LoginScreen";
import { AppNavigator } from "@/navigation/AppNavigator";
import { colors } from "@/theme/colors";

function RootSwitch() {
  const { isLoading, admin } = useAuth();

  if (isLoading) {
    // فحص الجلسة المحفوظة على الجهاز يحدث مرة واحدة عند الفتح — شاشة تحميل بسيطة بدل وميض شاشة الدخول لجزء من الثانية.
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return admin ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootSwitch />
    </AuthProvider>
  );
}
