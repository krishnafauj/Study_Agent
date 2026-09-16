"use client";

import React from "react";

export function ChatCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 animate-pulse">
      <div className="mb-3">
        <div className="h-4 w-2/3 rounded bg-neutral-800" />
        <div className="mt-2 h-3 w-1/3 rounded bg-neutral-800/70" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 flex-1 rounded-lg bg-neutral-800" />
        <div className="h-9 w-11 rounded-lg bg-neutral-800" />
        <div className="h-9 w-11 rounded-lg bg-neutral-800" />
      </div>
    </div>
  );
}
