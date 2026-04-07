"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  AlertCircle,
  Play,
} from "lucide-react";

type Topic = {
  _id: string;
  title: string;
  level: number;
  summary: string;
  content: string;
  order: number;
  children?: Topic[];
};

type Progress = {
  status: string;
  progress: number;
  totalTopics: number;
  topicsCreated: number;
  fileName: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export default function TopicBrowserPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params?.fileId as string;

  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  // Fetch progress
  const fetchProgress = useCallback(async () => {
    if (!fileId) return;
    try {
      const res = await fetch(`${API_URL}/api/topics/progress/${fileId}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success && data.progress) {
        setProgress(data.progress);
        setIsProcessing(data.progress.status !== "completed" && data.progress.status !== "failed");
      }
    } catch (err) {
      console.error("Failed to fetch progress:", err);
    }
  }, [fileId]);

  // Fetch topics
  const fetchTopics = useCallback(async () => {
    if (!fileId) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (searchQuery) query.append("search", searchQuery);

      const res = await fetch(`${API_URL}/api/topics/${fileId}?${query}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setTopics(data.topics);
      }
    } catch (err) {
      console.error("Failed to fetch topics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fileId, searchQuery]);

  // Start processing
  const handleStartProcessing = async () => {
    if (!fileId) return;
    try {
      const res = await fetch(`${API_URL}/api/topics/process/${fileId}`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        setIsProcessing(true);
        fetchProgress();
      }
    } catch (err) {
      console.error("Failed to start processing:", err);
    }
  };

  useEffect(() => {
    fetchProgress();
    fetchTopics();

    // Poll for progress updates
    if (isProcessing) {
      const interval = setInterval(fetchProgress, 2000);
      return () => clearInterval(interval);
    }
  }, [fileId, isProcessing, fetchProgress, fetchTopics]);

  useEffect(() => {
    fetchTopics();
  }, [searchQuery, fetchTopics]);

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(topicId)) newSet.delete(topicId);
      else newSet.add(topicId);
      return newSet;
    });
  };

  const TopicNode = ({ topic, depth = 0 }: { topic: Topic; depth?: number }) => {
    const isExpanded = expandedTopics.has(topic._id);
    const hasChildren = topic.children && topic.children.length > 0;

    return (
      <div key={topic._id} className="mb-1">
        <button
          onClick={() => {
            if (hasChildren) toggleTopic(topic._id);
            setSelectedTopic(topic);
          }}
          style={{ marginLeft: `${depth * 16}px` }}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
            selectedTopic?._id === topic._id
              ? "bg-purple-600/30 border border-purple-500/50 text-white"
              : "hover:bg-neutral-800/50 text-neutral-300 hover:text-white"
          }`}
        >
          {hasChildren && (
            <ChevronRight
              size={16}
              className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          )}
          {!hasChildren && <div className="w-4" />}

          <BookOpen size={14} className="shrink-0 text-cyan-400" />
          <span className="flex-1 text-sm truncate">{topic.title}</span>
          <span className="text-xs text-neutral-500">L{topic.level}</span>
        </button>

        {isExpanded && hasChildren && (
          <div>
            {topic.children!.map((child) => (
              <TopicNode key={child._id} topic={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <h1 className="text-2xl font-bold text-white mb-4">
            Document Topics & Concepts
          </h1>

          {/* Progress Bar */}
          {progress && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-neutral-400">
                  Processing Status: {progress.status}
                </span>
                <span className="text-sm font-medium text-white">
                  {progress.progress}/10
                </span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.progress / 10) * 100}%` }}
                />
              </div>
              {progress.status === "completed" && (
                <p className="text-xs text-green-400 mt-2">
                  ✅ Found {progress.totalTopics} topics
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {(!progress || progress.status === "failed") && (
            <button
              onClick={handleStartProcessing}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              <Play size={16} />
              {isProcessing ? "Processing..." : "Process Document"}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Topics List */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-3 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1 max-h-96 overflow-y-auto">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-purple-400" />
                  </div>
                ) : topics.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle size={32} className="mx-auto text-neutral-600 mb-2" />
                    <p className="text-neutral-500">
                      {searchQuery ? "No topics found" : "Process document to extract topics"}
                    </p>
                  </div>
                ) : (
                  topics.map((topic) => (
                    <TopicNode key={topic._id} topic={topic} />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Topic Details */}
          <div className="lg:col-span-2">
            {selectedTopic ? (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-6 sticky top-24">
                <div className="mb-4">
                  <span className="inline-block px-2 py-1 bg-purple-600/20 border border-purple-500/50 text-purple-300 text-xs rounded mb-2">
                    Level {selectedTopic.level}
                  </span>
                  <h2 className="text-xl font-bold text-white mb-2">
                    {selectedTopic.title}
                  </h2>
                  {selectedTopic.summary && (
                    <p className="text-sm text-neutral-400 mb-4">
                      {selectedTopic.summary}
                    </p>
                  )}
                </div>

                <div className="border-t border-neutral-700 pt-4">
                  <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                    Full Content
                  </h3>
                  <p className="text-sm text-neutral-400 leading-relaxed max-h-48 overflow-y-auto">
                    {selectedTopic.content}
                  </p>
                </div>

                {selectedTopic.children && selectedTopic.children.length > 0 && (
                  <div className="border-t border-neutral-700 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-neutral-300 mb-2">
                      Subtopics ({selectedTopic.children.length})
                    </h3>
                    <div className="space-y-1">
                      {selectedTopic.children.map((child) => (
                        <button
                          key={child._id}
                          onClick={() => setSelectedTopic(child)}
                          className="block w-full text-left px-2 py-1 text-xs text-neutral-400 hover:text-purple-300 hover:bg-neutral-800/50 rounded transition-colors truncate"
                        >
                          → {child.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-8 text-center">
                <BookOpen size={32} className="mx-auto text-neutral-600 mb-3" />
                <p className="text-neutral-500">
                  Select a topic to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
