"use client";

import { useEffect, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

const SUGGESTIONS = [
  "Summarize my Optics chapter",
  "Quiz me on Modern Physics",
  "What are my weak topics?",
  "Explain Coulomb's Law simply",
  "Create a study plan for me",
];

export default function AppHome() {
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUsername(parsedUser.name?.split(" ")[0] || "");
      } catch (err) {
        console.error(err);
      }
    }

    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setGreeting("Good Morning");
    else if (hour >= 12 && hour < 17) setGreeting("Good Afternoon");
    else if (hour >= 17 && hour < 21) setGreeting("Good Evening");
    else setGreeting("Good Night");
  }, []);

  const startChat = (text?: string) => {
    const msg = text || message;
    if (!msg.trim()) return;
    const chatId = uuidv4();
    sessionStorage.setItem(`chat_init_${chatId}`, msg.trim());
    router.push(`/chat/${chatId}`);
  };

  return (
    <div className="min-h-screen bg-neutral-900 p-4">
      <div className="min-h-[calc(100vh-32px)] rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl flex flex-col items-center justify-center px-6 gap-8">

        {/* Greeting */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles size={20} className="text-purple-400" />
            <span className="text-purple-400 text-sm font-medium uppercase tracking-widest">Study Agent</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-3 text-center bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 text-transparent bg-clip-text">
            {greeting}{username ? `, ${username}` : ""} ✨
          </h1>
          <p className="text-neutral-500 text-lg">What would you like to study today?</p>
        </div>

        {/* Input */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-all shadow-lg">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              type="text"
              placeholder="Ask anything about your study material..."
              className="flex-1 bg-transparent outline-none text-neutral-200 placeholder-neutral-500 text-lg"
              onKeyDown={(e) => { if (e.key === "Enter") startChat(); }}
            />
            <button
              onClick={() => startChat()}
              className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition-transform disabled:opacity-50"
              disabled={!message.trim()}
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>

        {/* Quick suggestions */}
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => startChat(s)}
              className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-purple-500/50 hover:bg-neutral-800 text-neutral-400 hover:text-white text-sm transition-all"
            >
              {s}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
