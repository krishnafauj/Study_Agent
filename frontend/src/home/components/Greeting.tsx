"use client";

import React from "react";
import { Sparkles } from "lucide-react";

export function Greeting({ greeting, username }: { greeting: string; username: string }) {
  return (
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
  );
}
