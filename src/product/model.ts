export type Student = {
  id: string;
  name: string;
  grade: string;
  subject: string;
  goal: string;
  status: "active" | "archived";
  strengths: string[];
  gaps: string[];
  notes: string;
  initials: string;
  color: string;
};

export type Material = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  topic: string;
  level: "Cơ bản" | "Trung bình" | "Nâng cao";
  kind: "PDF" | "Ảnh" | "Bài tập" | "Ghi chú";
  description: string;
  source: string;
  fileData?: string;
  createdAt: string;
  pages?: string[];
};

export type Activity = {
  id: string;
  title: string;
  duration: number;
  description: string;
  materialId?: string;
  type: "Khởi động" | "Lý thuyết" | "Luyện tập" | "Kiểm tra";
  sourceEvidenceIds?: string[];
};

export type Session = {
  id: string;
  studentId: string;
  title: string;
  goal: string;
  date: string;
  time: string;
  duration: number;
  meetingUrl: string;
  status: "draft" | "scheduled" | "live" | "ended" | "reviewed";
  activities: Activity[];
  currentActivityId?: string;
  createdAt: string;
  studentIds?: string[];
  groupName?: string;
  tools?: { board: boolean; upload: boolean; check: boolean; chat: boolean };
  startedAt?: string;
  endedAt?: string;
  sharedView?: "document" | "board" | "check";
  sharedBoardOwnerId?: string;
  materialPage?: number;
  dismissedSuggestionIds?: string[];
  completedActivityIds?: string[];
};

export type Submission = {
  id: string;
  studentId: string;
  sessionId: string;
  activityId?: string;
  title: string;
  answer: string;
  fileName?: string;
  fileData?: string;
  status: "new" | "draft" | "reviewed";
  suggestedFeedback?: string;
  finalFeedback?: string;
  score?: string;
  createdAt: string;
};

export type Evidence = {
  id: string;
  studentId: string;
  sessionId: string;
  activityId?: string;
  kind:
    | "Ghi chú"
    | "Bài làm"
    | "Mức hỗ trợ"
    | "Gợi ý giảng dạy"
    | "Trang nháp"
    | "Kiểm tra độc lập"
    | "Chú thích đề";
  title: string;
  detail: string;
  support?: "Độc lập" | "Có gợi ý" | "Được hướng dẫn" | "Chưa rõ";
  submissionId?: string;
  sourceId?: string;
  updatedAt?: string;
  createdAt: string;
};

