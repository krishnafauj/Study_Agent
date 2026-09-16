"use client";

import React from "react";
import { Send } from "lucide-react";

export function ChatInput({
  input, setInput, disabled, isLoadingHistory, isBusy, onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  disabled: boolean;
  isLoadingHistory: boolean;
  isBusy: boolean;
  onSend: () => void;
}) {
  return (
    <footer className="p-3 md:p-4 bg-neutral-900 border-t border-neutral-800 shrink-0 flex justify-center">
      <div className="w-full max-w-4xl flex gap-2 md:gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={isLoadingHistory ? "Loading chat..." : isBusy ? "Please wait..." : "Type your message..."}
          className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-white outline-none transition-all disabled:opacity-50 text-sm md:text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || disabled}
          className="px-4 md:px-6 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-colors flex items-center justify-center"
        >
          <Send size={20} />
        </button>
      </div>
    </footer>
  );
}
