"use client";

import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Loader2, Search } from "lucide-react";
import type { Book } from "../types";

export function BookSelect({
  books,
  selected,
  onSelect,
  loading,
}: {
  books: Book[];
  selected: Book | null;
  onSelect: (book: Book) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = query.trim()
    ? books.filter((b) => b.fileName.toLowerCase().includes(query.toLowerCase()))
    : books;

  const label = loading
    ? "Loading books..."
    : selected?.fileName ?? (books.length ? "Select a book" : "No books yet");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !loading && books.length && setOpen((o) => !o)}
        disabled={loading || !books.length}
        className={`flex items-center gap-1.5 max-w-[150px] px-2.5 py-1.5 rounded-lg border text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          selected
            ? "border-purple-500/50 bg-purple-500/10 text-purple-200"
            : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-purple-500/50"
        }`}
      >
        {loading ? <Loader2 size={13} className="animate-spin shrink-0" /> : <BookOpen size={13} className="shrink-0" />}
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-96 max-w-[80vw] z-50 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-hidden">
          {books.length > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
              <Search size={14} className="text-neutral-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search books..."
                className="flex-1 bg-transparent outline-none text-sm text-neutral-200 placeholder-neutral-500"
              />
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-neutral-500">No matching books</li>
            )}
            {filtered.map((b) => {
              const active = selected?._id === b._id;
              return (
                <li key={b._id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(b); setOpen(false); setQuery(""); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      active ? "bg-purple-500/10 text-purple-200" : "text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <BookOpen size={14} className="shrink-0 text-neutral-500" />
                    <span className="flex-1 break-words">{b.fileName}</span>
                    {b.isOwner === false && (
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">Shared</span>
                    )}
                    {active && <Check size={14} className="shrink-0 text-purple-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
