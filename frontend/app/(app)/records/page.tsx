"use client";

import React, { useEffect, useState, useCallback } from "react";
import { BarChart2, ChevronDown, ChevronRight, RefreshCw, FileText, Trophy, Target, AlertTriangle } from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Mark = { score: number; total: number; attemptedAt: string };
type TopicRecord = {
  topicName: string;
  summary?: string;
  performanceScore: number | null;
  weakFlag: boolean;
  attempts: number;
  lastAttempt: string | null;
  marks: Mark[];
};
type FileRecord = {
  fileId: string;
  fileName: string;
  uploadedAt: string;
  totalTopics: number;
  attemptedTopics: number;
  overallScore: number | null;
  topics: TopicRecord[];
};

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-900 rounded-full" />
      <span className="text-xs text-gray-600 w-10 text-right">—</span>
    </div>
  );
  const color = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-900 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${score >= 70 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
        {score.toFixed(0)}%
      </span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs px-2 py-1 rounded-full bg-gray-900 text-gray-500 border border-gray-800">Not attempted</span>;
  if (score >= 70) return <span className="text-xs px-2 py-1 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/30">✓ Good</span>;
  if (score >= 50) return <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800/30">⚡ Average</span>;
  return <span className="text-xs px-2 py-1 rounded-full bg-red-900/30 text-red-400 border border-red-800/30">⚠ Needs Work</span>;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/records`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load records");
      const data = await res.json();
      if (data.success) {
        setRecords(data.records);
        // Auto-expand files that have score data
        const withScores = data.records
          .filter((r: FileRecord) => r.attemptedTopics > 0)
          .map((r: FileRecord) => r.fileId);
        setExpandedFiles(new Set(withScores));
      }
    } catch (err) {
      setError("Could not load records.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
    const handleRefresh = () => loadRecords();
    window.addEventListener("scoresUpdated", handleRefresh);
    return () => window.removeEventListener("scoresUpdated", handleRefresh);
  }, [loadRecords]);

  const toggleExpand = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  };

  const totalAttempted = records.reduce((s, r) => s + r.attemptedTopics, 0);
  const totalTopics = records.reduce((s, r) => s + r.totalTopics, 0);
  const avgScore = records.filter(r => r.overallScore !== null).length > 0
    ? records.filter(r => r.overallScore !== null).reduce((s, r) => s + (r.overallScore || 0), 0) /
      records.filter(r => r.overallScore !== null).length
    : null;

  return (
    <div className="h-screen overflow-y-auto bg-black p-4 sm:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <BarChart2 className="text-purple-400" size={32} />
              Performance Records
            </h1>
            <p className="text-gray-400">Track your learning progress across all your study materials.</p>
          </div>
          <button
            onClick={loadRecords}
            disabled={isLoading}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors shrink-0"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin text-purple-400" : ""} />
          </button>
        </div>

        {/* Global Stats */}
        {!isLoading && records.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
              <Trophy className="mx-auto mb-2 text-yellow-400" size={24} />
              <p className="text-2xl font-black text-white">{avgScore !== null ? `${avgScore.toFixed(0)}%` : "—"}</p>
              <p className="text-xs text-gray-500 mt-1">Overall Average</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
              <Target className="mx-auto mb-2 text-blue-400" size={24} />
              <p className="text-2xl font-black text-white">{totalAttempted}</p>
              <p className="text-xs text-gray-500 mt-1">Topics Attempted</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
              <FileText className="mx-auto mb-2 text-purple-400" size={24} />
              <p className="text-2xl font-black text-white">{totalTopics}</p>
              <p className="text-xs text-gray-500 mt-1">Total Topics</p>
            </div>
          </div>
        )}

        {/* Records List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-800 bg-gray-950 p-6 h-24" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-8 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
            <BarChart2 className="mx-auto mb-3 text-gray-700" size={48} />
            <p className="text-gray-400 font-medium">No records yet</p>
            <p className="text-gray-600 text-sm mt-1">Start chatting with your PDFs to build your performance history.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map(file => {
              const isExpanded = expandedFiles.has(file.fileId);
              const weakTopics = file.topics.filter(t => t.weakFlag && t.performanceScore !== null);
              const notAttempted = file.topics.filter(t => t.performanceScore === null);

              return (
                <div key={file.fileId} className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden shadow-lg">
                  {/* File Header */}
                  <button
                    onClick={() => toggleExpand(file.fileId)}
                    className="w-full text-left p-5 hover:bg-gray-900/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-900/20 flex items-center justify-center shrink-0">
                        <FileText className="text-purple-400" size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-white truncate">{file.fileName}</h3>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-gray-500">{file.attemptedTopics}/{file.totalTopics} done</span>
                            {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                          </div>
                        </div>
                        <ScoreBar score={file.overallScore} />
                      </div>
                    </div>

                    {/* Weak topic alerts */}
                    {weakTopics.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-orange-400 text-xs">
                        <AlertTriangle size={14} />
                        <span>{weakTopics.length} topic{weakTopics.length > 1 ? "s" : ""} need more practice</span>
                      </div>
                    )}
                  </button>

                  {/* Topics breakdown */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                      {/* Topic rows */}
                      {file.topics.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          No topic data available yet. Chat with this PDF to generate scores.
                        </div>
                      ) : (
                        file.topics.map((topic, idx) => (
                          <div key={idx} className={`px-5 py-3 flex items-center gap-4 ${topic.weakFlag && topic.performanceScore !== null ? "bg-orange-950/10" : ""}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-sm text-white font-medium truncate">{topic.topicName}</span>
                                <ScoreBadge score={topic.performanceScore} />
                              </div>
                              <ScoreBar score={topic.performanceScore} />
                              {topic.attempts > 0 && (
                                <p className="text-xs text-gray-600 mt-1">
                                  {topic.attempts} attempt{topic.attempts !== 1 ? "s" : ""}
                                  {topic.lastAttempt && ` · Last: ${new Date(topic.lastAttempt).toLocaleDateString()}`}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}

                      {/* Chat button */}
                      <div className="p-4 bg-gray-900/30">
                        <Link
                          href={`/dashboard/${file.fileId}`}
                          className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors"
                        >
                          <Target size={14} />
                          {notAttempted.length > 0
                            ? `Practice ${notAttempted.length} unattempted topic${notAttempted.length > 1 ? "s" : ""}`
                            : "Continue studying →"}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
