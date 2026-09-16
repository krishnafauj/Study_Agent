"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Section } from "../types";

export function SectionStatusBadge({ section }: { section: Section }) {
  const status = section.parseStatus;
  if (status === "parsing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-300">
        <Loader2 className="animate-spin" size={11} />
        {typeof section.parseProgress === "number" ? `${section.parseProgress}%` : "Parsing"}
      </span>
    );
  }
  if (status === "parsed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
        <CheckCircle2 size={11} /> {section.topicsCreated ? `${section.topicsCreated}` : "Parsed"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">
        <AlertTriangle size={11} /> Failed
      </span>
    );
  }
  return null;
}
