"use client";

import { useHome } from "@/src/home/hooks";
import { Greeting, PromptBox, SuggestionChips } from "@/src/home/components";

export default function AppHome() {
  const { username, greeting, message, setMessage, startChat } = useHome();

  return (
    <div className="min-h-screen bg-neutral-900 p-4">
      <div className="min-h-[calc(100vh-32px)] rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl flex flex-col items-center justify-center px-6 gap-8">
        <Greeting greeting={greeting} username={username} />
        <PromptBox message={message} setMessage={setMessage} onSend={() => startChat()} />
        <SuggestionChips onPick={(text) => startChat(text)} />
      </div>
    </div>
  );
}
