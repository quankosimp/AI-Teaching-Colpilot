# "Lớp là phòng" — Phần 1: Khung app, Lớp, Mở lớp, Lịch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gia sư mở app là thấy danh sách lớp, bấm **Mở lớp** là vào dạy (không phải tạo buổi trước), xem từng lớp qua ba vùng Các em · Nhật ký buổi, mở hồ sơ em ở khung bên phải, và đặt lịch lặp không bắt buộc.

**Architecture:** Thêm hai hàm thuần trong `contracts/classes.ts` (dùng chung server và client): tính các buổi tới từ lịch lặp, và chọn việc khi bấm Mở lớp. Server thêm lịch vào `StudentGroup`, hai route mới (`PUT /groups/:id/schedule`, `POST /groups/:id/open`) và mở rộng dữ liệu trả về của `/groups`. Giao diện lớp viết lại thành các file nhỏ trong `src/product/classHome/`; `OnlineApp` chỉ còn điều hướng **Lớp · Tài liệu · Tài khoản**. Phòng dạy, màn chấm và tổng kết cũ giữ nguyên, chỉ đổi đường vào và đường ra.

**Tech Stack:** React 19 + Vite 8, TypeScript, Express + Prisma/PostgreSQL, zod, `node:test` qua `tsx` (`pnpm test`), Docker compose `teaching-copilot-local`.

**Spec:** `docs/superpowers/specs/2026-11-06-lop-la-phong-design.md` (mục 4, 5.1–5.4, 6 dòng Lớp/Buổi, 7 dòng Mở lớp, 9 bước 1).

## Global Constraints

- Thanh bên chỉ còn **Lớp · Tài liệu**, Tài khoản ở dưới cùng (spec mục 4).
- Mỗi lần mở lớp là một buổi; Mở lớp: có buổi `live` thì vào lại; có buổi `scheduled` hôm nay thì bắt đầu buổi đó; nếu không thì tạo buổi mới và bắt đầu (spec mục 7).
- Lịch chỉ chọn các thứ trong tuần và giờ bắt đầu, **không hỏi thời lượng** (spec 5.4). Không có lịch vẫn mở lớp được.
- Bỏ khái niệm "buổi lẻ" khỏi giao diện (spec mục 2.2).
- Ngày dùng múi giờ `Asia/Ho_Chi_Minh`, định dạng `YYYY-MM-DD`; thứ dùng 0 = Chủ Nhật … 6 = Thứ Bảy.
- Một buổi tối đa 5 em (luật hiện có của `SessionCreate`). Lớp nhiều hơn 5 em thì Mở lớp báo lỗi rõ ràng.
- Chữ trong giao diện và dữ liệu mẫu không mặc định môn Toán; không hiện "Ổn định" khi chưa có dữ liệu.
- Mọi dòng chữ trong danh sách là một dòng, cắt bằng "…" (class `cls-one`).
- Không in, commit hay chụp màn hình khoá trong `.env.local`. Dựng Docker luôn kèm `--env-file .env.local`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `contracts/classes.ts` (mới) | `ClassSchedule` (zod), `nextOccurrences()`, `pickOpenTarget()` — logic thuần, không đụng DB |
| `tests/unit/product/classes-logic.test.ts` (mới) | Test hai hàm thuần |
| `prisma/schema.prisma`, `prisma/migrations/202611060004_group_schedule/migration.sql` (mới) | Cột lịch trên `StudentGroup` |
| `server/routes/classRooms.ts` (mới) | Route `PUT /groups/:id/schedule`, `POST /groups/:id/open` |
| `server/routes/classes.ts` | Export `ownedGroup`; mở rộng `groupInclude`, `summarize`, `detail`, GET `/groups/:id` (lịch, buổi đang học, việc còn dở, điều cần nhớ) |
| `server/app.ts` | Mount `classRoomsRouter` trước `reviewRouter` |
| `tests/unit/product/class-rooms.integration.test.ts` (mới) | Test HTTP của lịch và Mở lớp trên DB thử riêng |
| `src/product/classHome/types.ts` (mới) | Kiểu dữ liệu `/groups` phía client |
| `src/product/classHome/ui.tsx` (mới) | `Av`, `Stack`, `CIco`, `Modal`, `dayLabel`, `hueOf` dùng chung |
| `src/product/classHome/useOpenClass.ts` (mới) | Gọi `/groups/:id/open` rồi `/sessions/:id/start` khi cần |
| `src/product/classHome/ClassList.tsx` (mới) | Màn danh sách lớp (spec 5.1) |
| `src/product/classHome/InviteLinks.tsx` (mới) | Hộp "Link mời": chép link riêng từng em |
| `src/product/classHome/ScheduleDialog.tsx` (mới) | Hộp "Lịch học của lớp" (spec 5.4) |
| `src/product/classHome/ClassPage.tsx` (mới) | Trang một lớp: đầu trang, dòng lịch, thẻ Các em và Nhật ký buổi (spec 5.2 a, b) |
| `src/product/classHome/StudentDrawer.tsx` (mới) | Hồ sơ em ở khung bên phải (spec 5.3) |
| `src/product/classHome/index.tsx` (mới) | `ClassesHome` ghép ClassList ↔ ClassPage |
| `src/product/classHome/classes-v2.css` (mới) | Style riêng của các màn trên (dựa trên token `--c-*` của `classes.css`) |
| `src/product/OnlineApp.tsx` | Điều hướng mới, trang mặc định `classes`, đường ra khỏi phòng về đúng lớp |
| `src/product/OnlineShell.tsx` | Icon cho mục Lớp |

Thẻ **Tài liệu** trong trang lớp, điều cần nhớ có nhãn "Ôn lại/Làm tốt", màn Sau buổi và đánh dấu một chạm thuộc các kế hoạch sau (xem cuối file).

---

### Task 0: Chốt nền code trước khi sửa

Cây làm việc hiện có thay đổi chưa commit của hai nguồn: Gói 1 (sửa nhãn, nháp tổng kết, liên kết lớp ↔ hồ sơ) và "Lô 1" của một công cụ khác (soạn nội dung, `LessonSchedule`, migration `202611060003_lesson_content`). Kế hoạch này xây trên nền đó.

**Files:** không sửa file.

- [ ] **Step 1: Hỏi người dùng trước khi commit.** Dừng lại, báo danh sách file đang thay đổi (`git status --short`) và xin phép commit nền. Không tự commit. Nếu người dùng muốn bỏ phần của công cụ khác, dừng kế hoạch và hỏi cách xử lý.

- [ ] **Step 2: Kiểm tra nền chạy được**

Run: `pnpm lint && pnpm exec tsc -p tsconfig.server.json --noEmit && pnpm test`
Expected: không lỗi kiểu; `ℹ fail 0`.

- [ ] **Step 3: Commit nền (chỉ khi đã được phép), không gồm hai file chỉ khác xuống dòng**

```bash
git add -A -- . ':!deploy/entrypoint.sh' ':!deploy/scripts/init-minio.sh'
git commit -m "chore: baseline before class-as-room part 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Logic thuần — lịch lặp và Mở lớp

**Files:**
- Create: `contracts/classes.ts`
- Test: `tests/unit/product/classes-logic.test.ts`

**Interfaces:**
- Produces:
  - `ClassSchedule = z.object({ days: z.array(z.number().int().min(0).max(6)).min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })`, type `ClassScheduleInput`.
  - `nextOccurrences(days: number[], time: string, fromDate: string, count: number, nowTime?: string): string[]` — ngày `YYYY-MM-DD` tăng dần, tính từ `fromDate`; nếu `fromDate` là ngày học và `nowTime` đã qua `time` thì bỏ ngày đó.
  - `type OpenCandidate = { id: string; status: string; date: string; time: string }`
  - `type OpenTarget = { kind: "rejoin"; sessionId: string } | { kind: "start"; sessionId: string } | { kind: "create" }`
  - `pickOpenTarget(sessions: OpenCandidate[], today: string): OpenTarget`
  - `vnToday(now?: Date): string`, `vnNowTime(now?: Date): string` (`HH:mm`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/product/classes-logic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClassSchedule,
  nextOccurrences,
  pickOpenTarget,
  vnNowTime,
  vnToday,
} from "../../../contracts/classes.js";

test("nextOccurrences lists the coming weekdays in order", () => {
  // 2026-11-06 is a Friday (5). Thursday = 4, Saturday = 6.
  assert.deepEqual(nextOccurrences([4], "19:30", "2026-11-06", 3), [
    "2026-11-12",
    "2026-11-19",
    "2026-11-26",
  ]);
  assert.deepEqual(nextOccurrences([6, 0], "09:00", "2026-11-06", 3), [
    "2026-11-07",
    "2026-11-08",
    "2026-11-14",
  ]);
});

test("nextOccurrences keeps today only while the start time is ahead", () => {
  assert.deepEqual(nextOccurrences([5], "19:30", "2026-11-06", 1, "18:00"), ["2026-11-06"]);
  assert.deepEqual(nextOccurrences([5], "19:30", "2026-11-06", 1, "20:00"), ["2026-11-13"]);
});

test("nextOccurrences returns nothing for an empty schedule", () => {
  assert.deepEqual(nextOccurrences([], "19:30", "2026-11-06", 3), []);
});

test("ClassSchedule rejects bad days and times", () => {
  assert.equal(ClassSchedule.safeParse({ days: [7], time: "19:30" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [], time: "19:30" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [1], time: "25:00" }).success, false);
  assert.equal(ClassSchedule.safeParse({ days: [1, 4], time: "07:05" }).success, true);
});

test("pickOpenTarget prefers a live session, then today's scheduled one", () => {
  const today = "2026-11-06";
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "a", status: "scheduled", date: today, time: "19:00" },
        { id: "b", status: "live", date: "2026-11-05", time: "19:00" },
      ],
      today,
    ),
    { kind: "rejoin", sessionId: "b" },
  );
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "late", status: "scheduled", date: today, time: "20:00" },
        { id: "early", status: "draft", date: today, time: "08:00" },
        { id: "old", status: "ended", date: today, time: "07:00" },
      ],
      today,
    ),
    { kind: "start", sessionId: "early" },
  );
});

test("pickOpenTarget creates a session when nothing fits today", () => {
  assert.deepEqual(
    pickOpenTarget(
      [
        { id: "x", status: "scheduled", date: "2026-11-12", time: "19:30" },
        { id: "y", status: "ended", date: "2026-11-06", time: "08:00" },
      ],
      "2026-11-06",
    ),
    { kind: "create" },
  );
});

test("vnToday and vnNowTime use Vietnam time", () => {
  const at = new Date("2026-11-06T17:30:00Z"); // 00:30 on 7/11 in Vietnam
  assert.equal(vnToday(at), "2026-11-07");
  assert.equal(vnNowTime(at), "00:30");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/product/classes-logic.test.ts`
