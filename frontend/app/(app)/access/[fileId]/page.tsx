"use client";

/**
 * Manage Access — full page reached from the dashboard "Assign" button.
 *
 * Owner view: two tabs.
 *   • Assigned Users     — invite / revoke by email (reuses /files/:id/assign|revoke,
 *                          which also sends the assignment email).
 *   • Section Permissions— define page-range sections, then per user pick a mode
 *                          per section: Assign (chat, pages parsed) or See (view only).
 *                          Plus a one-time "Build knowledge graph".
 *
 * Non-owner (student) view: read-only list of their sections with mode badges —
 * exactly what the owner set.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, Users, ShieldCheck, Network, Loader2, Eye, MessageSquare,
} from "lucide-react";
import api from "@/lib/axios/api";

type Section = { _id: string; title: string; pageStart: number; pageEnd: number; order?: number };
type Mode = "none" | "assign" | "see";
type MySection = Section & { mode: "assign" | "see" };

export default function ManageAccessPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState("");

  // owner data
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [grantByEmail, setGrantByEmail] = useState<Record<string, Record<string, "assign" | "see">>>({});

  // student data
  const [mySections, setMySections] = useState<MySection[]>([]);

  const [tab, setTab] = useState<"users" | "permissions">("users");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/access/${fileId}/overview`);
      const d = res.data || {};
      setIsOwner(!!d.isOwner);
      setFileName(d.fileName || "");
      if (d.isOwner) {
        setAssignedTo(d.assignedTo || []);
        setSections(d.sections || []);
        setGrantByEmail(d.grantByEmail || {});
      } else {
        setMySections(d.mySections || []);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || "Failed to load access settings");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => { if (fileId) load(); }, [fileId, load]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="text-indigo-400" size={22} />
          <h1 className="text-2xl font-semibold">Manage Access</h1>
        </div>
        <p className="mb-6 text-sm text-gray-400">{fileName}</p>

        {error && (
          <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : isOwner === false ? (
          <StudentView sections={mySections} />
        ) : (
          <OwnerView
            fileId={fileId}
            tab={tab}
            setTab={setTab}
            assignedTo={assignedTo}
            sections={sections}
            grantByEmail={grantByEmail}
            reload={load}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Student (read-only) ───────────────────────────

function StudentView({ sections }: { sections: MySection[] }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <h2 className="mb-3 font-medium">Your access</h2>
      {sections.length === 0 ? (
        <p className="text-sm text-gray-500">You haven’t been given access to any sections of this document yet.</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {sections.map((s) => (
            <li key={s._id} className="flex items-center justify-between py-2.5">
              <span className="text-sm">
                <span className="font-medium">{s.title}</span>{" "}
                <span className="text-gray-500">pages {s.pageStart}–{s.pageEnd}</span>
              </span>
              <ModeBadge mode={s.mode} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-500">
        <b>Assign</b> = you can chat about that section. <b>See</b> = view only.
      </p>
    </div>
  );
}

function ModeBadge({ mode }: { mode: "assign" | "see" }) {
  return mode === "assign" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-950 px-2.5 py-1 text-xs text-indigo-300">
      <MessageSquare size={12} /> Assign
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
      <Eye size={12} /> See
    </span>
  );
}

// ─────────────────────────── Owner (tabs) ───────────────────────────

function OwnerView(props: {
  fileId: string;
  tab: "users" | "permissions";
  setTab: (t: "users" | "permissions") => void;
  assignedTo: string[];
  sections: Section[];
  grantByEmail: Record<string, Record<string, "assign" | "see">>;
  reload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const { fileId, tab, setTab, assignedTo, sections, grantByEmail, reload, setError } = props;

  return (
    <>
      <div className="mb-6 flex gap-2 border-b border-gray-800">
        <TabButton active={tab === "users"} onClick={() => setTab("users")} icon={<Users size={16} />}>
          Assigned Users
        </TabButton>
        <TabButton active={tab === "permissions"} onClick={() => setTab("permissions")} icon={<ShieldCheck size={16} />}>
          Section Permissions
        </TabButton>
      </div>

      {tab === "users" ? (
        <AssignedUsersTab fileId={fileId} assignedTo={assignedTo} reload={reload} setError={setError} />
      ) : (
        <PermissionsTab
          fileId={fileId}
          assignedTo={assignedTo}
          sections={sections}
          grantByEmail={grantByEmail}
          reload={reload}
          setError={setError}
        />
      )}
    </>
  );
}

function TabButton({ active, onClick, icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
        active ? "border-indigo-500 text-white" : "border-transparent text-gray-400 hover:text-white"
      }`}
    >
      {icon} {children}
    </button>
  );
}

// ── Tab 1: Assigned Users ──

function AssignedUsersTab({ fileId, assignedTo, reload, setError }: any) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/files/${fileId}/assign`, { email: email.trim() });
      setEmail("");
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not assign");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(mail: string) {
    try {
      await api.post(`/api/files/${fileId}/revoke`, { email: mail });
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not revoke");
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <p className="mb-3 text-sm text-gray-400">
        Assign this document to another user. They receive an email and can chat with the topics you
        approve (they cannot view the raw file). Multiple emails allowed, separated by commas or spaces.
      </p>
      <form onSubmit={assign} className="mb-4 flex gap-2">
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 rounded-md border border-gray-700 bg-black px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Assign
        </button>
      </form>

      <h3 className="mb-2 text-sm font-medium text-gray-300">Assigned Users</h3>
      {assignedTo.length === 0 ? (
        <p className="text-xs text-gray-500">Not assigned to anyone yet.</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {assignedTo.map((mail: string) => (
            <li key={mail} className="flex items-center justify-between py-2 text-sm">
              <span>{mail}</span>
              <button onClick={() => revoke(mail)} className="text-xs text-red-400 hover:underline">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tab 2: Section Permissions ──

function PermissionsTab({ fileId, assignedTo, sections, grantByEmail, reload, setError }: any) {
  // new-section form
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
      await api.post(`/api/access/${fileId}/sections`, {
        title: nsTitle, pageStart: Number(nsStart), pageEnd: Number(nsEnd), order: sections.length,
      });
      setNsTitle(""); setNsStart(""); setNsEnd("");
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not add section");
    } finally {
      setSavingSection(false);
    }
  }

  async function deleteSection(id: string) {
    try {
      await api.delete(`/api/access/${fileId}/sections/${id}`);
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not delete section");
    }
  }

  async function suggestFromChapters() {
    try {
      const res = await api.get(`/api/topics/${fileId}`);
      const topics: any[] = res.data?.topics || res.data || [];
      const mains = topics.filter((t) => (t.level ?? 0) === 0);
      let created = 0;
      for (const [i, t] of mains.entries()) {
        if (!t.pageStart || !t.pageEnd) continue;
        await api.post(`/api/access/${fileId}/sections`, {
          title: t.title, pageStart: t.pageStart, pageEnd: t.pageEnd, order: i,
        });
        created++;
      }
      if (!created) setError("No page numbers on chapters — add sections manually.");
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not read chapters");
    }
  }

  async function buildGraph() {
    setBuildingGraph(true);
    setGraphMsg(null);
    try {
      const res = await api.post(`/api/access/${fileId}/graph/build`, { useLlm: false });
      const st = res.data?.stats;
      setGraphMsg(`Graph built: ${st?.edges ?? 0} prerequisite links across ${st?.nodes ?? 0} concepts.`);
    } catch (err: any) {
      setGraphMsg(err?.response?.data?.error || "Graph build failed");
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
            No sections yet. Add page ranges like 1–10, 11–20 — then set who can access each below.
          </p>
        )}

        <ul className="mb-4 divide-y divide-gray-800">
          {sections.map((s: Section) => (
            <li key={s._id} className="flex items-center justify-between py-2">
              <span className="text-sm">
                <span className="font-medium">{s.title}</span>{" "}
                <span className="text-gray-500">pages {s.pageStart}–{s.pageEnd}</span>
              </span>
              <button onClick={() => deleteSection(s._id)} className="text-gray-500 hover:text-red-400">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={addSection} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500">Name</label>
            <input
              value={nsTitle} onChange={(e) => setNsTitle(e.target.value)}
              placeholder="Section 1"
              className="w-full rounded-md border border-gray-700 bg-black px-2 py-1 text-sm"
            />
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
          For each assigned user, choose a mode per section. <b>Assign</b> = they can chat about it
          (those pages get parsed). <b>See</b> = view topics only.
        </p>

        {assignedTo.length === 0 ? (
          <p className="text-sm text-gray-500">Assign a user first (Assigned Users tab).</p>
        ) : sections.length === 0 ? (
          <p className="text-sm text-gray-500">Add at least one section above.</p>
        ) : (
          <div className="space-y-4">
            {assignedTo.map((mail: string) => (
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
        <button onClick={buildGraph} disabled={buildingGraph}
          className="inline-flex items-center gap-1 rounded-md border border-indigo-500 px-3 py-1.5 text-sm text-indigo-300 hover:bg-indigo-950 disabled:opacity-50">
          {buildingGraph ? <Loader2 className="animate-spin" size={14} /> : <Network size={14} />} Build knowledge graph
        </button>
        {graphMsg && <p className="mt-2 text-sm text-gray-400">{graphMsg}</p>}
      </section>
    </div>
  );
}

function UserPermissionCard({ fileId, email, sections, initial, setError, reload }: any) {
  const [modes, setModes] = useState<Record<string, Mode>>(() => {
    const m: Record<string, Mode> = {};
    for (const s of sections) m[s._id] = (initial[s._id] as Mode) || "none";
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setMode(id: string, mode: Mode) {
    setModes((prev) => ({ ...prev, [id]: mode }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = sections
        .filter((s: Section) => modes[s._id] && modes[s._id] !== "none")
        .map((s: Section) => ({ sectionId: s._id, mode: modes[s._id] }));
      await api.post(`/api/access/${fileId}/grants`, { email, sections: payload });
      setSaved(true);
      await reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-black p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{email}</span>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={12} /> : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <div className="space-y-1.5">
        {sections.map((s: Section) => (
          <div key={s._id} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-300">
              {s.title} <span className="text-gray-500">({s.pageStart}–{s.pageEnd})</span>
            </span>
            <select
              value={modes[s._id] || "none"}
              onChange={(e) => setMode(s._id, e.target.value as Mode)}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs"
            >
              <option value="none">No access</option>
              <option value="assign">Assign (chat)</option>
              <option value="see">See (view only)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
