// API calls for the suggestions feature module.

import { API_URL } from "../constants";
import type { Suggestion } from "../types";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const res = await fetch(`${API_URL}/api/suggestions`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to load suggestions.");
  const data = await res.json();
  if (data.success && data.suggestions) return data.suggestions as Suggestion[];
  throw new Error(data.message || "Failed to load suggestions.");
}
