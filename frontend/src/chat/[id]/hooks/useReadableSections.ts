"use client";

import { useEffect, useState } from "react";
import { getReadableSections } from "../services";
import type { ReadableSection } from "../types";

/** Which sections of this chat's book the user may open in the PDF reader. */
export function useReadableSections(fileId: string | null) {
  const [sections, setSections] = useState<ReadableSection[]>([]);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    getReadableSections(fileId)
      .then((s) => !cancelled && setSections(s))
      .catch(() => !cancelled && setSections([]));
    return () => { cancelled = true; };
  }, [fileId]);

  return fileId ? sections : [];
}
