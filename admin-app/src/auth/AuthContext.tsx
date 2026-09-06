import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { setAuthToken } from "@/api/client";
import { login as loginRequest } from "@/api/auth";
import { registerForPushNotificationsAsync } from "@/notifications/registerForPushNotifications";
import type { AdminAccount } from "@/types/auth";

const SESSION_KEY = "matjar_admin_session";

interface StoredSession {
  token: string;
  admin: AdminAccount;
}

interface AuthContextValue {
  isLoading: boolean;
  admin: AdminAccount | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminAccount | null>(null);

  // عند فتح التطبيق: هل هناك جلسة محفوظة مسبقاً؟ إن وُجدت نتخطى شاشة الدخول مباشرة.
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (raw) {
          const session: StoredSession = JSON.parse(raw);
          setAuthToken(session.token);
          setAdmin(session.admin);
          registerForPushNotificationsAsync();
        }
      } catch {
        // جلسة تالفة أو غير قابلة للقراءة — نتعامل معها كأنه لا توجد جلسة، بدل تعطّل التطبيق
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const result = await loginRequest(email, password);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(result));
    setAuthToken(result.token);
    setAdmin(result.admin);
    registerForPushNotificationsAsync();
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setAuthToken(null);
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ isLoading, admin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth يجب أن يُستخدم داخل AuthProvider");
  return ctx;
}
