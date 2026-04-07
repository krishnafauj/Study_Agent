"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, MessageSquare, Trash2, Pencil, Check, X as XIcon, Loader2, RefreshCw, File, BookOpen, Zap } from "lucide-react";
import Link from "next/link";

type Chat = {
  chatId: string;
  title: string;
  updatedAt: string;
  fileId: string;
  fileName?: string;
};

type ProcessingProgress = {
  progress: number;
  status: string;
  topicsCreated: number;
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
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Poll for processing progress
  useEffect(() => {
    if (!fileId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/topics/progress/${fileId}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (data.success) {
          setProcessingProgress(data.progress);
          setIsProcessing(data.progress?.status !== "completed" && data.progress?.status !== "failed");
        }
      } catch (err) {
        console.error("Progress fetch error:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [fileId]);

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

  const getProgressColor = () => {
    const progress = processingProgress?.progress || 0;
    if (progress < 4) return "from-red-500 to-orange-500";
    if (progress < 7) return "from-yellow-500 to-orange-500";
    return "from-green-500 to-emerald-500";
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
                <h1 className="text-2xl font-bold text-white truncate">{fileName}</h1>
                <p className="text-sm text-neutral-400">Chat & Topics Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/topics/${fileId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold transition-all duration-200"
              >
                <BookOpen size={18} />
                <span>View Topics</span>
              </Link>
              <button
                onClick={createNewChat}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold transition-all duration-200"
              >
                <Plus size={18} />
                <span>New Chat</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Processing Progress Section */}
        {processingProgress && (
          <div className="mb-8 p-6 rounded-xl bg-neutral-900 border border-neutral-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Zap size={20} className="text-yellow-500" />
                <div>
                  <h3 className="text-lg font-semibold text-white">Document Processing</h3>
                  <p className="text-sm text-neutral-400">
                    Status: <span className="capitalize text-yellow-400">{processingProgress.status}</span>
                  </p>
                </div>
              </div>
              {isProcessing && <Loader2 size={20} className="animate-spin text-blue-500" />}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-300">Topics Extracted</span>
                <span className="text-white font-semibold">{processingProgress.topicsCreated}</span>
              </div>
              
              <div className="relative h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${getProgressColor()} transition-all duration-500`}
                  style={{ width: `${(processingProgress.progress / 10) * 100}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-neutral-400">
                <span>Progress: {processingProgress.progress}/10</span>
                <span>{Math.round((processingProgress.progress / 10) * 100)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Chats Section */}
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

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-neutral-800">
              <MessageSquare size={48} className="mx-auto text-neutral-600 mb-4" />
              <p className="text-neutral-400 mb-4">No chats created yet</p>
              <button
                onClick={createNewChat}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold transition-all duration-200"
              >
                <Plus size={18} />
                Create Your First Chat
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chats.map((chat) => (
                <div
                  key={chat.chatId}
                  className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => router.push(`/chat/${chat.chatId}`)}
                    >
                      {renamingId === chat.chatId ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitRename(chat.chatId);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="flex-1 px-2 py-1 text-sm rounded bg-neutral-800 text-white border border-neutral-700 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => submitRename(chat.chatId)}
                            className="p-1 text-green-500 hover:text-green-400"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="p-1 text-red-500 hover:text-red-400"
                          >
                            <XIcon size={16} />
                          </button>
                        </div>
                      ) : (
                        <h3 className="font-semibold text-white hover:text-blue-400 transition-colors">
                          {chat.title}
                        </h3>
                      )}
                      <p className="text-xs text-neutral-400 mt-1">
                        Updated: {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/chat/${chat.chatId}`)}
                      className="flex-1 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <MessageSquare size={14} />
                      Open
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(chat.chatId);
                        setRenameValue(chat.title);
                      }}
                      className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(chat.chatId)}
                      className="px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
