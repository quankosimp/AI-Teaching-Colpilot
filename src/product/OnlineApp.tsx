import { LessonPreparation } from "./LessonPreparation";
import { LessonSchedule, type ScheduleStart } from "./LessonSchedule";
import { lessonHeading, lessonWhen, materialRef, nextPupilLesson, type LessonMaterial as Material, type LessonSession as Session, type LessonClaim as ApprovedClaim } from "./lessonPlanning";
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
  type AsyncState,
  type Feedback,
} from "./presentation";
import { api, ApiError, googleCallback, signIn, signOut } from "./onlineApi";
import { Modal, Status, initials } from "./ui";
import { OnlineShell, type OnlineNavItem } from "./OnlineShell";
import { type RecentEvidence } from "./OnlineOverview";
import { statusLabel } from "./statusLabels";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  Pencil,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  ChevronLeft,
} from "lucide-react";
import { ClassesHome } from "./classHome";
import { AfterClass } from "./classHome/AfterClass";
import { MaterialClassesDialog } from "./classHome/ClassMaterials";
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
type Teacher = { id: string; name: string; email: string };
type Page =
  | "dashboard"
  | "classes"
  | "sessions"
  | "students"
  | "student"
  | "materials"
  | "plans"
  | "grading"
  | "live"
  | "summary"
  | "after"
  | "account";
