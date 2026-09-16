"use client";

import React, { useState } from "react";
import { Plus, Trash2, Loader2, Network } from "lucide-react";
import { SectionStatus } from "./SectionStatus";
import { UserPermissionCard } from "./UserPermissionCard";
import { buildGraph, createSection, deleteSection, getTopics, reparseSection } from "../services";
import type { GrantByEmail, Section } from "../types";

export function PermissionsTab({
  fileId, assignedTo, sections, grantByEmail, reload, setError,
}: {
  fileId: string;
  assignedTo: string[];
  sections: Section[];
  grantByEmail: GrantByEmail;
  reload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [nsTitle, setNsTitle] = useState("");
  const [nsStart, setNsStart] = useState("");
  const [nsEnd, setNsEnd] = useState("");
  const [savingSection, setSavingSection] = useState(false);

  const [buildingGraph, setBuildingGraph] = useState(false);
  const [graphMsg, setGraphMsg] = useState<string | null>(null);

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!nsTitle || !nsStart || !nsEnd) return;
    setSavingSection(true);
    try {
      await createSection(fileId, { title: nsTitle, pageStart: Number(nsStart), pageEnd: Number(nsEnd), order: sections.length });
      setNsTitle(""); setNsStart(""); setNsEnd("");
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not add section");
    } finally {
      setSavingSection(false);
    }
  }

  async function removeSection(id: string) {
    try {
      await deleteSection(fileId, id);
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not delete section");
    }
  }

  async function reparse(id: string) {
    try {
      await reparseSection(fileId, id);
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not re-parse section");
    }
  }

  async function suggestFromChapters() {
    try {
      const topics: { level?: number; title: string; pageStart?: number; pageEnd?: number }[] = await getTopics(fileId);
      const mains = topics.filter((t) => (t.level ?? 0) === 0);
      let created = 0;
      for (const [i, t] of mains.entries()) {
        if (!t.pageStart || !t.pageEnd) continue;
        await createSection(fileId, { title: t.title, pageStart: t.pageStart, pageEnd: t.pageEnd, order: i });
        created++;
      }
      if (!created) setError("No page numbers on chapters — add sections manually.");
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not read chapters");
    }
  }

  async function onBuildGraph() {
    setBuildingGraph(true);
    setGraphMsg(null);
    try {
      const data = await buildGraph(fileId, false);
      const st = data?.stats;
      setGraphMsg(`Graph built: ${st?.edges ?? 0} prerequisite links across ${st?.nodes ?? 0} concepts.`);
    } catch (err: unknown) {
      setGraphMsg((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Graph build failed");
    } finally {
      setBuildingGraph(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sections */}
      <section className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Sections (page ranges)</h2>
          <button onClick={suggestFromChapters} className="text-xs text-indigo-400 hover:underline">
            Suggest from chapters
          </button>
        </div>

        {sections.length === 0 && (
          <p className="mb-3 text-sm text-gray-500">
            No sections yet. Add page ranges like 1–10, 11–20. Each section is parsed on its
            own the moment you add it — the whole PDF is never parsed at once.
          </p>
        )}

        <ul className="mb-4 divide-y divide-gray-800">
          {sections.map((s) => (
            <li key={s._id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                <span className="font-medium">{s.title}</span>{" "}
                <span className="text-gray-500">pages {s.pageStart}–{s.pageEnd}</span>
              </span>
              <div className="flex items-center gap-3">
                <SectionStatus section={s} onReparse={() => reparse(s._id)} />
                <button onClick={() => removeSection(s._id)} className="text-gray-500 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={addSection} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500">Name</label>
            <input value={nsTitle} onChange={(e) => setNsTitle(e.target.value)} placeholder="Section 1"
              className="w-full rounded-md border border-gray-700 bg-black px-2 py-1 text-sm" />
          </div>
          <div className="w-20">
            <label className="block text-xs text-gray-500">From page</label>
            <input type="number" min={1} value={nsStart} onChange={(e) => setNsStart(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-black px-2 py-1 text-sm" />
          </div>
          <div className="w-20">
            <label className="block text-xs text-gray-500">To page</label>
            <input type="number" min={1} value={nsEnd} onChange={(e) => setNsEnd(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-black px-2 py-1 text-sm" />
          </div>
          <button type="submit" disabled={savingSection}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-700 disabled:opacity-50">
            {savingSection ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Add
          </button>
        </form>
      </section>

      {/* Per-user permissions */}
      <section className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <h2 className="mb-1 font-medium">Permissions per user</h2>
        <p className="mb-4 text-xs text-gray-500">
          Sections are parsed when you create them, so their topics are ready either way.
          Per user, choose a mode per section: <b>Assign</b> = they can chat about it.
          <b> See</b> = view topics only, no chat.
        </p>

        {assignedTo.length === 0 ? (
          <p className="text-sm text-gray-500">Assign a user first (Assigned Users tab).</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-gray-500">Add at least one section above.</p>
        ) : (
          <div className="space-y-4">
            {assignedTo.map((mail) => (
              <UserPermissionCard
                key={mail}
                fileId={fileId}
                email={mail}
                sections={sections}
                initial={grantByEmail[mail] || {}}
                setError={setError}
                reload={reload}
              />
            ))}
          </div>
        )}
      </section>

      {/* Knowledge graph */}
      <section className="rounded-xl border border-gray-800 bg-gray-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Network className="text-indigo-400" size={18} />
          <h2 className="font-medium">Knowledge graph</h2>
        </div>
        <p className="mb-3 text-sm text-gray-400">
          Build the prerequisite links once. A user scoped to (say) Section 2 can still get a needed
          definition from Section 1 — pulled from the graph, without an LLM call, without unlocking the
          rest of the book.
        </p>
        <button onClick={onBuildGraph} disabled={buildingGraph}
          className="inline-flex items-center gap-1 rounded-md border border-indigo-500 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-950 disabled:opacity-50">
          {buildingGraph ? <Loader2 className="animate-spin" size={14} /> : <Network size={14} />} Build knowledge graph
        </button>
        {graphMsg && <p className="mt-2 text-sm text-gray-400">{graphMsg}</p>}
      </section>
    </div>
  );
}
