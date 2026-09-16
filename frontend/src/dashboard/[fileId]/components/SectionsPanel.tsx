"use client";

import React from "react";
import { BookOpen, Plus, ChevronRight, ShieldCheck } from "lucide-react";
import { SectionStatusBadge } from "./SectionStatusBadge";
import type { Section } from "../types";

export function SectionsPanel({
  sections, isOwner, onManage, onChat,
}: {
  sections: Section[];
  isOwner: boolean;
  onManage: () => void;
  onChat: (s: Section) => void;
}) {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen size={24} className="text-blue-500" />
          Sections
        </h2>
        {isOwner && sections.length > 0 && (
          <button onClick={onManage} className="text-sm font-medium text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
            Manage sections <ChevronRight size={14} />
          </button>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-dashed border-neutral-800">
          <ShieldCheck size={44} className="mx-auto text-neutral-600 mb-4" />
          <p className="text-neutral-300 font-medium mb-1">No sections yet</p>
          <p className="text-neutral-500 text-sm mb-4 max-w-md mx-auto">
            {isOwner
              ? "This document isn’t parsed as a whole. Create page-range sections and each one is parsed on its own."
              : "You haven’t been given access to any sections of this document yet."}
          </p>
          {isOwner && (
            <button
              onClick={onManage}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-700 text-white font-semibold transition-all duration-200"
            >
              <Plus size={18} />
              Create Sections
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((s) => (
            <div key={s._id} className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 transition-colors flex flex-col h-full group">
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-white leading-snug group-hover:text-blue-400 transition-colors">{s.title}</h3>
                  <SectionStatusBadge section={s} />
                </div>
                <p className="text-sm text-neutral-400">Pages {s.pageStart}–{s.pageEnd}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-end">
                <button
                  onClick={() => onChat(s)}
                  disabled={s.parseStatus === "parsing"}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-40"
                >
                  Chat about this <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