Expected: FAIL, `Cannot find module '.../contracts/classes.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// contracts/classes.ts
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
  new Intl.DateTimeFormat("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/product/classes-logic.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add contracts/classes.ts tests/unit/product/classes-logic.test.ts
git commit -m "feat(classes): schedule occurrences and open-class decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lưu lịch lặp trên lớp

**Files:**
- Modify: `prisma/schema.prisma` (model `StudentGroup`)
- Create: `prisma/migrations/202611060004_group_schedule/migration.sql`

**Interfaces:**
- Produces: `StudentGroup.scheduleDays Int[]` (mặc định rỗng = chưa đặt lịch), `StudentGroup.scheduleTime String?`.

- [ ] **Step 1: Thêm cột vào schema.** Trong `model StudentGroup`, ngay sau dòng `createdAt`, thêm:

```prisma
  scheduleDays                     Int[]                @default([])
  scheduleTime                     String?
```

- [ ] **Step 2: Viết migration**

```sql
-- prisma/migrations/202611060004_group_schedule/migration.sql
-- Lịch lặp không bắt buộc của lớp: các thứ trong tuần (0 = Chủ Nhật) và giờ bắt đầu.
ALTER TABLE "StudentGroup" ADD COLUMN "scheduleDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "StudentGroup" ADD COLUMN "scheduleTime" TEXT;
```

- [ ] **Step 3: Sinh client và kiểm tra kiểu**

Run: `pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec tsc -p tsconfig.server.json --noEmit`
Expected: `The schema at prisma/schema.prisma is valid`; không lỗi kiểu.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/202611060004_group_schedule/migration.sql
git commit -m "feat(db): optional weekly schedule on classes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API lịch, Mở lớp và dữ liệu lớp mở rộng

**Files:**
- Create: `server/routes/classRooms.ts`
- Modify: `server/routes/classes.ts` (export `ownedGroup`; `groupInclude`; `summarize`; `detail`; handler `GET /groups/:id`)
- Modify: `server/app.ts` (mount router)
- Test: `tests/unit/product/class-rooms.integration.test.ts`

**Interfaces:**
- Consumes: `ClassSchedule`, `nextOccurrences`, `pickOpenTarget`, `vnToday`, `vnNowTime` (Task 1); cột lịch (Task 2).
- Produces (HTTP, đều cần token gia sư):
  - `PUT /api/v1/groups/:id/schedule` body `{ days: number[], time: "HH:mm" }` → `200 { schedule: { days, time } }`; body không hợp lệ → `400`; lớp của gia sư khác → `403`.
  - `DELETE /api/v1/groups/:id/schedule` → `200 { schedule: null }`.
  - `POST /api/v1/groups/:id/open` → `200 { sessionId: string, action: "rejoin" | "start" | "created", needsStart: boolean }`. Lớp chưa có em → `409 "Thêm học sinh trước khi mở lớp."`; lớp hơn 5 em → `409 "Một buổi học tối đa 5 em. Lớp này đang có N em."`.
  - `GET /api/v1/groups` mỗi lớp thêm: `schedule: { days: number[]; time: string } | null`, `nextAt: { date: string; time: string; sessionId: string | null } | null`, `live: { sessionId: string; startedAt: string | null; joined: number; total: number } | null`, `pending: { unconfirmed: number; submissions: number }`.
  - `GET /api/v1/groups/:id` thêm các trường trên và: `students[].notes: { text: string; date: string; sessionId: string }[]` (tối đa 2, mới nhất trước), `sessions[].used: string[]` (tên tài liệu hoặc hoạt động, tối đa 3), `sessions[].pendingSubmissions: number`, `sessions[].startedAt`, `sessions[].endedAt`.

- [ ] **Step 1: Write the failing integration test**

Suite chạy trên DB thử riêng như `lesson-content.integration.test.ts`; bị bỏ qua khi thiếu `RUN_CLASSES_INTEGRATION=1`.

```ts
// tests/unit/product/class-rooms.integration.test.ts
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../server/app.js";
import { db, loadConfig } from "../../../server/context.js";