const pageNames: Record<Page, string> = {
  dashboard: "Tổng quan",
  classes: "Lớp",
  sessions: "Buổi học",
  students: "Học sinh",
  student: "Hồ sơ học sinh",
  materials: "Tài liệu",
  plans: "Chi tiết buổi học",
  grading: "Chấm bài",
  live: "Phòng dạy",
  summary: "Tổng kết & duyệt",
  after: "Sau buổi",
  account: "Tài khoản",
};
// Thanh bên theo thiết kế "Lớp là phòng": Lớp · Tài liệu, Tài khoản ở dưới.
const navItems: OnlineNavItem[] = (["classes", "materials", "account"] as const).map((id) => ({
  id,
  label: id === "materials" ? "Tài liệu" : pageNames[id],
  icon: id as OnlineNavItem["icon"],
}));
// Các trang thuộc vòng dạy của một lớp: mục Lớp trên thanh bên luôn sáng.
const classPages: Page[] = ["classes", "after", "student", "plans", "live", "grading", "summary", "sessions", "dashboard", "students"];
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
  const [page, setPage] = useState<Page>("classes");
  const [students, setStudents] = useState<Student[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  // Mở hồ sơ từ trang lớp thì nhớ lớp đó để quay lại đúng chỗ.
  const [returnClass, setReturnClass] = useState<{ id: string; name: string } | null>(null);
  const [classOpen, setClassOpen] = useState("");
  // Lớp của phòng đang mở, để thoát phòng là về đúng trang lớp đó.
  const [roomClass, setRoomClass] = useState("");
  const [afterSession, setAfterSession] = useState("");
  const backToClass = () => {
    setClassOpen(roomClass);
    setPage("classes");
  };
  const [studentGroups, setStudentGroups] = useState<{ id: string; name: string }[]>([]);
  const [roomSession, setRoomSession] = useState("");
  const [roomBackToLesson, setRoomBackToLesson] = useState(false);
  // Mở màn chấm từ màn Sau buổi thì thoát phòng là về lại màn Sau buổi đó.
  const [roomBackToAfter, setRoomBackToAfter] = useState("");
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
  const [schedule, setSchedule] = useState<(ScheduleStart & { editId?: string }) | null>(null);
  const [lessonNotice, setLessonNotice] = useState<{ id: string; text: string } | null>(null);
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [pinMaterial, setPinMaterial] = useState<Material | null>(null);
  const [grade, setGrade] = useState("Lớp 9");
  const [subject, setSubject] = useState("Toán");
  const [editGoal, setEditGoal] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStrengths, setEditStrengths] = useState("");
  const [editGaps, setEditGaps] = useState("");
  const [history, setHistory] = useState<ApprovedClaim[]>([]);
  const [openedSource, setOpenedSource] = useState<{
    evidence: { title: string; detail: string };
    source: unknown;
  } | null>(null);
  const [theme, setTheme] = useState(() =>
    document.body.classList.contains("dark"),
  );
  const [modal, setModal] = useState<"student" | "profile" | "material" | null>(null);
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
    setStudentGroups([]);
    if (!teacher || page !== "student" || !selectedStudent) return;
    let active = true;
    void api<{ groups: { id: string; name: string; students: { id: string }[] }[] }>("/groups")
      .then((r) => {
        if (active)
          setStudentGroups(
            r.groups
              .filter((g) => g.students.some((m) => m.id === selectedStudent))
              .map((g) => ({ id: g.id, name: g.name })),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [teacher?.id, page, selectedStudent]);
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
    setPage("classes");
    setStudents([]);
    setMaterials([]);
    setSessions([]);
    setHistory([]);
    setPreview(null);
    setOpenedSource(null);
    setSelectedStudent("");
    setSelectedSession("");
    setFile(null);
    setName("");
    setGoal("");
    setTitle("");
    setPinMaterial(null);
    setSchedule(null);
    setLessonNotice(null);
    setUploadSessionId("");
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
  const openUpload = (sessionId = "") => {
    setTitle("");
    setFile(null);
    setUploadError("");
    setUploadSessionId(sessionId);
    setModal("material");
  };
  const saveMaterial = (event: FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    setUploadError("");
    const target = sessions.find(item => item.id === uploadSessionId);
    const pupil = students.find(item => item.id === target?.RoomMember_sessionId_items[0]?.studentId);
    void run(async () => {
      let material: Material;
      try {
        const bytes = await file.arrayBuffer();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        const intent = await api<{ uploadId: string; uploadUrl: string }>("/materials/upload-intent", {
          method: "POST",
          body: body({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256: hash }),
        });
        const upload = await fetch(intent.uploadUrl, { method: "PUT", body: file });
        if (!upload.ok) throw new Error("Chưa tải được tệp. Vui lòng thử lại.");
        const fromLesson = !!uploadSessionId;
        const uploadTitle = fromLesson ? file.name.replace(/\.[^.]+$/, "").trim() || file.name : title;
        const result = await api<{ material: Material }>("/materials", {
          method: "POST",
          body: body({
            uploadId: intent.uploadId,
            title: uploadTitle,
            subject: fromLesson ? pupil?.subject || "" : materialSubject,
            grade: fromLesson ? pupil?.grade || "" : materialGrade,
            topic: fromLesson ? "" : materialTopic,
            level: fromLesson ? "TrungBinh" : materialLevel,
            kind: file.type === "application/pdf" ? "PDF" : "Anh",
            description: fromLesson ? "" : materialDescription,
            source: "Tải lên",
          }),
        });
        material = result.material;
      } catch (error) {
        setUploadError(error instanceof ApiError ? error.failure.message : "Chưa tải được tệp. Vui lòng thử lại.");
        return;
      }
      setTitle("");
      setFile(null);
      setMaterials(items => [material, ...items.filter(item => item.id !== material.id)]);
      setModal(null);
      setUploadSessionId("");
      if (target) {
        try {
          await attachMaterial(target, material);
        } catch (error) {
          setLessonNotice({ id: target.id, text: "Đã tải tệp lên kho. Chọn buổi để gắn tệp." });
          throw error;
        }
      }
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
    if (id !== "student") setReturnClass(null);
    if (id === "classes") setClassOpen("");
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
    setRoomBackToLesson(page === "plans");
    setRoomBackToAfter("");
    setPage(view === "teach" ? "live" : view);
  };
  const openLesson = (id: string, preferredStudentId?: string) => {
    const lesson = sessions.find(item => item.id === id);
    const participant = preferredStudentId || lesson?.RoomMember_sessionId_items[0]?.studentId;
    if (participant) setSelectedStudent(participant);
    setSelectedSession(id);
    setLessonNotice(null);
    navigate("plans");
  };
  const openLessonFromList = (id?: string) => {
    if (!id) { setSchedule({}); return; }
    const lesson = sessions.find(item => item.id === id);
    if (lesson?.status === "live") openRoom(id);
    else if (lesson?.status === "ended" || lesson?.status === "reviewed") openRoom(id, "summary");
    else openLesson(id);
  };
  const openPupilLesson = (pupil: Student) => {
    const next = nextPupilLesson(sessions, pupil.id);
    if (!next) return;
    if (next.status === "live") openRoom(next.id);
    else openLesson(next.id, pupil.id);
  };
  const updateLesson = (updated: Session, notice?: string) => {
    setSessions(items => items.some(item => item.id === updated.id)
      ? items.map(item => item.id === updated.id && item.version <= updated.version ? updated : item)
      : [updated, ...items]);
    if (notice) setLessonNotice({ id: updated.id, text: notice });
  };
  const attachMaterial = async (target: Session, material: Material) => {
    try {
      const { session: updated } = await api<{ session: Session }>("/sessions/" + target.id + "/materials", {
        method: "POST",
        headers: { "If-Match-Version": String(target.version) },
        body: body(materialRef(material)),
      });
      if (page !== "plans" || selectedSession !== target.id) openLesson(target.id);
      updateLesson(updated, "Đã thêm " + material.title + " vào buổi.");
    } catch (error) {
      if (error instanceof ApiError && error.failure.code === "VERSION_CONFLICT") {
        const latest = await api<{ session: Session }>("/sessions/" + target.id).catch(() => null);
        if (latest) updateLesson(latest.session);
      }
      throw error;
    }
  };
  const openSource = (id: string) =>
    void run(async () => setOpenedSource(await api("/evidence/" + id)));
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
      page={classPages.includes(page) ? "classes" : page}
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
              onPrepare={(sessionId, groupId) => {
                setRoomClass(groupId);
                setSelectedSession(sessionId);
                setLessonNotice(null);
                void reload().then(() => setPage("plans"));
              }}
              onOpenAfter={(sessionId, groupId) => {
                setRoomClass(groupId);
                setAfterSession(sessionId);
                setPage("after");
              }}
            />
          )}
          {page === "after" && afterSession && (
            <AfterClass
              key={afterSession}
              sessionId={afterSession}
              onBack={() => { void reload(); backToClass(); }}
              onOpenGrading={(id) => { openRoom(id, "grading"); setRoomBackToAfter(id); }}
            />
          )}
          {page === "student" && student && (
            <>
              {returnClass ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setClassOpen(returnClass.id);
                    setReturnClass(null);
                    setPage("classes");
                  }}
                >
                  <ChevronLeft size={14} /> {returnClass.name}
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() => navigate("classes")}
                >
                  Học sinh <ChevronRight size={14} />
                  Hồ sơ
                </button>
              )}
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
                    {studentGroups.length > 0 && (
                      <p className="profile-classes">
                        Đang học:{" "}
                        {studentGroups.map((g, i) => (
                          <span key={g.id}>
                            {i > 0 && ", "}
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setClassOpen(g.id);
                                setReturnClass(null);
                                setPage("classes");
                              }}
                            >
                              {g.name}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
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
                </div>
              </section>
              {student.status === "active" && <StudentNextLesson student={student} sessions={sessions} students={students}
                onOpen={() => openPupilLesson(student)} />}
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
                                        else openLesson(item.id, student.id);
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
                  <h1>Tài liệu</h1>
                  <p>Không bắt buộc: chia sẻ màn hình vẫn dạy được như thường. Tải lên đây khi bạn muốn máy làm thêm vài việc.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => openUpload()}
                >
                  <Plus size={17} />
                  Tải tài liệu
                </button>
              </div>
              <div className="mat-values">
                <div><Pin size={16} /><span><b>Mở sẵn khi vào lớp</b>Ghim cho lớp, bấm Mở lớp là tài liệu đã trên màn chiếu.</span></div>
                <div><BookOpen size={16} /><span><b>Nhớ trang đã dừng</b>Buổi sau mở tiếp đúng trang, không phải tìm lại.</span></div>
                <div><Sparkles size={16} /><span><b>Câu hỏi từ trang đang chiếu</b>AI soạn nháp câu hỏi nhanh, bạn sửa rồi mới gửi.</span></div>
              </div>
              <div className="filter-card">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Tìm tài liệu"
                    placeholder="Tìm theo tên, môn học hoặc chủ đề…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <span className="result-count">
                  {filteredMaterials.length} tài liệu
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
                    <button type="button" className="button secondary" onClick={() => setPinMaterial(item)}>Dùng cho lớp</button>
                  </article>
                ))}
              </div>
              {!filteredMaterials.length && (
                <section className="card restored-empty">
                  <BookOpen size={32} />
                  <h2>Chưa có tài liệu phù hợp</h2>
                  <p>Tải PDF hoặc hình ảnh để chuẩn bị nội dung giảng dạy.</p>
                  <button
                    className="button"
                    onClick={() => openUpload()}
                  >
                    Tải tài liệu đầu tiên
                  </button>
                </section>
              )}
            </>
          )}
          {page === "plans" && (session ? <LessonPreparation key={session.id} session={session}
            students={students} materials={materials} history={history} preferredStudentId={selectedStudent}
            notice={lessonNotice?.id === session.id ? lessonNotice.text : ""}
            onBack={() => (roomClass ? backToClass() : navigate("classes"))}
            onSchedule={() => setSchedule({ editId: session.id })}
            onOpenRoom={() => openRoom(session.id, session.status === "ended" || session.status === "reviewed" ? "summary" : "teach")}
            onOpenStudent={id => { setSelectedStudent(id); navigate("student"); }}
            onSource={openSource} onAttach={attachMaterial} onUpdated={updateLesson}
            onUpload={() => openUpload(session.id)}
          /> : <section className="card">
            <h1>Chọn buổi học</h1>
            <button type="button" className="button secondary" onClick={() => navigate("classes")}>Về danh sách buổi</button>
          </section>)}
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
                onEnded={() => {
                  setAfterSession(roomSession);
                  setRoomSession("");
                  setPage("after");
                  void reload();
                }}
                onExit={() => {
                  setRoomSession("");
                  if (roomBackToAfter) {
                    setAfterSession(roomBackToAfter);
                    setRoomBackToAfter("");
                    setPage("after");
                  } else if (roomBackToLesson) setPage("plans");
                  else {
                    // Về đúng trang lớp vừa dạy (hoặc danh sách lớp nếu không rõ lớp).
                    setClassOpen(roomClass);
                    setPage("classes");
                  }
                  void reload();
                }}
              />
            ) : null)}
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
                      Hồ sơ, tài liệu và buổi học đi cùng tài khoản giáo viên
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
        <Modal title={uploadSessionId ? "Tải tệp cho buổi học" : "Tải tài liệu"} onClose={() => { if (!busy) { setModal(null); setUploadSessionId(""); } }}>
          <form className="form-stack lesson-dialog-form" onSubmit={saveMaterial}>
            {uploadSessionId && session && <p className="lesson-dialog-context">{lessonHeading(session, students)} · {lessonWhen(session)}</p>}
            {!uploadSessionId && <>
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
            </>}
            <label className="upload-field">
              PDF hoặc ảnh, tối đa 10 MiB
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {uploadError && <p className="lesson-error" role="alert">{uploadError}</p>}
            <div className="lesson-dialog-actions">
              <button className="button primary" disabled={busy || !file}>
                {busy ? "Đang tải…" : uploadSessionId ? "Tải lên và thêm" : "Tải lên"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {schedule && <LessonSchedule start={schedule}
        editing={schedule.editId ? sessions.find(item => item.id === schedule.editId) : undefined}
        students={students} sessions={sessions} onClose={() => setSchedule(null)}
        onOpenClasses={() => { setSchedule(null); navigate("classes"); }}
        onSaved={(updated, notice) => {
          setSchedule(null);
          openLesson(updated.id, updated.RoomMember_sessionId_items[0]?.studentId);
          updateLesson(updated, notice);
        }} />}
      {pinMaterial && <MaterialClassesDialog material={pinMaterial} onClose={() => setPinMaterial(null)} />}
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
function StudentNextLesson({ student, sessions, students, onOpen }: {
  student: Student; sessions: Session[]; students: Student[]; onOpen: () => void;
}) {
  const next = nextPupilLesson(sessions, student.id);
  return <section className="card lesson-next-pupil">
    <div>
      <h2>{next?.status === "live" ? "Buổi đang học" : "Buổi tiếp theo"}</h2>
      {next ? <><strong>{lessonHeading(next, students)}</strong><p>{lessonWhen(next)}</p></> : <p>Chưa có buổi sắp tới.</p>}
    </div>
    {next && <button type="button" className="button primary" onClick={onOpen}>Mở buổi</button>}
  </section>;
}

function historyReplace() {
  window.history.replaceState({}, "", location.pathname + location.hash);
}
