"use client";

import React, { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { assignUser, revokeUser } from "../services";

export function AssignedUsersTab({
  fileId, assignedTo, reload, setError,
}: {
  fileId: string;
  assignedTo: string[];
  reload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await assignUser(fileId, email.trim());
      setEmail("");
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not assign");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(mail: string) {
    try {
      await revokeUser(fileId, mail);
      await reload();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Could not revoke");
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
          {assignedTo.map((mail) => (
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