test("class schedule and open-class flow", {
  skip: process.env.RUN_CLASSES_INTEGRATION !== "1",
}, async () => {
  // Never touch the user's working database.
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1");
  assert.notEqual(database.pathname, "/copilot");
  const config = loadConfig();
  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, token = "", method = "GET", data?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`, {
      method,
      headers: { Origin: config.origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    const token = (await call("/auth/mock", "", "POST", { account: "teacher-a" })).body.accessToken;
    const other = (await call("/auth/mock", "", "POST", { account: "teacher-b" })).body.accessToken;
    const made = await call("/groups", token, "POST", { name: "Tiếng Anh 7 · Thử", subject: "Tiếng Anh", grade: "Khối 7", newStudents: ["Em Một", "Em Hai"] });
    assert.equal(made.status, 201);
    const groupId = made.body.group.id;

    // Schedule: validation, ownership, save, list shape, clear.
    assert.equal((await call(`/groups/${groupId}/schedule`, token, "PUT", { days: [9], time: "19:30" })).status, 400);
    assert.equal((await call(`/groups/${groupId}/schedule`, other, "PUT", { days: [4], time: "19:30" })).status, 403);
    const saved = await call(`/groups/${groupId}/schedule`, token, "PUT", { days: [4], time: "19:30" });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.schedule, { days: [4], time: "19:30" });
    let list = (await call("/groups", token)).body.groups.find((g: { id: string }) => g.id === groupId);
    assert.deepEqual(list.schedule, { days: [4], time: "19:30" });
    assert.equal(new Date(`${list.nextAt.date}T00:00:00Z`).getUTCDay(), 4);
    assert.equal(list.nextAt.sessionId, null);
    assert.equal(list.live, null);
    assert.equal((await call(`/groups/${groupId}/schedule`, token, "DELETE")).body.schedule, null);

    // Open: creates a session for today, then rejoins it once live.
    const opened = await call(`/groups/${groupId}/open`, token, "POST", {});
    assert.equal(opened.status, 200);
    assert.equal(opened.body.action, "created");
    assert.equal(opened.body.needsStart, true);
    const sessionId = opened.body.sessionId;
    assert.equal((await call(`/sessions/${sessionId}/start`, token, "POST", {})).status, 200);
    const again = await call(`/groups/${groupId}/open`, token, "POST", {});
    assert.deepEqual(again.body, { sessionId, action: "rejoin", needsStart: false });
    list = (await call("/groups", token)).body.groups.find((g: { id: string }) => g.id === groupId);
    assert.equal(list.live.sessionId, sessionId);
    assert.equal(list.live.total, 2);
    assert.equal((await call(`/groups/${groupId}/open`, other, "POST", {})).status, 403);

    // Detail carries notes and session usage fields.
    const detail = (await call(`/groups/${groupId}`, token)).body.group;
    assert.ok(Array.isArray(detail.students[0].notes));
    assert.ok(Array.isArray(detail.sessions[0].used));
    assert.equal(typeof detail.sessions[0].pendingSubmissions, "number");

    // Empty class cannot be opened.
    const empty = (await call("/groups", token, "POST", { name: "Lớp trống", subject: "Ngữ văn", grade: "Khối 9" })).body.group;
    assert.equal((await call(`/groups/${empty.id}/open`, token, "POST", {})).status, 409);
  } finally {
    server.close(); await once(server, "close"); await db.$disconnect();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Dùng DB thử có sẵn của dự án (`copilot_test`, README mục "Kiểm tra"). Lệnh reset chỉ đụng `copilot_test`, không đụng dữ liệu demo của người dùng.

```bash
set -a; source .env; set +a
APP_MODE=test pnpm testdb:reset
```

Run (lấy `DATABASE_URL` của `copilot_test` từ README/.env; không in mật khẩu ra log):
`APP_MODE=test DATABASE_URL="$TEST_DATABASE_URL" RUN_CLASSES_INTEGRATION=1 node --import tsx --test tests/unit/product/class-rooms.integration.test.ts`
Expected: FAIL ở bước đặt lịch (route chưa có, nhận 404 thay vì 400). Sau khi `prisma migrate deploy` lên `copilot_test` có migration Task 2.

Nếu biến chứa URL của DB thử trong `.env` có tên khác `TEST_DATABASE_URL`, dùng đúng tên đó; câu `assert.notEqual(database.pathname, "/copilot")` trong test chặn chạy nhầm vào DB thật.

- [ ] **Step 3: Export `ownedGroup` trong `server/routes/classes.ts`**

Đổi `async function ownedGroup(` thành `export async function ownedGroup(`.

- [ ] **Step 4: Mở rộng `groupInclude` trong `server/routes/classes.ts`**

Thay khối `Activity_sessionId_items: { select: { id: true } },` bằng:

```ts
      Activity_sessionId_items: {
        select: { id: true, title: true, materialIdRef: { select: { title: true } } },
        orderBy: { order: "asc" as const },
      },
      Submission_sessionId_items: { select: { status: true } },
```

và thêm vào `select` của `RoomMember_sessionId_items` dòng `state: true,`.

- [ ] **Step 5: Mở rộng `summarize` trong `server/routes/classes.ts`**

Thêm import ở đầu file:

```ts
import { nextOccurrences, vnNowTime, vnToday } from "../../contracts/classes.js";
```

Trong `summarize`, trước `return {`, thêm:

```ts
  const liveRow = sessions.find((s) => s.status === "live") ?? null;
  const schedule =
    group.scheduleDays.length && group.scheduleTime
      ? { days: [...group.scheduleDays].sort(), time: group.scheduleTime }
      : null;
  const planned = sessions.find(
    (s) => (s.status === "draft" || s.status === "scheduled") && s.date >= today,
  );
  const fromSchedule = schedule
    ? nextOccurrences(schedule.days, schedule.time, vnToday(), 1, vnNowTime())[0]
    : undefined;
  const nextAt =
    planned && (!fromSchedule || planned.date <= fromSchedule)
      ? { date: planned.date, time: planned.time, sessionId: planned.id }
      : fromSchedule && schedule
        ? { date: fromSchedule, time: schedule.time, sessionId: null }
        : null;
  const pendingSubmissions = done.reduce(
    (n, s) => n + s.Submission_sessionId_items.filter((x) => x.status !== "reviewed").length,
    0,
  );
```

và thêm các trường vào object trả về (giữ nguyên các trường cũ):

```ts
    schedule,
    nextAt,
    live: liveRow
      ? {
          sessionId: liveRow.id,
          startedAt: liveRow.startedAt,
          joined: liveRow.RoomMember_sessionId_items.filter((m) => m.state === "joined").length,
          total: liveRow.RoomMember_sessionId_items.length,
        }
      : null,
    pending: { unconfirmed: done.filter((s) => !s.attendanceConfirmedAt).length, submissions: pendingSubmissions },
```

- [ ] **Step 6: Mở rộng `detail` trong `server/routes/classes.ts`**

Đổi chữ ký thành `function detail(group: GroupFull, notes: Map<string, { text: string; date: string; sessionId: string }[]> = new Map())`. Trong `roster.map`, thêm trường `notes: notes.get(st.id) ?? [],`. Trong `list` (map các buổi), thêm:

```ts
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      used: [...new Set(s.Activity_sessionId_items.map((a) => a.materialIdRef?.title || a.title))].slice(0, 3),
      pendingSubmissions: s.Submission_sessionId_items.filter((x) => x.status !== "reviewed").length,
```

Trong handler `GET /groups/:id`, thay `return res.json({ group: detail(full) });` bằng:

```ts
      const claims = await db.claim.findMany({
        where: {
          status: "approved",
          studentId: { in: full.StudentGroupMember_groupId_items.map((m) => m.studentId) },
          sessionIdRef: { groupId: full.id, teacherId: res.locals.actor.id },
        },
        orderBy: { reviewedAt: "desc" },
        select: { studentId: true, text: true, sessionId: true, reviewedAt: true, updatedAt: true },
      });
      const notes = new Map<string, { text: string; date: string; sessionId: string }[]>();
      for (const c of claims) {
        const list = notes.get(c.studentId) ?? [];
        if (list.length < 2)
          list.push({ text: c.text, sessionId: c.sessionId, date: (c.reviewedAt ?? c.updatedAt).toISOString().slice(0, 10) });
        notes.set(c.studentId, list);
      }
      return res.json({ group: detail(full, notes) });
```

- [ ] **Step 7: Viết router mới**

```ts
// server/routes/classRooms.ts
import { Router } from "express";
import { ClassSchedule, pickOpenTarget, vnNowTime, vnToday } from "../../contracts/classes.js";
import { asyncRoute, audit, db, fail, requireTeacher, type AppConfig, type TeacherActor } from "../context.js";
import { ownedGroup } from "./classes.js";

const MAX_PER_SESSION = 5;

/** Lớp là phòng: lịch lặp không bắt buộc và nút Mở lớp. */
export function classRoomsRouter(config: AppConfig) {
  const r = Router();
  const teacher = requireTeacher(config);

  r.put(
    "/groups/:id/schedule",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      const parsed = ClassSchedule.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Lịch học chưa hợp lệ");
      const days = [...new Set(parsed.data.days)].sort();
      await db.studentGroup.update({ where: { id: group.id }, data: { scheduleDays: days, scheduleTime: parsed.data.time } });
      await audit(res.locals.actor, "group.schedule_set", "student_group", group.id, res.locals.requestId);
      return res.json({ schedule: { days, time: parsed.data.time } });
    }),
  );

  r.delete(
    "/groups/:id/schedule",
    teacher,
    asyncRoute(async (req, res) => {
      const group = await ownedGroup(req.params.id, res.locals.actor, res);
      if (!group) return;
      await db.studentGroup.update({ where: { id: group.id }, data: { scheduleDays: [], scheduleTime: null } });
      await audit(res.locals.actor, "group.schedule_cleared", "student_group", group.id, res.locals.requestId);
      return res.json({ schedule: null });
    }),
  );

  r.post(
    "/groups/:id/open",
    teacher,
    asyncRoute(async (req, res) => {
      const actor: TeacherActor = res.locals.actor;
      const group = await ownedGroup(req.params.id, actor, res);
      if (!group) return;
      const sessions = await db.session.findMany({
        where: { groupId: group.id, teacherId: actor.id },
        select: { id: true, status: true, date: true, time: true },
      });
      const target = pickOpenTarget(sessions, vnToday());
      if (target.kind !== "create")
        return res.json({
          sessionId: target.sessionId,
          action: target.kind,
          needsStart: target.kind === "start",
        });
      const roster = await db.studentGroupMember.findMany({
        where: { groupId: group.id, studentIdRef: { teacherId: actor.id, status: "active" } },
        select: { studentId: true },
        orderBy: { studentId: "asc" },
      });
      if (!roster.length) return fail(res, 409, "SESSION_STATE_INVALID", "Thêm học sinh trước khi mở lớp.");
      if (roster.length > MAX_PER_SESSION)
        return fail(res, 409, "SESSION_STATE_INVALID", `Một buổi học tối đa ${MAX_PER_SESSION} em. Lớp này đang có ${roster.length} em.`);
      const ids = roster.map((m) => m.studentId);
      const count = await db.session.count({ where: { groupId: group.id } });
      const session = await db.session.create({
        data: {
          teacherId: actor.id,
          primaryStudentId: ids[0],
          groupId: group.id,
          groupName: group.name,
          title: `Buổi ${count + 1} · ${group.name}`,
          status: "scheduled",
          goal: "",
          sharedGoal: "",
          date: vnToday(),
          time: vnNowTime(),
          duration: 60,
          tools: { board: true, upload: true, check: true, chat: true },
          completedActivityIds: [],
          dismissedSuggestionIds: [],
          RoomMember_sessionId_items: { create: ids.map((studentId) => ({ studentId })) },
        },
      });
      await audit(actor, "session.created", "session", session.id, res.locals.requestId, session.id, { groupId: group.id, via: "open" });
      return res.json({ sessionId: session.id, action: "created", needsStart: true });
    }),
  );

  return r;
}
```

`duration: 60` chỉ để thoả cột bắt buộc của `Session`; giao diện không hiện con số này.

- [ ] **Step 8: Mount router trong `server/app.ts`**

Thêm import `import { classRoomsRouter } from "./routes/classRooms.js";` và ngay sau dòng `app.use("/api/v1", classesRouter(config));` thêm `app.use("/api/v1", classRoomsRouter(config));`. Router này phải nằm **trước** `reviewRouter` và `teacherRouter` (hai router đó gắn `requireTeacher` cho mọi đường dẫn).

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm exec tsc -p tsconfig.server.json --noEmit` rồi lệnh integration ở Step 2.
Expected: không lỗi kiểu; test PASS.

- [ ] **Step 10: Chạy toàn bộ test**

Run: `pnpm test`
Expected: `ℹ fail 0` (suite integration mới bị bỏ qua khi thiếu biến môi trường).

- [ ] **Step 11: Commit**

```bash
git add server/routes/classRooms.ts server/routes/classes.ts server/app.ts tests/unit/product/class-rooms.integration.test.ts
git commit -m "feat(classes): schedule and open-class API, richer class data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kiểu dữ liệu, thành phần dùng chung và hook Mở lớp (client)

**Files:**
- Create: `src/product/classHome/types.ts`, `src/product/classHome/ui.tsx`, `src/product/classHome/useOpenClass.ts`, `src/product/classHome/classes-v2.css`

**Interfaces:**
- Consumes: HTTP của Task 3; `api`, `ApiError` từ `src/product/onlineApi.ts`.
- Produces:
  - Kiểu `Pupil`, `ClassSchedule`, `ClassSummary`, `ClassDetail`, `ClassSessionRow`, `ClassStudentRow`.
  - `Av({ p, size })`, `Stack({ people, max })`, `CIco({ name, size })`, `Modal({ title, sub, onClose, children, footer, wide })`, `dayLabel(date)`, `weekdayNames`, `hueOf(key)`, `errText(e)`, `copyText(text)`.
  - `useOpenClass(onEnter: (sessionId: string) => void): { open: (groupId: string) => Promise<void>; busy: string; error: string; clearError: () => void }`.

- [ ] **Step 1: Viết `types.ts`**

```ts
// src/product/classHome/types.ts
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
  notes: { text: string; date: string; sessionId: string }[];
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
```

- [ ] **Step 2: Viết `ui.tsx`** (chuyển từ `Classes.tsx`, không đổi hành vi)

```tsx
// src/product/classHome/ui.tsx
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { ApiError } from "../onlineApi";
import type { Pupil } from "./types";

const HUES: Record<string, number> = { violet: 262, sky: 200, emerald: 160, amber: 38, rose: 345, indigo: 235, teal: 175, blue: 215, green: 145, orange: 25, pink: 330 };
export const hueOf = (key: string) => HUES[key] ?? [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Không thể hoàn thành yêu cầu.");
export const weekdayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_LONG = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
export const shortCode = (name: string) =>
  name.replace(/[·\-–]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "L";
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function Av({ p, size = 28 }: { p: { initials: string; color: string; name?: string }; size?: number }) {
  return <span className="cls-av" title={p.name} style={{ width: size, height: size, fontSize: size < 26 ? 9 : 11, ["--h" as string]: hueOf(p.color || p.initials) }}>{p.initials}</span>;
}
export function Stack({ people, max = 5 }: { people: Pupil[]; max?: number }) {
  return <span className="cls-stack">{people.slice(0, max).map((p) => <Av key={p.id} p={p} size={24} />)}{people.length > max && <span className="cls-av cls-av--more">+{people.length - max}</span>}</span>;
}
export function CIco({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`cls-cico${size === "lg" ? " is-lg" : size === "sm" ? " is-sm" : ""}`} style={{ ["--h" as string]: hueOf(name) }}>{shortCode(name)}</span>;
}
export function Modal({ title, sub, onClose, children, footer, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="cls-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`cls-modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="cls-modal__h"><div className="cls-min"><h2>{title}</h2>{sub && <p className="cls-muted cls-one">{sub}</p>}</div><button type="button" className="cls-ib" aria-label="Đóng" onClick={onClose}><X size={18} /></button></div>
      <div className="cls-modal__b">{children}</div>
      <div className="cls-modal__f">{footer}</div>
    </div>
  </div>;
}
```

- [ ] **Step 3: Viết `useOpenClass.ts`**

```ts
// src/product/classHome/useOpenClass.ts
import { useCallback, useState } from "react";
import { api } from "../onlineApi";
import { errText } from "./ui";

type OpenResult = { sessionId: string; action: "rejoin" | "start" | "created"; needsStart: boolean };

/** Bấm Mở lớp: hỏi server buổi nào, bắt đầu buổi nếu cần, rồi vào phòng. */
export function useOpenClass(onEnter: (sessionId: string) => void) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const open = useCallback(async (groupId: string) => {
    setBusy(groupId);
    setError("");
    try {
      const r = await api<OpenResult>(`/groups/${groupId}/open`, { method: "POST", body: "{}" });
      if (r.needsStart) await api(`/sessions/${r.sessionId}/start`, { method: "POST", body: "{}" });
      onEnter(r.sessionId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }, [onEnter]);
  return { open, busy, error, clearError: () => setError("") };
}
```

- [ ] **Step 4: Viết `classes-v2.css`**

```css
/* src/product/classHome/classes-v2.css — màn Lớp là phòng. Dùng token --c-* của ../classes.css */
.cls-grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
.cls-room { padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cls-room.is-live { border-color: #bfe7d4; box-shadow: 0 0 0 3px #e8f7f0; }
.cls-room__top { display: flex; align-items: center; gap: 12px; min-width: 0; border: 0; background: none; padding: 0; text-align: left; }
.cls-room__name { font-size: 16px; line-height: 22px; font-weight: 700; }
.cls-state { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--c-soft); font-size: 13px; color: var(--c-sub); min-width: 0; }
.cls-state b { font-weight: 600; color: var(--c-ink); }
.cls-state.is-live { background: var(--c-ok-bg); color: var(--c-ok-ink); }
.cls-state.is-live b { color: var(--c-ok-ink); }
.cls-livedot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 4px #c9f0de; flex: none; }
.cls-todo { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--c-warn-ink); min-width: 0; }
.cls-todo::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--c-warn); flex: none; }
.cls-todo.is-none { color: var(--c-muted); }
.cls-todo.is-none::before { background: var(--c-line2); }
.cls-room__ft { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--c-line); }
.cls-btn--go { background: #10b981; color: #fff !important; }
.cls-btn--lg { height: 40px; padding: 0 18px; font-size: 14px !important; }
.cls-newroom { border: 1.5px dashed var(--c-line2); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--c-acc-ink) !important; font-weight: 600 !important; min-height: 240px; background: none; }
.cls-sched { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 12px; background: var(--c-soft); font-size: 13px; color: var(--c-sub); min-width: 0; }
.cls-sched b { color: var(--c-ink); font-weight: 600; }
.cls-tabs2 { display: flex; gap: 26px; border-bottom: 1px solid var(--c-line); }
.cls-tabs2 button { height: 42px; padding: 0; border: 0; background: none; font-size: 14px !important; font-weight: 500; color: var(--c-sub) !important; border-bottom: 2px solid transparent; margin-bottom: -1px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.cls-tabs2 button.is-on { color: var(--c-ink) !important; font-weight: 600; border-bottom-color: var(--c-acc); }
.cls-etbl .cls-th, .cls-etbl .cls-tr { grid-template-columns: minmax(0, .9fr) 110px minmax(0, 1.6fr) 120px; }
.cls-tr.is-sel { background: color-mix(in srgb, var(--c-acc-bg) 40%, var(--c-surface)); }
.cls-mitem { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; }
.cls-mitem + .cls-mitem { margin-top: 6px; }
.cls-mitem .from { flex: none; color: var(--c-muted); font-size: 12px; }
.cls-tagnote { flex: none; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; background: var(--c-acc-bg); color: var(--c-acc-ink); }
.cls-log .cls-lrow { display: grid; grid-template-columns: 120px minmax(0, 1.5fr) 140px 210px; gap: 18px; align-items: center; min-height: 68px; padding: 10px 20px; }
.cls-log .cls-lrow + .cls-lrow { border-top: 1px solid var(--c-line); }
.cls-log .cls-lrow.is-next { background: color-mix(in srgb, var(--c-acc-bg) 25%, var(--c-surface)); }
.cls-lrow .when b { display: block; font: 600 14px Inter, sans-serif; }
.cls-lrow .when .cls-muted { display: block; }
.cls-lrow .what b { display: block; font-weight: 600; }
.cls-chips2 { display: flex; gap: 6px; margin-top: 6px; min-width: 0; overflow: hidden; }
.cls-chip2 { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: 7px; font-size: 12px; font-weight: 500; background: var(--c-soft); color: var(--c-sub); border: 1px solid var(--c-line); white-space: nowrap; flex: none; }
.cls-lrow .act { display: flex; justify-content: flex-end; }
.cls-drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 440px; max-width: 100%; z-index: 81; background: var(--c-surface); box-shadow: var(--c-pop); display: flex; flex-direction: column; }
.cls-drawer__h { display: flex; align-items: center; gap: 12px; padding: 18px 18px 14px 22px; border-bottom: 1px solid var(--c-line); }
.cls-drawer__h b { display: block; font-size: 17px; line-height: 24px; font-weight: 700; }
.cls-drawer__b { flex: 1; min-height: 0; overflow: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 22px; }
.cls-sect h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--c-sub); display: flex; align-items: center; gap: 8px; }
.cls-mcard { display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--c-line2); align-items: flex-start; }
.cls-mcard + .cls-mcard { margin-top: 8px; }
.cls-mcard b { display: block; font-weight: 600; font-size: 13px; line-height: 18px; }
.cls-kv2 { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; font-size: 13px; }
.cls-kv2 span:nth-child(odd) { color: var(--c-muted); }
.cls-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cls-days button { height: 40px; border-radius: 10px; border: 1px solid var(--c-line2); background: var(--c-surface); font-weight: 600 !important; font-size: 13px !important; color: var(--c-sub) !important; }
.cls-days button.is-on { background: var(--c-acc); border-color: var(--c-acc); color: #fff !important; }
.cls-preview { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: var(--c-soft); font-size: 13px; color: var(--c-sub); }
.cls-preview b { color: var(--c-ink); font-weight: 600; }
@media (max-width: 1360px) {
  .cls-etbl .cls-th, .cls-etbl .cls-tr { grid-template-columns: minmax(0, .9fr) 90px minmax(0, 1.5fr) 72px; }
  .cls-log .cls-lrow { grid-template-columns: 104px minmax(0, 1.5fr) 120px 190px; }
}
@media (max-width: 720px) {
  .cls-etbl .cls-tr { grid-template-columns: minmax(0, 1fr) auto; height: auto; padding: 12px 16px; }
  .cls-etbl .cls-tr > :nth-child(2), .cls-etbl .cls-tr > :nth-child(3) { display: none; }
  .cls-log .cls-lrow { grid-template-columns: minmax(0, 1fr) auto; }
  .cls-log .cls-lrow > :nth-child(3) { display: none; }
}
```

- [ ] **Step 5: Kiểm tra kiểu**

Run: `pnpm lint`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/product/classHome/types.ts src/product/classHome/ui.tsx src/product/classHome/useOpenClass.ts src/product/classHome/classes-v2.css
git commit -m "feat(classes-ui): shared types, primitives and open-class hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Màn danh sách lớp và hộp Link mời

**Files:**
- Create: `src/product/classHome/ClassList.tsx`, `src/product/classHome/InviteLinks.tsx`

**Interfaces:**
- Consumes: `ClassSummary`, `Pupil` (Task 4); `Av`, `Stack`, `CIco`, `Modal`, `dayLabel`, `weekdayNames`, `errText`, `copyText`; `useOpenClass`; `GET /groups`, `GET /students/:id/link`.
- Produces:
  - `ClassList({ groups, error, onOpenClass, onEnterRoom, onCreate }: { groups: ClassSummary[] | null; error: string; onOpenClass: (id: string) => void; onEnterRoom: (sessionId: string, groupId: string) => void; onCreate: () => void })`
  - `InviteLinks({ title, students, onClose }: { title: string; students: Pupil[]; onClose: () => void })`
  - `stateLine(g: ClassSummary): { live: boolean; text: string }` (export để test bằng mắt và dùng lại ở ClassPage)

- [ ] **Step 1: Viết `InviteLinks.tsx`**

```tsx
// src/product/classHome/InviteLinks.tsx
import { useState } from "react";
import { Copy } from "lucide-react";
import { api } from "../onlineApi";
import { Av, Modal, copyText, errText } from "./ui";
import type { Pupil } from "./types";

/** Mỗi em có link riêng, dùng mãi cho mọi buổi của lớp. */
export function InviteLinks({ title, students, onClose }: { title: string; students: Pupil[]; onClose: () => void }) {
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const copy = async (p: Pupil) => {
    setError("");
    try {
      const r = await api<{ url: string }>(`/students/${p.id}/link`);
      const ok = await copyText(r.url);
      setDone(ok ? p.id : "");
      if (!ok) setError(r.url); // trình duyệt chặn chép: hiện link để gia sư tự chép
    } catch (e) { setError(errText(e)); }
  };
  return <Modal title="Link mời" sub={title} onClose={onClose} footer={<button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Đóng</button>}>
    <p className="cls-muted">Gửi mỗi em link của em đó. Link không đổi giữa các buổi; em bấm vào là vào lớp khi bạn mở lớp.</p>
    <div className="cls-pick">
      {students.map((p) => <div key={p.id} className="cls-prow" style={{ cursor: "default" }}>
        <Av p={p} /><b className="cls-one">{p.name}</b><span className="cls-grow" />
        <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void copy(p)}><Copy size={14} />{done === p.id ? "Đã chép" : "Chép link"}</button>
      </div>)}
    </div>
    {error && <p className="cls-alert" role="alert">{error}</p>}
  </Modal>;
}
```

- [ ] **Step 2: Viết `ClassList.tsx`**

```tsx
// src/product/classHome/ClassList.tsx
import { useRef, useState } from "react";
import { AlertCircle, CalendarDays, Link2, Plus, UserPlus, Video } from "lucide-react";
import { CIco, Stack, dayLabel, weekdayNames } from "./ui";
import { InviteLinks } from "./InviteLinks";
import { useOpenClass } from "./useOpenClass";
import type { ClassSummary } from "./types";
import "../classes.css";
import "./classes-v2.css";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");

/** Dòng trạng thái của thẻ lớp: đang học, lịch tới, hoặc chưa đặt lịch. */
export function stateLine(g: ClassSummary): { live: boolean; text: string } {
  if (g.live) return { live: true, text: `Đang học · từ ${hhmm(g.live.startedAt)} · ${g.live.joined}/${g.live.total} em` };
  if (g.nextAt) {
    const days = g.schedule ? g.schedule.days.map((d) => weekdayNames[d]).join(", ") : dayLabel(g.nextAt.date);
    return { live: false, text: `Lịch ${days} · ${g.nextAt.time} · tới ${dayLabel(g.nextAt.date)}` };
  }
  return { live: false, text: "Chưa đặt lịch" };
}
export function todoLine(g: ClassSummary) {
  const parts = [
    g.pending.unconfirmed ? `${g.pending.unconfirmed} buổi chờ xác nhận` : "",
    g.pending.submissions ? `${g.pending.submissions} bài chưa nhận xét` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

export function ClassList({ groups, error, onOpenClass, onEnterRoom, onCreate }: {
  groups: ClassSummary[] | null;
  error: string;
  onOpenClass: (id: string) => void;
  /** groupId đi kèm để thoát phòng là về đúng lớp. */
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onCreate: () => void;
}) {
  const lastGroup = useRef("");
  const opener = useOpenClass((sessionId) => onEnterRoom(sessionId, lastGroup.current));
  const [invite, setInvite] = useState<ClassSummary | null>(null);
  const sorted = groups ? [...groups].sort((a, b) => Number(!!b.live) - Number(!!a.live)) : null;
  return <div className="cls">
    <div className="cls-ph">
      <div className="cls-min"><h1>Lớp của bạn</h1><p className="cls-muted cls-one">Mỗi lớp là một phòng học cố định. Bấm Mở lớp là vào dạy ngay.</p></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--pri" onClick={onCreate}><Plus size={16} />Tạo lớp</button>
    </div>
    {(error || opener.error) && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error || opener.error}</p>}
    {!sorted && !error && <p className="cls-muted" role="status">Đang tải danh sách lớp…</p>}
    {sorted && sorted.length === 0 && <div className="cls-empty">
      <span className="cls-ico cls-ico--acc"><UserPlus size={20} /></span>
      <b>Chưa có lớp nào</b>
      <p className="cls-muted">Tạo lớp để mỗi em có link riêng, mở lớp một chạm và app tự ghi lại từng buổi.</p>
      <button type="button" className="cls-btn cls-btn--pri" onClick={onCreate}><Plus size={16} />Tạo lớp đầu tiên</button>
    </div>}
    {sorted && sorted.length > 0 && <div className="cls-grid2">
      {sorted.map((g) => {
        const st = stateLine(g);
        const todo = todoLine(g);
        return <section key={g.id} className={`cls-card cls-room${st.live ? " is-live" : ""}`}>
          <button type="button" className="cls-room__top" onClick={() => onOpenClass(g.id)}>
            <CIco name={g.name} />
            <span className="cls-min"><b className="cls-one cls-room__name">{g.name}</b><span className="cls-muted cls-one">{g.subject} · {g.grade}{g.students.length === 1 ? " · dạy kèm 1–1" : ""}</span></span>
          </button>
          <div className="cls-row"><Stack people={g.students} /><span className="cls-muted cls-one">{g.students.length} em</span></div>
          <div className={`cls-state${st.live ? " is-live" : ""}`}>{st.live ? <span className="cls-livedot" /> : <CalendarDays size={15} />}<span className="cls-one">{st.text}</span></div>
          <div className={`cls-todo${todo ? "" : " is-none"}`}><span className="cls-one">{todo || "Không có việc còn dở"}</span></div>
          <div className="cls-room__ft">
            {g.live
              ? <button type="button" className="cls-btn cls-btn--go" onClick={() => onEnterRoom(g.live!.sessionId, g.id)}><Video size={16} />Vào lại</button>
              : <button type="button" className="cls-btn cls-btn--pri" disabled={!g.students.length || opener.busy === g.id} onClick={() => { lastGroup.current = g.id; void opener.open(g.id); }}><Video size={16} />{opener.busy === g.id ? "Đang mở…" : "Mở lớp"}</button>}
            <span className="cls-grow" />
            <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={!g.students.length} onClick={() => setInvite(g)}><Link2 size={14} />Link mời</button>
          </div>
        </section>;
      })}
      <button type="button" className="cls-newroom" onClick={onCreate}><span className="cls-ico cls-ico--acc"><Plus size={18} /></span>Tạo lớp mới<span className="cls-muted" style={{ fontWeight: 400 }}>Dạy kèm 1–1 cũng là một lớp</span></button>
    </div>}
    {invite && <InviteLinks title={invite.name} students={invite.students} onClose={() => setInvite(null)} />}
  </div>;
}
```

Nút không có em thì tắt (`disabled`), đúng spec mục 8.

- [ ] **Step 3: Thêm style nút chữ còn thiếu vào `classes-v2.css`**

```css
.cls-btn--txt { color: var(--c-acc-ink) !important; padding: 0 8px; }
```

- [ ] **Step 4: Kiểm tra kiểu**

Run: `pnpm lint`
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/product/classHome/ClassList.tsx src/product/classHome/InviteLinks.tsx src/product/classHome/classes-v2.css
git commit -m "feat(classes-ui): class list as rooms with open and invite links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hộp đặt lịch

**Files:**
- Create: `src/product/classHome/ScheduleDialog.tsx`

**Interfaces:**
- Consumes: `nextOccurrences`, `vnToday`, `vnNowTime` từ `contracts/classes`; `PUT/DELETE /groups/:id/schedule`; `Modal`, `dayLabel`, `weekdayNames`, `errText`.
- Produces: `ScheduleDialog({ groupId, groupName, schedule, onClose, onSaved }: { groupId: string; groupName: string; schedule: ClassSchedule | null; onClose: () => void; onSaved: (s: ClassSchedule | null) => void })`

- [ ] **Step 1: Viết `ScheduleDialog.tsx`**

```tsx
// src/product/classHome/ScheduleDialog.tsx
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { nextOccurrences, vnNowTime, vnToday } from "../../../contracts/classes";
import { api } from "../onlineApi";
import { Modal, dayLabel, errText, weekdayNames } from "./ui";
import type { ClassSchedule } from "./types";

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // T2 … CN

export function ScheduleDialog({ groupId, groupName, schedule, onClose, onSaved }: {
  groupId: string; groupName: string; schedule: ClassSchedule | null;
  onClose: () => void; onSaved: (s: ClassSchedule | null) => void;
}) {
  const [days, setDays] = useState<number[]>(schedule?.days ?? []);
  const [time, setTime] = useState(schedule?.time ?? "19:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = nextOccurrences(days, time, vnToday(), 3, vnNowTime());
  const toggle = (d: number) => setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
  const save = async () => {
    setBusy(true); setError("");
    try {
      const r = await api<{ schedule: ClassSchedule }>(`/groups/${groupId}/schedule`, { method: "PUT", body: JSON.stringify({ days, time }) });
      onSaved(r.schedule);
    } catch (e) { setError(errText(e)); setBusy(false); }
  };
  const clear = async () => {
    setBusy(true); setError("");
    try { await api(`/groups/${groupId}/schedule`, { method: "DELETE" }); onSaved(null); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <Modal title="Lịch học của lớp" sub={`${groupName} · không bắt buộc, không có lịch vẫn mở lớp được`} onClose={onClose} footer={<>
    {schedule && <button type="button" className="cls-btn cls-btn--txt" disabled={busy} onClick={() => void clear()}>Xoá lịch</button>}
    <span className="cls-grow" />
    <button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button>
    <button type="button" className="cls-btn cls-btn--pri" disabled={busy || !days.length || !time} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu lịch"}</button>
  </>}>
    <div className="cls-field"><span>Học vào các thứ</span>
      <div className="cls-days">{ORDER.map((d) => <button key={d} type="button" className={days.includes(d) ? "is-on" : ""} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{weekdayNames[d]}</button>)}</div>
    </div>
    <label className="cls-field" style={{ maxWidth: 200 }}>Giờ bắt đầu<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
    <div className="cls-preview">
      <span className="cls-one">{preview.length ? <>Các buổi tới: <b>{preview.map(dayLabel).join(", ")}</b></> : "Chọn ít nhất một thứ để xem các buổi tới"}</span>
      <span className="cls-one">Muốn dời hay học bù thì sửa từng buổi trong Nhật ký</span>
    </div>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
  </Modal>;
}
```

- [ ] **Step 2: Kiểm tra kiểu**

Run: `pnpm lint`
Expected: không lỗi. Nếu Vite/TS báo không resolve được `../../../contracts/classes`, kiểm tra cách các file khác trong `src/product` import `contracts` (ví dụ `SubmissionForm.tsx` dùng `"../../contracts/api"`) và sửa số `../` cho đúng từ thư mục `src/product/classHome/`.

- [ ] **Step 3: Commit**

```bash
git add src/product/classHome/ScheduleDialog.tsx
git commit -m "feat(classes-ui): optional weekly schedule dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Trang một lớp và hồ sơ em ở khung bên phải

**Files:**
- Create: `src/product/classHome/ClassPage.tsx`, `src/product/classHome/StudentDrawer.tsx`

**Interfaces:**
- Consumes: `ClassDetail`, `ClassSessionRow`, `ClassStudentRow` (Task 4); `useOpenClass`; `InviteLinks`, `stateLine`; `ScheduleDialog`; `AttendanceDialog` từ `../Classes`; `GET /groups/:id`, `POST /groups/:id/members`, `DELETE /groups/:id/members/:studentId`, `GET /students/:id/link`, `POST /students/:id/link/rotate`.
- Produces:
  - `ClassPage({ id, students, onBack, onEnterRoom, onOpenRoomView, onChanged })` với `onOpenRoomView: (sessionId: string, view: "grading" | "summary") => void`.
  - `StudentDrawer({ student, groupName, onClose, onRemove })`.

- [ ] **Step 1: Viết `StudentDrawer.tsx`**

```tsx
// src/product/classHome/StudentDrawer.tsx
import { useState } from "react";
import { Copy, RefreshCw, Trash2, X } from "lucide-react";
import { api } from "../onlineApi";
import { Av, copyText, dayLabel, errText } from "./ui";
import type { ClassStudentRow } from "./types";

export function StudentDrawer({ student, groupName, onClose, onRemove }: {
  student: ClassStudentRow; groupName: string; onClose: () => void; onRemove: () => void;
}) {
  const [msg, setMsg] = useState("");
  const copy = async (rotate: boolean) => {
    if (rotate && !confirm(`Đổi link của ${student.name}? Link cũ sẽ không vào được nữa.`)) return;
    try {
      const r = rotate
        ? await api<{ url: string }>(`/students/${student.id}/link/rotate`, { method: "POST", body: "{}" })
        : await api<{ url: string }>(`/students/${student.id}/link`);
      setMsg((await copyText(r.url)) ? (rotate ? "Đã đổi và chép link mới" : "Đã chép link") : r.url);
    } catch (e) { setMsg(errText(e)); }
  };
  const absent = student.total - student.attended;
  return <>
    <div className="cls-scrim" style={{ background: "rgb(20 18 50 / .16)" }} onMouseDown={onClose} />
    <aside className="cls-drawer" role="dialog" aria-label={`Hồ sơ ${student.name}`}>
      <div className="cls-drawer__h"><Av p={student} size={44} /><div className="cls-min" style={{ flex: 1 }}><b className="cls-one">{student.name}</b><span className="cls-muted cls-one">{groupName} · đi học {student.attended}/{student.total} buổi</span></div><button type="button" className="cls-ib" aria-label="Đóng" onClick={onClose}><X size={18} /></button></div>
      <div className="cls-drawer__b">
        <div className="cls-sect"><h4>Điều cần nhớ <span className="cls-count">{student.notes.length}</span></h4>
          {student.notes.length === 0 && <p className="cls-muted">Chưa có điều cần nhớ. Nhận định bạn duyệt sau buổi sẽ hiện ở đây.</p>}
          {student.notes.map((n) => <div key={n.sessionId + n.text} className="cls-mcard"><span className="cls-tagnote">Ghi nhận</span><div className="cls-min"><b>{n.text}</b><span className="cls-muted cls-one">Buổi {dayLabel(n.date)}</span></div></div>)}
        </div>
        <div className="cls-sect"><h4>Đi học</h4>
          <div className="cls-kv2"><span>Có mặt</span><span>{student.attended}/{student.total} buổi</span><span>Vắng</span><span>{absent} buổi</span>
            <span>Link riêng</span><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" style={{ padding: 0 }} onClick={() => void copy(false)}><Copy size={14} />Chép link</button>
              <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => void copy(true)}><RefreshCw size={14} />Đổi link</button>
            </span></div>
          {msg && <p className="cls-muted" role="status" style={{ marginTop: 8, overflowWrap: "anywhere" }}>{msg}</p>}
        </div>
        <div className="cls-sect"><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={onRemove}><Trash2 size={14} />Bỏ khỏi lớp</button></div>
      </div>
    </aside>
  </>;
}
```

Nhãn "Ghi nhận" là tạm cho tới kế hoạch Phần 3 (khi nhận định có loại "Ôn lại/Làm tốt").

- [ ] **Step 2: Viết `ClassPage.tsx`**

```tsx
// src/product/classHome/ClassPage.tsx
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, ChevronLeft, Copy, Link2, Plus, Video } from "lucide-react";
import { api } from "../onlineApi";
import { AttendanceDialog } from "../Classes";
import { CIco, Stack, Av, copyText, dayLabel, errText, weekdayNames } from "./ui";
import { InviteLinks } from "./InviteLinks";
import { ScheduleDialog } from "./ScheduleDialog";
import { StudentDrawer } from "./StudentDrawer";
import { useOpenClass } from "./useOpenClass";
import type { ClassDetail, ClassSessionRow, Pupil } from "./types";

type Tab = "students" | "log";
const minutes = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : 0);

export function ClassPage({ id, students, onBack, onEnterRoom, onOpenRoomView, onChanged }: {
  id: string;
  students: Pupil[];
  onBack: () => void;
  onEnterRoom: (sessionId: string) => void;
  onOpenRoomView: (sessionId: string, view: "grading" | "summary") => void;
  onChanged: () => Promise<void> | void;
}) {
  const [g, setG] = useState<ClassDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("students");
  const [drawer, setDrawer] = useState("");
  const [invite, setInvite] = useState(false);
  const [sched, setSched] = useState(false);
  const [attFor, setAttFor] = useState("");
  const [adding, setAdding] = useState(false);
  const opener = useOpenClass(onEnterRoom);
  const load = useCallback(async () => {
    try { setG((await api<{ group: ClassDetail }>(`/groups/${id}`)).group); setError(""); }
    catch (e) { setError(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error && !g) return <div className="cls"><button type="button" className="cls-btn cls-btn--sec" onClick={onBack}><ChevronLeft size={16} />Danh sách lớp</button><p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p></div>;
  if (!g) return <div className="cls"><p className="cls-muted" role="status">Đang tải lớp…</p></div>;
  const open = drawer ? g.students.find((s) => s.id === drawer) : undefined;
  const waiting = g.sessions.filter((s) => (s.status === "ended" || s.status === "reviewed") && (!s.attendanceConfirmed || s.pendingSubmissions > 0)).length;
  const upcoming = g.nextAt;
  const remove = async (sid: string) => {
    const name = g.students.find((s) => s.id === sid)?.name ?? "em này";
    if (!confirm(`Bỏ ${name} khỏi lớp? Hồ sơ và các buổi cũ của em vẫn giữ.`)) return;
    try { setG((await api<{ group: ClassDetail }>(`/groups/${g.id}/members/${sid}`, { method: "DELETE" })).group); setDrawer(""); await onChanged(); }
    catch (e) { setError(errText(e)); }
  };
  const row = (s: ClassSessionRow) => {
    const done = s.status === "ended" || s.status === "reviewed";
    const action = s.status === "live"
      ? <button type="button" className="cls-btn cls-btn--go cls-btn--sm" onClick={() => onEnterRoom(s.id)}><Video size={14} />Vào lại</button>
      : !done ? null
      : !s.attendanceConfirmed ? <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setAttFor(s.id)}>Xác nhận điểm danh</button>
      : s.pendingSubmissions > 0 ? <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpenRoomView(s.id, "grading")}>Nhận xét {s.pendingSubmissions} bài</button>
      : s.status === "ended" ? <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => onOpenRoomView(s.id, "summary")}>Tổng kết</button>
      : <span className="cls-st is-ok">Xong</span>;
    return <div key={s.id} className="cls-lrow">
      <div className="when"><b className="cls-one">{dayLabel(s.date)}</b><span className="cls-muted cls-one">{s.time}{s.startedAt && s.endedAt ? ` · ${minutes(s.startedAt, s.endedAt)} phút` : s.status === "live" ? " · đang học" : " · chưa dạy"}</span></div>
      <div className="what cls-min"><b className="cls-one">{s.title}</b><div className="cls-chips2">{s.used.map((u) => <span key={u} className="cls-chip2">{u}</span>)}</div></div>
      <span className="cls-muted cls-one">{done ? (s.absentNames.length ? `${s.present}/${s.invited} · ${s.absentNames.map((n) => n.split(/\s+/).slice(-1)[0]).join(", ")} vắng` : `${s.present}/${s.invited} có mặt`) : `${s.invited} em`}</span>
      <div className="act">{action}</div>
    </div>;
  };
  const past = g.sessions.filter((s) => s.status !== "draft" && s.status !== "scheduled");
  return <div className="cls">
    <div className="cls-chead">
      <button type="button" className="cls-ib" aria-label="Về danh sách lớp" onClick={onBack}><ChevronLeft size={18} /></button>
      <CIco name={g.name} size="lg" />
      <div className="cls-min"><h1 className="cls-one">{g.name}</h1><div className="cls-row"><Stack people={g.students} /><span className="cls-muted cls-one">{g.subject} · {g.grade} · {g.students.length} em</span></div></div>
      <span className="cls-grow" />
      <button type="button" className="cls-btn cls-btn--sec" disabled={!g.students.length} onClick={() => setInvite(true)}><Link2 size={16} />Link mời</button>
      {g.live
        ? <button type="button" className="cls-btn cls-btn--go cls-btn--lg" onClick={() => onEnterRoom(g.live!.sessionId)}><Video size={17} />Vào lại</button>
        : <button type="button" className="cls-btn cls-btn--pri cls-btn--lg" disabled={!g.students.length || !!opener.busy} title={g.students.length ? undefined : "Thêm học sinh trước"} onClick={() => void opener.open(g.id)}><Video size={17} />{opener.busy ? "Đang mở…" : "Mở lớp"}</button>}
    </div>
    {opener.error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{opener.error}</p>}
    <div className="cls-sched"><CalendarDays size={16} />
      <span className="cls-one">{g.schedule ? <>Lịch: <b>{g.schedule.days.map((d) => weekdayNames[d]).join(", ")} hằng tuần, {g.schedule.time}</b>{upcoming ? ` · buổi tới ${dayLabel(upcoming.date)}` : ""}</> : "Chưa đặt lịch · mở lớp lúc nào cũng được"}</span>
      <span className="cls-grow" /><button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => setSched(true)}>{g.schedule ? "Sửa lịch" : "Đặt lịch"}</button>
    </div>
    <div className="cls-tabs2" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "students"} className={tab === "students" ? "is-on" : ""} onClick={() => setTab("students")}>Các em <span className="cls-c">{g.students.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "log"} className={tab === "log" ? "is-on" : ""} onClick={() => setTab("log")}>Nhật ký buổi <span className={`cls-c${waiting ? " is-warn" : ""}`}>{waiting ? `${waiting} còn việc` : past.length}</span></button>
    </div>
    {tab === "students" && <section className="cls-card cls-etbl">
      {g.students.length === 0 && <p className="cls-pad cls-muted">Lớp chưa có học sinh.</p>}
      {g.students.length > 0 && <div className="cls-tbl">
        <div className="cls-th"><span>Học sinh</span><span>Đi học</span><span>Cần nhớ</span><span /></div>
        {g.students.map((s) => <div key={s.id} className={`cls-tr${drawer === s.id ? " is-sel" : ""}`}>
          <div className="cls-nm"><Av p={s} /><div className="cls-min"><button type="button" className="cls-namebtn cls-one" onClick={() => setDrawer(s.id)}>{s.name}</button></div></div>
          <div className="cls-min"><b style={{ font: "600 13px Inter, sans-serif" }}>{s.total ? `${s.attended}/${s.total}` : "—"}</b><span className="cls-muted cls-one" style={{ display: "block" }}>buổi đã học</span></div>
          <div className="cls-min">{s.notes.length ? s.notes.map((n) => <div key={n.sessionId + n.text} className="cls-mitem"><span className="cls-tagnote">Ghi nhận</span><span className="cls-one">{n.text}</span><span className="from">{dayLabel(n.date).split(" ").slice(-1)[0]}</span></div>) : <span className="cls-muted">Chưa có điều cần nhớ</span>}</div>
          <div className="cls-lk"><button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => void api<{ url: string }>(`/students/${s.id}/link`).then((r) => copyText(r.url))}><Copy size={14} /><span className="cls-lbl">Chép link</span></button></div>
        </div>)}
        <button type="button" className="cls-addrow" onClick={() => setAdding(true)}><Plus size={15} />Thêm học sinh</button>
      </div>}
    </section>}
    {tab === "log" && <section className="cls-card cls-log">
      {upcoming && <div className="cls-lrow is-next">
        <div className="when"><b className="cls-one">{dayLabel(upcoming.date)}</b><span className="cls-muted cls-one">{upcoming.time} · sắp tới</span></div>
        <div className="what cls-min"><b className="cls-one">Buổi tới</b><span className="cls-muted cls-one">Bấm Mở lớp khi tới giờ, hoặc sớm hơn nếu cần</span></div>
        <span className="cls-muted cls-one">{g.students.length} em</span><div className="act" />
      </div>}
      {past.length === 0 && !upcoming && <p className="cls-pad cls-muted">Chưa có buổi nào. Mỗi lần bấm Mở lớp là một dòng mới ở đây.</p>}
      {past.map(row)}
    </section>}
    {open && <StudentDrawer student={open} groupName={g.name} onClose={() => setDrawer("")} onRemove={() => void remove(open.id)} />}
    {invite && <InviteLinks title={g.name} students={g.students} onClose={() => setInvite(false)} />}
    {sched && <ScheduleDialog groupId={g.id} groupName={g.name} schedule={g.schedule} onClose={() => setSched(false)} onSaved={() => { setSched(false); void load(); }} />}
    {attFor && <AttendanceDialog sessionId={attFor} mode="edit" onClose={() => setAttFor("")} onSaved={() => { setAttFor(""); void load(); }} />}
    {adding && <AddStudents groupId={g.id} existing={g.students.map((s) => s.id)} students={students} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); await onChanged(); }} />}
  </div>;
}

/** Thêm em có sẵn hoặc gõ tên em mới (mỗi dòng một tên). */
function AddStudents({ groupId, existing, students, onClose, onDone }: { groupId: string; existing: string[]; students: Pupil[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = students.filter((s) => s.status !== "archived" && !existing.includes(s.id));
  const fresh = names.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const submit = async () => {
    setBusy(true); setError("");
    try { await api(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ studentIds: picked, newStudents: fresh }) }); await onDone(); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return <div className="cls-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cls-modal" role="dialog" aria-modal="true" aria-label="Thêm học sinh">
      <div className="cls-modal__h"><div className="cls-min"><h2>Thêm học sinh</h2></div></div>
      <div className="cls-modal__b">
        {options.length > 0 && <div className="cls-field"><span>Em đã có</span><div className="cls-pick">{options.map((s) => {
          const on = picked.includes(s.id);
          return <button type="button" key={s.id} className={`cls-prow${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}><span className="cls-cbx">{on ? "✓" : ""}</span><Av p={s} /><b className="cls-one">{s.name}</b></button>;
        })}</div></div>}
        <label className="cls-field">Học sinh mới<textarea rows={3} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Mỗi dòng một tên" /></label>
        {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}
      </div>
      <div className="cls-modal__f"><button type="button" className="cls-btn cls-btn--sec" onClick={onClose}>Huỷ</button><button type="button" className="cls-btn cls-btn--pri" disabled={busy || (!picked.length && !fresh.length)} onClick={() => void submit()}>{busy ? "Đang thêm…" : "Thêm"}</button></div>
    </div>
  </div>;
}
```

- [ ] **Step 3: Thêm style còn thiếu vào `classes-v2.css`**

```css
.cls-addrow { display: flex; align-items: center; gap: 8px; width: calc(100% - 36px); height: 44px; margin: 10px 18px 16px; padding: 0 14px; border: 1px dashed var(--c-line2); border-radius: 10px; background: none; color: var(--c-acc-ink) !important; font-weight: 600 !important; font-size: 13px !important; }
```

- [ ] **Step 4: Kiểm tra kiểu**

Run: `pnpm lint`
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/product/classHome/ClassPage.tsx src/product/classHome/StudentDrawer.tsx src/product/classHome/classes-v2.css
git commit -m "feat(classes-ui): class page with students, session log and student drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ghép vào app — điều hướng mới, Mở lớp, đường ra khỏi phòng

**Files:**
- Create: `src/product/classHome/index.tsx`
- Modify: `src/product/OnlineApp.tsx`, `src/product/OnlineShell.tsx`

**Interfaces:**
- Consumes: `ClassList`, `ClassPage` (Task 5, 7); tạo lớp dùng lại `CreateClass` hiện có trong `src/product/Classes.tsx` (export thêm nếu chưa export).
- Produces: `ClassesHome({ students, initialOpenId, onEnterRoom, onOpenRoomView, onChanged }: { students: Pupil[]; initialOpenId?: string; onEnterRoom: (sessionId: string, groupId: string) => void; onOpenRoomView: (sessionId: string, view: "grading" | "summary", groupId: string) => void; onChanged: () => Promise<void> | void })`.

- [ ] **Step 1: Export `CreateClass` trong `src/product/Classes.tsx`**

Đổi `function CreateClass(` thành `export function CreateClass(`.

- [ ] **Step 2: Viết `index.tsx`**

```tsx
// src/product/classHome/index.tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../onlineApi";
import { CreateClass } from "../Classes";
import { ClassList } from "./ClassList";
import { ClassPage } from "./ClassPage";
import { errText } from "./ui";
import type { ClassSummary, Pupil } from "./types";

export function ClassesHome({ students, initialOpenId = "", onEnterRoom, onOpenRoomView, onChanged }: {
  students: Pupil[];
  initialOpenId?: string;
  onEnterRoom: (sessionId: string, groupId: string) => void;
  onOpenRoomView: (sessionId: string, view: "grading" | "summary", groupId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [groups, setGroups] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try { setGroups((await api<{ groups: ClassSummary[] }>("/groups")).groups); setError(""); }
    catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const enterFor = (groupId: string) => (sessionId: string) => onEnterRoom(sessionId, groupId);
  if (openId)
    return <ClassPage id={openId} students={students}
      onBack={() => { setOpenId(""); void load(); }}
      onEnterRoom={enterFor(openId)}
      onOpenRoomView={(sid, view) => onOpenRoomView(sid, view, openId)}
      onChanged={onChanged} />;
  return <>
    <ClassList groups={groups} error={error} onOpenClass={setOpenId} onEnterRoom={onEnterRoom} onCreate={() => setCreating(true)} />
    {creating && <CreateClass students={students} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await onChanged(); await load(); setOpenId(id); }} />}
  </>;
}
```

- [ ] **Step 3: Kiểm tra kiểu cho phần vừa thêm**

Run: `pnpm lint`
Expected: không lỗi. Nếu `CreateClass` có chữ ký `onCreated: (id: string) => void` thì callback async vẫn hợp lệ.

- [ ] **Step 4: Sửa điều hướng trong `src/product/OnlineApp.tsx`**

1. Thay khối khai báo `navItems` (dòng bắt đầu `const navItems: OnlineNavItem[] = (`) bằng:

```ts
// Thanh bên theo thiết kế "Lớp là phòng": Lớp · Tài liệu, Tài khoản ở dưới.
const navItems: OnlineNavItem[] = (["classes", "materials", "account"] as const).map((id) => ({
  id,
  label: id === "materials" ? "Tài liệu" : pageNames[id],
  icon: id as OnlineNavItem["icon"],
}));
const classPages: Page[] = ["classes", "student", "plans", "live", "grading", "summary", "sessions", "dashboard", "students"];
```

2. Đổi trang mặc định: `useState<Page>("dashboard")` → `useState<Page>("classes")`; trong `clearWorkspace`, `setPage("dashboard")` → `setPage("classes")`.

3. Prop `page` của `OnlineShell`: thay `page={sessionPages.includes(page) ? "sessions" : page}` bằng `page={classPages.includes(page) ? "classes" : page}`. Xoá khai báo `sessionPages` nếu không còn dùng.

4. Thêm state ghi lớp đang dạy, gần các state `returnClass`/`classOpen`:

```ts
  // Lớp của phòng đang mở, để thoát phòng là về đúng trang lớp đó.
  const [roomClass, setRoomClass] = useState("");
```

5. Thay khối `{page === "classes" && ( <ClassesPage … /> )}` bằng:

```tsx
          {page === "classes" && (
            <ClassesHome
              key={classOpen || "list"}
              initialOpenId={classOpen}
              students={students}
              onChanged={reload}
              onEnterRoom={(sessionId, groupId) => {
                setRoomClass(groupId);
                void reload().then(() => openRoom(sessionId));
              }}
              onOpenRoomView={(sessionId, view, groupId) => {
                setRoomClass(groupId);
                openRoom(sessionId, view);
              }}
            />
          )}
```

và thêm import `import { ClassesHome } from "./classes";` (giữ import `ClassesPage` nếu nơi khác còn dùng; nếu không, xoá).

6. Trong `LiveRoom` `onExit`, thay đoạn đặt trang sau khi thoát (hiện là `setPage(roomBackToLesson ? "plans" : "sessions")`) bằng:

```ts
                  if (roomBackToLesson) setPage("plans");
                  else {
                    setClassOpen(roomClass);
                    setPage("classes");
                  }
```

7. Tìm mọi `navigate("sessions")`, `navigate("dashboard")`, `navigate("students")` còn lại và thay bằng `navigate("classes")` (giữ `navigate("student")` cho hồ sơ). Dùng: `grep -n 'navigate("sessions")\|navigate("dashboard")\|navigate("students")' src/product/OnlineApp.tsx`.

- [ ] **Step 5: Icon cho mục Lớp trong `src/product/OnlineShell.tsx`**

Đảm bảo map `icons` có `classes: GraduationCap` (đã có từ trước) và nhãn mục `materials` hiện "Tài liệu". Không cần sửa thêm nếu Step 4 đã đổi label.

- [ ] **Step 6: Kiểm tra kiểu và test**

Run: `pnpm lint && pnpm test`
Expected: không lỗi; `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/product/classHome/index.tsx src/product/classHome/ClassList.tsx src/product/Classes.tsx src/product/OnlineApp.tsx src/product/OnlineShell.tsx
git commit -m "feat(app): class-as-room navigation, open class and return to class

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dựng lại và kiểm tra cả vòng trên app thật

**Files:** không sửa code (chỉ sửa nếu phát hiện lỗi, mỗi lỗi một commit riêng).

- [ ] **Step 1: Build**

Run: `pnpm exec vite build && pnpm exec tsc -p tsconfig.server.json --noEmit`
Expected: build xong (cảnh báo chunk lớn là cũ, chấp nhận).

- [ ] **Step 2: Dựng lại Docker (migration tự chạy khi API khởi động)**

```bash
docker compose -p teaching-copilot-local --env-file .env.local -f compose.docker.yml up -d --build --no-deps --pull never api gateway
```

Kiểm tra: `docker logs teaching-copilot-api --tail 3` có `Server listening on 0.0.0.0:3100`; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4170/api/v1/health` trả `200`. Kiểm tra bundle mới đang được phục vụ: tải `index.html`, lấy tên `assets/index-*.js`, và `curl` file đó rồi `grep -c "Lớp của bạn"` phải ≥ 1.

- [ ] **Step 3: Đi hết vòng trên trình duyệt (Chrome headless, hồ sơ trình duyệt trống) ở 1440×900**

1. Đăng nhập "Demo Hoàng Nam" → thấy **Lớp của bạn**, thanh bên chỉ có Lớp · Tài liệu · Tài khoản.
2. Mở một lớp có em → bấm **Đặt lịch** → chọn T5, 19:30 → Lưu → dòng lịch hiện "T5 hằng tuần, 19:30 · buổi tới …".
3. Bấm **Mở lớp** → vào phòng dạy; mở link riêng của một em ở tab khác → em vào lớp.
4. Về danh sách lớp → thẻ lớp hiện "Đang học" và nút **Vào lại**; bấm lại **Mở lớp** ở trang lớp không tạo buổi thứ hai (Nhật ký vẫn một dòng đang học).
5. Trong phòng bấm **Kết thúc buổi** → xác nhận → thoát phòng → về đúng trang lớp, thẻ **Nhật ký buổi** có dòng buổi vừa dạy với nút đúng việc.
6. Bấm tên một em → khung hồ sơ bên phải mở, Chép link chạy.
7. Lớp không có em: nút Mở lớp tắt.

- [ ] **Step 4: Kiểm tra chữ không xuống dòng hoặc bị cắt** ở 1440 và 1280 bằng script `wrapcheck` đã dùng cho mockup (đếm dòng của mỗi nút chữ trong `.cls`, báo phần tử `.cls-one` bị cắt). Expected: `wrapped: []`; phần bị cắt chỉ là tên dài có "…".

- [ ] **Step 5: Chụp ảnh** danh sách lớp, trang lớp (Các em, Nhật ký), khung hồ sơ, hộp lịch; gửi người dùng.

- [ ] **Step 6: Báo kết quả.** Liệt kê những gì đã kiểm tra, những gì chưa (ví dụ chưa thử trên điện thoại thật), và hỏi người dùng có commit/push không.

---

## Các kế hoạch tiếp theo (chưa viết chi tiết)

Mỗi phần dưới đây sẽ có file kế hoạch riêng sau khi Phần 1 được dùng thử:

- **Phần 2 — Đánh dấu một chạm (spec 5.5):** cột `mark`, `context` trên `Evidence`; route ghi/gỡ dấu; nút Cần ôn lại/Làm tốt trong cột phải phòng dạy, nhãn trên ô video, thông báo có Hoàn tác.
- **Phần 3 — Màn Sau buổi (spec 5.7, 7):** `Claim.kind`, `resolvedAt`; AI soạn nháp mỗi em từ đánh dấu, câu hỏi nhanh, bài nộp; Giữ/Sửa/Bỏ/Tự thêm; Đã ổn; thay nhãn "Ghi nhận" bằng "Ôn lại/Làm tốt"; Kết thúc buổi chuyển thẳng sang màn này.
- **Phần 4 — Tài liệu (spec 5.2c, 5.6, 5.9):** bảng `GroupMaterial`, thẻ Tài liệu trong lớp, hộp Chiếu cho cả lớp, "Mở tiếp trang N", nút Dùng cho lớp trong kho.
- **Phần 5 — Đồng ý dùng AI ở mức học sinh (spec 6, 11.2):** sau khi nhóm trả lời câu hỏi mở về chính sách dữ liệu.
- **Phần 6 — AI đọc trang tài liệu (spec 7):** chỉ PDF có chữ; nút "Soạn câu hỏi từ trang này".
- **Dọn dẹp:** xoá `Sessions.tsx`, `ClassesPage` cũ, các trang không còn trong điều hướng, sau khi Phần 3 thay xong màn tổng kết.
