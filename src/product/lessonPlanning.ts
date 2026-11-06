import { ApiError } from "./onlineApi";
import type { LessonContent } from "./LessonContentEditor";

export type LessonPupil = {
  id: string;
  name: string;
  status: "active" | "archived";
  initials: string;
  color: string;
};
export type LessonMaterial = {
  id: string;
  title: string;
  topic: string;
  grade: string;
  subject: string;
  level: string;
  kind: "PDF" | "Anh" | "BaiTap" | "GhiChu";
  currentVersion: number;
};
export type LessonActivity = Omit<LessonContent, "materialStartPage"> & {
  id: string;
  materialStartPage?: number;
  type: "KhoiDong" | "LyThuyet" | "LuyenTap" | "KiemTra";
  sourceEvidenceIds: string[];
  sourceClaimRefs: { claimId: string; revision: number }[];
  isSourceStale?: boolean;
};
export type LessonSession = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  goal: string;
  sharedGoal: string;
  status: string;
  version: number;
  groupId?: string | null;
  groupName?: string | null;
  Activity_sessionId_items: LessonActivity[];
  RoomMember_sessionId_items: { studentId: string; consent?: boolean }[];
};
export type LessonClaim = {
  id: string;
  studentId: string;
  text: string;
  revision: number;
  evidenceIds: string[];
  observationEvidenceIds: string[];
};

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});
const todayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

export const lessonToday = () => todayFormat.format(new Date());
export const editableLesson = (session: LessonSession) => session.status === "draft" || session.status === "scheduled";
export const lessonOrder = (a: LessonSession, b: LessonSession) =>
  (a.date + a.time).localeCompare(b.date + b.time);
export const lessonPupils = <Pupil extends { id: string }>(
  session: Pick<LessonSession, "RoomMember_sessionId_items">,
  students: Pupil[],
) =>
  session.RoomMember_sessionId_items.flatMap(({ studentId }) => students.filter(pupil => pupil.id === studentId));

export function lessonHeading(
  session: Pick<LessonSession, "title" | "groupName" | "RoomMember_sessionId_items">,
  students: Pick<LessonPupil, "id" | "name">[],
) {
  if (session.groupName) return session.groupName;
  const pupils = lessonPupils(session, students);
  if (pupils.length === 1) return pupils[0].name;
  return pupils.length ? "Nhóm · " + pupils.map(pupil => pupil.name.split(" ").at(-1)).join(", ") : session.title;
}

export function lessonWhen(session: Pick<LessonSession, "date" | "time" | "duration">) {
  const date = dateFormat.format(new Date(session.date + "T00:00:00Z"));
  const [hours, minutes] = session.time.split(":").map(Number);
  const end = hours * 60 + minutes + session.duration;
  const endHour = String(Math.floor(end / 60) % 24).padStart(2, "0");
  const endMinute = String(end % 60).padStart(2, "0");
  return date + " · " + session.time + "–" + endHour + ":" + endMinute + (end >= 1440 ? " (+1 ngày)" : "");
}

export function nextPupilLesson(sessions: LessonSession[], studentId: string) {
  const own = sessions.filter(session => session.RoomMember_sessionId_items.some(member => member.studentId === studentId));
  return own.find(session => session.status === "live") ??
    own.filter(session => editableLesson(session) && session.date >= lessonToday()).sort(lessonOrder)[0];
}

export const lessonError = (error: unknown) =>
  error instanceof ApiError ? error.failure.message : "Không lưu được thay đổi. Vui lòng thử lại.";

export const materialRef = (material: LessonMaterial) => ({
  materialId: material.id,
  version: material.currentVersion,
});
