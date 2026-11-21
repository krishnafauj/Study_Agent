"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, AlertTriangle, Clock } from "lucide-react";
import { fetchResults } from "../services";
import type { AssignmentResults } from "../types";

const verdictColor = (v?: string | null) =>
  v === "correct" ? "text-emerald-400" : v === "partial" ? "text-amber-400" : "text-red-400";

export function VivaResults({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [data, setData] = useState<AssignmentResults | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchResults(assignmentId).then(setData).catch((e) => setError(e.message));
  }, [assignmentId]);

  if (error) return <p className="p-8 text-red-400">{error}</p>;
  if (!data) return <div className="p-8"><div className="h-40 rounded-xl bg-neutral-900 animate-pulse" /></div>;

  const { assignment: a, attempts, notStarted } = data;
  const completed = attempts.filter((x) => x.status === "completed");
  const avg = completed.length
    ? Math.round((completed.reduce((t, x) => t + x.totalScore / (x.maxScore || 1), 0) / completed.length) * 100)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <button onClick={() => router.push(`/dashboard/${a.fileId}`)} className="text-neutral-400 hover:text-white flex items-center gap-2 mb-6">
          <ArrowLeft size={18} /> Back to book
        </button>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="text-neutral-400 text-sm mt-1">{a.sectionTitle || "Whole book"} · {a.count} questions · {a.difficulty}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
          {[
            ["Assigned", a.studentEmails.length],
            ["Attempted", new Set(attempts.map((x) => x.userEmail)).size],
            ["Completed", completed.length],
            ["Average", avg === null ? "—" : `${avg}%`],
          ].map(([k, val]) => (
            <div key={k as string} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-xs text-neutral-500">{k}</p>
              <p className="text-2xl font-bold mt-1">{val}</p>
            </div>
          ))}
        </div>

        <h2 className="font-semibold mb-3">Attempts</h2>
        {attempts.length === 0 && <p className="text-neutral-500 text-sm mb-6">No attempts yet.</p>}
        <div className="space-y-3 mb-8">
          {attempts.map((t) => {
            const isOpen = open === t.sessionId;
            const flags = t.fullscreenExits + t.tabSwitches;
            return (
              <div key={t.sessionId} className="bg-neutral-900 border border-neutral-800 rounded-xl">
                <button onClick={() => setOpen(isOpen ? null : t.sessionId)} className="w-full p-4 flex items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.userEmail || "Unknown"}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{new Date(t.startedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {flags > 0 && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title={`${t.fullscreenExits} full-screen exits, ${t.tabSwitches} tab switches`}>
                        <AlertTriangle size={14} /> {flags} flag{flags > 1 ? "s" : ""}
                      </span>
                    )}
                    {t.status === "completed" ? (
                      <span className="font-semibold">{t.totalScore}/{t.maxScore}</span>
                    ) : (
                      <span className="text-xs text-neutral-400 flex items-center gap-1"><Clock size={14} /> In progress</span>
                    )}
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-neutral-800 pt-4">
                    {t.report?.summary && <p className="text-sm text-neutral-300">{t.report.summary}</p>}
                    {t.report?.weakTopics?.length ? (
                      <p className="text-sm text-neutral-400"><b className="text-neutral-300">Weak topics:</b> {t.report.weakTopics.join(", ")}</p>
                    ) : null}
                    {t.questions.map((q, i) => (
                      <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
                        <div className="flex justify-between gap-3">
                          <p className="text-sm font-medium">{i + 1}. {q.question}</p>
                          <span className={`text-sm font-semibold shrink-0 ${verdictColor(q.verdict)}`}>{q.score ?? "—"}/10</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">{q.topic}</p>
                        <p className="text-sm text-neutral-400 mt-2"><b className="text-neutral-300">Student said:</b> {q.transcript ?? "not answered"}</p>
                        <p className="text-sm text-neutral-400 mt-1"><b className="text-neutral-300">Model answer:</b> {q.referenceAnswer}</p>
                        {q.feedback && <p className="text-sm text-neutral-300 mt-1">{q.feedback}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {notStarted.length > 0 && (
          <>
            <h2 className="font-semibold mb-3">Not started ({notStarted.length})</h2>
            <div className="flex flex-wrap gap-2">
              {notStarted.map((e) => (
                <span key={e} className="text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1 text-neutral-300">{e}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
