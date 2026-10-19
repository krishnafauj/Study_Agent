"use client";

import React, { useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, Search } from "lucide-react";
import { saveGrantsBulk } from "../services";
import type { GrantByEmail, GrantMode, Mode, Section } from "../types";

type Matrix = Record<string, Record<string, Mode>>; // email -> sectionId -> mode

const MODE_STYLE: Record<Mode, string> = {
  none: "border-gray-700 text-gray-500",
  assign: "border-indigo-600/60 bg-indigo-900/30 text-indigo-200",
  full: "border-emerald-600/60 bg-emerald-900/25 text-emerald-200",
  see: "border-amber-600/50 bg-amber-900/20 text-amber-200",
};

// Options must set their own colours: otherwise they inherit the select's
// light mode text (e.g. indigo-200) on the browser's light popup → unreadable.
const OPTION_CLS = "bg-gray-950 text-gray-200";

function buildMatrix(users: string[], sections: Section[], grants: GrantByEmail): Matrix {
  const m: Matrix = {};
  for (const u of users) {
    const g = grants[u] || grants[u.toLowerCase()] || {};
    m[u] = {};
    for (const s of sections) m[u][s._id] = (g[s._id] as Mode) || "none";
  }
  return m;
}

function ModeSelect({
  value, onChange, placeholder, className = "",
}: {
  value: Mode | "";
  onChange: (m: Mode) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value as Mode)}
      className={`rounded-md border bg-black px-2 py-1 text-xs focus:outline-none [color-scheme:dark] ${value ? MODE_STYLE[value] : "border-gray-700 text-gray-400"} ${className}`}
    >
      {placeholder && <option value="" className={OPTION_CLS}>{placeholder}</option>}
      <option value="none" className={OPTION_CLS}>No access</option>
      <option value="assign" className={OPTION_CLS}>Assign (chat)</option>
      <option value="full" className={OPTION_CLS}>Assign fully (chat + PDF)</option>
      {/* Legacy mode: only shown on cells that still have it */}
      {value === "see" && <option value="see" className={OPTION_CLS}>See (legacy)</option>}
    </select>
  );
}

/**
 * Users × sections permissions table.
 * - Tick users (or "select all"), then apply a mode to all / one section in one go.
 * - Column header dropdown sets that section for every (selected or all) user.
 * - "Save changes" sends only the users that changed, in a single request.
 */
