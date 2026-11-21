"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Volume2, Loader2, RotateCcw, Check, Maximize, AlertTriangle, X, Trophy } from "lucide-react";
import { useLiveViva } from "../hooks/useLiveViva";
import type { VivaSession } from "../types";

const PHASE_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  speaking: "Examiner is speaking",
  listening: "Listening… answer out loud",
  thinking: "Evaluating your answer…",
  completed: "Viva complete",
  error: "Disconnected",
};

const verdictColor = (v?: string | null) =>
  v === "correct" ? "text-emerald-400" : v === "partial" ? "text-amber-400" : "text-red-400";

export function LiveVivaScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const v = useLiveViva(sessionId);
  const s = v.session;
  const started = v.phase !== "ready";
  const finished = s?.status === "completed";
  const exit = () => router.push(s?.fileId ? `/dashboard/${s.fileId}` : "/home");

  return (
    <div ref={boxRef} className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Mic className="text-teal-400" size={22} />
          <span className="font-semibold">Voice Viva</span>
          {s && (
            <span className="text-sm text-neutral-400">
              Question {Math.min(s.currentIndex + 1, s.totalQuestions)} / {s.totalQuestions} · {s.difficulty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {s && <span className="text-sm text-neutral-300">Score <b className="text-white">{s.totalScore}</b> / {s.maxScore}</span>}
          {(finished || !started || v.phase === "error") && (
            <button onClick={exit} className="text-neutral-400 hover:text-white"><X size={20} /></button>
          )}
        </div>
      </div>

      {/* progress */}
      {s && (
        <div className="h-1 bg-neutral-900">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${(s.answered.length / s.totalQuestions) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!started ? (
          /* pre-start */
          <div className="max-w-xl mx-auto px-6 py-16 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-teal-600/20 flex items-center justify-center mb-6">
              <Mic size={36} className="text-teal-400" />
            </div>
            <h1 className="text-2xl font-bold mb-3">Ready for your viva?</h1>
            <ul className="text-neutral-300 text-sm space-y-2 text-left bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
              <li>• The examiner will ask questions out loud. Answer by speaking.</li>
              <li>• Press <b>Done</b> when you finish, or pause for a few seconds.</li>
              <li>• The test runs in <b>full screen</b>. Leaving full screen or switching tabs is recorded.</li>
              <li>• Use headphones if you can, and sit somewhere quiet.</li>
            </ul>
            {v.error && <p className="text-red-400 text-sm mb-4">{v.error}</p>}
            <button onClick={() => v.begin(boxRef.current)} className="px-8 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 font-semibold inline-flex items-center gap-2">
              <Maximize size={18} /> Enter full screen &amp; start
            </button>
          </div>
        ) : finished ? (
          <Report session={s!} onExit={exit} />
        ) : (
          /* live */
          <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col items-center">
            <Orb phase={v.phase} level={v.micLevel} />
            <p className="mt-4 text-sm text-neutral-400">{PHASE_LABEL[v.phase] || ""}</p>
            {v.phase === "listening" && v.listenStartedAt && s && (
              <Countdown startedAt={v.listenStartedAt} limitSec={s.answerTimeSec || 90} />
            )}

            {s?.currentQuestion && (
              <p className="mt-2 text-xs uppercase tracking-wide text-teal-400">{s.currentQuestion.topic}</p>
            )}
            <p className="mt-3 text-xl md:text-2xl font-semibold text-center leading-relaxed">
              {s?.currentQuestion?.question || v.aiText}
            </p>

            {/* live captions */}
            <div className="mt-8 w-full min-h-[96px] rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <p className="text-xs text-neutral-500 mb-1">Your answer (live)</p>
              <p className="text-neutral-100">{v.caption || <span className="text-neutral-600">{v.phase === "listening" ? "Start speaking…" : "—"}</span>}</p>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={v.done} disabled={v.phase !== "listening"} className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 font-semibold flex items-center gap-2">
                <Check size={18} /> Done
              </button>
              <button onClick={v.repeat} disabled={v.phase !== "listening"} className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2">
                <RotateCcw size={16} /> Repeat question
              </button>
            </div>

            {v.error && <p className="mt-4 text-sm text-red-400">{v.error}</p>}

            {v.lastEvaluated && (
              <div className="mt-8 w-full rounded-xl bg-neutral-900/60 border border-neutral-800 p-4">
                <p className="text-xs text-neutral-500 mb-1">Previous answer</p>
                <p className={`font-semibold ${verdictColor(v.lastEvaluated.verdict)}`}>
                  {v.lastEvaluated.score}/10 · {v.lastEvaluated.verdict}
                </p>
                <p className="text-sm text-neutral-300 mt-1">{v.lastEvaluated.feedback}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* must stay in full screen */}
      {started && !finished && !v.isFullscreen && v.phase !== "error" && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-10">
          <div className="text-center max-w-sm px-6">
            <AlertTriangle size={40} className="mx-auto text-amber-400 mb-4" />
            <h2 className="text-xl font-bold mb-2">You left full screen</h2>
            <p className="text-neutral-400 text-sm mb-6">This has been recorded. Return to full screen to continue your viva.</p>
            <button onClick={() => v.enterFullscreen(boxRef.current)} className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 font-semibold inline-flex items-center gap-2">
              <Maximize size={16} /> Return to full screen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Countdown({ startedAt, limitSec }: { startedAt: number; limitSec: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil(limitSec - (now - startedAt) / 1000));
  const low = left <= 10;
  return (
    <p className={`mt-1 text-sm font-mono ${low ? "text-red-400" : "text-neutral-300"}`}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
    </p>
  );
}

function Orb({ phase, level }: { phase: string; level: number }) {
  const scale = phase === "listening" ? 1 + Math.min(level, 1) * 0.35 : 1;
  const color =
    phase === "listening" ? "bg-teal-500" : phase === "speaking" ? "bg-purple-500" : phase === "thinking" ? "bg-amber-500" : "bg-neutral-700";
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <div className={`absolute inset-0 rounded-full ${color} opacity-20 ${phase === "speaking" ? "animate-ping" : ""}`} />
      <div className={`w-24 h-24 rounded-full ${color} flex items-center justify-center transition-transform duration-75`} style={{ transform: `scale(${scale})` }}>
        {phase === "thinking" || phase === "connecting" ? <Loader2 className="animate-spin" size={32} /> : phase === "speaking" ? <Volume2 size={32} /> : <Mic size={32} />}
      </div>
    </div>
  );
}

function Report({ session, onExit }: { session: VivaSession; onExit: () => void }) {
  const r = session.report;
  const pct = session.maxScore ? Math.round((session.totalScore / session.maxScore) * 100) : 0;
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <Trophy size={40} className="mx-auto text-amber-400 mb-3" />
        <h1 className="text-3xl font-bold">{session.totalScore} / {session.maxScore}</h1>
        <p className="text-neutral-400">{pct}%</p>
      </div>
      {r?.summary && <p className="text-neutral-200 bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">{r.summary}</p>}

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[["Strengths", r?.strengths], ["Revise", r?.weakTopics], ["Next steps", r?.nextSteps]].map(([title, list]) => (
          <div key={title as string} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-sm font-semibold mb-2">{title as string}</p>
            <ul className="text-sm text-neutral-300 space-y-1">
              {((list as string[]) || []).map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {session.answered.map((q, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex justify-between gap-3">
              <p className="font-medium">{i + 1}. {q.question}</p>
              <span className={`shrink-0 font-semibold ${verdictColor(q.verdict)}`}>{q.score}/10</span>
            </div>
            <p className="text-sm text-neutral-400 mt-2"><b className="text-neutral-300">You said:</b> {q.transcript || "—"}</p>
            <p className="text-sm text-neutral-400 mt-1"><b className="text-neutral-300">Model answer:</b> {q.referenceAnswer}</p>
            {q.feedback && <p className="text-sm text-neutral-300 mt-1">{q.feedback}</p>}
          </div>
        ))}
      </div>

      <div className="text-center mt-8">
        <button onClick={onExit} className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 font-semibold">Back to book</button>
      </div>
    </div>
  );
}
