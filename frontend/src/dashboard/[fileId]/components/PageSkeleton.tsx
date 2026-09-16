"use client";

import React from "react";
import { ChatCardSkeleton } from "./ChatCardSkeleton";
import { SECTION_SKELETON_COUNT, CHAT_SKELETON_COUNT } from "../constants";

export function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8">
        <div className="mb-4 h-6 w-40 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: SECTION_SKELETON_COUNT }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 h-[140px]">
              <div className="h-5 w-1/2 rounded bg-neutral-800" />
              <div className="mt-3 h-3 w-1/3 rounded bg-neutral-800/70" />
              <div className="mt-8 h-3 w-24 ml-auto rounded bg-neutral-800/70" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-6 h-6 w-56 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: CHAT_SKELETON_COUNT }).map((_, i) => (
            <ChatCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
