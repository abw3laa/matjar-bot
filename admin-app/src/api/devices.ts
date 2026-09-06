import { apiClient } from "./client";

export async function registerDeviceForPush(expoPushToken: string): Promise<void> {
  await apiClient.post("/admin/devices", { expo_push_token: expoPushToken });
}
