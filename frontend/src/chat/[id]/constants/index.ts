// Constants for the chat feature module.

export const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const HISTORY_PAGE_SIZE = 50;

/**
 * PDF reader ("Read" button next to Share). Hidden for now — flip to true to
 * bring it back once S3 access is sorted.
 */
export const ENABLE_PDF_READER = false;
