import {
  baselineSeed,
  defaultTools,
  sessionStudentIds,
  boardKey,
} from "./model";
import type { AppData, Board, Stroke } from "./model";

const iso = (minutes = 0) =>
  new Date(Date.now() + minutes * 60_000).toISOString();
export const mathPages = [
  "PHIẾU HỌC TẬP · PHƯƠNG TRÌNH BẬC HAI\n\n1. Cho x² − 5x + 6 = 0.\nTính Δ, tìm hai nghiệm và kiểm tra tổng, tích nghiệm.\n\n2. Cho x² − 2mx + m + 2 = 0.\nTìm m để phương trình có hai nghiệm thực.\n\nGợi ý quan sát: Hãy viết điều kiện có nghiệm trước khi dùng Viète.",
  "VẬN DỤNG · LÀM ĐỘC LẬP\n\n3. Cho hai nghiệm x₁, x₂ của x² − 6x + 5 = 0.\nTính x₁² + x₂² bằng tổng và tích nghiệm.\n\n4. Tự tạo một phương trình có tổng nghiệm bằng 7 và tích nghiệm bằng 10.\nGiải thích cách em kiểm tra kết quả.",
];

export function normalizeData(input: Partial<AppData>): AppData {
  const data: AppData = {
    students: [],
    materials: [],
    sessions: [],
    submissions: [],
    evidence: [],
    claims: [],
    members: [],
    invites: [],
    boards: [],
    attempts: [],
    annotations: [],
    checks: [],
    responses: [],
    messages: [],
    events: [],
    recordings: [],
    aiRequests: [],
    ...input,
    version: 2,
  };
  data.sessions = data.sessions.map((s) => ({
    ...s,
    studentIds: sessionStudentIds(s),
    tools: s.tools || { ...defaultTools },
  }));
  if (input.version !== 2) {
    data.materials = data.materials.map((m) => ({
      ...m,
      pages:
        m.pages ||
        (m.grade === "Lớp 9"
          ? mathPages
          : [
              "PHÂN TÍCH ĐA THỨC\n\n1. x² + 5x + 6\n2. x² − 9\n3. 2x² + 6x\n\nChọn phương pháp và trình bày từng bước.",
            ]),
    }));
    for (const s of data.sessions) {
      for (const studentId of sessionStudentIds(s)) {
        if (
          !data.members.some(
            (m) => m.sessionId === s.id && m.studentId === studentId,
          )
        )
          data.members.push({
            id: `${s.id}:${studentId}`,
            sessionId: s.id,
            studentId,
            state: "invited",
            canWrite: true,
            handRaised: false,
            consent: false,
          });
        if (
          !data.invites.some(
            (i) => i.sessionId === s.id && i.studentId === studentId,
          )
        )
          data.invites.push({
            id: `invite:${s.id}:${studentId}`,
            token: `demo-${s.id}-${studentId}`,
            sessionId: s.id,
            studentId,
            expiresAt: iso(60 * 24 * 7),
            revoked: false,
          });
      }
    }
  }
  for (const s of data.sessions)
    for (const studentId of sessionStudentIds(s)) {
      if (
        !data.members.some(
          (m) => m.sessionId === s.id && m.studentId === studentId,
        )
      )
        data.members.push({
          id: `${s.id}:${studentId}`,
          sessionId: s.id,
          studentId,
          state: "invited",
          canWrite: true,
          handRaised: false,
          consent: false,
        });
    }
  return data;
}

