"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSuggestions } from "../services";
import type { Suggestion } from "../types";

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setSuggestions(await fetchSuggestions());
    } catch (err) {
      console.error(err);
      setError("Could not generate suggestions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { suggestions, isLoading, error, reload: load };
}
