"use client";

import React from "react";
import { ModeBadge } from "./ModeBadge";
import type { MySection } from "../types";

export function StudentView({ sections }: { sections: MySection[] }) {
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
