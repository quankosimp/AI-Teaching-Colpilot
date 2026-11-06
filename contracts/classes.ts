import { z } from "zod";

/** Lịch lặp của một lớp: các thứ trong tuần (0 = Chủ Nhật … 6 = Thứ Bảy) và giờ bắt đầu. */
export const ClassSchedule = z.strictObject({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type ClassScheduleInput = z.infer<typeof ClassSchedule>;

const VN = "Asia/Ho_Chi_Minh";
export const vnToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: VN }).format(now);
export const vnNowTime = (now = new Date()) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: VN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Các ngày học sắp tới theo lịch lặp, tính từ fromDate (gồm cả hôm nay nếu chưa tới giờ). */
export function nextOccurrences(
  days: number[],
  time: string,
  fromDate: string,
  count: number,
  nowTime?: string,
): string[] {
  const wanted = new Set(days);
  if (!wanted.size || count <= 0) return [];
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 7 * (count + 1); i++) {
    const date = addDays(fromDate, i);
    if (!wanted.has(weekday(date))) continue;
    if (i === 0 && nowTime && nowTime > time) continue;
    out.push(date);
  }
  return out;
}

export type OpenCandidate = { id: string; status: string; date: string; time: string };
export type OpenTarget =
  | { kind: "rejoin"; sessionId: string }
  | { kind: "start"; sessionId: string }
  | { kind: "create" };

/** Bấm Mở lớp thì làm gì: vào lại buổi đang học, bắt đầu buổi đã hẹn hôm nay, hoặc tạo buổi mới. */
export function pickOpenTarget(sessions: OpenCandidate[], today: string): OpenTarget {
  const live = sessions.find((s) => s.status === "live");
  if (live) return { kind: "rejoin", sessionId: live.id };
  const todays = sessions
    .filter((s) => (s.status === "scheduled" || s.status === "draft") && s.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  if (todays[0]) return { kind: "start", sessionId: todays[0].id };
  return { kind: "create" };
}
