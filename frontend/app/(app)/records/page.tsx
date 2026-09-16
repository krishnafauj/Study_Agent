"use client";

import { BarChart2, RefreshCw } from "lucide-react";
import { useRecords } from "@/src/records/hooks";
import { GlobalStats, FileRecordCard } from "@/src/records/components";

export default function RecordsPage() {
  const { records, isLoading, error, expandedFiles, toggleExpand, stats, reload } = useRecords();

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
            onClick={reload}
            disabled={isLoading}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors shrink-0"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin text-purple-400" : ""} />
          </button>
        </div>

        {/* Global stats */}
        {!isLoading && records.length > 0 && (
          <GlobalStats avgScore={stats.avgScore} totalAttempted={stats.totalAttempted} totalTopics={stats.totalTopics} />
        )}

        {/* Records list */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
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
            {records.map((file) => (
              <FileRecordCard
                key={file.fileId}
                file={file}
                isExpanded={expandedFiles.has(file.fileId)}
                onToggle={toggleExpand}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
