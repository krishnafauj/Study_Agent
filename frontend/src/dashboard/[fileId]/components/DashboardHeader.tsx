"use client";

import React from "react";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";

export function DashboardHeader({
  fileName, isOwner, onBack, onAssign, onNewChat,
}: {
  fileName: string;
  isOwner: boolean;
  onBack: () => void;
  onAssign: () => void;
  onNewChat: () => void;
}) {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <button
              onClick={onBack}
              className="p-2 mt-1 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white shrink-0"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-medium text-white break-words line-clamp-2">{fileName}</h1>
              <p className="text-sm text-neutral-400 mt-1">Chat &amp; Topics Dashboard</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isOwner && (
              <button
                onClick={onAssign}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-700 text-white font-semibold transition-all duration-200"
                title="Manage access & permissions"
              >
                <UserPlus size={18} />
                <span>Assign</span>
              </button>
            )}
            <button
              onClick={onNewChat}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold transition-all duration-200"
            >
              <Plus size={18} />
              <span>New Chat</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
