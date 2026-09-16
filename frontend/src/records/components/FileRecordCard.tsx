"use client";

import React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, AlertTriangle, Target } from "lucide-react";
import { ScoreBar } from "./ScoreBar";
import { ScoreBadge } from "./ScoreBadge";
import type { FileRecord } from "../types";

export function FileRecordCard({
  file, isExpanded, onToggle,
}: {
  file: FileRecord;
  isExpanded: boolean;
  onToggle: (fileId: string) => void;
}) {
  const weakTopics = file.topics.filter((t) => t.weakFlag && t.performanceScore !== null);
  const notAttempted = file.topics.filter((t) => t.performanceScore === null);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden shadow-lg">
      <button onClick={() => onToggle(file.fileId)} className="w-full text-left p-5 hover:bg-gray-900/50 transition-colors">
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
        {weakTopics.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-orange-400 text-xs">
            <AlertTriangle size={14} />
            <span>{weakTopics.length} topic{weakTopics.length > 1 ? "s" : ""} need more practice</span>
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/50">
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
          <div className="p-4 bg-gray-900/30">
            <Link href={`/dashboard/${file.fileId}`} className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 font-medium transition-colors">
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
}
