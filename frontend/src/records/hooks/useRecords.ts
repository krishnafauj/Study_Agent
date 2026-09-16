"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRecords } from "../services";
import type { FileRecord } from "../types";

export function useRecords() {
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const recs = await fetchRecords();
      setRecords(recs);
      // Auto-expand files that already have score data.
      setExpandedFiles(new Set(recs.filter((r) => r.attemptedTopics > 0).map((r) => r.fileId)));
    } catch {
      setError("Could not load records.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onScores = () => load();
    window.addEventListener("scoresUpdated", onScores);
    return () => window.removeEventListener("scoresUpdated", onScores);
  }, [load]);

  const toggleExpand = useCallback((fileId: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const totalAttempted = records.reduce((s, r) => s + r.attemptedTopics, 0);
    const totalTopics = records.reduce((s, r) => s + r.totalTopics, 0);
    const scored = records.filter((r) => r.overallScore !== null);
    const avgScore = scored.length
      ? scored.reduce((s, r) => s + (r.overallScore || 0), 0) / scored.length
      : null;
    return { totalAttempted, totalTopics, avgScore };
  }, [records]);

  return { records, isLoading, error, expandedFiles, toggleExpand, stats, reload: load };
}
