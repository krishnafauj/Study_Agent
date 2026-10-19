// API calls + sheet parsing for the student-groups feature module.

import { readSheet } from "read-excel-file/browser";
import { API_URL, EMAIL_HEADER_RE, EMAIL_RE, NAME_HEADER_RE } from "../constants";
import type { Group, GroupInput, GroupSummary, ImportResult, GroupMember } from "../types";

function headers(json = false): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export class ApiError extends Error {
  invalid?: { row: number; email: string; name: string }[];
  constructor(message: string, invalid?: ApiError["invalid"]) {
    super(message);
    this.invalid = invalid;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new ApiError(data.message || `Request failed (${res.status})`, data.invalid);
  }
  return data as T;
}

export async function listGroups(): Promise<GroupSummary[]> {
  const data = await request<{ groups: GroupSummary[] }>("/groups", { headers: headers() });
  return data.groups;
}

export async function getGroup(id: string): Promise<Group> {
  const data = await request<{ group: Group }>(`/groups/${id}`, { headers: headers() });
  return data.group;
}

export async function createGroup(input: GroupInput): Promise<Group> {
  const data = await request<{ group: Group }>("/groups", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  return data.group;
}

export async function updateGroup(id: string, input: Partial<GroupInput>): Promise<Group> {
  const data = await request<{ group: Group }>(`/groups/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  return data.group;
}

export async function deleteGroup(id: string): Promise<void> {
  await request(`/groups/${id}`, { method: "DELETE", headers: headers() });
}

// ── Sheet import ────────────────────────────────────────────────────────────

/** Minimal CSV parser (handles quoted fields with commas / escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Read an .xlsx or .csv file and pull out { name, email } rows.
 * Uses the header row ("Name", "Email", "Student Name", "E-mail"...) when
 * present; otherwise guesses the email column as the one containing "@".
 */
export async function parseStudentSheet(file: File): Promise<ImportResult> {
  let grid: string[][];
  if (file.name.toLowerCase().endsWith(".csv")) {
    grid = parseCsv(await file.text());
  } else {
    const data = await readSheet(file);
    grid = data.map((r) => r.map((c) => (c == null ? "" : String(c))));
  }
  grid = grid
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
  if (!grid.length) return { members: [], skippedNoEmail: 0 };

  const head = grid[0];
  let emailCol = head.findIndex((c) => EMAIL_HEADER_RE.test(c));
  let nameCol = head.findIndex((c, i) => i !== emailCol && NAME_HEADER_RE.test(c));
  let body = grid;

  if (emailCol >= 0) {
    body = grid.slice(1);
  } else {
    // No header — find the column with the most "@"s
    const width = Math.max(...grid.map((r) => r.length));
    let best = -1, bestCount = 0;
    for (let c = 0; c < width; c++) {
      const n = grid.filter((r) => EMAIL_RE.test(r[c] ?? "")).length;
      if (n > bestCount) { best = c; bestCount = n; }
    }
    emailCol = best;
    // If the first row isn't an email, treat it as a header we didn't recognise
    if (emailCol >= 0 && !EMAIL_RE.test(grid[0][emailCol] ?? "")) body = grid.slice(1);
  }
  if (nameCol < 0) {
    // First column that isn't the email column and has text
    const width = Math.max(...body.map((r) => r.length), 0);
    for (let c = 0; c < width; c++) {
      if (c !== emailCol && body.some((r) => (r[c] ?? "") && !EMAIL_RE.test(r[c]))) { nameCol = c; break; }
    }
  }

  let skippedNoEmail = 0;
  const members: GroupMember[] = [];
  for (const r of body) {
    const email = emailCol >= 0 ? (r[emailCol] ?? "").toLowerCase() : "";
    const name = nameCol >= 0 ? (r[nameCol] ?? "") : "";
    if (!email) { skippedNoEmail++; continue; }
    members.push({ name, email });
  }
  return { members, skippedNoEmail };
}

/** Downloads a blank Name/Email template the teacher can fill in Excel. */
export function downloadTemplate() {
  const csv = "Name,Email\nAarav Sharma,aarav@example.com\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "student-group-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
