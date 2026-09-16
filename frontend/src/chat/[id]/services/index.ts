// API calls for the chat feature module. SSE parsing stays in the hook; this
// module owns the plain request wrappers.

import { API_URL, HISTORY_PAGE_SIZE } from "../constants";
import type { Message } from "../types";

function token(): string {
  return (typeof window !== "undefined" ? localStorage.getItem("authToken") : "") || "";
}

export async function loadHistory(
  chatId: string,
  page: number,
  limit = HISTORY_PAGE_SIZE
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const res = await fetch(`${API_URL}/api/chat/${chatId}/history?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await res.json();
  if (!data.success) return { messages: [], hasMore: false };
  const messages: Message[] = data.messages.map((m: { role: "user" | "assistant"; content: string }) => ({
    role: m.role,
    content: m.content,
  }));
  return { messages, hasMore: !!data.pagination?.hasMore };
}

export async function fetchTitle(chatId: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/chat/${chatId}/title`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await res.json();
  return data.success && data.title && data.title !== "New Chat" ? data.title : null;
}

export type InitPayload = {
  fileId?: string;
  folderId?: string;
  fileName?: string;
  sectionId?: string;
  sectionTitle?: string;
};

export async function initChat(chatId: string, payload: InitPayload) {
  const res = await fetch(`${API_URL}/api/chat/${chatId}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => null);
}

export async function updateTitle(chatId: string, title: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/chat/${chatId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  return data.success ? data.title : null;
}

/** Open the streaming response; the caller reads the SSE body. */
export function openChatStream(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API_URL}/api/chat-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
}
