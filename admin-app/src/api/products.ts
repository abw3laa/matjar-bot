import { apiClient } from "./client";
import type { Product } from "@/types";

export async function searchProducts(query: string): Promise<Product[]> {
  if (query.trim().length === 0) return [];
  const { data } = await apiClient.get<Product[]>("/products/search", {
    params: { q: query.trim() },
  });
  return data;
}
