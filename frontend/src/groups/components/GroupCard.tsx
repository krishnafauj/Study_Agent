"use client";

import React from "react";
import { ChevronRight, Users } from "lucide-react";
import type { GroupSummary } from "../types";

export function GroupCard({ group, onOpen }: { group: GroupSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-gray-800 bg-gray-950 p-4 hover:border-purple-500/50 transition-all flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-lg bg-purple-900/20 flex items-center justify-center shrink-0">
        <Users className="text-purple-400" size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{group.name}</p>
        <p className="text-gray-500 text-xs mt-1 truncate">
          {group.memberCount} {group.memberCount === 1 ? "student" : "students"}
          {" • "}Updated {new Date(group.updatedAt).toLocaleDateString()}
          {group.description ? ` • ${group.description}` : ""}
        </p>
      </div>
      <ChevronRight size={18} className="text-gray-600 shrink-0" />
    </button>
  );
}
