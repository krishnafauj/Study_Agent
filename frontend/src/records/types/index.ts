// Types for the records (/records) feature module.

export type Mark = { score: number; total: number; attemptedAt: string };

export type TopicRecord = {
  topicName: string;
  summary?: string;
  performanceScore: number | null;
  weakFlag: boolean;
  attempts: number;
  lastAttempt: string | null;
  marks: Mark[];
};

export type FileRecord = {
  fileId: string;
  fileName: string;
  uploadedAt: string;
  totalTopics: number;
  attemptedTopics: number;
  overallScore: number | null;
  topics: TopicRecord[];
};
