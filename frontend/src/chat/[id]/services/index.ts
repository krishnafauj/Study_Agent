// API calls for the chat feature module. SSE parsing stays in the hook; this
// module owns the plain request wrappers.

import { API_URL, HISTORY_PAGE_SIZE } from "../constants";
import type { Message, ReadableSection } from "../types";

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

/**
 * Sections whose PDF pages the caller may read: every section for the owner,
 * only "full"-mode sections for invited users.
 */
export async function getReadableSections(fileId: string): Promise<ReadableSection[]> {
  const res = await fetch(`${API_URL}/api/access/${fileId}/my-scope`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await res.json().catch(() => null);
  if (!data?.success) return [];
  const list = (data.sections || []) as (ReadableSection & { mode?: string })[];
  return list
    .filter((s) => data.isOwner || s.mode === "full")
    .map(({ _id, title, pageStart, pageEnd }) => ({ _id, title, pageStart, pageEnd }));
}

/** Download just one section's pages as a PDF blob (server cuts the page range). */
export async function fetchSectionPdf(fileId: string, sectionId: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/access/${fileId}/sections/${sectionId}/pdf`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "Could not load these pages");
  }
  return res.blob();
}
