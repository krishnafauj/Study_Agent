"use client";

import React from "react";
import { MessageSquare, Eye } from "lucide-react";

export function ModeBadge({ mode }: { mode: "assign" | "see" }) {
  return mode === "assign" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950 px-2.5 py-1 text-xs text-indigo-300">
      <MessageSquare size={12} /> Assign
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
      <Eye size={12} /> See
    </span>
  );
}
