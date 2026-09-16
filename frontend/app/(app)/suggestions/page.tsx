"use client";

import { Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { useSuggestions } from "@/src/suggestions/hooks";
import { SuggestionCard, SuggestionsSkeleton } from "@/src/suggestions/components";

export default function SuggestionsPage() {
  const { suggestions, isLoading, error, reload } = useSuggestions();

  return (
    <div className="h-screen overflow-y-auto bg-black p-4 sm:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <Sparkles className="text-purple-400" size={32} />
              AI Study Suggestions
            </h1>
            <p className="text-gray-400 max-w-2xl">
              Discover global news, advanced facts, and study tips generated specifically for the topics in your PDFs.
            </p>
          </div>
          <button
            onClick={reload}
            disabled={isLoading}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors flex shrink-0 items-center justify-center"
            title="Refresh Suggestions"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin text-purple-400" : ""} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <SuggestionsSkeleton />
        ) : error ? (
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-8 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={reload} className="px-6 py-2 bg-red-900/50 hover:bg-red-800/50 text-white rounded-lg transition-colors">
              Try Again
            </button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
            <Lightbulb className="mx-auto mb-3 text-gray-600" size={40} />
            <p className="text-gray-400">No suggestions available. Try uploading a PDF to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {suggestions.map((s, idx) => (
              <SuggestionCard key={idx} suggestion={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
