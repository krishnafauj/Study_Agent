"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Send, Share2, RotateCcw, Loader2, User, Bot } from "lucide-react";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params.id as string;
    const initialMessage = searchParams.get("message");

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL;

    useEffect(() => {
        if (initialMessage && messages.length === 0) {
            handleSend(initialMessage);
        }
    }, [initialMessage]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (textToSend: string) => {
        if (!textToSend.trim() || isLoading) return;

        const userMessage: Message = { role: "user", content: textToSend };

        // Add user message + empty assistant message
        setMessages((prev) => [
            ...prev,
            userMessage,
            { role: "assistant", content: "" },
        ]);

        setInput("");
        setIsLoading(true);

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
                }),
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) return;

            let assistantText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n\n");

                for (const line of lines) {

                    if (!line.startsWith("data:")) continue;

                    const token = line.replace("data:", "");

                    const cleanToken = token.trim();

                    if (!cleanToken) continue;

                    if (cleanToken === "[DONE]") {
                        setIsLoading(false);
                        return;
                    }

                    assistantText += token;

                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            role: "assistant",
                            content: assistantText,
                        };
                        return updated;
                    });
                }
            }
        } catch (error) {
            console.error("Streaming error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleShare = async () => {
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Check out this AI Chat",
                    url,
                });
            } catch (err) {
                console.error(err);
            }
        } else {
            navigator.clipboard.writeText(url);
            alert("Link copied to clipboard!");
        }
    };

    return (
        <div className="h-[100dvh] bg-neutral-950 p-2 md:p-4 font-sans flex flex-col w-full">
            <div className="flex-1 w-full bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col overflow-hidden">

                {/* Header */}
                <header className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 bg-neutral-900 border-b border-neutral-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-600/20 text-purple-400 rounded-lg">
                            <Bot size={20} />
                        </div>
                        <h1 className="text-white font-semibold text-lg tracking-wide">
                            Admin Assistant{" "}
                            <span className="text-neutral-500 text-sm font-normal ml-2">
                                #{id?.slice(0, 6) || "new"}
                            </span>
                        </h1>
                    </div>

                    <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors text-sm font-medium"
                    >
                        <Share2 size={16} />
                        <span className="hidden sm:inline">Share</span>
                    </button>
                </header>

                {/* Messages */}
                <main className="flex-1 overflow-y-auto w-full p-4 md:p-6">
                    <div className="max-w-5xl mx-auto w-full space-y-6">

                        {messages.length === 0 && !isLoading && (
                            <div className="mt-32 flex flex-col items-center justify-center text-neutral-500 space-y-4">
                                <Bot size={48} className="opacity-20" />
                                <p>Start a conversation...</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex w-full gap-3 md:gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"
                                    } group`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
                                        <Bot size={18} />
                                    </div>
                                )}

                                <div
                                    className={`flex flex-col relative max-w-[85%] md:max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"
                                        }`}
                                >
                                    {msg.role === "user" && !isLoading && (
                                        <button
                                            onClick={() => handleSend(msg.content)}
                                            className="md:opacity-0 md:group-hover:opacity-100 absolute -left-10 top-1/2 -translate-y-1/2 p-2 text-neutral-500 hover:text-purple-400 transition-opacity"
                                            title="Resend this message"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    )}

                                    <div
                                        className={`p-3 md:p-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm ${msg.role === "user"
                                            ? "bg-purple-600 text-white rounded-tr-sm"
                                            : "bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-tl-sm"
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>

                                {msg.role === "user" && (
                                    <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-900 border border-purple-700 flex items-center justify-center text-purple-200 mt-1">
                                        <User size={18} />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex w-full gap-3 md:gap-4 justify-start">
                                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
                                    <Bot size={18} />
                                </div>
                                <div className="p-3 md:p-4 bg-neutral-800 border border-neutral-700 rounded-2xl rounded-tl-sm flex items-center gap-3 text-neutral-400 max-w-[75%]">
                                    <Loader2 size={16} className="animate-spin text-purple-500" />
                                    <span className="text-sm">Generating response...</span>
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
                            disabled={isLoading}
                            placeholder={isLoading ? "Please wait..." : "Type your message..."}
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
                            disabled={!input.trim() || isLoading}
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