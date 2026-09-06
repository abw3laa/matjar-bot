import { apiClient } from "./client";
import type { AdminAccount } from "@/types/auth";

export interface LoginResponse {
  token: string;
  admin: AdminAccount;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}
