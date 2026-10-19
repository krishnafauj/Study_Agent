// Types for the home feature module.

export type StoredUser = {
  name?: string;
  email?: string;
  [key: string]: unknown;
};

/** A book (uploaded file) the user can chat with. Shape of GET /api/files items. */
export type Book = {
  _id: string;
  fileName: string;
  isOwner?: boolean;
};
