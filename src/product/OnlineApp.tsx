import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import {
  AsyncPanel,
  FormFeedback,
  AISuggestionReview,
  type AsyncState,
  type Feedback,
} from "./presentation";
import { api, ApiError, googleCallback, signIn, signOut } from "./onlineApi";
import { Modal, Status, initials } from "./ui";
import { OnlineShell, type OnlineNavItem } from "./OnlineShell";
import {
  OnlineOverview,
  OnlineSessionPicker,
  type RecentEvidence,
} from "./OnlineOverview";
import { statusLabel } from "./statusLabels";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileText,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { LiveRoom } from "./LiveRoom";
import { MaterialViewer } from "./MaterialViewer";
import "./product.css";
import "./classroom.css";
import "./refinement.css";

type Student = {
  id: string;
  name: string;
  grade: string;
  subject: string;
  goal: string;
  notes: string;
  strengths: string[];
  gaps: string[];
  status: "active" | "archived";
  initials: string;
  color: string;
  version: number;
};
type Material = {
  id: string;
  title: string;
  topic: string;
  grade: string;
  subject: string;
  level: string;
  kind: "PDF" | "Anh" | "BaiTap" | "GhiChu";
  currentVersion: number;
};
type Activity = {
  id: string;
  title: string;
  description: string;
  duration: number;
  type: "KhoiDong" | "LyThuyet" | "LuyenTap" | "KiemTra";
  materialId: string | null;
  materialVersion: number | null;
  teacherNotes: string | null;
  sourceEvidenceIds: string[];
  sourceClaimRefs: { claimId: string; revision: number }[];
  isSourceStale?: boolean;
};
type Session = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  goal: string;
  sharedGoal: string;
  status: string;
  version: number;
  Activity_sessionId_items: Activity[];
  RoomMember_sessionId_items: { studentId: string }[];
};
type Teacher = { id: string; name: string; email: string };
type ApprovedClaim = {
  id: string;
  studentId: string;
  text: string;
  revision: number;
  evidenceIds: string[];
  observationEvidenceIds: string[];
};
type Annotation = {
  id: string;
  activityId: string;
  materialId: string;
  page: number;
  x: number;
  y: number;
  text: string;
  materialVersion: number;
};
type Page =
  | "dashboard"
  | "students"
  | "student"
  | "materials"
  | "plans"
  | "grading"
  | "live"
  | "summary"
  | "account";
const pageNames: Record<Page, string> = {
  dashboard: "Tổng quan",
  students: "Học sinh",
  student: "Hồ sơ học sinh",
  materials: "Kho học liệu",
  plans: "Soạn buổi học",
  grading: "Chấm bài",
  live: "Phòng dạy",
  summary: "Tổng kết & duyệt",
  account: "Tài khoản",
};
const navItems: OnlineNavItem[] = Object.entries(pageNames)
  .filter(([id]) => id !== "student")
  .map(([id, label]) => ({ id, label, icon: id as OnlineNavItem["icon"] }));
const message = (e: unknown): Feedback =>
  e instanceof ApiError
    ? e.failure
    : {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Không thể hoàn thành yêu cầu.",
        requestId: "unknown",
      };
const body = (value: unknown) => JSON.stringify(value);
const configTools = { board: true, upload: true, check: true, chat: true };

let oauthBootstrap: Promise<void> | null = null;
function initializeOAuth() {
  if (oauthBootstrap) return oauthBootstrap;
  const params = new URLSearchParams(location.search);
  const code = params.get("code"),
    state = params.get("state");
  if (!code || !state) return Promise.resolve();
  historyReplace();
  oauthBootstrap = googleCallback(code, state);
  return oauthBootstrap;
}

