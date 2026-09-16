"use client";

import React, { RefObject } from "react";
import { Share2, Pencil, Check, X as XIcon, BookOpen } from "lucide-react";
import type { SectionInfo } from "../types";

export function ChatHeader({
  id, chatTitle, section,
  isRenamingTitle, setIsRenamingTitle, renameValue, setRenameValue, titleInputRef,
  onSubmitRename, onStartRename, onShare,
}: {
  id: string;
  chatTitle: string;
  section: SectionInfo;
  isRenamingTitle: boolean;
  setIsRenamingTitle: (v: boolean) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onSubmitRename: () => void;
  onStartRename: () => void;
  onShare: () => void;
}) {
  return (
    <header className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 bg-neutral-900 border-b border-neutral-800 shrink-0">
      <div className="flex items-center gap-2 group/title">
        {isRenamingTitle ? (
          <div className="flex items-center gap-2">
            <input
              ref={titleInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmitRename();
                if (e.key === "Escape") setIsRenamingTitle(false);
              }}
              className="bg-neutral-950 border border-purple-500 rounded-lg px-3 py-1 text-white text-sm outline-none w-48 md:w-72"
              maxLength={80}
            />
            <button onClick={onSubmitRename} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
            <button onClick={() => setIsRenamingTitle(false)} className="text-neutral-500 hover:text-white"><XIcon size={16} /></button>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-white font-semibold text-base leading-tight tracking-wide">
                {chatTitle || <span className="text-neutral-400 font-normal italic text-sm">New Chat</span>}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-neutral-600 text-xs font-mono">#{id?.slice(0, 8) || "new"}</p>
                {section && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950 px-2 py-0.5 text-[11px] text-indigo-300">
                    <BookOpen size={11} />
                    {section.title || "Section"}
                    {section.pageStart && section.pageEnd ? ` · p.${section.pageStart}–${section.pageEnd}` : ""}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onStartRename}
              className="opacity-0 group-hover/title:opacity-100 p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-purple-400 transition-all"
              title="Rename chat"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>
      <button
        onClick={onShare}
        className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors text-sm font-medium"
      >
        <Share2 size={16} />
        <span className="hidden sm:inline">Share</span>
      </button>
    </header>
  );
}
