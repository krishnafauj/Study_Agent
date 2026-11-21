// API calls for the voice-viva feature module. Pure functions — no React here.

import type { Assignment, AssignmentResults, GroupOption, NewAssignmentInput, VivaSession } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const token = () => (typeof window !== "undefined" ? localStorage.getItem("authToken") || "" : "");

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

export async function fetchAssignments(fileId: string): Promise<{ isOwner: boolean; assignments: Assignment[] }> {
  const d = await call<{ isOwner: boolean; assignments: Assignment[] }>(`/evaluation/assignments?fileId=${fileId}`);
  return { isOwner: d.isOwner, assignments: d.assignments || [] };
}

export const createAssignment = (input: NewAssignmentInput) =>
  call("/evaluation/assignments", { method: "POST", body: JSON.stringify(input) });

export const updateAssignment = (id: string, input: Partial<Omit<NewAssignmentInput, "fileId">>) =>
  call(`/evaluation/assignments/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const deleteAssignment = (id: string) => call(`/evaluation/assignments/${id}`, { method: "DELETE" });

export async function startAssignment(id: string): Promise<VivaSession> {
  const d = await call<{ session: VivaSession }>(`/evaluation/assignments/${id}/start`, { method: "POST" });
  return d.session;
}

export const fetchResults = (id: string) => call<AssignmentResults & { success: boolean }>(`/evaluation/assignments/${id}/results`);

export async function fetchSession(sessionId: string): Promise<VivaSession> {
  const d = await call<{ session: VivaSession }>(`/evaluation/${sessionId}`);
  return d.session;
}

export async function fetchGroups(): Promise<GroupOption[]> {
  const d = await call<{ groups: GroupOption[] }>("/groups").catch(() => ({ groups: [] }));
  return d.groups || [];
}

/** WebSocket URL for the live viva (token goes in the query — browsers can't set WS headers). */
export function liveVivaUrl(sessionId: string) {
  const base = API_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/ws/viva?token=${encodeURIComponent(token())}&sessionId=${sessionId}`;
}
