// Types for the student-groups feature module.

export type GroupMember = {
  name: string;
  email: string;
};

/** Item from GET /api/groups (no member list). */
export type GroupSummary = {
  _id: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Full group from GET /api/groups/:id. */
export type Group = Omit<GroupSummary, "memberCount"> & {
  members: GroupMember[];
};

export type GroupInput = {
  name: string;
  description?: string;
  members: GroupMember[];
};

/** Editable row in the create/edit form. */
export type MemberRow = GroupMember & { key: string };

export type ImportResult = {
  members: GroupMember[];
  skippedNoEmail: number;
};
