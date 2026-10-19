"use client";

import React from "react";
import { Send } from "lucide-react";
import { BookSelect } from "./BookSelect";
import type { Book } from "../types";

export function PromptBox({
  message, setMessage, onSend,
  books, selectedBook, onSelectBook, booksLoading,
}: {
  message: string;
  setMessage: (v: string) => void;
  onSend: () => void;
  books: Book[];
  selectedBook: Book | null;
  onSelectBook: (book: Book) => void;
  booksLoading: boolean;
}) {
  const canSend = !!message.trim() && !!selectedBook;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-2xl px-3 py-3 focus-within:border-purple-500 transition-all shadow-lg">
        <BookSelect
          books={books}
          selected={selectedBook}
          onSelect={onSelectBook}
          loading={booksLoading}
        />
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          type="text"
          placeholder={selectedBook ? "Ask anything about this book..." : "Select a book to start..."}
          className="flex-1 min-w-0 bg-transparent outline-none text-neutral-200 placeholder-neutral-500 text-lg"
          onKeyDown={(e) => { if (e.key === "Enter" && canSend) onSend(); }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          title={!selectedBook ? "Select a book first" : undefined}
          className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
      {!booksLoading && books.length === 0 && (
        <p className="mt-2 text-center text-sm text-neutral-500">
          Upload a book from <span className="text-purple-400">My Files</span> to start chatting.
        </p>
      )}
    </div>
  );
}
