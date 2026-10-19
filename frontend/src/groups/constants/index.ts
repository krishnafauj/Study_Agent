// Constants for the student-groups feature module.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ACCEPTED_SHEET_TYPES = ".xlsx,.csv";

/** Header cells we recognise when importing a sheet. */
export const EMAIL_HEADER_RE = /e-?mail/i;
export const NAME_HEADER_RE = /name/i;
