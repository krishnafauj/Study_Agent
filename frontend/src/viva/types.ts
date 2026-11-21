// Types for the voice-viva (evaluation) feature module.

export type Difficulty = "easy" | "medium" | "hard";

export type AssignmentStats = {
  attempts: number;
  completed: number;
  studentsAttempted: number;
  bestScore: number | null;
  maxScore: number;
  inProgressSessionId: string | null;
};

export type Assignment = {
  _id: string;
  title: string;
  sectionId: string | null;
  sectionTitle: string;
  count: number;
  difficulty: Difficulty;
  answerTimeSec: number;
  createdAt: string;
  studentCount?: number;
  studentEmails?: string[];
  stats: AssignmentStats;
};

export type NewAssignmentInput = {
  fileId: string;
  sectionId: string | null;
  title?: string;
  emails: string[];
  groupIds: string[];
  count: number;
  difficulty: Difficulty;
  answerTimeSec: number;
};

export type Evaluated = {
  index: number;
  score: number;
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
  missingPoints: string[];
  referenceAnswer: string;
};

export type Report = {
  summary: string;
  strengths: string[];
  weakTopics: string[];
  nextSteps: string[];
};

export type AnsweredQuestion = {
  topic: string;
  question: string;
  transcript: string | null;
  score: number | null;
  verdict: string | null;
  feedback: string | null;
  missingPoints: string[];
  referenceAnswer: string;
};

export type VivaSession = {
  sessionId: string;
  fileId: string;
  sectionId: string | null;
  assignmentId: string | null;
  difficulty: Difficulty;
  answerTimeSec: number;
  status: "in_progress" | "completed";
  currentIndex: number;
  totalQuestions: number;
  totalScore: number;
  maxScore: number;
  currentQuestion: { index: number; topic: string; question: string } | null;
  answered: AnsweredQuestion[];
  report: Report | null;
};

export type Attempt = {
  sessionId: string;
  userEmail: string;
  status: "in_progress" | "completed";
  totalScore: number;
  maxScore: number;
  fullscreenExits: number;
  tabSwitches: number;
  startedAt: string;
  completedAt: string | null;
  report: Report | null;
  questions: AnsweredQuestion[];
};

export type AssignmentResults = {
  assignment: {
    _id: string;
    title: string;
    sectionTitle: string;
    count: number;
    difficulty: Difficulty;
    fileId: string;
    studentEmails: string[];
  };
  notStarted: string[];
  attempts: Attempt[];
};

export type GroupOption = { _id: string; name: string; memberCount: number };

/** What the live screen is doing right now. */
export type LivePhase = "ready" | "connecting" | "speaking" | "listening" | "thinking" | "completed" | "error";
