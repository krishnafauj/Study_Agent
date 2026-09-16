// Types for the dashboard (/dashboard/[fileId]) feature module.

export type ParseStatus = "unparsed" | "parsing" | "parsed" | "failed";

export type Section = {
  _id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  parseStatus?: ParseStatus;
  parseProgress?: number;
  topicsCreated?: number;
  mode?: "assign" | "see";
};

export type Chat = {
  chatId: string;
  title: string;
  updatedAt: string;
  fileId: string;
  fileName?: string;
};

export type FileInfo = {
  _id: string;
  fileName: string;
  isOwner?: boolean;
  assignedTo?: string[];
  [key: string]: unknown;
};
