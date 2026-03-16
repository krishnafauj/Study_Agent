"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUsername(parsedUser.name || "User");
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

  const startChat = () => {
    if (!message.trim()) return;
    const chatId = uuidv4();
    // ✅ store in sessionStorage, not the URL
    sessionStorage.setItem(`chat_init_${chatId}`, message.trim());
    router.push(`/chat/${chatId}`);
  };

  return (
    <div className="min-h-screen bg-neutral-900 p-4">
      <div className="min-h-[calc(100vh-32px)] rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl flex flex-col items-center justify-center px-6">
        <h1 className="text-6xl font-bold mb-10 text-center bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 text-transparent bg-clip-text">
          {greeting} {username || "..."} ✨
        </h1>
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 transition-all shadow-lg">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              type="text"
              placeholder="Ask anything..."
              className="flex-1 bg-transparent outline-none text-neutral-200 placeholder-neutral-500 text-lg"
              onKeyDown={(e) => { if (e.key === "Enter") startChat(); }}
            />
            <button
              onClick={startChat}
              className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition-transform"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}