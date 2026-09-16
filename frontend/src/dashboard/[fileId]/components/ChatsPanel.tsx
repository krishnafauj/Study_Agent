"use client";

import React from "react";
import { MessageSquare, Trash2, Pencil, Check, X as XIcon, Plus } from "lucide-react";
import type { Chat } from "../types";

export function ChatsPanel({
  chats, renamingId, renameValue, setRenameValue,
  onOpen, onStartRename, onSubmitRename, onCancelRename, onDelete, onCreate,
}: {
  chats: Chat[];
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onOpen: (chatId: string) => void;
  onStartRename: (chat: Chat) => void;
  onSubmitRename: (chatId: string) => void;
  onCancelRename: () => void;
  onDelete: (chatId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={24} className="text-purple-500" />
          Chats in this Document
        </h2>
        <p className="text-sm text-neutral-400 mt-1">
          {chats.length === 0 ? "No chats yet. Create one to get started!" : `${chats.length} chat${chats.length !== 1 ? "s" : ""} available`}
        </p>
      </div>

      {chats.length === 0 ? (
        <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <MessageSquare size={48} className="mx-auto text-neutral-600 mb-4" />
          <p className="text-neutral-400 mb-4">No chats created yet</p>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold transition-all duration-200"
          >
            <Plus size={18} />
            Create Your First Chat
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chats.map((chat) => {
            const isRenaming = renamingId === chat.chatId;
            return (
              <div key={chat.chatId} className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all duration-200 group">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 cursor-pointer" onClick={() => !isRenaming && onOpen(chat.chatId)}>
                    {isRenaming ? (
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSubmitRename(chat.chatId);
                            if (e.key === "Escape") onCancelRename();
                          }}
                          className="flex-1 px-2 py-1 text-sm rounded bg-neutral-800 text-white border border-neutral-700 focus:outline-none focus:border-blue-500"
                        />
                        <button onClick={() => onSubmitRename(chat.chatId)} className="p-1 text-green-500 hover:text-green-400"><Check size={16} /></button>
                        <button onClick={onCancelRename} className="p-1 text-red-500 hover:text-red-400"><XIcon size={16} /></button>
                      </div>
                    ) : (
                      <h3 className="font-semibold text-white hover:text-blue-400 transition-colors">{chat.title}</h3>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">Updated: {new Date(chat.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onOpen(chat.chatId)}
                    className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={14} /> Open
                  </button>
                  <button onClick={() => onStartRename(chat)} className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(chat.chatId)} className="px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
