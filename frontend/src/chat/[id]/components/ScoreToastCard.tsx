"use client";

import React from "react";
import type { ScoreToast } from "../types";

export function ScoreToastCard({ toast, onClose }: { toast: ScoreToast; onClose: () => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-4 duration-300">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border max-w-xs
        ${toast.weakFlag ? "bg-orange-950/90 border-orange-700/50 text-orange-200" : "bg-emerald-950/90 border-emerald-700/50 text-emerald-200"} backdrop-blur-md`}>
        <div className={`text-2xl font-black shrink-0 leading-none ${toast.weakFlag ? "text-orange-400" : "text-emerald-400"}`}>
          {toast.score >= 8 ? "🌟" : toast.score >= 6 ? "✅" : toast.score >= 4 ? "📝" : "⚠️"}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-0.5">Score Recorded</p>
          <p className="font-bold text-sm leading-tight truncate">{toast.topicName}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-lg font-black ${toast.weakFlag ? "text-orange-300" : "text-emerald-300"}`}>
              {toast.score}/{toast.total}
            </span>
            <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${toast.weakFlag ? "bg-orange-400" : "bg-emerald-400"}`}
                style={{ width: `${toast.performanceScore}%` }}
              />
            </div>
            <span className="text-xs opacity-70">{Math.round(toast.performanceScore)}%</span>
          </div>
          {toast.weakFlag && <p className="text-xs text-orange-400 mt-1">💡 Needs more practice</p>}
        </div>
        <button onClick={onClose} className="text-current opacity-40 hover:opacity-80 shrink-0 mt-0.5">✕</button>
      </div>
    </div>
  );
}
