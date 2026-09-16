// API calls for the dashboard feature module. Pure functions — no React here.

import { API_URL } from "../constants";
import type { Chat, FileInfo, Section } from "../types";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Sections + ownership for a file (owner → sections, non-owner → mySections). */
export async function fetchSectionsOverview(
  fileId: string
): Promise<{ isOwner: boolean; sections: Section[]; fileName: string }> {
  const res = await fetch(`${API_URL}/api/access/${fileId}/overview`, { headers: authHeaders() });
  const data = await res.json();
  if (!data?.success) return { isOwner: true, sections: [], fileName: "" };
  return {
    isOwner: !!data.isOwner,
    sections: data.isOwner ? data.sections || [] : data.mySections || [],
    fileName: data.fileName || "",
  };
}

export async function fetchFileDetails(fileId: string): Promise<FileInfo | null> {
  const res = await fetch(`${API_URL}/api/files/${fileId}`, { headers: authHeaders() });
  const data = await res.json();
  return data?.success ? (data.file as FileInfo) : null;
}

export async function fetchChatsByFile(fileId: string): Promise<Chat[]> {
  const res = await fetch(`${API_URL}/api/chats/file/${fileId}`, { headers: authHeaders() });
  const data = await res.json();
  return data?.success ? (data.chats as Chat[]) : [];
}

export async function renameChat(chatId: string, title: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/chat/${chatId}/title`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  return data?.success ? (data.title as string) : null;
}

export async function deleteChat(chatId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json();
  return !!data?.success;
}
