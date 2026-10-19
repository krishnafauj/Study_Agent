// Types for the manage-access (/access/[fileId]) feature module.

export type ParseStatus = "unparsed" | "parsing" | "parsed" | "failed";

/** Stored per-section grant mode. "see" is legacy (topics only, no chat). */
export type GrantMode = "assign" | "full" | "see";

/** UI mode: "assign" = chat only, "full" = chat + read the PDF pages. */
export type Mode = "none" | GrantMode;

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

export type MySection = Section & { mode: GrantMode };

export type GrantByEmail = Record<string, Record<string, GrantMode>>;
