"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { fetchBooks, getGreeting, getLastBookId, getStoredUser, setLastBookId } from "../services";
import type { Book } from "../types";

export function useHome() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [message, setMessage] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  useEffect(() => {
    setTimeout(() => {
      const user = getStoredUser();
      if (user?.name) setUsername(user.name.split(" ")[0] || "");
      setGreeting(getGreeting());
    }, 0);
  }, []);

  // Load books; preselect the last used one if it's still available
  useEffect(() => {
    let cancelled = false;
    fetchBooks()
      .then((list) => {
        if (cancelled) return;
        setBooks(list);
        const lastId = getLastBookId();
        const last = list.find((b) => b._id === lastId);
        if (last) setSelectedBook(last);
        else if (list.length === 1) setSelectedBook(list[0]);
      })
      .catch((err) => console.warn("Failed to load books:", err))
      .finally(() => { if (!cancelled) setBooksLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectBook = (book: Book) => {
    setSelectedBook(book);
    setLastBookId(book._id);
  };

  const startChat = (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg || !selectedBook) return;
    const chatId = uuidv4();
    try {
      sessionStorage.setItem(`chat_init_${chatId}`, msg);
    } catch {
      /* ignore storage errors */
    }
    const q = new URLSearchParams({ fileId: selectedBook._id, fileName: selectedBook.fileName });
    router.push(`/chat/${chatId}?${q.toString()}`);
  };

  return {
    username, greeting, message, setMessage, startChat,
    books, booksLoading, selectedBook, selectBook,
  };
}
