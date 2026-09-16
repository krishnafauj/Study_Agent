"use client";

import React from "react";
import { QUICK_SUGGESTIONS } from "../constants";

export function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
      {QUICK_SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-purple-500/50 hover:bg-neutral-800 text-neutral-400 hover:text-white text-sm transition-all"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
