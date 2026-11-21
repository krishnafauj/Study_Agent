"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Mic, BarChart3, Trash2, Loader2, Play, Pencil, Timer } from "lucide-react";
import { deleteAssignment, fetchAssignments, startAssignment } from "../services";
import type { Assignment } from "../types";
import { AssignVivaModal } from "./AssignVivaModal";

type SectionOption = { _id: string; title: string; pageStart: number; pageEnd: number };

export function AssignmentsPanel({ fileId, sections }: { fileId: string; sections: SectionOption[] }) {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fetchAssignments(fileId);
      setIsOwner(d.isOwner);
      setItems(d.assignments);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (fileId) load();
  }, [fileId, load]);

  const start = async (a: Assignment) => {
    setError("");
    setStartingId(a._id);
    try {
      const s = await startAssignment(a._id);
      router.push(`/viva/${s.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      setStartingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this assignment? Student attempts stay saved.")) return;
    await deleteAssignment(id).catch(() => {});
    setItems((prev) => prev.filter((a) => a._id !== id));
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardCheck size={24} className="text-teal-500" />
            Assignments
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            {isOwner ? "Voice vivas you assigned on this book" : "Voice vivas assigned to you"}
          </p>
        </div>
        {isOwner && (
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="shrink-0 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center gap-1.5">
            <Plus size={16} /> Assign viva
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {loading ? (
        <div className="h-32 rounded-xl bg-neutral-900 border border-neutral-800 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <Mic size={44} className="mx-auto text-neutral-600 mb-3" />
          <p className="text-neutral-400">{isOwner ? "No vivas assigned yet" : "Nothing assigned to you yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((a) => {
            const s = a.stats;
            const done = s.bestScore !== null;
            return (
              <div
                key={a._id}
                onClick={() => isOwner && router.push(`/viva/results/${a._id}`)}
                className={`p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors ${isOwner ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{a.title}</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      {a.sectionTitle || "Whole book"} · {a.count} questions · {a.difficulty} ·{" "}
                      <Timer size={11} className="inline -mt-0.5" /> {a.answerTimeSec < 60 ? `${a.answerTimeSec}s` : `${a.answerTimeSec / 60} min`}/answer
                    </p>
                  </div>
                  {isOwner ? (
                    <span className="text-xs text-neutral-300 bg-neutral-800 rounded-full px-2.5 py-1 shrink-0">
                      {s.studentsAttempted}/{a.studentCount} attempted
                    </span>
                  ) : done ? (
                    <span className="text-xs text-teal-300 bg-teal-900/30 rounded-full px-2.5 py-1 shrink-0">
                      Best {s.bestScore}/{s.maxScore}
                    </span>
                  ) : null}
                </div>

                <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  {isOwner ? (
                    <>
                      <button onClick={() => router.push(`/viva/results/${a._id}`)} className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium flex items-center justify-center gap-2">
                        <BarChart3 size={14} /> Results
                      </button>
                      <button onClick={() => { setEditing(a); setShowModal(true); }} title="Edit settings" className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => start(a)} title="Test-run this viva yourself" className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200">
                        {startingId === a._id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      </button>
                      <button onClick={() => remove(a._id)} className="px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => start(a)}
                      disabled={!!startingId}
                      className="flex-1 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      {startingId === a._id ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                      {s.inProgressSessionId ? "Resume viva" : done ? "Retake viva" : "Start viva"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AssignVivaModal
          key={editing?._id || "new"}
          fileId={fileId}
          sections={sections}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onCreated={load}
        />
      )}
    </div>
  );
}
