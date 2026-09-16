// State + data logic for the dashboard feature module.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PARSE_POLL_MS } from "../constants";
import {
  deleteChat as apiDeleteChat,
  fetchChatsByFile,
  fetchFileDetails,
  fetchSectionsOverview,
  renameChat,
} from "../services";
import type { Chat, FileInfo, Section } from "../types";

export function useDashboard(fileId: string) {
  const router = useRouter();

  const [chats, setChats] = useState<Chat[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isOwner, setIsOwner] = useState(true);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [fileName, setFileName] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fileNameRef = useRef("");
  fileNameRef.current = fileName;

  const loadSections = useCallback(async () => {
    if (!fileId) return;
    const { isOwner: owner, sections: secs, fileName: name } = await fetchSectionsOverview(fileId);
    setIsOwner(owner);
    setSections(secs);
    if (!fileNameRef.current && name) setFileName(name);
  }, [fileId]);

  const loadFile = useCallback(async () => {
    if (!fileId) return;
    const info = await fetchFileDetails(fileId);
    if (info) {
      setFileInfo(info);
      if (!fileNameRef.current && info.fileName) setFileName(info.fileName);
    }
  }, [fileId]);

  const loadChats = useCallback(async () => {
    if (!fileId) return;
    const list = await fetchChatsByFile(fileId);
    setChats(list);
    if (list.length && list[0].fileName) setFileName(list[0].fileName);
  }, [fileId]);

  // Load everything in parallel; keep the whole page skeletoned until ready.
  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    (async () => {
      await Promise.all([loadSections(), loadFile(), loadChats()]);
      if (alive) setInitialLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fileId, loadSections, loadFile, loadChats]);

  // Poll section status while any section is still parsing.
  const anyParsing = sections.some((s) => s.parseStatus === "parsing");
  useEffect(() => {
    if (!anyParsing) return;
    const t = setInterval(() => loadSections(), PARSE_POLL_MS);
    return () => clearInterval(t);
  }, [anyParsing, loadSections]);

  const createNewChat = useCallback(
    (sec?: Section) => {
      const newChatId = `chat-${Date.now()}`;
      const q = new URLSearchParams({ fileId, fileName: fileNameRef.current });
      if (sec) {
        q.set("sectionId", sec._id);
        if (sec.title) q.set("sectionTitle", sec.title);
        if (sec.pageStart) q.set("pageStart", String(sec.pageStart));
        if (sec.pageEnd) q.set("pageEnd", String(sec.pageEnd));
      }
      router.push(`/chat/${newChatId}?${q.toString()}`);
    },
    [fileId, router]
  );

  const openChat = useCallback(
    (chatId: string) => {
      const q = new URLSearchParams({ fileId, fileName: fileNameRef.current });
      router.push(`/chat/${chatId}?${q.toString()}`);
    },
    [fileId, router]
  );

  const startRename = useCallback((chat: Chat) => {
    setRenamingId(chat.chatId);
    setRenameValue(chat.title);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const submitRename = useCallback(
    async (chatId: string) => {
      const trimmed = renameValue.trim();
      if (!trimmed) return cancelRename();
      const title = await renameChat(chatId, trimmed);
      if (title) setChats((prev) => prev.map((c) => (c.chatId === chatId ? { ...c, title } : c)));
      cancelRename();
    },
    [renameValue, cancelRename]
  );

  const removeChat = useCallback(async (chatId: string) => {
    if (!confirm("Delete this chat and all its messages?")) return;
    const ok = await apiDeleteChat(chatId);
    if (ok) setChats((prev) => prev.filter((c) => c.chatId !== chatId));
  }, []);

  return {
    // data
    chats,
    sections,
    isOwner,
    fileInfo,
    fileName,
    initialLoading,
    // rename state
    renamingId,
    renameValue,
    setRenameValue,
    // actions
    goToAccess: () => router.push(`/access/${fileId}`),
    reloadSections: loadSections,
    createNewChat,
    openChat,
    startRename,
    cancelRename,
    submitRename,
    removeChat,
  };
}
