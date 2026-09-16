"use client";

import React from "react";
import { Bot, Loader2 } from "lucide-react";
import Markdown from "@/components/chat/Markdown";

export function StreamingBubble({ streamingText }: { streamingText: string }) {
  return (
    <div className="flex w-full gap-3 md:gap-4 justify-start">
      <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-purple-400 mt-1">
        <Bot size={18} />
      </div>
      <div className="p-3 md:p-4 bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-2xl rounded-tl-sm text-sm md:text-base leading-relaxed max-w-[85%] md:max-w-[75%]">
        {streamingText ? (
          <Markdown content={streamingText} isStreaming={true} />
        ) : (
          <span className="flex items-center gap-3 text-neutral-400">
            <Loader2 size={16} className="animate-spin text-purple-500" />
            Generating response...
          </span>
        )}
      </div>
    </div>
  );
}
