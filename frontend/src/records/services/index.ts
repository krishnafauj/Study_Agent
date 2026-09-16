// API calls for the records feature module.

import { API_URL } from "../constants";
import type { FileRecord } from "../types";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchRecords(): Promise<FileRecord[]> {
  const res = await fetch(`${API_URL}/api/records`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load records");
  const data = await res.json();
  return data?.success ? (data.records as FileRecord[]) : [];
}
