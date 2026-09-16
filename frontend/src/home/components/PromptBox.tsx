"use client";

import React from "react";
import { Send } from "lucide-react";

export function PromptBox({
  message, setMessage, onSend,
}: {
  message: string;
  setMessage: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-all shadow-lg">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          type="text"
          placeholder="Ask anything about your study material..."
          className="flex-1 bg-transparent outline-none text-neutral-200 placeholder-neutral-500 text-lg"
          onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
        />
        <button
          onClick={onSend}
          disabled={!message.trim()}
          className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition-transform disabled:opacity-50"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </div>
  );
}
