"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTitle as apiFetchTitle,
  initChat,
  loadHistory as apiLoadHistory,
  openChatStream,
  updateTitle,
} from "../services";
import type { ChatContextParams, Message, ScoreToast, SectionInfo } from "../types";

export function useChat(id: string, ctx: ChatContextParams) {
  const { fileId, folderId, fileName, sectionId, sectionTitle, pageStart, pageEnd } = ctx;

  const [section, setSection] = useState<SectionInfo>(
    sectionId
      ? {
          id: sectionId,
          title: sectionTitle,
          pageStart: pageStart ? Number(pageStart) : undefined,
          pageEnd: pageEnd ? Number(pageEnd) : undefined,
        }
      : null
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const [historyPage, setHistoryPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [chatTitle, setChatTitle] = useState("");
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [scoreToast, setScoreToast] = useState<ScoreToast | null>(null);
  const scoreToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef<string | null>(null);

  // ─── History + title ──────────────────────────────────────────────────────
  const loadHistory = useCallback(
    async (page: number, prepend: boolean) => {
      if (!id) return;
      try {
        const { messages: fetched, hasMore: more } = await apiLoadHistory(id, page);
        setMessages((prev) => (prepend ? [...fetched, ...prev] : fetched));
        setHasMore(more);
        setHistoryPage(page);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    },
    [id]
  );

  const fetchTitle = useCallback(async () => {
    if (!id) return;
    try {
      const t = await apiFetchTitle(id);
      if (t) setChatTitle(t);
    } catch (err) {
      console.error("Failed to load chat title:", err);
    }
  }, [id]);

  // Initial load — guarded to run once per chatId.
  useEffect(() => {
    if (hasLoadedRef.current === id) return;
    hasLoadedRef.current = id;
    setIsLoadingHistory(true);
    setHistoryLoaded(false);
    setChatTitle("");
    setMessages([]);
    Promise.all([loadHistory(1, false), fetchTitle()]).finally(() => {
      setIsLoadingHistory(false);
      setHistoryLoaded(true);
    });
  }, [id, loadHistory, fetchTitle]);

  // Init chat with file/section context; pick up stored section for existing chats.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const payload: {
          fileId?: string; folderId?: string; fileName?: string; sectionId?: string; sectionTitle?: string;
        } = {};
        if (fileId) payload.fileId = fileId;
        if (folderId) payload.folderId = folderId;
        if (fileName) payload.fileName = fileName;
        if (sectionId) payload.sectionId = sectionId;
        if (sectionTitle) payload.sectionTitle = sectionTitle;
        const data = await initChat(id, payload);
        if (data?.success && data.sectionId) {
          setSection((prev) => prev || { id: data.sectionId, title: data.sectionTitle || null });
        }
      } catch (err) {
        console.error("Failed to init chat with context:", err);
      }
    })();
  }, [id, fileId, folderId, fileName, sectionId, sectionTitle]);

  // Tell the sidebar this chat exists + refresh.
  useEffect(() => {
    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("chatOpened", {
        detail: { chatId: id, title: "New Chat", fileId: fileId || undefined, fileName: fileName || undefined },
      })
    );
    window.dispatchEvent(new CustomEvent("sidebarRefresh"));
  }, [id, fileId, fileName]);

  // Sync loaded title to the sidebar.
  useEffect(() => {
    if (!id || !chatTitle) return;
    window.dispatchEvent(new CustomEvent("chatTitleUpdated", { detail: { chatId: id, title: chatTitle } }));
  }, [id, chatTitle]);

  // Fire the sessionStorage initial message once history is ready.
  useEffect(() => {
    if (!historyLoaded) return;
    const key = `chat_init_${id}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      sessionStorage.removeItem(key);
      handleSend(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, id]);

  // Scroll to bottom on new messages / streaming.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleLoadMore = async () => {
    const nextPage = historyPage + 1;
    setIsLoadingHistory(true);
    await loadHistory(nextPage, true);
    setIsLoadingHistory(false);
    messagesTopRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ─── Send / stream ────────────────────────────────────────────────────────
  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: textToSend }]);
    setInput("");
    setEditingIndex(null);
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");

    try {
      const response = await openChatStream({
        message: textToSend,
        chatId: id,
        ...(fileId && { fileId }),
        ...(folderId && { folderId }),
        ...(section?.id && { sectionId: section.id }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let assistantText = "";
      let isMessageSaved = false;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (!isMessageSaved && assistantText.trim()) {
            setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
            fetchTitle();
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;
          const raw = line.slice("data:".length).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);
            if (parsed.done) {
              if (!isMessageSaved) {
                setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
                isMessageSaved = true;
                fetchTitle();
              }
              break;
            }
            if (typeof parsed.text === "string") {
              assistantText += parsed.text;
              setStreamingText(assistantText);
            }
            if (typeof parsed.title === "string") {
              setChatTitle(parsed.title);
              window.dispatchEvent(new CustomEvent("chatTitleUpdated", { detail: { chatId: id, title: parsed.title } }));
            }
            if (parsed.scoreUpdate) {
              setScoreToast(parsed.scoreUpdate);
              if (scoreToastTimer.current) clearTimeout(scoreToastTimer.current);
              scoreToastTimer.current = setTimeout(() => setScoreToast(null), 6000);
              window.dispatchEvent(new CustomEvent("scoresUpdated"));
            }
          } catch {
            if (raw === "[DONE]") {
              if (!isMessageSaved) {
                setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
                isMessageSaved = true;
                fetchTitle();
              }
            } else {
              assistantText += raw;
              setStreamingText(assistantText);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText("");
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const startEdit = (index: number, content: string) => {
    setEditingIndex(index);
    setEditValue(content);
  };

  const submitEdit = () => {
    if (!editValue.trim()) return;
    handleSend(editValue.trim());
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Check out this AI Chat", url }); } catch (err) { console.error(err); }
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  const startTitleRename = () => {
    setRenameValue(chatTitle || "");
    setIsRenamingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const submitTitleRename = async () => {
    const trimmed = renameValue.trim();
    setIsRenamingTitle(false);
    if (!trimmed || trimmed === chatTitle) return;
    try {
      const t = await updateTitle(id, trimmed);
      if (t) setChatTitle(t);
    } catch (err) {
      console.error("Title rename failed:", err);
    }
  };

  return {
    // context
    section,
    // messages + input
    messages, input, setInput,
    isLoading, isStreaming, streamingText,
    // history
    hasMore, isLoadingHistory, handleLoadMore,
    // title
    chatTitle, isRenamingTitle, setIsRenamingTitle, renameValue, setRenameValue, titleInputRef,
    startTitleRename, submitTitleRename,
    // per-message ui
    copiedIndex, editingIndex, setEditingIndex, editValue, setEditValue,
    startEdit, submitEdit, handleCopy,
    // actions
    handleSend, handleShare,
    // score toast
    scoreToast, setScoreToast,
    // refs
    messagesEndRef, messagesTopRef,
  };
}
