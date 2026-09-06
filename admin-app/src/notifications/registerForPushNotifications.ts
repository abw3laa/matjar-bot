import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { registerDeviceForPush } from "@/api/devices";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// يُستدعى مرة واحدة بعد نجاح تسجيل الدخول. فشل صامت مقصود هنا (جهاز بلا دعم إشعارات،
// أو رفض الإذن) — لا يجب أن يمنع الأدمن من استخدام باقي التطبيق.
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) return; // المحاكيات لا تدعم Push الفعلي غالباً

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "إشعارات الطلبات",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    await registerDeviceForPush(tokenResponse.data);
  } catch {
    // انظر التعليق أعلاه — فشل التسجيل هنا لا يستحق إزعاج الأدمن أو إيقافه
  }
}
