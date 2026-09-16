"use client";

import React from "react";
import { Send, RotateCcw, User, Bot, Copy, Check, Pencil } from "lucide-react";
import Markdown from "@/components/chat/Markdown";
import type { Message } from "../types";

export function MessageBubble({
  msg, index, isLoading,
  editingIndex, editValue, setEditValue, onStartEdit, onSubmitEdit, onCancelEdit,
  copiedIndex, onCopy, onResend,
}: {
  msg: Message;
  index: number;
  isLoading: boolean;
  editingIndex: number | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onStartEdit: (index: number, content: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  copiedIndex: number | null;
  onCopy: (text: string, index: number) => void;
  onResend: (content: string) => void;
}) {
  const isUser = msg.role === "user";
  const isEditing = editingIndex === index;

  return (
    <div className={`flex w-full gap-3 md:gap-4 ${isUser ? "justify-end" : "justify-start"} group`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
          <Bot size={18} />
        </div>
      )}

      <div className={`flex flex-col relative max-w-[85%] md:max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {isUser && !isLoading && !isEditing && (
          <button
            onClick={() => onStartEdit(index, msg.content)}
            className="md:opacity-0 md:group-hover:opacity-100 absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-purple-400 transition-opacity"
            title="Edit message"
          >
            <Pencil size={15} />
          </button>
        )}

        {isUser && isEditing ? (
          <div className="flex items-center gap-2 w-full">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmitEdit(); }
                if (e.key === "Escape") onCancelEdit();
              }}
              className="flex-1 bg-neutral-950 border border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-white outline-none text-sm md:text-base"
            />
            <button
              onClick={onSubmitEdit}
              disabled={!editValue.trim()}
              className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className={`p-3 md:p-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm ${
            isUser ? "bg-purple-600 text-white rounded-tr-sm" : "bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-tl-sm"
          }`}>
            {isUser ? msg.content : <Markdown content={msg.content} />}
          </div>
        )}

        {!isUser && !isEditing && (
          <button
            onClick={() => onCopy(msg.content, index)}
            className="md:opacity-0 md:group-hover:opacity-100 mt-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-purple-400 transition-opacity px-1"
            title="Copy message"
          >
            {copiedIndex === index ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        )}

        {isUser && !isLoading && !isEditing && (
          <button
            onClick={() => onResend(msg.content)}
            className="md:opacity-0 md:group-hover:opacity-100 mt-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-purple-400 transition-opacity px-1"
            title="Resend"
          >
            <RotateCcw size={12} /> Resend
          </button>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-900 border border-purple-700 flex items-center justify-center text-purple-200 mt-1">
          <User size={18} />
        </div>
      )}
    </div>
  );
}
