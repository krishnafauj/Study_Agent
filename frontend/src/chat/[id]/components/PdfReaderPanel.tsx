"use client";

import React, { useEffect, useState } from "react";
import { BookOpenText, Loader2, X } from "lucide-react";
import { fetchSectionPdf } from "../services";
import type { ReadableSection } from "../types";

/**
 * Side panel that shows ONLY the allowed page range of the book. The server
 * builds a small PDF with just those pages, so the full book never reaches
 * the browser.
 */
export function PdfReaderPanel({
  fileId, sections, initialSectionId, onClose,
}: {
  fileId: string;
  sections: ReadableSection[];
  initialSectionId?: string | null;
  onClose: () => void;
}) {
  const [sectionId, setSectionId] = useState(
    sections.find((s) => s._id === initialSectionId)?._id ?? sections[0]?._id ?? ""
  );
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sectionId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError("");
    setUrl(null);
    fetchSectionPdf(fileId, sectionId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, sectionId]);

  const current = sections.find((s) => s._id === sectionId);

  return (
    <aside className="fixed inset-0 z-40 md:static md:z-auto md:w-[45%] md:min-w-[380px] md:max-w-[720px] flex flex-col bg-neutral-900 md:border md:border-neutral-800 md:rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 shrink-0">
        <BookOpenText size={16} className="text-emerald-400 shrink-0" />
        {sections.length > 1 ? (
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-200 [color-scheme:dark] focus:outline-none"
          >
            {sections.map((s) => (
              <option key={s._id} value={s._id} className="bg-neutral-950 text-neutral-200">
                {s.title} · p.{s.pageStart}–{s.pageEnd}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm text-neutral-200">
            {current?.title} <span className="text-neutral-500">· p.{current?.pageStart}–{current?.pageEnd}</span>
          </span>
        )}
        <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800" title="Close reader">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 relative bg-neutral-950">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-neutral-500" />
          </div>
        )}
        {error && <p className="p-6 text-sm text-red-400">{error}</p>}
        {url && (
          <iframe
            key={url}
            src={`${url}#toolbar=0&navpanes=0`}
            title={current ? `${current.title} pages ${current.pageStart}-${current.pageEnd}` : "Book pages"}
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>
    </aside>
  );
}