export function PermissionsMatrix({
  fileId, users, sections, grantByEmail, reload, setError,
}: {
  fileId: string;
  users: string[];
  sections: Section[];
  grantByEmail: GrantByEmail;
  reload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const initial = useMemo(() => buildMatrix(users, sections, grantByEmail), [users, sections, grantByEmail]);
  const [matrix, setMatrix] = useState<Matrix>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [bulkSection, setBulkSection] = useState<string>("all");
  const [bulkMode, setBulkMode] = useState<Mode>("assign");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.toLowerCase().includes(q)) : users;
  }, [users, query]);

  const dirtyUsers = useMemo(
    () => users.filter((u) => sections.some((s) => matrix[u]?.[s._id] !== initial[u]?.[s._id])),
    [users, sections, matrix, initial]
  );
  const dirtySet = useMemo(() => new Set(dirtyUsers), [dirtyUsers]);

  const allVisibleSelected = visible.length > 0 && visible.every((u) => selected.has(u));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((u) => n.delete(u));
      else visible.forEach((u) => n.add(u));
      return n;
    });
  const toggleUser = (u: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(u)) n.delete(u); else n.add(u);
      return n;
    });

  const setCell = (u: string, sid: string, mode: Mode) => {
    setSavedMsg("");
    setMatrix((m) => ({ ...m, [u]: { ...m[u], [sid]: mode } }));
  };

  /** Set `mode` for the given section ids on the given users. */
  const applyTo = (targetUsers: string[], sectionIds: string[], mode: Mode) => {
    setSavedMsg("");
    setMatrix((m) => {
      const n = { ...m };
      for (const u of targetUsers) {
        n[u] = { ...n[u] };
        for (const sid of sectionIds) n[u][sid] = mode;
      }
      return n;
    });
  };

  const selectedList = users.filter((u) => selected.has(u));
  const applyBulk = () =>
    applyTo(selectedList, bulkSection === "all" ? sections.map((s) => s._id) : [bulkSection], bulkMode);

  // Column header: apply to selected users, or everyone visible if none selected
  const applyColumn = (sid: string, mode: Mode) =>
    applyTo(selectedList.length ? selectedList : visible, [sid], mode);

  const save = async () => {
    if (!dirtyUsers.length) return;
    setSaving(true);
    setSavedMsg("");
    try {
      await saveGrantsBulk(
        fileId,
        dirtyUsers.map((u) => ({
          email: u,
          sections: sections
            .filter((s) => matrix[u][s._id] !== "none")
            .map((s) => ({ sectionId: s._id, mode: matrix[u][s._id] as GrantMode })),
        }))
      );
      setSavedMsg(`Saved ${dirtyUsers.length} user${dirtyUsers.length === 1 ? "" : "s"}`);
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not save permissions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-gray-700 bg-black px-2 py-1.5 min-w-[200px] flex-1 max-w-xs">
          <Search size={14} className="text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users..."
            className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
          />
        </div>

        <div className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${selectedList.length ? "border-indigo-700/60 bg-indigo-950/30" : "border-gray-800 opacity-60"}`}>
          <span className="text-xs text-gray-300">{selectedList.length} selected — set</span>
          <select
            value={bulkSection}
            onChange={(e) => setBulkSection(e.target.value)}
            disabled={!selectedList.length}
            className="rounded-md border border-gray-700 bg-black px-2 py-1 text-xs [color-scheme:dark]"
          >
            <option value="all" className={OPTION_CLS}>All sections</option>
            {sections.map((s) => <option key={s._id} value={s._id} className={OPTION_CLS}>{s.title}</option>)}
          </select>
          <span className="text-xs text-gray-500">to</span>
          <ModeSelect value={bulkMode} onChange={setBulkMode} />
          <button
            onClick={applyBulk}
            disabled={!selectedList.length}
            className="rounded-md bg-gray-800 px-2.5 py-1 text-xs hover:bg-gray-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {savedMsg && <span className="flex items-center gap-1 text-xs text-green-400"><Check size={13} />{savedMsg}</span>}
          {dirtyUsers.length > 0 && (
            <button
              onClick={() => { setMatrix(initial); setSavedMsg(""); }}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <RotateCcw size={13} /> Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirtyUsers.length}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="animate-spin" size={13} />}
            Save changes{dirtyUsers.length ? ` (${dirtyUsers.length})` : ""}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs">
          <thead className="bg-black text-gray-400">
            <tr>
              <th className="sticky left-0 z-10 bg-black px-3 py-2 text-left font-medium">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-indigo-600" />
                  User
                </label>
              </th>
              {sections.map((s) => (
                <th key={s._id} className="px-3 py-2 text-left font-medium align-top min-w-[150px]">
                  <div className="text-gray-200">{s.title}</div>
                  <div className="text-[10px] text-gray-500 mb-1">pages {s.pageStart}–{s.pageEnd}</div>
                  <ModeSelect
                    value=""
                    placeholder={selectedList.length ? "Set selected…" : "Set all…"}
                    onChange={(m) => applyColumn(s._id, m)}
                    className="w-full"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visible.length === 0 && (
              <tr><td colSpan={sections.length + 1} className="px-3 py-6 text-center text-gray-500">No matching users</td></tr>
            )}
            {visible.map((u) => {
              const isSel = selected.has(u);
              return (
                <tr key={u} className={isSel ? "bg-indigo-950/20" : "hover:bg-gray-900/50"}>
                  <td className={`sticky left-0 z-10 px-3 py-2 ${isSel ? "bg-[#0d0f1f]" : "bg-gray-950"}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={isSel} onChange={() => toggleUser(u)} className="accent-indigo-600" />
                      <span className="text-gray-200 truncate max-w-[220px]">{u}</span>
                      {dirtySet.has(u) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />}
                    </label>
                  </td>
                  {sections.map((s) => (
                    <td key={s._id} className="px-3 py-2">
                      <ModeSelect
                        value={matrix[u]?.[s._id] || "none"}
                        onChange={(m) => setCell(u, s._id, m)}
                        className="w-full"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
