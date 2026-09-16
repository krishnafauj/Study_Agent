"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, MessageSquare, Trash2, Pencil, Check, X as XIcon, Loader2,
  BookOpen, UserPlus, ChevronRight, CheckCircle2, AlertTriangle, ShieldCheck,
} from "lucide-react";

type ParseStatus = "unparsed" | "parsing" | "parsed" | "failed";
type Section = {
  _id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  parseStatus?: ParseStatus;
  parseProgress?: number;
  topicsCreated?: number;
  mode?: "assign" | "see";
};

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [fileName, setFileName] = useState<string>("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [fileInfo, setFileInfo] = useState<any>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const [sections, setSections] = useState<Section[]>([]);
  const [isOwner, setIsOwner] = useState<boolean>(true);

  // Sections (the real page-range sections the owner created) + parse status.
  const fetchSections = useCallback(async () => {
    if (!fileId) return;
    try {
      const res = await fetch(`${API_URL}/api/access/${fileId}/overview`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setIsOwner(!!data.isOwner);
        setSections(data.isOwner ? (data.sections || []) : (data.mySections || []));
        if (!fileName && data.fileName) setFileName(data.fileName);
      }
    } catch (err) {
      console.error("Failed to load sections:", err);
    }
  }, [fileId, fileName]);

  // Load everything in parallel and keep the whole page in a skeleton until it
  // is ALL ready — so content appears at once instead of popping in piece by
  // piece (which caused the "No sections yet" flash before the real cards).
  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    (async () => {
      await Promise.all([fetchSections(), fetchFileDetails(), fetchChats()]);
      if (alive) setInitialLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // While a section is still parsing, refresh so its status advances.
  const anyParsing = sections.some((s) => s.parseStatus === "parsing");
  useEffect(() => {
    if (!anyParsing) return;
    const t = setInterval(() => fetchSections(), 4000);
    return () => clearInterval(t);
  }, [anyParsing, fetchSections]);

  const fetchFileDetails = useCallback(async () => {
    if (!fileId) return;
    try {
      const res = await fetch(`${API_URL}/api/files/${fileId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setFileInfo(data.file);
        if (!fileName && data.file.fileName) {
          setFileName(data.file.fileName);
        }
      }
    } catch (err) {
      console.error("Failed to load file info:", err);
    }
  }, [fileId, fileName]);

  // Fetch chats for this file
  const fetchChats = useCallback(async () => {
    if (!fileId) return;
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
    }
  }, [fileId]);

  // Create new chat for this file (optionally scoped to a section)
  const createNewChat = (sec?: Section) => {
    const newChatId = `chat-${Date.now()}`;
    const q = new URLSearchParams({ fileId, fileName });
    if (sec) {
      q.set("sectionId", sec._id);
      if (sec.title) q.set("sectionTitle", sec.title);
      if (sec.pageStart) q.set("pageStart", String(sec.pageStart));
      if (sec.pageEnd) q.set("pageEnd", String(sec.pageEnd));
    }
    router.push(`/chat/${newChatId}?${q.toString()}`);
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

  const handleAssign = async () => {
    if (!assignEmail.trim() || !fileInfo) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`${API_URL}/api/files/${fileInfo._id}/assign`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: assignEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to assign");

      setFileInfo({ ...fileInfo, assignedTo: data.assignedTo });
      setAssignEmail("");
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRevoke = async (email: string) => {
    if (!fileInfo) return;
    try {
      const res = await fetch(`${API_URL}/api/files/${fileInfo._id}/revoke`, {
        method: "POST",
       headers: authHeaders(),
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to revoke");

      setFileInfo({ ...fileInfo, assignedTo: data.assignedTo });
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <button
                onClick={() => router.back()}
                className="p-2 mt-1 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white shrink-0"
                title="Go back"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg md:text-xl font-medium text-white break-words line-clamp-2">{fileName}</h1>
                <p className="text-sm text-neutral-400 mt-1">Chat & Topics Dashboard</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {fileInfo?.isOwner !== false && (
                <button
                  onClick={() => router.push(`/access/${fileId}`)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-700 text-white font-semibold transition-all duration-200"
                  title="Manage access & permissions"
                >
                  <UserPlus size={18} />
                  <span>Assign</span>
                </button>
              )}
              <button
                onClick={() => createNewChat()}
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
        {initialLoading ? (
          <PageSkeleton />
        ) : (
        <>
        {/* Sections */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen size={24} className="text-blue-500" />
              Sections
            </h2>
            {isOwner && sections.length > 0 && (
              <button
                onClick={() => router.push(`/access/${fileId}`)}
                className="text-sm font-medium text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
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
                  onClick={() => router.push(`/access/${fileId}`)}
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
                <div
                  key={s._id}
                  className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 transition-colors flex flex-col h-full group"
                >
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white leading-snug group-hover:text-blue-400 transition-colors">
                        {s.title}
                      </h3>
                      <SectionStatusBadge section={s} />
                    </div>
                    <p className="text-sm text-neutral-400">Pages {s.pageStart}–{s.pageEnd}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-end">
                    <button
                      onClick={() => createNewChat(s)}
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

          {chats.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900/50 rounded-xl border border-neutral-800">
              <MessageSquare size={48} className="mx-auto text-neutral-600 mb-4" />
              <p className="text-neutral-400 mb-4">No chats created yet</p>
              <button
                onClick={() => createNewChat()}
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
                      onClick={() => router.push(`/chat/${chat.chatId}?fileId=${fileId}&fileName=${encodeURIComponent(fileName)}`)}
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
                      onClick={() => router.push(`/chat/${chat.chatId}?fileId=${fileId}&fileName=${encodeURIComponent(fileName)}`)}
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
        </>
        )}
      </main>

      {/* Assignment Modal */}
      {isAssignModalOpen && fileInfo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Share / Assign PDF</h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-gray-400 hover:text-white">
                <XIcon size={20} />
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              Assign <strong className="text-white">{fileInfo.fileName}</strong> to another user.
              They will receive an email and can chat with the PDF topics (but cannot view the raw file).
              <br/>
              <span className="text-xs text-purple-400">Tip: You can add multiple emails separated by commas or spaces.</span>
            </p>

            <div className="flex gap-2 mb-6">
              <input
                type="email"
                placeholder="User's email address"
                value={assignEmail}
                onChange={e => setAssignEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAssign()}
                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
              />
              <button
                onClick={handleAssign}
                disabled={isAssigning || !assignEmail.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {isAssigning ? "Assigning..." : "Assign"}
              </button>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">Assigned Users</h4>
              {(!fileInfo.assignedTo || fileInfo.assignedTo.length === 0) ? (
                <p className="text-xs text-gray-500">Not assigned to anyone yet.</p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {fileInfo.assignedTo.map((email: string) => (
                    <li key={email} className="flex items-center justify-between bg-gray-950 px-3 py-2 rounded border border-gray-800">
                      <span className="text-sm text-gray-300">{email}</span>
                      <button
                        onClick={() => handleRevoke(email)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Sections skeleton */}
      <div className="mb-8">
        <div className="mb-4 h-6 w-40 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 h-[140px]">
              <div className="h-5 w-1/2 rounded bg-neutral-800" />
              <div className="mt-3 h-3 w-1/3 rounded bg-neutral-800/70" />
              <div className="mt-8 h-3 w-24 ml-auto rounded bg-neutral-800/70" />
            </div>
          ))}
        </div>
      </div>

      {/* Chats skeleton */}
      <div>
        <div className="mb-6 h-6 w-56 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <ChatCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 animate-pulse">
      <div className="mb-3">
        <div className="h-4 w-2/3 rounded bg-neutral-800" />
        <div className="mt-2 h-3 w-1/3 rounded bg-neutral-800/70" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 flex-1 rounded-lg bg-neutral-800" />
        <div className="h-9 w-11 rounded-lg bg-neutral-800" />
        <div className="h-9 w-11 rounded-lg bg-neutral-800" />
      </div>
    </div>
  );
}

function SectionStatusBadge({ section }: { section: Section }) {
  const status = section.parseStatus;
  if (status === "parsing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-300">
        <Loader2 className="animate-spin" size={11} />
        {typeof section.parseProgress === "number" ? `${section.parseProgress}%` : "Parsing"}
      </span>
    );
  }
  if (status === "parsed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
        <CheckCircle2 size={11} /> {section.topicsCreated ? `${section.topicsCreated}` : "Parsed"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">
        <AlertTriangle size={11} /> Failed
      </span>
    );
  }
  return null;
}
