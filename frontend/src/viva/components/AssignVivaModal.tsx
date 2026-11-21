"use client";

import React, { useEffect, useState } from "react";
import { X, Loader2, Users } from "lucide-react";
import { createAssignment, fetchGroups, updateAssignment } from "../services";
import type { Assignment, Difficulty, GroupOption } from "../types";

type SectionOption = { _id: string; title: string; pageStart: number; pageEnd: number };

export function AssignVivaModal({
  fileId, sections, editing, onClose, onCreated,
}: {
  fileId: string;
  sections: SectionOption[];
  editing?: Assignment | null; // set → edit mode
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sectionId, setSectionId] = useState<string>(editing ? editing.sectionId || "" : sections[0]?._id || "");
  const [title, setTitle] = useState(editing?.title || "");
  const [emails, setEmails] = useState((editing?.studentEmails || []).join(", "));
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [count, setCount] = useState(editing?.count || 5);
  const [difficulty, setDifficulty] = useState<Difficulty>(editing?.difficulty || "medium");
  const [answerTimeSec, setAnswerTimeSec] = useState(editing?.answerTimeSec || 90);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchGroups().then(setGroups);
  }, []);

  const toggleGroup = (id: string) =>
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const submit = async () => {
    setError("");
    const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (!list.length && !groupIds.length) return setError("Add at least one student email or group");
    setSaving(true);
    try {
      const body = { sectionId: sectionId || null, title, emails: list, groupIds, count, difficulty, answerTimeSec };
      if (editing) await updateAssignment(editing._id, body);
      else await createAssignment({ fileId, ...body });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-teal-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">{editing ? "Edit viva" : "Assign a voice viva"}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-neutral-300">Section</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={`${field} mt-1`}>
              <option value="">Whole book</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>{s.title} (pages {s.pageStart}–{s.pageEnd})</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-neutral-300">Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DP viva – week 3" className={`${field} mt-1`} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm text-neutral-300">Questions</span>
              <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} mt-1`} />
            </label>
            <label className="block">
              <span className="text-sm text-neutral-300">Difficulty</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={`${field} mt-1`}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-neutral-300">Time / answer</span>
              <select value={answerTimeSec} onChange={(e) => setAnswerTimeSec(Number(e.target.value))} className={`${field} mt-1`}>
                {[30, 45, 60, 90, 120, 180, 300].map((t) => (
                  <option key={t} value={t}>{t < 60 ? `${t}s` : `${t / 60} min`}</option>
                ))}
              </select>
            </label>
          </div>

          {groups.length > 0 && (
            <div>
              <span className="text-sm text-neutral-300">Groups</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {groups.map((g) => {
                  const on = groupIds.includes(g._id);
                  return (
                    <button
                      key={g._id}
                      onClick={() => toggleGroup(g._id)}
                      className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 border transition-colors ${on ? "bg-teal-600/20 border-teal-500 text-teal-300" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}
                    >
                      <Users size={12} /> {g.name} · {g.memberCount}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-sm text-neutral-300">Student emails</span>
            <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={3} placeholder="one@college.edu, two@college.edu" className={`${field} mt-1 resize-none`} />
          </label>

          {editing && <p className="text-xs text-neutral-500">Changes apply to new attempts. Finished attempts keep their original settings.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />} {editing ? "Save changes" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
