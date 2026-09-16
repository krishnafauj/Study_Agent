"use client";

import React from "react";
import { Globe, BookOpen, Lightbulb, Sparkles } from "lucide-react";

function icon(category: string) {
  switch (category) {
    case "News": return <Globe className="text-blue-400" size={20} />;
    case "Study Tip": return <BookOpen className="text-teal-400" size={20} />;
    case "Fact": return <Lightbulb className="text-yellow-400" size={20} />;
    default: return <Sparkles className="text-purple-400" size={20} />;
  }
}

function color(category: string) {
  switch (category) {
    case "News": return "bg-blue-900/20 border-blue-800/30 text-blue-400";
    case "Study Tip": return "bg-teal-900/20 border-teal-800/30 text-teal-400";
    case "Fact": return "bg-yellow-900/20 border-yellow-800/30 text-yellow-400";
    default: return "bg-purple-900/20 border-purple-800/30 text-purple-400";
  }
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${color(category)}`}>
      {icon(category)}
      {category}
    </span>
  );
}
