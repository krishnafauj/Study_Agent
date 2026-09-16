"use client";

import React from "react";
import { SUGGESTIONS_SKELETON_COUNT } from "../constants";

export function SuggestionsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: SUGGESTIONS_SKELETON_COUNT }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-800 bg-gray-950 p-6 h-48 flex flex-col justify-between">
          <div>
            <div className="w-24 h-6 bg-gray-900 rounded mb-4" />
            <div className="w-full h-6 bg-gray-900 rounded mb-2" />
            <div className="w-3/4 h-6 bg-gray-900 rounded" />
          </div>
          <div className="w-1/2 h-4 bg-gray-900 rounded" />
        </div>
      ))}
    </div>
  );
}
