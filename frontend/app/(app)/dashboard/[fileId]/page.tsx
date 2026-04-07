"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, MessageSquare, Trash2, Pencil, Check, X as XIcon, Loader2, RefreshCw, File } from "lucide-react";
import Link from "next/link";

type Chat = {
  chatId: string;
  title: string;
  updatedAt: string;
  fileId: string;
  fileName?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export default function FileDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params?.fileId as string;

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fileName, setFileName] = useState<string>("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Fetch chats for this file
  const fetchChats = useCallback(async () => {
    if (!fileId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chats/file/${fileId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats);
        if (data.chats.length > 0 && data.chats[0].fileName) {
          setFileName(data.chats[0].fileName);
        }
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Create new chat for this file
  const createNewChat = () => {
    const newChatId = `chat-${Date.now()}`;
    router.push(`/chat/${newChatId}?fileId=${fileId}&fileName=${encodeURIComponent(fileName)}`);
  };

  // Rename chat
  const submitRename = async (chatId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/chat/${chatId}/title`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setChats((prev) =>
          prev.map((c) => (c.chatId === chatId ? { ...c, title: data.title } : c))
        );
      }
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setRenamingId(null);
  };

  // Delete chat
  const handleDelete = async (chatId: string) => {
    if (!confirm("Delete this chat and all its messages?")) return;
    try {
      const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setChats((prev) => prev.filter((c) => c.chatId !== chatId));
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
                title="Go back"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <File size={20} className="text-cyan-400" />
                  <h1 className="text-xl font-bold text-white">{fileName || "File Dashboard"}</h1>
                </div>
                <p className="text-sm text-neutral-400 mt-0.5">
                  {chats.length} {chats.length === 1 ? "chat" : "chats"}
                </p>
              </div>
            </div>
            <button
              onClick={createNewChat}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium transition-all hover:scale-105"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 size={24} className="animate-spin text-purple-400" />
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={48} className="mx-auto text-neutral-600 mb-4" />
            <h2 className="text-xl font-semibold text-neutral-300 mb-2">No chats yet</h2>
            <p className="text-neutral-500 mb-6">
              Start a new conversation with this document to ask questions and get insights.
            </p>
            <button
              onClick={createNewChat}
              className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Create First Chat
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {chats.map((chat) => (
              <div
                key={chat.chatId}
                className="group relative bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 hover:border-purple-700/50 transition-all hover:bg-neutral-900/80"
              >
                <Link href={`/chat/${chat.chatId}`} className="absolute inset-0 rounded-lg z-0" />
                
                <div className="relative z-10">
                  {renamingId === chat.chatId ? (
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(chat.chatId);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 bg-neutral-950 border border-purple-500 rounded px-2 py-1 text-sm text-white outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          submitRename(chat.chatId);
                        }}
                        className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/40"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(null);
                        }}
                        className="p-1 rounded bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700"
                      >
                        <XIcon size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 mb-3">
                        <MessageSquare size={18} className="text-purple-400 shrink-0 mt-0.5" />
                        <h3 className="text-lg font-semibold text-white flex-1 line-clamp-2 group-hover:text-purple-300 transition-colors">
                          {chat.title}
                        </h3>
                      </div>
                      
                      <p className="text-sm text-neutral-500 mb-4">
                        Last updated: {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </>
                  )}

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(chat.chatId);
                        setRenameValue(chat.title);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-purple-400 transition-colors text-sm"
                      title="Rename"
                    >
                      <Pencil size={14} />
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(chat.chatId);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors text-sm"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
