export type Pupil = { id: string; name: string; initials: string; color: string; status?: string };
export type ClassSchedule = { days: number[]; time: string };
export type ClassSummary = {
  id: string; name: string; subject: string; grade: string; createdAt: string;
  students: Pupil[]; taught: number; attendance: { present: number; slots: number };
  schedule: ClassSchedule | null;
  nextAt: { date: string; time: string; sessionId: string | null } | null;
  live: { sessionId: string; startedAt: string | null; joined: number; total: number } | null;
  pending: { unconfirmed: number; submissions: number };
};
export type ClassStudentRow = Pupil & {
  recent: string[]; attended: number; total: number;
  notes: { id: string; kind: "review" | "good" | null; text: string; date: string; sessionId: string }[];
  aiConsent: "granted" | "revoked" | "unset";
};
export type ClassSessionRow = {
  id: string; title: string; date: string; time: string; duration: number; status: string;
  startedAt: string | null; endedAt: string | null;
  invited: number; present: number; absentNames: string[]; attendanceConfirmed: boolean;
  used: string[]; pendingSubmissions: number;
};
export type ClassDetail = Omit<ClassSummary, "students"> & {
  students: ClassStudentRow[];
  sessions: ClassSessionRow[];
};
