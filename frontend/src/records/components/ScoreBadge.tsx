"use client";

import React from "react";
import { SCORE_AVERAGE, SCORE_GOOD } from "../constants";

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-xs px-2 py-1 rounded-full bg-gray-900 text-gray-500 border border-gray-800">Not attempted</span>;
  if (score >= SCORE_GOOD)
    return <span className="text-xs px-2 py-1 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/30">✓ Good</span>;
  if (score >= SCORE_AVERAGE)
    return <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800/30">⚡ Average</span>;
  return <span className="text-xs px-2 py-1 rounded-full bg-red-900/30 text-red-400 border border-red-800/30">⚠ Needs Work</span>;
}
