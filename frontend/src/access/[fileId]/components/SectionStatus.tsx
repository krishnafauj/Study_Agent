"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { Section } from "../types";

export function SectionStatus({ section, onReparse }: { section: Section; onReparse: () => void }) {
  const status = section.parseStatus || "unparsed";

  if (status === "parsing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 px-2.5 py-1 text-xs text-amber-300">
        <Loader2 className="animate-spin" size={12} />
        Parsing{typeof section.parseProgress === "number" ? ` ${section.parseProgress}%` : "…"}
      </span>
    );
  }
  if (status === "parsed") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 px-2.5 py-1 text-xs text-emerald-300">
          <CheckCircle2 size={12} /> Parsed{section.topicsCreated ? ` · ${section.topicsCreated} topics` : ""}
        </span>
        <button
          onClick={onReparse}
          title="Re-parse this section (e.g. after changing the parser model)"
          className="rounded-full p-1 text-gray-500 hover:bg-gray-800 hover:text-emerald-300"
        >
          <RefreshCw size={12} />
        </button>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <button
        onClick={onReparse}
        title={section.parseError || "Parse failed — click to retry"}
        className="inline-flex items-center gap-1 rounded-full bg-red-950 px-2.5 py-1 text-xs text-red-300 hover:bg-red-900"
      >
        <AlertTriangle size={12} /> Failed · retry
      </button>
    );
  }
  return (
    <button
      onClick={onReparse}
      className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700"
    >
      <RefreshCw size={12} /> Parse
    </button>
  );
}