export function createDemoData(): AppData {
  const base = structuredClone(baselineSeed);
  const group = {
    ...base.sessions[0],
    id: "ses-group",
    studentId: "stu-minh",
    studentIds: ["stu-minh", "stu-huy"],
    groupName: "Nhóm Toán 9",
    title: "Viète · Từ ví dụ đến tự giải",
    duration: 60,
    activities: base.sessions[0].activities.map((a, n) => ({
      ...a,
      id: `act-group-${n}`,
      duration: 15,
      description: a.description.replace("Minh", "học sinh"),
    })),
  };
  base.sessions.unshift(group);
  const data = normalizeData(base);
  data.members.find(
    (m) => m.sessionId === "ses-group" && m.studentId === "stu-huy",
  )!.state = "waiting";
  data.members.find(
    (m) => m.sessionId === "ses-group" && m.studentId === "stu-huy",
  )!.consent = true;
  data.invites.push(
    {
      id: "demo-expired",
      token: "demo-expired",
      sessionId: "ses-group",
      studentId: "stu-minh",
      revoked: false,
      expiresAt: iso(-10),
    },
    {
      id: "demo-revoked",
      token: "demo-revoked",
      sessionId: "ses-group",
      studentId: "stu-huy",
      revoked: true,
      expiresAt: iso(120),
    },
  );
  const previous = data.sessions.find((s) => s.id === "ses-minh-prev")!;
  const historical = (minutes: number) =>
    new Date(
      new Date(previous.date + "T" + previous.time).getTime() +
        (minutes + 200) * 60_000,
    ).toISOString();
  data.evidence = data.evidence.map((e) =>
    e.sessionId === previous.id ? { ...e, createdAt: historical(-160) } : e,
  );
  data.claims = data.claims.map((c) =>
    c.sessionId === previous.id ? { ...c, createdAt: historical(-120) } : c,
  );
  data.submissions = data.submissions.map((s) =>
    s.sessionId === previous.id ? { ...s, createdAt: historical(-130) } : s,
  );
  const startedAt = historical(-200);
  previous.startedAt = startedAt;
  previous.completedActivityIds = previous.activities.map((a) => a.id);
  previous.endedAt = historical(-110);
  const strokes: Stroke[] = [
    {
      id: "seed-stroke",
      authorId: "stu-minh",
      color: "#5849c5",
      points: [
        { x: 80, y: 180 },
        { x: 120, y: 120 },
        { x: 160, y: 180 },
        { x: 200, y: 100 },
      ],
    },
  ];
  const board: Board = {
    id: boardKey(previous.id, "act-prev-1", "stu-minh"),
    sessionId: previous.id,
    activityId: "act-prev-1",
    ownerId: "stu-minh",
    shared: true,
    strokes,
    text: "S = x₁ + x₂ = 5\nP = x₁x₂ = 6\nx₁² + x₂² = S² − 2P = 13",
    updatedAt: historical(-170),
  };
  data.boards.push(board);
  data.attempts.push({
    id: "attempt-seed",
    boardId: board.id,
    sessionId: previous.id,
    activityId: board.activityId,
    studentId: "stu-minh",
    strokes,
    text: board.text,
    createdAt: historical(-170),
  });
  data.attempts.push({
    ...data.attempts[0],
    id: "attempt-seed-2",
    text: board.text + "\nKiểm tra: Δ = 25 − 24 = 1 ≥ 0",
    createdAt: historical(-150),
  });
  data.evidence.push({
    id: "ev-draft",
    studentId: "stu-minh",
    sessionId: previous.id,
    activityId: board.activityId,
    kind: "Trang nháp",
    title: "Lần thử 2 · điều kiện nghiệm",
    detail: "Minh bổ sung điều kiện Δ sau một câu hỏi dẫn dắt.",
    support: "Có gợi ý",
    sourceId: "attempt-seed-2",
    createdAt: historical(-150),
  });
  data.claims.push({
    id: "claim-approved",
    studentId: "stu-minh",
    sessionId: previous.id,
    text: "Minh biết tính biểu thức đối xứng bằng tổng và tích nghiệm. Cần kiểm tra lại điều kiện nghiệm trong bài mới.",
    evidenceIds: ["ev-draft"],
    status: "approved",
    createdAt: historical(-120),
  });
  data.annotations.push({
    id: "anno-seed",
    sessionId: previous.id,
    activityId: board.activityId,
    materialId: "mat-viete",
    page: 0,
    x: 50,
    y: 44,
    text: "Kiểm tra Δ trước khi dùng Viète",
    createdAt: historical(-165),
  });
  data.checks.push({
    id: "check-seed",
    sessionId: previous.id,
    activityId: board.activityId,
    question: "Với x² − 4x + 3 = 0, tính x₁² + x₂² và giải thích cách làm.",
    status: "closed",
    createdAt: historical(-140),
  });
  data.responses.push({
    id: "response-seed",
    checkId: "check-seed",
    studentId: "stu-minh",
    answer: "S = 4, P = 3, nên kết quả là 16 − 6 = 10.",
    support: "Độc lập",
    feedback: "Lập luận đúng, đã kiểm tra điều kiện nghiệm.",
    createdAt: historical(-135),
  });
  data.recordings.push({
    id: "rec-seed",
    sessionId: previous.id,
    status: "ready",
    startedAt,
    endedAt: historical(-110),
  });
  data.events.push(
    {
      id: "event-1",
      sessionId: previous.id,
      kind: "activity",
      label: "Bắt đầu chữa phương trình",
      createdAt: historical(-199),
      activityId: board.activityId,
      materialId: "mat-viete",
      shared: true,
    },
    {
      id: "event-2",
      sessionId: previous.id,
      kind: "board",
      label: "Minh chia sẻ lần nháp đầu tiên",
      createdAt: historical(-170),
      activityId: board.activityId,
      board: { strokes, text: board.text },
      shared: true,
    },
    {
      id: "event-3",
      sessionId: previous.id,
      kind: "annotation",
      label: "Đánh dấu điều kiện nghiệm trên đề",
      createdAt: historical(-165),
      activityId: board.activityId,
      sourceId: "anno-seed",
      materialId: "mat-viete",
      shared: true,
    },
    {
      id: "event-4",
      sessionId: previous.id,
      kind: "board",
      label: "Minh bổ sung Δ ≥ 0",
      createdAt: historical(-150),
      activityId: board.activityId,
      board: { strokes, text: data.attempts[1].text },
      shared: true,
    },
    {
      id: "event-5",
      sessionId: previous.id,
      kind: "check",
      label: "Kiểm tra độc lập",
      createdAt: historical(-140),
      activityId: board.activityId,
      sourceId: "check-seed",
      shared: true,
    },
  );
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="420"><rect width="700" height="420" fill="#fffdf6"/><g fill="#202940" font-family="serif" font-size="25"><text x="45" y="65">Bài làm · Nguyễn Bảo Minh</text><text x="45" y="130">x² − 5x + 6 = 0</text><text x="45" y="185">S = 5, P = 6</text><text x="45" y="240">x₁² + x₂² = S² − 2P = 13</text><text x="45" y="310">Δ = 25 − 24 = 1 ≥ 0</text></g></svg>';
  data.submissions[0].fileData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  data.submissions[0].fileName = "bai-lam-mau.svg";
  data.events.push({
    id: "event-6",
    sessionId: previous.id,
    kind: "submission",
    label: "Nhận ảnh bài làm của Minh",
    createdAt: historical(-130),
    activityId: board.activityId,
    sourceId: data.submissions[0].id,
    shared: true,
  });
  return data;
}
