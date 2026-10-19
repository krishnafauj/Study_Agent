"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileSpreadsheet, Loader2, Users, X } from "lucide-react";
import { getGroup, listGroups, parseStudentSheet } from "@/src/groups/services";
import { ACCEPTED_SHEET_TYPES, EMAIL_RE } from "@/src/groups/constants";
import type { GroupMember, GroupSummary } from "@/src/groups/types";
import { assignUser } from "../services";

type Mode = "group" | "excel";

/**
 * Assign a book to many students at once — picked from a saved Student Group
 * or read from an Excel/CSV sheet. Shows a review list before assigning.
 */
export function BulkAssignModal({
  fileId, mode, assignedTo, onClose, onDone,
}: {
  fileId: string;
  mode: Mode;
  assignedTo: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(mode === "group");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceLabel, setSourceLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const already = useMemo(() => new Set(assignedTo.map((e) => e.toLowerCase())), [assignedTo]);

  // Load the teacher's groups
  useEffect(() => {
    if (mode !== "group") return;
    listGroups()
      .then(setGroups)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [mode]);

  /** Put a member list into the review step (valid, de-duped, new ones pre-selected). */
  const loadMembers = (list: GroupMember[], label: string) => {
    const seen = new Set<string>();
    const clean = list
      .map((m) => ({ name: m.name?.trim() || "", email: m.email.trim().toLowerCase() }))
      .filter((m) => EMAIL_RE.test(m.email) && !seen.has(m.email) && seen.add(m.email));
    setMembers(clean);
    setSelected(new Set(clean.filter((m) => !already.has(m.email)).map((m) => m.email)));
    setSourceLabel(label);
  };

  const pickGroup = async (id: string) => {
    setGroupId(id);
    setError("");
    setMembers([]);
    if (!id) return;
    setLoading(true);
    try {
      const g = await getGroup(id);
      loadMembers(g.members, g.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pickFile = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const { members: rows } = await parseStudentSheet(file);
      if (!rows.length) setError("No emails found. Use a sheet with Name and Email columns.");
      loadMembers(rows, file.name);
    } catch {
      setError("Couldn't read that file. Use .xlsx or .csv with Name and Email columns.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggle = (email: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email); else n.add(email);
      return n;
    });

  const selectable = members.filter((m) => !already.has(m.email));
  const allOn = selectable.length > 0 && selectable.every((m) => selected.has(m.email));
  const toggleAll = () =>
    setSelected(allOn ? new Set() : new Set(selectable.map((m) => m.email)));

  const assign = async () => {
    if (!selected.size) return;
    setBusy(true);
    setError("");
    try {
      await assignUser(fileId, [...selected].join(","));
      await onDone();
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not assign");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            {mode === "group" ? <Users size={18} className="text-purple-400" /> : <FileSpreadsheet size={18} className="text-green-400" />}
            {mode === "group" ? "Assign a student group" : "Assign from Excel"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {mode === "group" ? (
            groups.length === 0 && !loading ? (
              <p className="text-sm text-gray-400">
                You have no groups yet. Create one in{" "}
                <a href="/profile/groups" className="text-purple-400 hover:underline">Profile → Student Groups</a>.
              </p>
            ) : (
              <select
                value={groupId}
                onChange={(e) => pickGroup(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-white [color-scheme:dark]"
              >
                <option value="" className="bg-gray-950 text-gray-200">Select a group…</option>
                {groups.map((g) => (
                  <option key={g._id} value={g._id} className="bg-gray-950 text-gray-200">{g.name} ({g.memberCount})</option>
                ))}
              </select>
            )
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-700 bg-gray-950 px-3 py-3">
              <span className="text-sm text-gray-400 flex-1">
                {sourceLabel || <>Upload .xlsx or .csv with <b className="text-gray-300">Name</b> and <b className="text-gray-300">Email</b> columns</>}
              </span>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-900/30 text-green-400 hover:bg-green-900/50"
              >
                {sourceLabel ? "Choose another" : "Choose file"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_SHEET_TYPES}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
              />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {loading && <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>}

        {!loading && members.length > 0 && (
          <>
            <div className="px-6 flex items-center justify-between text-xs text-gray-400">
              <button onClick={toggleAll} disabled={!selectable.length} className="hover:text-white disabled:opacity-50">
                {allOn ? "Deselect all" : "Select all"}
              </button>
              <span>{selected.size} of {members.length} selected</span>
            </div>
            <ul className="px-6 py-2 overflow-y-auto flex-1 space-y-1">
              {members.map((m) => {
                const isAlready = already.has(m.email);
                const on = selected.has(m.email);
                return (
                  <li key={m.email}>
                    <button
                      onClick={() => !isAlready && toggle(m.email)}
                      disabled={isAlready}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-left disabled:opacity-50"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-indigo-600 border-indigo-600" : "border-gray-600"}`}>
                        {on && <Check size={12} className="text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-white truncate">{m.name || m.email}</span>
                        {m.name && <span className="block text-xs text-gray-500 truncate">{m.email}</span>}
                      </span>
                      {isAlready && <span className="text-[10px] uppercase tracking-wide text-teal-400">Assigned</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={assign}
            disabled={busy || !selected.size}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Assign {selected.size || ""} {selected.size === 1 ? "student" : "students"}
          </button>
        </div>
      </div>
    </div>
  );
}
