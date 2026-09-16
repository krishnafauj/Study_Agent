"use client";

import React from "react";

export function AccessSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Tabs */}
      <div className="mb-6 flex gap-4 border-b border-gray-800 pb-3">
        <div className="h-5 w-32 rounded bg-gray-800" />
        <div className="h-5 w-40 rounded bg-gray-800/70" />
      </div>

      {/* Sections card */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div className="mb-4 h-5 w-48 rounded bg-gray-800" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 w-1/3 rounded bg-gray-800" />
              <div className="h-6 w-24 rounded-full bg-gray-800/70" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-2">
          <div className="h-9 flex-1 min-w-[160px] rounded-md bg-gray-800" />
          <div className="h-9 w-20 rounded-md bg-gray-800" />
          <div className="h-9 w-20 rounded-md bg-gray-800" />
          <div className="h-9 w-20 rounded-md bg-gray-800" />
        </div>
      </div>

      {/* Per-user card */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div className="mb-4 h-5 w-52 rounded bg-gray-800" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-800 bg-black p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="h-4 w-40 rounded bg-gray-800" />
                <div className="h-7 w-16 rounded-md bg-gray-800" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-gray-800/60" />
                <div className="h-4 w-5/6 rounded bg-gray-800/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
