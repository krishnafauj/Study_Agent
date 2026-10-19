"use client";

import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Plus, Trash2, X } from "lucide-react";
import { ACCEPTED_SHEET_TYPES, EMAIL_RE } from "../constants";
import { ApiError, createGroup, downloadTemplate, parseStudentSheet, updateGroup } from "../services";
import type { Group, MemberRow } from "../types";

let keySeq = 0;
const newKey = () => `r${++keySeq}`;
const blankRow = (): MemberRow => ({ key: newKey(), name: "", email: "" });

export function GroupFormModal({
  group,
  onClose,
  onSaved,
}: {
  /** Pass a group to edit it; omit to create a new one. */
  group?: Group | null;
  onClose: () => void;
  onSaved: (g: Group) => void;
}) {
  const isEdit = !!group;
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [rows, setRows] = useState<MemberRow[]>(
    group?.members.length ? group.members.map((m) => ({ ...m, key: newKey() })) : [blankRow()]
  );
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Row-level validation: invalid email or duplicate email
  const rowIssues = useMemo(() => {
    const issues: Record<string, string> = {};
    const seen = new Map<string, string>();
    for (const r of rows) {
      const email = r.email.trim().toLowerCase();
      if (!email && !r.name.trim()) continue;
      if (!EMAIL_RE.test(email)) issues[r.key] = "Invalid email";
      else if (seen.has(email)) issues[r.key] = "Duplicate";
      else seen.set(email, r.key);
    }
    return issues;
  }, [rows]);

  const filledRows = rows.filter((r) => r.email.trim() || r.name.trim());
  const issueCount = Object.keys(rowIssues).length;
  const canSave = !!name.trim() && issueCount === 0 && !saving;

  const updateRow = (key: string, patch: Partial<MemberRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((r) => r.key !== key)));

  const onImport = async (file: File) => {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const { members, skippedNoEmail } = await parseStudentSheet(file);
      const existing = new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean));
      const fresh = members.filter((m) => {
        if (existing.has(m.email)) return false;
        existing.add(m.email);
        return true;
      });
      const dupes = members.length - fresh.length;
      setRows((rs) => {
        const next = [
          ...rs.filter((r) => r.email.trim() || r.name.trim()),
          ...fresh.map((m) => ({ ...m, key: newKey() })),
        ];
        return next.length ? next : [blankRow()];
      });
      const parts = [`Imported ${fresh.length} student${fresh.length === 1 ? "" : "s"}`];
      if (dupes) parts.push(`${dupes} duplicate${dupes === 1 ? "" : "s"} skipped`);
      if (skippedNoEmail) parts.push(`${skippedNoEmail} row${skippedNoEmail === 1 ? "" : "s"} without email skipped`);
      setNotice(parts.join(" • "));
      if (!members.length) setError("No email column found. Use a sheet with Name and Email columns.");
    } catch (e) {
      console.error(e);
      setError("Couldn't read that file. Use .xlsx or .csv with Name and Email columns.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    const payload = {
      name: name.trim(),
      description: description.trim(),
      members: filledRows.map((r) => ({ name: r.name.trim(), email: r.email.trim().toLowerCase() })),
    };
    try {
      const saved = isEdit ? await updateGroup(group!._id, payload) : await createGroup(payload);
      onSaved(saved);
    } catch (e) {
      const err = e as ApiError;
      setError(err.invalid?.length ? `${err.message}: ${err.invalid.map((i) => i.email || `row ${i.row}`).join(", ")}` : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">{isEdit ? "Edit group" : "Create student group"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {/* Name / description */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Group name *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CSE 3rd Year – Sec A"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Import bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-700 bg-gray-950 px-3 py-3">
            <FileSpreadsheet size={18} className="text-green-400" />
            <span className="text-sm text-gray-400 flex-1 min-w-[180px]">
              Import students from Excel (.xlsx) or CSV with <b className="text-gray-300">Name</b> and <b className="text-gray-300">Email</b> columns
            </span>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <Download size={13} /> Template
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
              Import file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_SHEET_TYPES}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            />
          </div>
          {notice && <p className="text-xs text-green-400">{notice}</p>}

          {/* Members table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">
                Students <span className="text-gray-500">({filledRows.length})</span>
              </span>
              {issueCount > 0 && <span className="text-xs text-red-400">{issueCount} row{issueCount === 1 ? "" : "s"} need fixing</span>}
            </div>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <div className="grid grid-cols-[1fr_1.3fr_32px] gap-2 px-3 py-2 bg-gray-950 text-[11px] uppercase tracking-wide text-gray-500">
                <span>Name</span><span>Email</span><span />
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-800">
                {rows.map((r) => {
                  const issue = rowIssues[r.key];
                  return (
                    <div key={r.key} className={`grid grid-cols-[1fr_1.3fr_32px] gap-2 px-3 py-1.5 items-center ${issue ? "bg-red-900/10" : ""}`}>
                      <input
                        value={r.name}
                        onChange={(e) => updateRow(r.key, { name: e.target.value })}
                        placeholder="Student name"
                        className="bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
                      />
                      <div className="min-w-0">
                        <input
                          value={r.email}
                          onChange={(e) => updateRow(r.key, { email: e.target.value })}
                          placeholder="student@email.com"
                          className={`w-full bg-transparent text-sm placeholder-gray-600 focus:outline-none ${issue ? "text-red-300" : "text-white"}`}
                        />
                        {issue && <span className="text-[10px] text-red-400">{issue}</span>}
                      </div>
                      <button onClick={() => removeRow(r.key)} className="p-1 text-gray-600 hover:text-red-400" title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => setRows((rs) => [...rs, blankRow()])}
              className="mt-2 flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
            >
              <Plus size={14} /> Add student
            </button>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-900/10 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save changes" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
