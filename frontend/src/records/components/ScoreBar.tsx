"use client";

import React from "react";
import { SCORE_AVERAGE, SCORE_GOOD } from "../constants";

export function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-900 rounded-full" />
        <span className="text-xs text-gray-600 w-10 text-right">—</span>
      </div>
    );
  }
  const color = score >= SCORE_GOOD ? "bg-emerald-500" : score >= SCORE_AVERAGE ? "bg-yellow-500" : "bg-red-500";
  const text = score >= SCORE_GOOD ? "text-emerald-400" : score >= SCORE_AVERAGE ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-900 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${text}`}>{score.toFixed(0)}%</span>
    </div>
  );
}
