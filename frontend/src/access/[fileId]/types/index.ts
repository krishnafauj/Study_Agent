// Types for the manage-access (/access/[fileId]) feature module.

export type ParseStatus = "unparsed" | "parsing" | "parsed" | "failed";

export type Mode = "none" | "assign" | "see";

export type Section = {
  _id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  order?: number;
  parseStatus?: ParseStatus;
  parseProgress?: number;
  topicsCreated?: number;
  parseError?: string | null;
};

export type MySection = Section & { mode: "assign" | "see" };

export type GrantByEmail = Record<string, Record<string, "assign" | "see">>;
