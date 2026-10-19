"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import { getGroup } from "../services";
import type { Group } from "../types";

export function GroupDetailModal({
  groupId,
  onClose,
  onEdit,
  onDelete,
}: {
  groupId: string;
  onClose: () => void;
  onEdit: (g: Group) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGroup(groupId)
      .then((g) => !cancelled && setGroup(g))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [groupId]);

  const members = useMemo(() => {
    if (!group) return [];
    const q = query.trim().toLowerCase();
    return q
      ? group.members.filter((m) => m.name.toLowerCase().includes(q) || m.email.includes(q))
      : group.members;
  }, [group, query]);

  const handleDelete = async () => {
    if (!group || !confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(group._id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{group?.name ?? "Loading..."}</h3>
            {group && (
              <p className="text-xs text-gray-500 mt-1">
                {group.members.length} students{group.description ? ` • ${group.description}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0"><X size={20} /></button>
        </div>

        {!group && !error && (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
        )}
        {error && <p className="m-6 text-sm text-red-400">{error}</p>}

        {group && (
          <>
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search students..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                />
              </div>
            </div>
            <ul className="px-6 py-3 overflow-y-auto flex-1 space-y-1">
              {members.length === 0 && (
                <li className="text-sm text-gray-500 py-6 text-center">
                  {group.members.length ? "No matching students" : "No students in this group yet"}
                </li>
              )}
              {members.map((m) => (
                <li key={m.email} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800">
                  <div className="w-7 h-7 rounded-full bg-purple-900/30 text-purple-300 text-xs flex items-center justify-center shrink-0">
                    {(m.name || m.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{m.name || "—"}</p>
                    <p className="text-xs text-gray-500 truncate">{m.email}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 px-6 py-4 border-t border-gray-800">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-red-900/10 text-red-500 hover:bg-red-900/20 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
              <button
                onClick={() => onEdit(group)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Pencil size={14} /> Edit group
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
