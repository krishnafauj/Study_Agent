"use client";

import React from "react";
import { Users, ShieldCheck } from "lucide-react";
import { TabButton } from "./TabButton";
import { AssignedUsersTab } from "./AssignedUsersTab";
import { PermissionsTab } from "./PermissionsTab";
import type { GrantByEmail, Section } from "../types";

export function OwnerView({
  fileId, tab, setTab, assignedTo, sections, grantByEmail, reload, setError,
}: {
  fileId: string;
  tab: "users" | "permissions";
  setTab: (t: "users" | "permissions") => void;
  assignedTo: string[];
  sections: Section[];
  grantByEmail: GrantByEmail;
  reload: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
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
