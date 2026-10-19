"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw, Users } from "lucide-react";
import { useGroups } from "@/src/groups/hooks";
import { GroupCard, GroupDetailModal, GroupFormModal } from "@/src/groups/components";
import type { Group } from "@/src/groups/types";

export default function StudentGroupsPage() {
  const { groups, loading, error, refresh, remove } = useGroups();
  const [openId, setOpenId] = useState<string | null>(null);
  // undefined = closed, null = create, Group = edit
  const [formGroup, setFormGroup] = useState<Group | null | undefined>(undefined);

  return (
    <div className="h-screen overflow-y-auto bg-black p-4 sm:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={16} /> Back to profile
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Student Groups</h1>
            <p className="text-gray-400 text-sm">Reusable student lists you can assign to any book</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-full"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setFormGroup(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
            >
              <Plus size={16} /> New group
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading && groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
            <Users className="mx-auto text-gray-600 mb-3" size={32} />
            <p className="text-gray-400 mb-4">No groups yet. Create one by hand or import an Excel sheet.</p>
            <button
              onClick={() => setFormGroup(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
            >
              <Plus size={16} /> Create your first group
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <GroupCard key={g._id} group={g} onOpen={() => setOpenId(g._id)} />
            ))}
          </div>
        )}
      </div>

      {openId && formGroup === undefined && (
        <GroupDetailModal
          groupId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(g) => setFormGroup(g)}
          onDelete={remove}
        />
      )}

      {formGroup !== undefined && (
        <GroupFormModal
          group={formGroup}
          onClose={() => setFormGroup(undefined)}
          onSaved={() => {
            setFormGroup(undefined);
            setOpenId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
