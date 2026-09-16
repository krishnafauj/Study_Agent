"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveGrant } from "../services";
import type { Mode, Section } from "../types";

export function UserPermissionCard({
  fileId, email, sections, initial, setError, reload,
}: {
  fileId: string;
  email: string;
  sections: Section[];
  initial: Record<string, "assign" | "see">;
  setError: (e: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [modes, setModes] = useState<Record<string, Mode>>(() => {
    const m: Record<string, Mode> = {};
    for (const s of sections) m[s._id] = (initial[s._id] as Mode) || "none";
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setMode(id: string, mode: Mode) {
    setModes((prev) => ({ ...prev, [id]: mode }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = sections
        .filter((s) => modes[s._id] && modes[s._id] !== "none")
        .map((s) => ({ sectionId: s._id, mode: modes[s._id] as "assign" | "see" }));
      await saveGrant(fileId, { email, sections: payload });
      setSaved(true);
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-black p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{email}</span>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={12} /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <div className="space-y-1.5">
        {sections.map((s) => (
          <div key={s._id} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-300">
              {s.title} <span className="text-gray-500">({s.pageStart}–{s.pageEnd})</span>
            </span>
            <select
              value={modes[s._id] || "none"}
              onChange={(e) => setMode(s._id, e.target.value as Mode)}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
            >
              <option value="none">No access</option>
              <option value="assign">Assign (chat)</option>
              <option value="see">See (view only)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
