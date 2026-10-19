"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteGroup, listGroups } from "../services";
import type { GroupSummary } from "../types";

export function useGroups() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setGroups(await listGroups());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteGroup(id);
    setGroups((g) => g.filter((x) => x._id !== id));
  }, []);

  return { groups, loading, error, refresh, remove };
}
