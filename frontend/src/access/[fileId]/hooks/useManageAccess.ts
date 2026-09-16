"use client";

import { useCallback, useEffect, useState } from "react";
import { PARSE_POLL_MS } from "../constants";
import { getOverview } from "../services";
import type { GrantByEmail, MySection, Section } from "../types";

export function useManageAccess(fileId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState("");

  // owner data
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [grantByEmail, setGrantByEmail] = useState<GrantByEmail>({});

  // student data
  const [mySections, setMySections] = useState<MySection[]>([]);

  const [tab, setTab] = useState<"users" | "permissions">("users");

  // `silent` refreshes (polling, after mutations) skip the loading skeleton so
  // the page doesn't flash/jitter — only the first load shows the skeleton.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const d = await getOverview(fileId);
      setIsOwner(!!d.isOwner);
      setFileName(d.fileName || "");
      if (d.isOwner) {
        setAssignedTo(d.assignedTo || []);
        setSections(d.sections || []);
        setGrantByEmail(d.grantByEmail || {});
      } else {
        setMySections(d.mySections || []);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Failed to load access settings");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fileId]);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    if (fileId) load(false);
  }, [fileId, load]);

  // Poll (silently) while any owner section is still parsing.
  const anyParsing = sections.some((s) => s.parseStatus === "parsing");
  useEffect(() => {
    if (!isOwner || !anyParsing) return;
    const t = setInterval(() => load(true), PARSE_POLL_MS);
    return () => clearInterval(t);
  }, [isOwner, anyParsing, load]);

  return {
    loading, error, setError,
    isOwner, fileName,
    assignedTo, sections, grantByEmail, mySections,
    tab, setTab,
    reload,
  };
}
