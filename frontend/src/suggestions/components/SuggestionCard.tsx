"use client";

import React from "react";
import { CategoryBadge } from "./CategoryBadge";
import type { Suggestion } from "../types";

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 flex flex-col hover:border-purple-500/50 transition-colors shadow-lg hover:shadow-purple-900/20">
      <div className="flex items-start justify-between mb-4">
        <CategoryBadge category={String(suggestion.category)} />
      </div>
      <h3 className="text-lg font-bold text-white mb-2 leading-tight">{suggestion.title}</h3>
      <p className="text-gray-400 text-sm mb-6 flex-1">{suggestion.description}</p>
      <div className="pt-4 border-t border-gray-800 mt-auto">
        <p className="text-xs text-gray-500 font-medium">
          <span className="uppercase tracking-wider text-gray-600 mr-2">Based on:</span>
          <span className="text-purple-300/80">{suggestion.relatedTopic}</span>
        </p>
      </div>
    </div>
  );
}