export type Claim = {
  id: string;
  studentId: string;
  sessionId: string;
  text: string;
  evidenceIds: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type AppData = {
  students: Student[];
  materials: Material[];
  sessions: Session[];
  submissions: Submission[];
  evidence: Evidence[];
  claims: Claim[];
  members: RoomMember[];
  invites: Invite[];
  boards: Board[];
  attempts: BoardAttempt[];
  annotations: Annotation[];
  checks: QuickCheck[];
  responses: CheckResponse[];
  messages: RoomMessage[];
  events: SessionEvent[];
  recordings: Recording[];
  aiRequests: AIRequest[];
  version: number;
};

export type RoomMember = {
  id: string;
  sessionId: string;
  studentId: string;
  state: "invited" | "waiting" | "joined" | "disconnected" | "left";
  canWrite: boolean;
  handRaised: boolean;
  consent: boolean;
};
export type Invite = {
  id: string;
  token: string;
  sessionId: string;
  studentId: string;
  expiresAt: string;
  revoked: boolean;
};
export type Stroke = {
  id: string;
  authorId: string;
  color: string;
  points: { x: number; y: number }[];
};
export type Board = {
  id: string;
  sessionId: string;
  activityId: string;
  ownerId: string;
  shared: boolean;
  strokes: Stroke[];
  text: string;
  notes?: { authorId: string; text: string }[];
  updatedAt: string;
};
export type BoardAttempt = {
  id: string;
  boardId: string;
  studentId: string;
  sessionId: string;
  activityId: string;
  strokes: Stroke[];
  text: string;
  createdAt: string;
};
export type Annotation = {
  id: string;
  sessionId: string;
  activityId: string;
  materialId: string;
  page: number;
  x: number;
  y: number;
  text: string;
  createdAt: string;
};
export type QuickCheck = {
  id: string;
  sessionId: string;
  activityId: string;
  question: string;
  status: "open" | "closed";
  createdAt: string;
};
export type CheckResponse = {
  id: string;
  checkId: string;
  studentId: string;
  answer: string;
  support: Evidence["support"];
  feedback?: string;
  createdAt: string;
};
export type RoomMessage = {
  id: string;
  sessionId: string;
  authorId: string;
  text: string;
  createdAt: string;
};
export type SessionEvent = {
  id: string;
  sessionId: string;
  kind:
    | "activity"
    | "board"
    | "annotation"
    | "submission"
    | "check"
    | "recording"
    | "member";
  label: string;
  createdAt: string;
  activityId?: string;
  board?: { strokes: Stroke[]; text: string };
  materialId?: string;
  page?: number;
  sourceId?: string;
  shared?: boolean;
};
export type Recording = {
  id: string;
  sessionId: string;
  status: "recording" | "processing" | "ready" | "error";
  startedAt: string;
  endedAt?: string;
  readyAt?: string;
  error?: string;
};
export type AIRequest = {
  id: string;
  sessionId: string;
  activityId?: string;
  studentId: string;
  prompt: string;
  text: string;
  status: "ready" | "used" | "ignored" | "reported";
  createdAt: string;
};

const day = (offset: number) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

const now = new Date().toISOString();

export const baselineSeed: Pick<
  AppData,
  "students" | "materials" | "sessions" | "submissions" | "evidence" | "claims"
> = {
  students: [
    {
      id: "stu-minh",
      name: "Nguyễn Bảo Minh",
      grade: "Lớp 9",
      subject: "Toán",
      goal: "Nắm vững hệ thức Viète và bài toán cực trị",
      status: "active",
      strengths: [
        "Biến đổi biểu thức đối xứng",
        "Chủ động thử nhiều cách giải",
      ],
      gaps: [
        "Điều kiện có nghiệm Δ ≥ 0",
        "Chọn điểm rơi trong bài toán cực trị",
      ],
      notes: "Cho Minh tự nháp 2–3 phút trước khi gợi ý.",
      initials: "BM",
      color: "violet",
    },
    {
      id: "stu-ha",
      name: "Trần Thu Hà",
      grade: "Lớp 8",
      subject: "Toán",
      goal: "Củng cố phân tích đa thức và giải phương trình",
      status: "active",
      strengths: ["Trình bày bài rõ ràng"],
      gaps: ["Phân tích đa thức thành nhân tử"],
      notes: "Ưu tiên bài tập ngắn rồi tăng độ khó.",
      initials: "TH",
      color: "peach",
    },
    {
      id: "stu-huy",
      name: "Lê Gia Huy",
      grade: "Lớp 9",
      subject: "Toán",
      goal: "Ôn luyện đề thi tuyển sinh lớp 10",
      status: "active",
      strengths: ["Hình học phẳng"],
      gaps: ["Bài toán thực tế lập phương trình"],
      notes: "",
      initials: "GH",
      color: "blue",
    },
    {
      id: "stu-anh",
      name: "Phạm Ngọc Anh",
      grade: "Lớp 8",
      subject: "Toán",
      goal: "Tăng độ chính xác khi giải bài nhiều bước",
      status: "active",
      strengths: ["Tiếp thu nhanh ví dụ trực quan"],
      gaps: ["Sai dấu khi biến đổi"],
      notes: "",
      initials: "NA",
      color: "mint",
    },
  ],
  materials: [
    {
      id: "mat-viete",
      title: "Hệ thức Viète và ứng dụng",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Phương trình bậc hai",
      level: "Trung bình",
      kind: "Bài tập",
      description: "Tóm tắt kiến thức và 8 bài tập tăng dần độ khó.",
      source: "Kho học liệu mẫu",
      createdAt: now,
    },
    {
      id: "mat-delta",
      title: "Điều kiện nghiệm và biệt thức Δ",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Điều kiện có nghiệm",
      level: "Cơ bản",
      kind: "Ghi chú",
      description:
        "Phiếu kiểm tra nhanh các điều kiện trước khi áp dụng Viète.",
      source: "Kho học liệu mẫu",
      createdAt: now,
    },
    {
      id: "mat-cuctri",
      title: "Cực trị biểu thức đối xứng",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Cực trị đại số",
      level: "Nâng cao",
      kind: "Bài tập",
      description: "Bài toán tìm giá trị nhỏ nhất với ba mức gợi ý.",
      source: "Kho học liệu mẫu",
      createdAt: now,
    },
    {
      id: "mat-dathuc",
      title: "Phân tích đa thức thành nhân tử",
      subject: "Toán",
      grade: "Lớp 8",
      topic: "Đa thức",
      level: "Trung bình",
      kind: "Bài tập",
      description:
        "Bộ bài tập nhóm hạng tử, đặt nhân tử chung và hằng đẳng thức.",
      source: "Kho học liệu mẫu",
      createdAt: now,
    },
    {
      id: "mat-thucte",
      title: "Bài toán thực tế lập phương trình",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "Phương trình",
      level: "Nâng cao",
      kind: "Bài tập",
      description: "Bài toán năng suất và chuyển động có hướng dẫn lập bảng.",
      source: "Kho học liệu mẫu",
      createdAt: now,
    },
  ],
  sessions: [
    {
      id: "ses-minh-next",
      studentId: "stu-minh",
      title: "Hệ thức Viète và cực trị đại số",
      goal: "Kiểm tra điều kiện nghiệm trước khi giải bài cực trị",
      date: day(0),
      time: "19:30",
      duration: 90,
      meetingUrl: "",
      status: "scheduled",
      createdAt: now,
      activities: [
        {
          id: "act-1",
          title: "Khởi động: kiểm tra điều kiện nghiệm",
          duration: 15,
          description: "Hai câu ngắn để Minh tự xác định Δ ≥ 0.",
          materialId: "mat-delta",
          type: "Khởi động",
        },
        {
          id: "act-2",
          title: "Ôn hệ thức Viète",
          duration: 20,
          description: "Biểu diễn tổng và tích nghiệm.",
          materialId: "mat-viete",
          type: "Lý thuyết",
        },
        {
          id: "act-3",
          title: "Luyện bài cực trị có hướng dẫn",
          duration: 40,
          description: "Giải hai bài có mức hỗ trợ tăng dần.",
          materialId: "mat-cuctri",
          type: "Luyện tập",
        },
        {
          id: "act-4",
          title: "Kiểm tra độc lập",
          duration: 15,
          description: "Một câu mới không dùng gợi ý.",
          type: "Kiểm tra",
        },
      ],
    },
    {
      id: "ses-ha-next",
      studentId: "stu-ha",
      title: "Phân tích đa thức thành nhân tử",
      goal: "Nhận biết cách nhóm hạng tử phù hợp",
      date: day(1),
      time: "18:00",
      duration: 60,
      meetingUrl: "",
      status: "scheduled",
      createdAt: now,
      activities: [
        {
          id: "act-ha-1",
          title: "Luyện phân tích đa thức",
          duration: 60,
          description: "Đi từ ví dụ mẫu đến bài tự làm.",
          materialId: "mat-dathuc",
          type: "Luyện tập",
        },
      ],
    },
    {
      id: "ses-minh-prev",
      studentId: "stu-minh",
      title: "Phương trình bậc hai",
      goal: "Vận dụng công thức nghiệm và Viète",
      date: day(-3),
      time: "19:30",
      duration: 90,
      meetingUrl: "",
      status: "ended",
      createdAt: now,
      activities: [
        {
          id: "act-prev-1",
          title: "Giải bài và chữa lỗi",
          duration: 90,
          description: "Chữa bài theo bước.",
          materialId: "mat-viete",
          type: "Luyện tập",
        },
      ],
    },
  ],
  submissions: [
    {
      id: "sub-minh-1",
      studentId: "stu-minh",
      sessionId: "ses-minh-prev",
      activityId: "act-prev-1",
      title: "Bài tìm tham số m",
      answer:
        "Em biến đổi theo S = x₁ + x₂, P = x₁x₂ nhưng chưa kiểm tra điều kiện Δ ≥ 0.",
      status: "new",
      createdAt: now,
    },
    {
      id: "sub-ha-1",
      studentId: "stu-ha",
      sessionId: "ses-ha-next",
      activityId: "act-ha-1",
      title: "Bài phân tích đa thức",
      answer: "x² + 5x + 6 = (x + 2)(x + 3)",
      status: "new",
      createdAt: now,
    },
  ],
  evidence: [
    {
      id: "ev-prev-1",
      studentId: "stu-minh",
      sessionId: "ses-minh-prev",
      activityId: "act-prev-1",
      kind: "Ghi chú",
      title: "Quan sát khi chữa bài",
      detail:
        "Minh dùng Viète đúng nhưng bỏ qua điều kiện có nghiệm ở bước đầu.",
      support: "Có gợi ý",
      createdAt: now,
    },
  ],
  claims: [
    {
      id: "claim-prev-1",
      studentId: "stu-minh",
      sessionId: "ses-minh-prev",
      text: "Minh vận dụng được hệ thức Viète nhưng cần kiểm tra điều kiện có nghiệm trước khi kết luận.",
      evidenceIds: ["ev-prev-1"],
      status: "pending",
      createdAt: now,
    },
  ],
};

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const formatDate = (value: string) => {
  if (!value) return "Chưa đặt lịch";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const pickMaterials = (student: Student, materials: Material[]) => {
  const gaps = student.gaps.join(" ").toLowerCase();
  return materials
    .filter((material) => material.subject === student.subject)
    .map((material) => {
      const topic = material.topic.toLowerCase();
      const title = material.title.toLowerCase();
      const score =
        (material.grade === student.grade ? 3 : 0) +
        (gaps.includes(topic) ? 4 : 0) +
        (student.gaps.some((gap) =>
          gap
            .toLowerCase()
            .split(" ")
            .some((word) => word.length > 4 && title.includes(word)),
        )
          ? 2
          : 0);
      return { material, score };
    })
    .sort((a, b) => b.score - a.score);
};

export const sessionStudentIds = (session: Session) =>
  session.studentIds?.length ? session.studentIds : [session.studentId];
export const defaultTools = {
  board: true,
  upload: true,
  check: true,
  chat: true,
};
export const boardKey = (
  sessionId: string,
  activityId: string,
  ownerId: string,
) => `${sessionId}:${activityId}:${ownerId}`;
