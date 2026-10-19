// API calls for the manage-access feature module (uses the shared axios instance).

import api from "@/lib/axios/api";
import type { GrantMode } from "../types";

export async function getOverview(fileId: string) {
  const res = await api.get(`/api/access/${fileId}/overview`);
  return res.data || {};
}

export async function createSection(
  fileId: string,
  body: { title: string; pageStart: number; pageEnd: number; order?: number }
) {
  const res = await api.post(`/api/access/${fileId}/sections`, body);
  return res.data;
}

export async function deleteSection(fileId: string, sectionId: string) {
  const res = await api.delete(`/api/access/${fileId}/sections/${sectionId}`);
  return res.data;
}

export async function reparseSection(fileId: string, sectionId: string) {
  const res = await api.post(`/api/access/${fileId}/sections/${sectionId}/reparse`);
  return res.data;
}

export async function saveGrant(
  fileId: string,
  body: { email: string; sections: { sectionId: string; mode: GrantMode }[] }
) {
  const res = await api.post(`/api/access/${fileId}/grants`, body);
  return res.data;
}

export async function buildGraph(fileId: string, useLlm = false) {
  const res = await api.post(`/api/access/${fileId}/graph/build`, { useLlm });
  return res.data;
}

/** Chapter topics used by "Suggest from chapters". */
export async function getTopics(fileId: string) {
  const res = await api.get(`/api/topics/${fileId}`);
  return res.data?.topics || res.data || [];
}

export async function assignUser(fileId: string, email: string) {
  const res = await api.post(`/api/files/${fileId}/assign`, { email });
  return res.data;
}

export async function revokeUser(fileId: string, email: string) {
  const res = await api.post(`/api/files/${fileId}/revoke`, { email });
  return res.data;
}

/** Save many users' section permissions in one request. */
export async function saveGrantsBulk(
  fileId: string,
  grants: { email: string; sections: { sectionId: string; mode: GrantMode }[] }[]
) {
  const res = await api.post(`/api/access/${fileId}/grants/bulk`, { grants });
  return res.data;
}
