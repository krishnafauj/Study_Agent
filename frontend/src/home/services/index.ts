// Local (non-network) data access for the home feature module.

import type { Book, StoredUser } from "../types";

/** Read the signed-in user from localStorage (client only). */
export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

/** Time-of-day greeting. */
export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const LAST_BOOK_KEY = "home_last_book_id";

/** Books (owned + shared files) available to the user. */
export async function fetchBooks(): Promise<Book[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  if (!token) return [];
  const res = await fetch(`${API_URL}/api/files`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return Array.isArray(data.files) ? (data.files as Book[]) : [];
}

export function getLastBookId(): string | null {
  try { return localStorage.getItem(LAST_BOOK_KEY); } catch { return null; }
}

export function setLastBookId(id: string) {
  try { localStorage.setItem(LAST_BOOK_KEY, id); } catch { /* ignore */ }
}
