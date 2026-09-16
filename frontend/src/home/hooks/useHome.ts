"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { getGreeting, getStoredUser } from "../services";

export function useHome() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (user?.name) setUsername(user.name.split(" ")[0] || "");
    setGreeting(getGreeting());
  }, []);

  const startChat = (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;
    const chatId = uuidv4();
    try {
      sessionStorage.setItem(`chat_init_${chatId}`, msg);
    } catch {
      /* ignore storage errors */
    }
    router.push(`/chat/${chatId}`);
  };

  return { username, greeting, message, setMessage, startChat };
}
