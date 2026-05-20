"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Globe, Lightbulb, BookOpen, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Suggestion = {
  category: "News" | "Study Tip" | "Fact";
  title: string;
  description: string;
  relatedTopic: string;
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSuggestions = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/suggestions`, {
        headers: { ...authHeaders() }
      });
      if (!res.ok) throw new Error("Failed to load suggestions.");
      const data = await res.json();
      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions);
      } else {
        throw new Error(data.message || "Failed to load suggestions.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not generate suggestions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "News": return <Globe className="text-blue-400" size={20} />;
      case "Study Tip": return <BookOpen className="text-teal-400" size={20} />;
      case "Fact": return <Lightbulb className="text-yellow-400" size={20} />;
      default: return <Sparkles className="text-purple-400" size={20} />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "News": return "bg-blue-900/20 border-blue-800/30 text-blue-400";
      case "Study Tip": return "bg-teal-900/20 border-teal-800/30 text-teal-400";
      case "Fact": return "bg-yellow-900/20 border-yellow-800/30 text-yellow-400";
      default: return "bg-purple-900/20 border-purple-800/30 text-purple-400";
    }
  };

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
            onClick={loadSuggestions}
            disabled={isLoading}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors flex shrink-0 items-center justify-center"
            title="Refresh Suggestions"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin text-purple-400" : ""} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-800 bg-gray-950 p-6 h-48 flex flex-col justify-between">
                <div>
                  <div className="w-24 h-6 bg-gray-900 rounded mb-4"></div>
                  <div className="w-full h-6 bg-gray-900 rounded mb-2"></div>
                  <div className="w-3/4 h-6 bg-gray-900 rounded"></div>
                </div>
                <div className="w-1/2 h-4 bg-gray-900 rounded"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-8 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={loadSuggestions}
              className="px-6 py-2 bg-red-900/50 hover:bg-red-800/50 text-white rounded-lg transition-colors"
            >
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
              <div 
                key={idx} 
                className="rounded-xl border border-gray-800 bg-gray-950 p-6 flex flex-col hover:border-purple-500/50 transition-colors shadow-lg hover:shadow-purple-900/20"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${getCategoryColor(s.category)}`}>
                    {getCategoryIcon(s.category)}
                    {s.category}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-white mb-2 leading-tight">
                  {s.title}
                </h3>
                
                <p className="text-gray-400 text-sm mb-6 flex-1">
                  {s.description}
                </p>
                
                <div className="pt-4 border-t border-gray-800 mt-auto">
                  <p className="text-xs text-gray-500 font-medium">
                    <span className="uppercase tracking-wider text-gray-600 mr-2">Based on:</span> 
                    <span className="text-purple-300/80">{s.relatedTopic}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
