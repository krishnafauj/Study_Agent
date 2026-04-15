"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Send, Share2, RotateCcw, Loader2, User, Bot, Copy, Check, Pencil, ChevronUp, X as XIcon } from "lucide-react";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params.id as string;
    const fileId = searchParams?.get("fileId") || null;
    const folderId = searchParams?.get("folderId") || null;
    const fileName = searchParams?.get("fileName") ? decodeURIComponent(searchParams.get("fileName")!) : null;

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Streaming state
    const [streamingText, setStreamingText] = useState<string>("");
    const [isStreaming, setIsStreaming] = useState<boolean>(false);

    // Per-message UI state
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    // History / pagination state
    const [historyPage, setHistoryPage] = useState<number>(1);
    const [hasMore, setHasMore] = useState<boolean>(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
    const [historyLoaded, setHistoryLoaded] = useState<boolean>(false);

    // Chat title
    const [chatTitle, setChatTitle] = useState<string>("");
    const [isRenamingTitle, setIsRenamingTitle] = useState<boolean>(false);
    const [renameValue, setRenameValue] = useState<string>("");
    const titleInputRef = useRef<HTMLInputElement>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesTopRef = useRef<HTMLDivElement>(null);
    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    // Guard: track which chatId we've already fetched history for
    // Prevents loadHistory from running twice if useCallback refs change identity
    const hasLoadedRef = useRef<string | null>(null);

    // ─── Load history ────────────────────────────────────────────────────────────
    const loadHistory = useCallback(
        async (page: number, prepend: boolean) => {
            if (!id) return;
            try {
                const token = localStorage.getItem("authToken");
                const res = await fetch(
                    `${API_URL}/api/chat/${id}/history?page=${page}&limit=50`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                const data = await res.json();
                if (data.success) {
                    const fetched: Message[] = data.messages.map(
                        (m: { role: "user" | "assistant"; content: string }) => ({
                            role: m.role,
                            content: m.content,
                        })
                    );
                    setMessages((prev) => (prepend ? [...fetched, ...prev] : fetched));
                    setHasMore(data.pagination.hasMore);
                    setHistoryPage(page);
                }
            } catch (err) {
                console.error("Failed to load history:", err);
            }
        },
        [id, API_URL]
    );

    // Fetch chat title
    const fetchTitle = useCallback(async () => {
        if (!id) return;
        try {
            const token = localStorage.getItem("authToken");
            const res = await fetch(`${API_URL}/api/chat/${id}/title`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success && data.title && data.title !== "New Chat") {
                setChatTitle(data.title);
            }
        } catch (err) {
            console.error("Failed to load chat title:", err);
        }
    }, [id, API_URL]);

    // Initial history + title load on mount — guarded so it only runs ONCE per chatId
    useEffect(() => {
        if (hasLoadedRef.current === id) return; // already loaded for this chat
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

    // Initialize chat with file context (if provided)
    useEffect(() => {
        if (!id) return;
        const initChatWithContext = async () => {
            try {
                const token = localStorage.getItem("authToken");
                const payload: { fileId?: string; folderId?: string; fileName?: string } = {};
                if (fileId) payload.fileId = fileId;
                if (folderId) payload.folderId = folderId;
                if (fileName) payload.fileName = fileName;

                await fetch(`${API_URL}/api/chat/${id}/init`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                });
            } catch (err) {
                console.error("Failed to init chat with context:", err);
            }
        };
        initChatWithContext();
    }, [id, fileId, fileName, API_URL]);

    // Optimistically tell the Sidebar this chat exists so it shows up immediately
    useEffect(() => {
        if (!id) return;
        window.dispatchEvent(
            new CustomEvent("chatOpened", { detail: { chatId: id, title: "New Chat" } })
        );
    }, [id]);

    // When the real title is loaded, sync it to the sidebar too
    useEffect(() => {
        if (!id || !chatTitle) return;
        window.dispatchEvent(
            new CustomEvent("chatTitleUpdated", { detail: { chatId: id, title: chatTitle } })
        );
    }, [id, chatTitle]);

    // After history is loaded, fire the sessionStorage initial message (once)
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

    // Scroll to bottom on new messages / streaming
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingText]);

    // ─── Load earlier messages ───────────────────────────────────────────────────
    const handleLoadMore = async () => {
        const nextPage = historyPage + 1;
        setIsLoadingHistory(true);
        await loadHistory(nextPage, true);
        setIsLoadingHistory(false);
        // Keep scroll position at the top of newly prepended messages
        messagesTopRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // ─── Send / stream ───────────────────────────────────────────────────────────
    const handleSend = async (textToSend: string) => {
        if (!textToSend.trim() || isLoading) return;

        const userMessage: Message = { role: "user", content: textToSend };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setEditingIndex(null);
        setIsLoading(true);
        setIsStreaming(true);
        setStreamingText("");

        try {
            const token = localStorage.getItem("authToken");

            const response = await fetch(`${API_URL}/api/chat-stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message: textToSend,
                    chatId: id,
                    ...(fileId && { fileId }),
                    ...(folderId && { folderId }),
                }),
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;

            let assistantText = "";
            let isMessageSaved = false;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    if (!isMessageSaved && assistantText.trim()) {
                        setMessages((prev) => [
                            ...prev,
                            { role: "assistant", content: assistantText },
                        ]);
                        fetchTitle();
                    }
                    break;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n\n");

                for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const token = line.replace("data:", "");
                    const cleanToken = token.trim();
                    
                    if (!cleanToken) continue;
                    
                    if (cleanToken === "[DONE]") {
                        if (!isMessageSaved) {
                            setMessages((prev) => [
                                ...prev,
                                { role: "assistant", content: assistantText },
                            ]);
                            isMessageSaved = true;
                            fetchTitle();
                        }
                        break; 
                    }
                    
                    assistantText += token;
                    setStreamingText(assistantText);
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

    // ─── Copy handler ─────────────────────────────────────────────────────────────
    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        });
    };

    // ─── Edit handlers ────────────────────────────────────────────────────────────
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
            try { await navigator.share({ title: "Check out this AI Chat", url }); }
            catch (err) { console.error(err); }
        } else {
            navigator.clipboard.writeText(url);
            alert("Link copied to clipboard!");
        }
    };

    // ─── Title rename ─────────────────────────────────────────────────────────────
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
            const token = localStorage.getItem("authToken");
            const res = await fetch(`${API_URL}/api/chat/${id}/title`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: trimmed }),
            });
            const data = await res.json();
            if (data.success) setChatTitle(data.title);
        } catch (err) {
            console.error("Title rename failed:", err);
        }
    };

    return (
        <div className="h-[100dvh] bg-neutral-950 p-2 md:p-4 font-sans flex flex-col w-full">
            
            {/* Custom Scrollbar Styles Injected Here */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px; /* Thin scrollbar */
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent; /* Invisible track */
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #3f3f46; /* Tailwind neutral-700 */
                    border-radius: 10px; /* Rounded pill shape */
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #9333ea; /* Tailwind purple-600 */
                }
                /* Firefox Fallback */
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: #3f3f46 transparent;
                }
            `}</style>

            <div className="flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <header className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 bg-neutral-900 border-b border-neutral-800 shrink-0">
                    <div className="flex items-center gap-2 group/title">
                        {isRenamingTitle ? (
                            <div className="flex items-center gap-2">
                                <input
                                    ref={titleInputRef}
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") submitTitleRename();
                                        if (e.key === "Escape") setIsRenamingTitle(false);
                                    }}
                                    className="bg-neutral-950 border border-purple-500 rounded-lg px-3 py-1 text-white text-sm outline-none w-48 md:w-72"
                                    maxLength={80}
                                />
                                <button onClick={submitTitleRename} className="text-green-400 hover:text-green-300">
                                    <Check size={16} />
                                </button>
                                <button onClick={() => setIsRenamingTitle(false)} className="text-neutral-500 hover:text-white">
                                    <XIcon size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <h1 className="text-white font-semibold text-base leading-tight tracking-wide">
                                        {chatTitle || (
                                            <span className="text-neutral-400 font-normal italic text-sm">New Chat</span>
                                        )}
                                    </h1>
                                    <p className="text-neutral-600 text-xs font-mono">#{id?.slice(0, 8) || "new"}</p>
                                </div>
                                <button
                                    onClick={startTitleRename}
                                    className="opacity-0 group-hover/title:opacity-100 p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-purple-400 transition-all"
                                    title="Rename chat"
                                >
                                    <Pencil size={14} />
                                </button>
                            </>
                        )}
                    </div>
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors text-sm font-medium"
                    >
                        <Share2 size={16} />
                        <span className="hidden sm:inline">Share</span>
                    </button>
                </header>

                {/* Messages Container - Added 'custom-scrollbar' and 'scroll-smooth' here */}
                <main className="flex-1 overflow-y-auto w-full p-4 md:p-6 custom-scrollbar scroll-smooth">
                    <div className="max-w-5xl mx-auto w-full space-y-6">

                        {/* Load earlier messages button */}
                        {hasMore && !isLoadingHistory && (
                            <div className="flex justify-center">
                                <button
                                    onClick={handleLoadMore}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors text-sm"
                                >
                                    <ChevronUp size={15} />
                                    Load earlier messages
                                </button>
                            </div>
                        )}

                        {/* History loading indicator (top) */}
                        {isLoadingHistory && (
                            <div className="flex justify-center py-4">
                                <Loader2 size={20} className="animate-spin text-purple-500 opacity-60" />
                            </div>
                        )}

                        {/* Anchor for scroll-to-top after load-more */}
                        <div ref={messagesTopRef} />

                        {/* Empty state */}
                        {messages.length === 0 && !isLoading && !isStreaming && !isLoadingHistory && (
                            <div className="mt-32 flex flex-col items-center justify-center text-neutral-500 space-y-4">
                                <Bot size={48} className="opacity-20" />
                                <p>Start a conversation...</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex w-full gap-3 md:gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"} group`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
                                        <Bot size={18} />
                                    </div>
                                )}

                                <div className={`flex flex-col relative max-w-[85%] md:max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"}`}>

                                    {/* Edit pencil for user messages */}
                                    {msg.role === "user" && !isLoading && editingIndex !== i && (
                                        <button
                                            onClick={() => startEdit(i, msg.content)}
                                            className="md:opacity-0 md:group-hover:opacity-100 absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-purple-400 transition-opacity"
                                            title="Edit message"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                    )}

                                    {/* Inline edit mode */}
                                    {msg.role === "user" && editingIndex === i ? (
                                        <div className="flex items-center gap-2 w-full">
                                            <input
                                                autoFocus
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        submitEdit();
                                                    }
                                                    if (e.key === "Escape") setEditingIndex(null);
                                                }}
                                                className="flex-1 bg-neutral-950 border border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-white outline-none text-sm md:text-base"
                                            />
                                            <button
                                                onClick={submitEdit}
                                                disabled={!editValue.trim()}
                                                className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-colors"
                                            >
                                                <Send size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            className={`p-3 md:p-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm ${msg.role === "user"
                                                    ? "bg-purple-600 text-white rounded-tr-sm"
                                                    : "bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-tl-sm"
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    )}

                                    {/* Copy button for assistant */}
                                    {msg.role === "assistant" && editingIndex !== i && (
                                        <button
                                            onClick={() => handleCopy(msg.content, i)}
                                            className="md:opacity-0 md:group-hover:opacity-100 mt-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-purple-400 transition-opacity px-1"
                                            title="Copy message"
                                        >
                                            {copiedIndex === i ? (
                                                <><Check size={12} /> Copied</>
                                            ) : (
                                                <><Copy size={12} /> Copy</>
                                            )}
                                        </button>
                                    )}

                                    {/* Resend button */}
                                    {msg.role === "user" && !isLoading && editingIndex !== i && (
                                        <button
                                            onClick={() => handleSend(msg.content)}
                                            className="md:opacity-0 md:group-hover:opacity-100 mt-1 flex items-center gap-1 text-xs text-neutral-500 hover:text-purple-400 transition-opacity px-1"
                                            title="Resend"
                                        >
                                            <RotateCcw size={12} /> Resend
                                        </button>
                                    )}
                                </div>

                                {msg.role === "user" && (
                                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-900 border border-purple-700 flex items-center justify-center text-purple-200 mt-1">
                                        <User size={18} />
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Streaming bubble */}
                        {isStreaming && (
                            <div className="flex w-full gap-3 md:gap-4 justify-start">
                                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
                                    <Bot size={18} />
                                </div>
                                <div className="p-3 md:p-4 bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-2xl rounded-tl-sm text-sm md:text-base leading-relaxed max-w-[85%] md:max-w-[75%]">
                                    {streamingText || (
                                        <span className="flex items-center gap-3 text-neutral-400">
                                            <Loader2 size={16} className="animate-spin text-purple-500" />
                                            Generating response...
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} className="h-1" />
                    </div>
                </main>

                {/* Input */}
                <footer className="p-3 md:p-4 bg-neutral-900 border-t border-neutral-800 shrink-0 flex justify-center">
                    <div className="w-full max-w-4xl flex gap-2 md:gap-3">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading || isStreaming || isLoadingHistory}
                            placeholder={
                                isLoadingHistory ? "Loading chat..." : 
                                isLoading || isStreaming ? "Please wait..." : 
                                "Type your message..."
                            }
                            className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-white outline-none transition-all disabled:opacity-50 text-sm md:text-base"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(input);
                                }
                            }}
                        />
                        <button
                            onClick={() => handleSend(input)}
                            disabled={!input.trim() || isLoading || isStreaming || isLoadingHistory}
                            className="px-4 md:px-6 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white transition-colors flex items-center justify-center"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </footer>

            </div>
        </div>
    );
}