export default function OnlineApp() {
  const workspaceEpoch = useRef(0);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [state, setState] = useState<AsyncState>("loading");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [students, setStudents] = useState<Student[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [roomSession, setRoomSession] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [materialGrade, setMaterialGrade] = useState("Lớp 9");
  const [materialSubject, setMaterialSubject] = useState("Toán");
  const [materialTopic, setMaterialTopic] = useState("");
  const [materialLevel, setMaterialLevel] = useState("TrungBinh");
  const [materialDescription, setMaterialDescription] = useState("");
  const [preview, setPreview] = useState<Material | null>(null);
  const [viewerActivity, setViewerActivity] = useState("");
  const [suggestion, setSuggestion] = useState<{
    id: string;
    text: string;
    provider?: "gemini" | "mock";
    sources: { claimId: string; revision: number; evidenceIds: string[] }[];
  } | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [activity, setActivity] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityDuration, setActivityDuration] = useState(15);
  const [grade, setGrade] = useState("Lớp 9");
  const [subject, setSubject] = useState("Toán");
  const [planDate, setPlanDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [planTime, setPlanTime] = useState("19:00");
  const [planDuration, setPlanDuration] = useState(60);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [editGoal, setEditGoal] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStrengths, setEditStrengths] = useState("");
  const [editGaps, setEditGaps] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<ApprovedClaim[]>([]);
  const [openedSource, setOpenedSource] = useState<{
    evidence: { title: string; detail: string };
    source: unknown;
  } | null>(null);
  const [theme, setTheme] = useState(() =>
    document.body.classList.contains("dark"),
  );
  const [modal, setModal] = useState<
    | "student"
    | "profile"
    | "material"
    | "session"
    | "session-settings"
    | "activity"
    | null
  >(null);
  const [editingActivity, setEditingActivity] = useState("");
  const [query, setQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("active");
  const [recentEvidence, setRecentEvidence] = useState<RecentEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  const [profileTab, setProfileTab] = useState<
    "overview" | "history" | "evidence"
  >("overview");
  const [studentEvidence, setStudentEvidence] = useState<RecentEvidence[]>([]);
  const [studentEvidenceState, setStudentEvidenceState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  useEffect(() => setProfileTab("overview"), [selectedStudent]);
  useEffect(() => {
    setStudentEvidence([]);
    if (!teacher || page !== "student" || !selectedStudent) return;
    let active = true;
    setStudentEvidenceState("loading");
    void api<{ evidence: RecentEvidence[] }>(
      `/evidence?studentId=${encodeURIComponent(selectedStudent)}&limit=100`,
    )
      .then((data) => {
        if (!active) return;
        setStudentEvidence(
          data.evidence.filter((item) => item.studentId === selectedStudent),
        );
        setStudentEvidenceState("ready");
      })
      .catch(() => {
        if (active) setStudentEvidenceState("error");
      });
    return () => {
      active = false;
    };
  }, [teacher?.id, selectedStudent, page]);
  useEffect(() => {
    if (!teacher || page !== "dashboard") return;
    let active = true;
    setEvidenceError("");
    void api<{ evidence: RecentEvidence[] }>("/evidence?limit=4")
      .then((data) => {
        if (active) setRecentEvidence(data.evidence);
      })
      .catch((error) => {
        if (active)
          setEvidenceError(
            error instanceof Error ? error.message : "Chưa tải được minh chứng",
          );
      });
    return () => {
      active = false;
    };
  }, [teacher?.id, page, state]);
  const clearWorkspace = useCallback(() => {
    workspaceEpoch.current += 1;
    setTeacher(null);
    setRecentEvidence([]);
    setEvidenceError("");
    setStudentEvidence([]);
    setProfileTab("overview");
    setModal(null);
    setRoomSession("");
    setPage("dashboard");
    setStudents([]);
    setMaterials([]);
    setSessions([]);
    setHistory([]);
    setAnnotations([]);
    setPreview(null);
    setViewerActivity("");
    setOpenedSource(null);
    setSuggestion(null);
    setSelectedStudent("");
    setSelectedSession("");
    setMemberIds([]);
    setFile(null);
    setName("");
    setGoal("");
    setTitle("");
    setActivity("");
    setActivityDescription("");
    setMaterialTopic("");
    setMaterialDescription("");
    setEditGoal("");
    setEditNotes("");
    setEditStrengths("");
    setEditGaps("");
  }, []);
  const reload = useCallback(async () => {
    const epoch = workspaceEpoch.current;
    setState("loading");
    setFeedback(null);
    try {
      const [who, pupils, library, plans] = await Promise.all([
        api<{ teacher: Teacher }>("/auth/me"),
        api<{ students: Student[] }>("/students"),
        api<{ materials: Material[] }>("/materials"),
        api<{ sessions: Session[] }>("/sessions"),
      ]);
      if (epoch !== workspaceEpoch.current) return;
      setTeacher(who.teacher);
      setStudents(pupils.students);
      setMaterials(library.materials);
      setSessions(plans.sessions);
      setState("ready");
      setSelectedStudent((id) =>
        pupils.students.some((s) => s.id === id)
          ? id
          : pupils.students[0]?.id || "",
      );
      setSelectedSession((id) =>
        plans.sessions.some((s) => s.id === id)
          ? id
          : plans.sessions[0]?.id || "",
      );
    } catch (e) {
      if (epoch !== workspaceEpoch.current) return;
      if (e instanceof ApiError && e.status === 401) {
        clearWorkspace();
        setState("ready");
      } else {
        setFeedback(message(e));
        setState("error");
      }
    }
  }, [clearWorkspace]);
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        await initializeOAuth();
      } catch (e) {
        if (active) {
          setFeedback(message(e));
          setState("ready");
        }
        return;
      }
      if (active) await reload();
    };
    void start();
    return () => {
      active = false;
    };
  }, [reload]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback(message(e));
    } finally {
      setBusy(false);
    }
  };
  const submitStudent = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api<{ student: Student }>("/students", {
        method: "POST",
        body: body({
          name,
          grade,
          subject,
          goal,
          strengths: [],
          gaps: [],
          notes: "",
          status: "active",
          initials: name
            .trim()
            .split(/\s+/)
            .slice(-2)
            .map((v) => v[0])
            .join("")
            .toUpperCase(),
          color: "violet",
        }),
      });
      setName("");
      setGoal("");
      await reload();
      setSelectedStudent(result.student.id);
      setModal(null);
    });
  };
  const student = students.find((s) => s.id === selectedStudent);
  const studentHistory = history.filter(
    (claim) => claim.studentId === selectedStudent,
  );
  const session = sessions.find((s) => s.id === selectedSession);
  useEffect(() => {
    setEditGoal(student?.goal || "");
    setEditNotes(student?.notes || "");
    setEditStrengths(student?.strengths.join("\n") || "");
    setEditGaps(student?.gaps.join("\n") || "");
    setHistory([]);
  }, [student?.id]);
  useEffect(() => {
    if (!selectedStudent) return;
    let active = true;
    api<{ claims: ApprovedClaim[] }>(`/students/${selectedStudent}/history`)
      .then((r) => {
        if (active) setHistory(r.claims);
      })
      .catch((e) => {
        if (active) setFeedback(message(e));
      });
    return () => {
      active = false;
    };
  }, [selectedStudent, page, roomSession]);
  useEffect(() => {
    if (!selectedSession) {
      setAnnotations([]);
      return;
    }
    let active = true;
    api<{ annotations: Annotation[] }>(
      `/sessions/${selectedSession}/annotations`,
    )
      .then((result) => {
        if (active) setAnnotations(result.annotations);
      })
      .catch((error) => {
        if (active) setFeedback(message(error));
      });
    return () => {
      active = false;
    };
  }, [selectedSession]);
  const updateStudent = (patch: Partial<Student>) => {
    if (!student) return;
    void run(async () => {
      await api(`/students/${student.id}`, {
        method: "PATCH",
        headers: { "If-Match-Version": String(student.version) },
        body: body(patch),
      });
      await reload();
    });
  };
  const saveMaterial = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    void run(async () => {
      const bytes = await file.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      const intent = await api<{ uploadId: string; uploadUrl: string }>(
        "/materials/upload-intent",
        {
          method: "POST",
          body: body({
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            sha256: hash,
          }),
        },
      );
      const upload = await fetch(intent.uploadUrl, {
        method: "PUT",
        body: file,
      });
      if (!upload.ok) throw new Error("Upload failed");
      await api("/materials", {
        method: "POST",
        body: body({
          uploadId: intent.uploadId,
          title,
          subject: materialSubject,
          grade: materialGrade,
          topic: materialTopic,
          level: materialLevel,
          kind: file.type === "application/pdf" ? "PDF" : "Anh",
          description: materialDescription,
          source: "Tải lên",
        }),
      });
      setTitle("");
      setFile(null);
      setModal(null);
      await reload();
    });
  };
  const createSession = (e: FormEvent) => {
    e.preventDefault();
    if (!student) return;
    void run(async () => {
      const created = await api<{ session: Session }>("/sessions", {
        method: "POST",
        body: body({
          studentIds: [...new Set([student.id, ...memberIds])],
          title,
          goal: student.goal,
          sharedGoal: "",
          date: planDate,
          time: planTime,
          duration: planDuration,
          tools: configTools,
        }),
      });
      setTitle("");
      setModal(null);
      await reload();
      setSelectedSession(created.session.id);
    });
  };
  const saveActivities = async (items: Activity[]) => {
    if (!session) return;
    const payload = items.map(
      ({
        id,
        title: itemTitle,
        description,
        duration,
        type,
        materialId,
        materialVersion,
        teacherNotes,
        sourceEvidenceIds,
        sourceClaimRefs,
      }) => ({
        ...(id ? { id } : {}),
        title: itemTitle,
        description,
        duration,
        type,
        materialId,
        materialVersion,
        teacherNotes,
        sourceEvidenceIds,
        sourceClaimRefs,
      }),
    );
    await api(`/sessions/${session.id}/activities`, {
      method: "PUT",
      headers: { "If-Match-Version": String(session.version) },
      body: body(payload),
    });
    await reload();
  };
  const addActivity = (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    void run(async () => {
      await saveActivities([
        ...session.Activity_sessionId_items,
        {
          id: "",
          title: activity,
          description: activityDescription,
          duration: activityDuration,
          type: "LuyenTap",
          materialId: null,
          materialVersion: null,
          teacherNotes: null,
          sourceEvidenceIds: [],
          sourceClaimRefs: [],
        },
      ]);
      setActivity("");
      setActivityDescription("");
      setActivityDuration(15);
      setModal(null);
    });
  };
  const toggleTheme = () => {
    setTheme((current) => {
      document.body.classList.toggle("dark", !current);
      return !current;
    });
  };
  const logout = () =>
    void run(async () => {
      try {
        await signOut();
      } finally {
        clearWorkspace();
      }
    });
  const navigate = (id: string) => {
    setPage(id as Page);
    setQuery("");
    if (!["live", "grading", "summary"].includes(id)) setRoomSession("");
  };
  const openRoom = (
    id: string,
    view: "teach" | "grading" | "summary" = "teach",
  ) => {
    setSelectedSession(id);
    setRoomSession(id);
    setPage(view === "teach" ? "live" : view);
  };
  const openSource = (id: string) =>
    void run(async () => setOpenedSource(await api(`/evidence/${id}`)));
  const workspace = ["live", "grading", "summary"].includes(page);
  const filteredStudents = students.filter(
    (item) =>
      (studentFilter === "all" || item.status === studentFilter) &&
      `${item.name} ${item.grade} ${item.subject}`
        .toLocaleLowerCase("vi-VN")
        .includes(query.toLocaleLowerCase("vi-VN")),
  );
  const filteredMaterials = materials.filter((item) =>
    `${item.title} ${item.subject} ${item.topic}`
      .toLocaleLowerCase("vi-VN")
      .includes(query.toLocaleLowerCase("vi-VN")),
  );
  const sourceModal = openedSource && (
    <Modal
      title={openedSource.evidence.title}
      onClose={() => setOpenedSource(null)}
    >
      <p>{openedSource.evidence.detail}</p>
      <pre>
        {openedSource.source
          ? JSON.stringify(openedSource.source, null, 2)
          : "Nguồn gốc không khả dụng."}
      </pre>
    </Modal>
  );
  if (!teacher)
    return (
      <main className="restored-auth" data-theme={theme ? "dark" : "light"}>
        <section className="restored-auth-hero">
          <div className="restored-auth-brand">
            <span className="brand-mark">
              <Sparkles size={24} />
            </span>
            <strong>AI Teaching Copilot</strong>
          </div>
          <Status tone="violet">Không gian dạy học trực tuyến</Status>
          <h1>
            Một nơi để dạy.
            <br />
            Một mạch để học tiếp.
          </h1>
          <p>
            Chuẩn bị buổi học, cùng làm bài và lưu lại điều học sinh đã hiểu —
            trong một phòng học.
          </p>
          <div className="auth-features">
            <div>
              <Video size={20} />
              <span>Phòng giáo viên và học sinh riêng biệt</span>
            </div>
            <div>
              <BookOpen size={20} />
              <span>Đề bài, bảng nháp và minh chứng cùng một nơi</span>
            </div>
            <div>
              <ShieldCheck size={20} />
              <span>Gia sư duyệt trước khi cập nhật hồ sơ</span>
            </div>
          </div>
          <div className="restored-auth-preview">
            <Sparkles size={20} />
            <h3>Giữ mạch bài học của từng học sinh</h3>
            <p>
              Soạn giáo án → cùng làm bài → đối chiếu minh chứng → chuẩn bị buổi
              tiếp theo.
            </p>
          </div>
        </section>
        <section className="restored-auth-main">
          <div className="eyebrow">DÀNH CHO GIÁO VIÊN</div>
          <h2>Chào mừng bạn trở lại</h2>
          <p>Đăng nhập để mở lịch dạy và các buổi học.</p>
          <FormFeedback saving={busy} error={feedback} />
          {state === "loading" ? (
            <AsyncPanel state="loading" />
          ) : (
            <>
              <button
                className="button ghost google-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ url: string }>(
                      "/auth/google/start",
                    );
                    location.assign(result.url);
                  })
                }
              >
                <span className="google-g" aria-hidden="true">
                  G
                </span>
                Tiếp tục với Google
                <ArrowRight size={17} />
              </button>
              <div className="auth-demo">
                <Status tone="violet">Demo cục bộ</Status>
                <p>
                  Dùng tài khoản mẫu trên máy chủ demo để thử luồng dạy học.
                </p>
                <button
                  className="demo-account"
                  aria-label="Demo Hoàng Nam"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await signIn("teacher-a");
                      await reload();
                    })
                  }
                >
                  <span className="avatar avatar-violet">HN</span>
                  <span>
                    <strong>Demo Hoàng Nam</strong>
                    <small>Không gian giáo viên</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button
                  className="demo-account"
                  aria-label="Demo Mai An"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await signIn("teacher-b");
                      await reload();
                    })
                  }
                >
                  <span className="avatar avatar-blue">MA</span>
                  <span>
                    <strong>Demo Mai An</strong>
                    <small>Tài khoản kiểm tra độc lập</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              </div>
              {state === "error" && (
                <button className="button" onClick={() => void reload()}>
                  Thử kết nối lại
                </button>
              )}
            </>
          )}
          <p className="auth-student-note">
            <GraduationCap size={19} />
            Học sinh dùng liên kết buổi học do giáo viên cung cấp.
          </p>
          <button className="text-button" onClick={toggleTheme}>
            Đổi giao diện
          </button>
        </section>
      </main>
    );
  return (
    <OnlineShell
      page={page}
      title={pageNames[page]}
      teacher={teacher}
      theme={theme ? "dark" : "light"}
      onThemeToggle={toggleTheme}
      navItems={navItems}
      onNavigate={navigate}
      onSignOut={logout}
      accountAction={() => navigate("account")}
      room={workspace && !!roomSession}
    >
      <FormFeedback saving={busy} error={feedback} />
      {state === "error" ? (
        <AsyncPanel state="error" onRetry={() => void reload()} />
      ) : (
        <>
          {page === "dashboard" && (
            <OnlineOverview
              teacherName={teacher?.name}
              students={students}
              materialsCount={materials.length}
              sessions={sessions}
              evidence={recentEvidence}
              evidenceError={evidenceError}
              onPlan={(sessionId?: string) => {
                if (sessionId) setSelectedSession(sessionId);
                navigate("plans");
              }}
              onMaterials={() => navigate("materials")}
              onStudents={() => navigate("students")}
              onSession={openRoom}
              onEvidence={openSource}
            />
          )}
          {page === "students" && (
            <>
              <div className="restored-page-title">
                <div>
                  <h1>Học sinh của bạn</h1>
                  <p>Hiểu từng học sinh để chuẩn bị đúng điều các em cần.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("student")}
                >
                  <Plus size={17} />
                  Thêm học sinh
                </button>
              </div>
              <div className="filter-card">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Tìm học sinh"
                    placeholder="Tìm theo tên, lớp hoặc môn học…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  aria-label="Trạng thái học sinh"
                  value={studentFilter}
                  onChange={(event) => setStudentFilter(event.target.value)}
                >
                  <option value="active">Đang theo dõi</option>
                  <option value="archived">Đã lưu trữ</option>
                  <option value="all">Tất cả học sinh</option>
                </select>
                <span className="result-count">
                  {filteredStudents.length} học sinh
                </span>
              </div>
              <div className="restored-student-grid">
                {filteredStudents.map((item) => (
                  <article className="card restored-student-card" key={item.id}>
                    <div className="row-between">
                      <span className={`avatar avatar-${item.color}`}>
                        {item.initials || initials(item.name)}
                      </span>
                      <Status
                        tone={item.status === "active" ? "green" : "neutral"}
                      >
                        {item.status === "active"
                          ? "Đang theo dõi"
                          : "Đã lưu trữ"}
                      </Status>
                    </div>
                    <h2>{item.name}</h2>
                    <p>
                      {item.grade} · {item.subject}
                    </p>
                    <p className="student-goal">
                      <span>Mục tiêu hiện tại</span>
                      {item.goal || "Chưa ghi mục tiêu học tập."}
                    </p>
                    <div className="student-card-footer">
                      <button
                        className="button"
                        onClick={() => {
                          setSelectedStudent(item.id);
                          navigate("student");
                        }}
                      >
                        Xem hồ sơ
                        <ChevronRight size={15} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedStudent(item.id);
                          navigate("plans");
                        }}
                      >
                        Soạn buổi học
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filteredStudents.length && (
                <section className="card restored-empty">
                  <Users size={30} />
                  <h2>
                    {query
                      ? "Chưa tìm thấy học sinh"
                      : "Chưa có học sinh ở danh sách này"}
                  </h2>
                  <p>Thêm hồ sơ để theo dõi mục tiêu và quá trình học.</p>
                </section>
              )}
            </>
          )}
          {page === "student" && student && (
            <>
              <button
                className="text-button"
                onClick={() => navigate("students")}
              >
                Học sinh <ChevronRight size={14} />
                Hồ sơ
              </button>
              <section className="card profile-hero">
                <div className="profile-identity">
                  <span className={`avatar avatar-${student.color} avatar-lg`}>
                    {student.initials || initials(student.name)}
                  </span>
                  <div>
                    <h1>{student.name}</h1>
                    <p>
                      {student.grade} · {student.subject}
                    </p>
                    <Status
                      tone={student.status === "active" ? "green" : "neutral"}
                    >
                      {student.status === "active"
                        ? "Đang theo dõi"
                        : "Đã lưu trữ"}
                    </Status>
                  </div>
                </div>
                <div className="profile-hero-actions">
                  <button
                    className="button"
                    onClick={() => setModal("profile")}
                  >
                    <Pencil size={15} />
                    Chỉnh sửa hồ sơ
                  </button>
                  <button
                    className="button primary"
                    onClick={() => navigate("plans")}
                  >
                    <Plus size={15} />
                    Soạn buổi học
                  </button>
                </div>
              </section>
              <div className="profile-metrics">
                <div className="metric-card">
                  <span>Buổi học đã tham gia</span>
                  <strong>
                    {
                      sessions.filter((item) =>
                        item.RoomMember_sessionId_items.some(
                          (member) => member.studentId === student.id,
                        ),
                      ).length
                    }
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Nhận định đã duyệt</span>
                  <strong>{studentHistory.length}</strong>
                </div>
                <div className="metric-card">
                  <span>Điểm mạnh ghi nhận</span>
                  <strong>{student.strengths.length}</strong>
                </div>
              </div>
              <div
                className="tabs"
                role="tablist"
                aria-label="Nội dung hồ sơ học sinh"
                onKeyDown={(event) => {
                  const tabs = ["overview", "history", "evidence"] as const;
                  const index = tabs.indexOf(profileTab);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setProfileTab(tabs[next]);
                  event.currentTarget
                    .querySelectorAll<HTMLButtonElement>("[role=tab]")
                    [next]?.focus();
                }}
              >
                {(
                  [
                    ["overview", "Tổng quan"],
                    ["history", "Lịch sử buổi học"],
                    ["evidence", "Minh chứng"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={profileTab === value}
                    tabIndex={profileTab === value ? 0 : -1}
                    id={`profile-tab-${value}`}
                    aria-controls="student-profile-panel"
                    className={profileTab === value ? "active" : ""}
                    onClick={() => setProfileTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                id="student-profile-panel"
                role="tabpanel"
                aria-labelledby={`profile-tab-${profileTab}`}
              >
                {profileTab === "overview" && (
                  <div className="two-column restored-profile">
                    <section className="card profile-overview-card">
                      <div className="profile-goal-box">
                        <span className="eyebrow">MỤC TIÊU HỌC TẬP</span>
                        <h2>Mục tiêu học tập</h2>
                        <p>{student.goal || "Chưa có mục tiêu học tập."}</p>
                      </div>
                      <div className="profile-traits-grid">
                        <div className="profile-trait-block">
                          <h3>Điểm mạnh</h3>
                          {student.strengths.length ? (
                            <ul className="trait-pill-list">
                              {student.strengths.map((item, index) => (
                                <li
                                  key={index}
                                  className="trait-pill trait-pill--strength"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted">
                              Giáo viên chưa ghi điểm mạnh.
                            </p>
                          )}
                        </div>
                        <div className="profile-trait-block">
                          <h3>Cần củng cố</h3>
                          {student.gaps.length ? (
                            <ul className="trait-pill-list">
                              {student.gaps.map((item, index) => (
                                <li
                                  key={index}
                                  className="trait-pill trait-pill--gap"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted">
                              Chưa có nội dung cần củng cố được ghi nhận.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="profile-note-box">
                        <h3>Ghi chú riêng của giáo viên</h3>
                        <p>{student.notes || "Chưa có ghi chú riêng."}</p>
                      </div>
                    </section>
                    <section className="card">
                      <div className="section-head">
                        <div>
                          <h2>Nhận định đã duyệt</h2>
                          <p>
                            Chỉ những nhận định có nguồn hợp lệ mới được đưa vào
                            hồ sơ.
                          </p>
                        </div>
                        <ShieldCheck size={20} />
                      </div>
                      {studentHistory.map((claim) => (
                        <article className="claim-item" key={claim.id}>
                          <Status tone="green">Đã duyệt</Status>
                          <p>{claim.text}</p>
                          <div className="claim-actions">
                            {claim.evidenceIds.map((id) => (
                              <button
                                className="text-button"
                                key={id}
                                onClick={() => openSource(id)}
                              >
                                <FileText size={14} />
                                Xem minh chứng
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                      {!studentHistory.length && (
                        <div className="restored-empty">
                          <ShieldCheck size={28} />
                          <p>Chưa có nhận định đã duyệt.</p>
                          <small>
                            Sau buổi học, đối chiếu minh chứng trước khi cập
                            nhật hồ sơ.
                          </small>
                        </div>
                      )}
                    </section>
                  </div>
                )}
                {profileTab === "history" && (
                  <section className="card">
                    <div className="section-head">
                      <div>
                        <h2>Các buổi học</h2>
                        <p>Mở kế hoạch hoặc tổng kết của từng buổi.</p>
                      </div>
                    </div>
                    {sessions.some((item) =>
                      item.RoomMember_sessionId_items.some(
                        (member) => member.studentId === student.id,
                      ),
                    ) ? (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Buổi học</th>
                              <th>Ngày giờ</th>
                              <th>Trạng thái</th>
                              <th>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessions
                              .filter((item) =>
                                item.RoomMember_sessionId_items.some(
                                  (member) => member.studentId === student.id,
                                ),
                              )
                              .sort((a, b) =>
                                `${b.date} ${b.time}`.localeCompare(
                                  `${a.date} ${a.time}`,
                                ),
                              )
                              .map((item) => (
                                <tr key={item.id}>
                                  <td>
                                    <strong>{item.title}</strong>
                                  </td>
                                  <td>
                                    {item.date} · {item.time}
                                  </td>
                                  <td>
                                    <Status
                                      tone={
                                        item.status === "reviewed"
                                          ? "green"
                                          : "neutral"
                                      }
                                    >
                                      {statusLabel(item.status)}
                                    </Status>
                                  </td>
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        if (
                                          [
                                            "ended",
                                            "reviewed",
                                            "live",
                                          ].includes(item.status)
                                        )
                                          openRoom(
                                            item.id,
                                            item.status === "live"
                                              ? "teach"
                                              : "summary",
                                          );
                                        else {
                                          setSelectedSession(item.id);
                                          navigate("plans");
                                        }
                                      }}
                                    >
                                      Mở <ArrowRight size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">Học sinh chưa có buổi học nào.</p>
                    )}
                  </section>
                )}
                {profileTab === "evidence" && (
                  <section className="card">
                    <div className="section-head">
                      <div>
                        <h2>Dòng minh chứng</h2>
                        <p>
                          Các minh chứng gần nhất gắn với đúng học sinh và buổi
                          học.
                        </p>
                      </div>
                    </div>
                    {studentEvidenceState === "loading" ? (
                      <p role="status">Đang tải minh chứng…</p>
                    ) : studentEvidenceState === "error" ? (
                      <p role="alert">
                        Chưa tải được minh chứng. Mở lại hồ sơ để thử lại.
                      </p>
                    ) : studentEvidence.length ? (
                      <div className="evidence-list">
                        {studentEvidence.map((item) => (
                          <button
                            className="evidence-row evidence-clickable"
                            key={item.id}
                            onClick={() => openSource(item.id)}
                          >
                            <FileText size={18} />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.detail}</small>
                            </span>
                            <ArrowRight size={16} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">
                        Chưa có minh chứng của học sinh này.
                      </p>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
          {page === "materials" && (
            <>
              <div className="restored-page-title">
                <div>
                  <h1>Kho học liệu</h1>
                  <p>Sắp xếp đề bài và tài liệu để dùng trong từng buổi học.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setTitle("");
                    setModal("material");
                  }}
                >
                  <Plus size={17} />
                  Tải học liệu
                </button>
              </div>
              <div className="filter-card">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Tìm học liệu"
                    placeholder="Tìm theo tên, môn học hoặc chủ đề…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <span className="result-count">
                  {filteredMaterials.length} học liệu
                </span>
              </div>
              <div className="restored-material-grid">
                {filteredMaterials.map((item) => (
                  <article
                    className="card restored-material-card"
                    key={item.id}
                  >
                    <div className="material-preview">
                      <FileText size={34} />
                      <Status tone="violet">
                        {item.kind === "PDF" ? "PDF" : "Hình ảnh"}
                      </Status>
                    </div>
                    <h2>{item.title}</h2>
                    <p>
                      {item.subject} · {item.grade}
                    </p>
                    <div className="material-tags">
                      <span>{item.topic}</span>
                      <span>Phiên bản {item.currentVersion}</span>
                    </div>
                    <button className="button" onClick={() => setPreview(item)}>
                      Xem tệp
                      <ArrowRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
              {!filteredMaterials.length && (
                <section className="card restored-empty">
                  <BookOpen size={32} />
                  <h2>Chưa có học liệu phù hợp</h2>
                  <p>Tải PDF hoặc hình ảnh để chuẩn bị nội dung giảng dạy.</p>
                  <button
                    className="button"
                    onClick={() => setModal("material")}
                  >
                    Tải học liệu đầu tiên
                  </button>
                </section>
              )}
            </>
          )}
          {page === "plans" && (
            <>
              <div className="restored-page-title">
                <div>
                  <h1>Soạn buổi học</h1>
                  <p>
                    Từ mục tiêu của học sinh đến một mạch hoạt động rõ ràng.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setTitle("");
                    setModal("session");
                  }}
                >
                  <Plus size={17} />
                  Tạo buổi học
                </button>
              </div>
              <div className="restored-plan-layout">
                <aside className="card restored-plan-aside">
                  <div className="section-head">
                    <h2>Buổi học của bạn</h2>
                    <CalendarDays size={18} />
                  </div>
                  <div className="restored-session-list">
                    {sessions.map((item) => (
                      <button
                        key={item.id}
                        aria-label={item.title}
                        className={`restored-session-row${selectedSession === item.id ? " is-selected" : ""}`}
                        onClick={() => setSelectedSession(item.id)}
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {item.date} · {item.time}
                        </span>
                        <Status
                          tone={item.status === "live" ? "green" : "neutral"}
                        >
                          {statusLabel(item.status)}
                        </Status>
                      </button>
                    ))}
                  </div>
                  {!sessions.length && (
                    <p className="muted">
                      Tạo buổi học đầu tiên để thêm mục tiêu và hoạt động.
                    </p>
                  )}
                </aside>
                <section className="card restored-plan-main">
                  {session ? (
                    <>
                      <header className="plan-main-header">
                        <div className="plan-main-title-block">
                          <div className="plan-main-badges">
                            <Status
                              tone={
                                session.status === "live"
                                  ? "green"
                                  : session.status === "scheduled"
                                    ? "blue"
                                    : session.status === "reviewed"
                                      ? "green"
                                      : "violet"
                              }
                            >
                              {statusLabel(session.status)}
                            </Status>
                            <span className="plan-duration-pill">
                              Thời lượng {session.duration} phút
                            </span>
                          </div>
                          <h2>{session.title}</h2>
                          <p className="plan-meta-line">
                            {session.date} · {session.time} · {session.duration}{" "}
                            phút
                          </p>
                          {(session.sharedGoal || session.goal) && (
                            <div className="plan-goals-summary">
                              {session.sharedGoal && (
                                <p>
                                  <strong>Mục tiêu lớp học:</strong>{" "}
                                  {session.sharedGoal}
                                </p>
                              )}
                              {session.goal && (
                                <p>
                                  <strong>Mục tiêu giáo viên:</strong>{" "}
                                  {session.goal}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="plan-main-actions">
                          <button
                            className="button ghost small"
                            onClick={() => setModal("session-settings")}
                          >
                            <Settings2 size={15} />
                            Thiết lập buổi học
                          </button>
                          <button
                            className="button ghost small"
                            disabled={busy || session.status !== "draft"}
                            onClick={() =>
                              void run(async () => {
                                await api(`/sessions/${session.id}`, {
                                  method: "PATCH",
                                  headers: {
                                    "If-Match-Version": String(session.version),
                                  },
                                  body: body({ status: "scheduled" }),
                                });
                                await reload();
                              })
                            }
                          >
                            Lên lịch
                          </button>
                          <button
                            className="button primary"
                            type="button"
                            onClick={() => openRoom(session.id)}
                          >
                            <Video size={16} />
                            Mở phòng học
                          </button>
                        </div>
                      </header>

                      <div className="plan-members-section">
                        <span className="plan-section-label">
                          Học sinh tham gia (
                          {session.RoomMember_sessionId_items.length})
                        </span>
                        <div className="plan-member-list">
                          {session.RoomMember_sessionId_items.map((member) => {
                            const pupil = students.find(
                              (item) => item.id === member.studentId,
                            );
                            const pupilName = pupil?.name || "Học sinh";
                            return (
                              <div
                                key={member.studentId}
                                className="plan-member-chip"
                              >
                                <span
                                  className={`avatar avatar-sm avatar-${pupil?.color || "violet"}`}
                                >
                                  {pupil?.initials || initials(pupilName)}
                                </span>
                                <span className="plan-member-name">
                                  {pupilName}
                                </span>{" "}
                                {session.status === "draft" && (
                                  <button
                                    className="text-button"
                                    disabled={
                                      busy ||
                                      session.RoomMember_sessionId_items
                                        .length <= 1
                                    }
                                    onClick={() =>
                                      void run(async () => {
                                        await api(
                                          `/sessions/${session.id}/members/${member.studentId}`,
                                          {
                                            method: "DELETE",
                                            headers: {
                                              "If-Match-Version": String(
                                                session.version,
                                              ),
                                            },
                                          },
                                        );
                                        await reload();
                                      })
                                    }
                                  >
                                    Bỏ khỏi bản nháp
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="plan-activities-header">
                        <div>
                          <h3>
                            Lộ trình hoạt động (
                            {session.Activity_sessionId_items.length})
                          </h3>
                          <small>
                            Tổng thời lượng:{" "}
                            {session.Activity_sessionId_items.reduce(
                              (n, a) => n + a.duration,
                              0,
                            )}{" "}
                            phút / {session.duration} phút
                          </small>
                        </div>
                        <div className="plan-activities-actions">
                          <button
                            className="button ghost small"
                            disabled={
                              busy || !session.RoomMember_sessionId_items.length
                            }
                            onClick={() =>
                              void run(async () => {
                                const studentId =
                                  session.RoomMember_sessionId_items.some(
                                    (m) => m.studentId === selectedStudent,
                                  )
                                    ? selectedStudent
                                    : session.RoomMember_sessionId_items[0]
                                        .studentId;
                                const response = await api<{
                                  suggestion: {
                                    id: string;
                                    text: string;
                                    provider?: "gemini" | "mock";
                                    sources: {
                                      claimId: string;
                                      revision: number;
                                      evidenceIds: string[];
                                    }[];
                                  };
                                }>(`/sessions/${session.id}/ai/plan-suggestions`, {
                                  method: "POST",
                                  body: body({ studentId }),
                                });
                                setSuggestion(response.suggestion);
                                setEditingSuggestion(false);
                              })
                            }
                          >
                            <Sparkles size={15} />
                            Đề xuất hoạt động từ lịch sử đã duyệt
                          </button>
                          <button
                            className="button secondary small"
                            onClick={() => setModal("activity")}
                          >
                            <Plus size={16} />
                            Thêm hoạt động
                          </button>
                        </div>
                      </div>

                      {session.Activity_sessionId_items.reduce(
                        (n, a) => n + a.duration,
                        0,
                      ) > session.duration && (
                        <p role="alert" className="plan-duration-alert">
                          Tổng thời lượng hoạt động vượt thời lượng buổi học.
                        </p>
                      )}

                      {suggestion && (
                        <div className="plan-ai-suggestion">
                          <p className="plan-ai-provider">
                            <Sparkles size={14} />
                            {suggestion.provider === "mock"
                              ? "Giả lập local"
                              : suggestion.provider === "gemini"
                                ? "Gemini"
                                : "Gợi ý đã lưu"}{" "}
                            · Giáo viên kiểm tra nguồn trước khi dùng.
                          </p>
                          <AISuggestionReview
                            text={suggestion.text}
                            busy={busy}
                            onEdit={() => setEditingSuggestion(true)}
                            onDismiss={() =>
                              void run(async () => {
                                await api(`/ai-requests/${suggestion.id}`, {
                                  method: "PATCH",
                                  body: body({ status: "ignored" }),
                                });
                                setSuggestion(null);
                              })
                            }
                            onAccept={() =>
                              void run(async () => {
                                await saveActivities([
                                  ...session.Activity_sessionId_items,
                                  {
                                    id: "",
                                    title: "Củng cố từ lịch sử đã duyệt",
                                    description: "",
                                    teacherNotes: suggestion.text,
                                    duration: 15,
                                    type: "KiemTra",
                                    materialId: null,
                                    materialVersion: null,
                                    sourceEvidenceIds: [
                                      ...new Set(
                                        suggestion.sources.flatMap(
                                          (source) => source.evidenceIds,
                                        ),
                                      ),
                                    ],
                                    sourceClaimRefs: suggestion.sources.map(
                                      ({ claimId, revision }) => ({
                                        claimId,
                                        revision,
                                      }),
                                    ),
                                  },
                                ]);
                                await api(`/ai-requests/${suggestion.id}`, {
                                  method: "PATCH",
                                  body: body({ status: "used" }),
                                });
                                setSuggestion(null);
                              })
                            }
                          />
                          {editingSuggestion && (
                            <label>
                              Sửa gợi ý riêng cho giáo viên
                              <textarea
                                value={suggestion.text}
                                onChange={(e) =>
                                  setSuggestion({
                                    ...suggestion,
                                    text: e.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                        </div>
                      )}

                      <div className="plan-activities-list">
                        {session.Activity_sessionId_items.map((a, index) => (
                          <article
                            className="restored-activity-card"
                            key={a.id}
                          >
                            <div className="activity-card-header">
                              <div className="activity-card-heading">
                                <span className="activity-step-badge">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <div>
                                  <p className="activity-card-title">
                                    {a.title} · {a.duration} phút
                                  </p>
                                  {a.description && (
                                    <p className="activity-card-desc">
                                      {a.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="activity-card-actions">
                                <button
                                  className="button ghost small"
                                  onClick={() => setEditingActivity(a.id)}
                                >
                                  <Pencil size={14} />
                                  Chỉnh sửa hoạt động
                                </button>
                                <button
                                  className="text-button"
                                  disabled={busy || index === 0}
                                  onClick={() =>
                                    void run(async () => {
                                      const items = [
                                        ...session.Activity_sessionId_items,
                                      ];
                                      [items[index - 1], items[index]] = [
                                        items[index],
                                        items[index - 1],
                                      ];
                                      await saveActivities(items);
                                    })
                                  }
                                >
                                  Lên
                                </button>
                                <button
                                  className="text-button"
                                  disabled={
                                    busy ||
                                    index ===
                                      session.Activity_sessionId_items.length -
                                        1
                                  }
                                  onClick={() =>
                                    void run(async () => {
                                      const items = [
                                        ...session.Activity_sessionId_items,
                                      ];
                                      [items[index + 1], items[index]] = [
                                        items[index],
                                        items[index + 1],
                                      ];
                                      await saveActivities(items);
                                    })
                                  }
                                >
                                  Xuống
                                </button>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await saveActivities(
                                        session.Activity_sessionId_items.filter(
                                          (item) => item.id !== a.id,
                                        ),
                                      );
                                    })
                                  }
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>

                            {a.isSourceStale && (
                              <p role="alert" className="activity-stale-alert">
                                Nguồn đã thay đổi, cần kiểm tra lại.
                              </p>
                            )}

                            {editingActivity === a.id && (
                              <Modal
                                title={`Chỉnh sửa: ${a.title}`}
                                onClose={() => !busy && setEditingActivity("")}
                              >
                                <form
                                  className="form-stack"
                                  key={`${a.id}-${session.version}`}
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const fields = new FormData(
                                      event.currentTarget,
                                    );
                                    void run(async () => {
                                      await saveActivities(
                                        session.Activity_sessionId_items.map(
                                          (item) =>
                                            item.id === a.id
                                              ? {
                                                  ...item,
                                                  title: String(
                                                    fields.get("title"),
                                                  ),
                                                  description: String(
                                                    fields.get("description"),
                                                  ),
                                                  duration: Number(
                                                    fields.get("duration"),
                                                  ),
                                                }
                                              : item,
                                        ),
                                      );
                                    });
                                  }}
                                >
                                  <label>
                                    Tên hoạt động
                                    <input
                                      name="title"
                                      defaultValue={a.title}
                                      required
                                    />
                                  </label>
                                  <label>
                                    Mô tả hoạt động
                                    <textarea
                                      name="description"
                                      defaultValue={a.description}
                                    />
                                  </label>
                                  <label>
                                    Số phút
                                    <input
                                      name="duration"
                                      type="number"
                                      min="1"
                                      defaultValue={a.duration}
                                      required
                                    />
                                  </label>
                                  <button
                                    className="button primary small"
                                    disabled={busy}
                                  >
                                    Lưu hoạt động
                                  </button>
                                </form>
                              </Modal>
                            )}

                            <div className="activity-card-footer">
                              <div className="activity-material-row">
                                <select
                                  aria-label={`Học liệu cho ${a.title}`}
                                  value={a.materialId || ""}
                                  onChange={(e) => {
                                    const materialId = e.target.value || null;
                                    void run(async () => {
                                      await saveActivities(
                                        session.Activity_sessionId_items.map(
                                          (item) =>
                                            item.id === a.id
                                              ? {
                                                  ...item,
                                                  materialId,
                                                  materialVersion: materialId
                                                    ? (materials.find(
                                                        (m) =>
                                                          m.id === materialId,
                                                      )?.currentVersion ?? null)
                                                    : null,
                                                }
                                              : item,
                                        ),
                                      );
                                    });
                                  }}
                                >
                                  <option value="">Chưa gắn học liệu</option>
                                  {materials.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.title}
                                    </option>
                                  ))}
                                </select>
                                {a.materialId && (
                                  <button
                                    className="button ghost small"
                                    onClick={() =>
                                      setViewerActivity(
                                        viewerActivity === a.id ? "" : a.id,
                                      )
                                    }
                                  >
                                    {viewerActivity === a.id
                                      ? "Đóng xem đề"
                                      : "Xem và chú thích đề"}
                                  </button>
                                )}
                              </div>
                              <div className="activity-sources-row">
                                {a.sourceEvidenceIds.map((id) => (
                                  <button
                                    className="text-button source-chip"
                                    key={id}
                                    onClick={() =>
                                      void run(async () => {
                                        setOpenedSource(
                                          await api(`/evidence/${id}`),
                                        );
                                      })
                                    }
                                  >
                                    <FileText size={13} />
                                    Xem nguồn đã duyệt
                                  </button>
                                ))}
                                {history
                                  .filter(() =>
                                    session.RoomMember_sessionId_items.some(
                                      (member) =>
                                        member.studentId === selectedStudent,
                                    ),
                                  )
                                  .map((claim) => (
                                    <button
                                      className="text-button source-chip"
                                      key={claim.id}
                                      onClick={() =>
                                        void run(async () => {
                                          await saveActivities(
                                            session.Activity_sessionId_items.map(
                                              (item) =>
                                                item.id === a.id
                                                  ? {
                                                      ...item,
                                                      sourceEvidenceIds: [
                                                        ...new Set([
                                                          ...item.sourceEvidenceIds,
                                                          ...claim.observationEvidenceIds,
                                                        ]),
                                                      ],
                                                      sourceClaimRefs: [
                                                        ...item.sourceClaimRefs.filter(
                                                          (ref) =>
                                                            ref.claimId !==
                                                            claim.id,
                                                        ),
                                                        {
                                                          claimId: claim.id,
                                                          revision:
                                                            claim.revision,
                                                        },
                                                      ],
                                                    }
                                                  : item,
                                            ),
                                          );
                                        })
                                      }
                                    >
                                      Gắn nguồn: {claim.text}
                                    </button>
                                  ))}
                              </div>
                            </div>

                            {viewerActivity === a.id &&
                              a.materialId &&
                              a.materialVersion &&
                              materials.find((m) => m.id === a.materialId) && (
                                <MaterialViewer
                                  materialId={a.materialId}
                                  version={a.materialVersion}
                                  title={
                                    materials.find(
                                      (m) => m.id === a.materialId,
                                    )!.title
                                  }
                                  kind={
                                    materials.find(
                                      (m) => m.id === a.materialId,
                                    )!.kind
                                  }
                                  annotations={annotations}
                                  sessionId={session.id}
                                  activityId={a.id}
                                  students={session.RoomMember_sessionId_items.map(
                                    (member) => ({
                                      id: member.studentId,
                                      name:
                                        students.find(
                                          (pupil) =>
                                            pupil.id === member.studentId,
                                        )?.name || "Học sinh",
                                    }),
                                  )}
                                  onSaved={(saved) =>
                                    setAnnotations((items) => [...items, saved])
                                  }
                                />
                              )}
                            {annotations
                              .filter((item) => item.activityId === a.id)
                              .map((item) => (
                                <p key={item.id} className="activity-pin-note">
                                  Chú thích trang {item.page + 1} · vị trí{" "}
                                  {item.x}
                                  %, {item.y}% · phiên bản{" "}
                                  {item.materialVersion}: {item.text}
                                </p>
                              ))}
                          </article>
                        ))}
                        {!session.Activity_sessionId_items.length && (
                          <div className="restored-empty">
                            <BookOpen size={28} />
                            <p>Buổi học này chưa có hoạt động nào.</p>
                            <small>
                              Nhấn &ldquo;Thêm hoạt động&rdquo; hoặc đề xuất từ
                              lịch sử đã duyệt để xây dựng lộ trình.
                            </small>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="restored-empty">
                      <CalendarDays size={30} />
                      <p>Chọn buổi học.</p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {workspace &&
            (roomSession ? (
              <LiveRoom
                sessionId={roomSession}
                teacherId={teacher.id}
                onThemeToggle={toggleTheme}
                view={
                  page === "grading"
                    ? "grading"
                    : page === "summary"
                      ? "summary"
                      : "teach"
                }
                onViewChange={(view) =>
                  setPage(view === "teach" ? "live" : view)
                }
                onExit={() => {
                  setRoomSession("");
                  setPage("plans");
                }}
              />
            ) : (
              <OnlineSessionPicker
                sessions={sessions}
                students={students}
                selected={selectedSession}
                purpose={page as "live" | "grading" | "summary"}
                onSelect={setSelectedSession}
                onOpen={(id) =>
                  openRoom(
                    id,
                    page === "grading"
                      ? "grading"
                      : page === "summary"
                        ? "summary"
                        : "teach",
                  )
                }
                onPlan={(sessionId?: string) => {
                if (sessionId) setSelectedSession(sessionId);
                navigate("plans");
              }}
              />
            ))}
          {page === "account" && (
            <>
              <div className="restored-page-title">
                <div>
                  <h1>Tài khoản của bạn</h1>
                  <p>Thông tin đăng nhập và không gian dữ liệu giáo viên.</p>
                </div>
              </div>
              <section className="card account-panel">
                <div className="profile-identity">
                  <span className="avatar avatar-violet avatar-lg">
                    {initials(teacher.name)}
                  </span>
                  <div>
                    <h2>{teacher.name}</h2>
                    <p>{teacher.email}</p>
                    <Status tone="green">Phiên đã xác thực</Status>
                  </div>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Dữ liệu được lưu trên máy chủ</strong>
                    <p>
                      Hồ sơ, học liệu và buổi học đi cùng tài khoản giáo viên
                      của bạn.
                    </p>
                  </div>
                  <ShieldCheck size={22} />
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Giao diện</strong>
                    <p>
                      {theme
                        ? "Đang dùng giao diện tối"
                        : "Đang dùng giao diện sáng"}
                    </p>
                  </div>
                  <button className="button" onClick={toggleTheme}>
                    Đổi giao diện
                  </button>
                </div>
                <button className="button" onClick={logout}>
                  Đăng xuất
                </button>
              </section>
            </>
          )}
        </>
      )}
      {modal === "student" && (
        <Modal title="Thêm học sinh" onClose={() => !busy && setModal(null)}>
          <form className="form-stack" onSubmit={submitStudent}>
            <label>
              Tên học sinh
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Lớp
              <input value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
            <label>
              Môn học
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Mục tiêu
              <input value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <button className="button primary" disabled={busy}>
              Thêm học sinh
            </button>
          </form>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal
          title="Hồ sơ học sinh"
          wide
          onClose={() => !busy && setModal(null)}
        >
          <section className="restored-profile">
            {student ? (
              <>
                <div className="profile-modal-header">
                  <div>
                    <h2>{student.name}</h2>
                    <small className="muted">
                      {student.grade} · {student.subject}
                    </small>
                  </div>
                  <button
                    className="button ghost small"
                    type="button"
                    onClick={() =>
                      updateStudent({
                        status:
                          student.status === "active" ? "archived" : "active",
                      })
                    }
                  >
                    {student.status === "active" ? "Lưu trữ" : "Khôi phục"}
                  </button>
                </div>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateStudent({
                      goal: editGoal,
                      notes: editNotes,
                      strengths: editStrengths
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean),
                      gaps: editGaps
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    });
                  }}
                >
                  <label>
                    Mục tiêu
                    <textarea
                      aria-label="Mục tiêu"
                      value={editGoal}
                      onChange={(e) => setEditGoal(e.target.value)}
                    />
                  </label>
                  <label>
                    Ghi chú
                    <textarea
                      aria-label="Ghi chú"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </label>
                  <div className="form-grid-two">
                    <label>
                      Điểm mạnh (mỗi dòng một mục)
                      <textarea
                        aria-label="Điểm mạnh (mỗi dòng một mục)"
                        value={editStrengths}
                        onChange={(e) => setEditStrengths(e.target.value)}
                      />
                    </label>
                    <label>
                      Cần củng cố (mỗi dòng một mục)
                      <textarea
                        aria-label="Cần củng cố (mỗi dòng một mục)"
                        value={editGaps}
                        onChange={(e) => setEditGaps(e.target.value)}
                      />
                    </label>
                  </div>
                  <button className="button primary" disabled={busy}>
                    Lưu hồ sơ
                  </button>
                </form>
                <div className="profile-modal-claims">
                  <h3>Nhận định đã duyệt</h3>
                  {studentHistory.map((c) => (
                    <div key={c.id} className="claim-item">
                      <p>{c.text}</p>
                      <div className="claim-actions">
                        {c.evidenceIds.map((id) => (
                          <button
                            className="text-button"
                            key={id}
                            onClick={() =>
                              void run(async () => {
                                setOpenedSource(await api(`/evidence/${id}`));
                              })
                            }
                          >
                            Xem minh chứng
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!studentHistory.length && (
                    <p className="muted">Chưa có nhận định đã duyệt.</p>
                  )}
                </div>
              </>
            ) : (
              <p>Chọn học sinh.</p>
            )}
          </section>
        </Modal>
      )}
      {modal === "material" && (
        <Modal title="Tải học liệu" onClose={() => !busy && setModal(null)}>
          <form className="form-stack" onSubmit={saveMaterial}>
            <label>
              Tên
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="form-grid-two">
              <label>
                Môn học
                <input
                  value={materialSubject}
                  onChange={(e) => setMaterialSubject(e.target.value)}
                  required
                />
              </label>
              <label>
                Lớp
                <input
                  value={materialGrade}
                  onChange={(e) => setMaterialGrade(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="form-grid-two">
              <label>
                Chủ đề
                <input
                  value={materialTopic}
                  onChange={(e) => setMaterialTopic(e.target.value)}
                  required
                />
              </label>
              <label>
                Mức độ
                <select
                  value={materialLevel}
                  onChange={(e) => setMaterialLevel(e.target.value)}
                >
                  <option value="CoBan">Cơ bản</option>
                  <option value="TrungBinh">Trung bình</option>
                  <option value="NangCao">Nâng cao</option>
                </select>
              </label>
            </div>
            <label>
              Mô tả
              <textarea
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
              />
            </label>
            <label className="upload-field">
              PDF hoặc ảnh, tối đa 10 MiB
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Tải lên
            </button>
          </form>
        </Modal>
      )}
      {modal === "session" && (
        <Modal title="Tạo buổi học" onClose={() => !busy && setModal(null)}>
          <form className="form-stack" onSubmit={createSession}>
            <label>
              Học sinh
              <select
                aria-label="Học sinh"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                {students
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Thêm học sinh (tối đa 5)
              <select
                aria-label="Thêm học sinh (tối đa 5)"
                multiple
                value={memberIds}
                onChange={(e) =>
                  setMemberIds(
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
              >
                {students
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tên buổi học
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label>
              Ngày
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                required
              />
            </label>
            <label>
              Giờ
              <input
                type="time"
                value={planTime}
                onChange={(e) => setPlanTime(e.target.value)}
                required
              />
            </label>
            <label>
              Thời lượng (phút)
              <input
                type="number"
                min="1"
                value={planDuration}
                onChange={(e) => setPlanDuration(Number(e.target.value))}
                required
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !student || student.status !== "active"}
            >
              Tạo bản nháp
            </button>
          </form>
        </Modal>
      )}
      {modal === "session-settings" && session && (
        <Modal
          title="Thiết lập buổi học"
          onClose={() => !busy && setModal(null)}
        >
          <form
            key={`session-${session.id}-${session.version}`}
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              void run(async () => {
                await api(`/sessions/${session.id}`, {
                  method: "PATCH",
                  headers: {
                    "If-Match-Version": String(session.version),
                  },
                  body: body({
                    title: String(fields.get("title")),
                    goal: String(fields.get("goal")),
                    sharedGoal: String(fields.get("sharedGoal")),
                    date: String(fields.get("date")),
                    time: String(fields.get("time")),
                    duration: Number(fields.get("duration")),
                  }),
                });
                await reload();
              });
            }}
          >
            <label>
              Tên buổi
              <input name="title" defaultValue={session.title} required />
            </label>
            <label>
              Mục tiêu riêng
              <textarea name="goal" defaultValue={session.goal} />
            </label>
            <label>
              Mục tiêu chia sẻ
              <textarea name="sharedGoal" defaultValue={session.sharedGoal} />
            </label>
            <label>
              Ngày
              <input
                name="date"
                type="date"
                defaultValue={session.date}
                required
              />
            </label>
            <label>
              Giờ
              <input
                name="time"
                type="time"
                defaultValue={session.time}
                required
              />
            </label>
            <label>
              Thời lượng
              <input
                name="duration"
                type="number"
                min="1"
                defaultValue={session.duration}
                required
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Lưu kế hoạch
            </button>
          </form>
        </Modal>
      )}
      {modal === "activity" && (
        <Modal title="Thêm hoạt động" onClose={() => !busy && setModal(null)}>
          <form className="form-stack" onSubmit={addActivity}>
            <label>
              Hoạt động
              <input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                required
              />
            </label>
            <label>
              Mô tả
              <textarea
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
              />
            </label>
            <label>
              Thời lượng hoạt động
              <input
                type="number"
                min="1"
                value={activityDuration}
                onChange={(e) => setActivityDuration(Number(e.target.value))}
                required
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Thêm hoạt động
            </button>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal title={preview.title} wide onClose={() => setPreview(null)}>
          <MaterialViewer
            materialId={preview.id}
            version={preview.currentVersion}
            kind={preview.kind}
            title={preview.title}
          />
        </Modal>
      )}
      {sourceModal}
    </OnlineShell>
  );
}
function historyReplace() {
  window.history.replaceState({}, "", location.pathname + location.hash);
}
