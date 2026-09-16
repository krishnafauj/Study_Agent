"use client";

import React from "react";
import { Trophy, Target, FileText } from "lucide-react";

export function GlobalStats({
  avgScore, totalAttempted, totalTopics,
}: {
  avgScore: number | null;
  totalAttempted: number;
  totalTopics: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
        <Trophy className="mx-auto mb-2 text-yellow-400" size={24} />
        <p className="text-2xl font-black text-white">{avgScore !== null ? `${avgScore.toFixed(0)}%` : "—"}</p>
        <p className="text-xs text-gray-500 mt-1">Overall Average</p>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
        <Target className="mx-auto mb-2 text-blue-400" size={24} />
        <p className="text-2xl font-black text-white">{totalAttempted}</p>
        <p className="text-xs text-gray-500 mt-1">Topics Attempted</p>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
        <FileText className="mx-auto mb-2 text-purple-400" size={24} />
        <p className="text-2xl font-black text-white">{totalTopics}</p>
        <p className="text-xs text-gray-500 mt-1">Total Topics</p>
      </div>
    </div>
  );
}
