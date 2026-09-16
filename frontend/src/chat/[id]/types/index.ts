// Types for the chat (/chat/[id]) feature module.

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type SectionInfo = {
  id: string;
  title: string | null;
  pageStart?: number;
  pageEnd?: number;
} | null;

export type ScoreToast = {
  topicName: string;
  score: number;
  total: number;
  performanceScore: number;
  weakFlag: boolean;
};

export type ChatContextParams = {
  fileId: string | null;
  folderId: string | null;
  fileName: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  pageStart: string | null;
  pageEnd: string | null;
};
