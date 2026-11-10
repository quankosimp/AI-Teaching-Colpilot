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
import { StudentJourney } from "./StudentJourney";
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
import { DashboardHome } from "./classHome/DashboardHome";
import { AfterClass } from "./classHome/AfterClass";
import { LandingPage } from "./LandingPage";
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
  | "after";
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
};
// Thanh bên theo thiết kế "Lớp là phòng" và module Quản lý Học sinh (SRS M02): Trang chủ · Lớp · Học sinh · Tài liệu.
const navItems: OnlineNavItem[] = [
  { id: "dashboard", label: "Trang chủ", icon: "dashboard" },
  ...( ["classes", "students", "materials"] as const).map((id) => ({
    id,
    label: id === "materials" ? "Tài liệu" : pageNames[id],
    icon: id as OnlineNavItem["icon"],
  })),
];
// Các trang thuộc vòng dạy của một lớp: mục Lớp trên thanh bên luôn sáng.
const classPages: Page[] = ["classes", "after", "plans", "live", "grading", "summary", "sessions"];
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
  const [page, setPage] = useState<Page>("dashboard");
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
  const [allGroups, setAllGroups] = useState<{ id: string; name: string; subject?: string; grade?: string; students: { id: string }[] }[]>([]);
  const [roomSession, setRoomSession] = useState("");
  const [roomBackToLesson, setRoomBackToLesson] = useState(false);
  // Mở màn chấm từ màn Sau buổi thì thoát phòng là về lại màn Sau buổi đó.
  const [roomBackToAfter, setRoomBackToAfter] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newStrengths, setNewStrengths] = useState("");
  const [newGaps, setNewGaps] = useState("");
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
  const [editName, setEditName] = useState("");
  const [editGrade, setEditGrade] = useState("Lớp 9");
  const [editSubject, setEditSubject] = useState("Toán");
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
  const [showLandingPreview, setShowLandingPreview] = useState(false);
  const [modal, setModal] = useState<"student" | "profile" | "material" | null>(null);
  const [query, setQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("active");
  const [studentGradeFilter, setStudentGradeFilter] = useState("all");
  const [studentGroupFilter, setStudentGroupFilter] = useState("all");
  const [studentPage, setStudentPage] = useState(1);
  const [materialSubjectFilter, setMaterialSubjectFilter] = useState("all");
  const [materialLevelFilter, setMaterialLevelFilter] = useState("all");
  const [recentEvidence, setRecentEvidence] = useState<RecentEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  const [profileTab, setProfileTab] = useState<
    "overview" | "journey" | "history" | "evidence"
  >("overview");
  const [studentEvidence, setStudentEvidence] = useState<RecentEvidence[]>([]);
  const [studentEvidenceState, setStudentEvidenceState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  useEffect(() => setProfileTab("overview"), [selectedStudent]);
  useEffect(() => {
    setStudentPage(1);
  }, [query, studentFilter, studentGradeFilter, studentGroupFilter]);
  useEffect(() => {
    if (!teacher) {
      setAllGroups([]);
      setStudentGroups([]);
      return;
    }
    let active = true;
    void api<{ groups: { id: string; name: string; subject?: string; grade?: string; students: { id: string }[] }[] }>("/groups")
      .then((r) => {
        if (!active) return;
        setAllGroups(r.groups);
        if (selectedStudent) {
          setStudentGroups(
            r.groups
              .filter((g) => g.students.some((m) => m.id === selectedStudent))
              .map((g) => ({ id: g.id, name: g.name })),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [teacher?.id, page, selectedStudent, students.length]);
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
    setClassOpen("");
    setReturnClass(null);
    setPage("dashboard");
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
          strengths: newStrengths
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          gaps: newGaps
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          notes: newNotes,
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
      setNewNotes("");
      setNewStrengths("");
      setNewGaps("");
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
    setEditName(student?.name || "");
    setEditGrade(student?.grade || "Lớp 9");
    setEditSubject(student?.subject || "Toán");
    setEditGoal(student?.goal || "");
    setEditNotes(student?.notes || "");
    setEditStrengths(student?.strengths.join("\n") || "");
    setEditGaps(student?.gaps.join("\n") || "");
    setHistory([]);
  }, [student?.id, student?.version]);
  useEffect(() => {
    if (!selectedStudent || !teacher) return;
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
  }, [teacher?.id, selectedStudent, page, roomSession, afterSession, state]);
  const updateStudentById = (
    target: Student,
    patch: Partial<Student>,
    closeModalAfter = false,
  ) => {
    void run(async () => {
      await api(`/students/${target.id}`, {
        method: "PATCH",
        headers: { "If-Match-Version": String(target.version) },
        body: body(patch),
      });
      await reload();
      if (closeModalAfter) setModal(null);
    });
  };
  const updateStudent = (patch: Partial<Student>, closeModalAfter = false) => {
    if (!student) return;
    updateStudentById(student, patch, closeModalAfter);
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
  const availableStudentGrades = Array.from(
    new Set(students.map((s) => s.grade.trim()).filter(Boolean)),
  );
  const filteredStudents = students.filter((item) => {
    if (studentFilter !== "all" && item.status !== studentFilter) return false;
    if (studentGradeFilter !== "all" && item.grade.trim() !== studentGradeFilter) return false;
    if (studentGroupFilter === "unassigned") {
      const inAnyGroup = allGroups.some((g) => g.students.some((m) => m.id === item.id));
      if (inAnyGroup) return false;
    } else if (studentGroupFilter !== "all") {
      const grp = allGroups.find((g) => g.id === studentGroupFilter);
      if (!grp || !grp.students.some((m) => m.id === item.id)) return false;
    }
    const searchable = `${item.name} ${item.grade} ${item.subject} ${item.goal} ${item.strengths.join(" ")} ${item.gaps.join(" ")}`.toLocaleLowerCase("vi-VN");
    return searchable.includes(query.toLocaleLowerCase("vi-VN"));
  });
  const STUDENT_PAGE_SIZE = 6;
  const totalStudentPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / STUDENT_PAGE_SIZE),
  );
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const pagedStudents = filteredStudents.slice(
    (safeStudentPage - 1) * STUDENT_PAGE_SIZE,
    safeStudentPage * STUDENT_PAGE_SIZE,
  );
  const availableMaterialSubjects = Array.from(
    new Set(materials.map((m) => m.subject.trim()).filter(Boolean)),
  );
  const filteredMaterials = materials.filter((item) => {
    if (
      materialSubjectFilter !== "all" &&
      item.subject.trim() !== materialSubjectFilter
    )
      return false;
    if (materialLevelFilter !== "all" && item.level !== materialLevelFilter)
      return false;
    return `${item.title} ${item.subject} ${item.topic} ${item.description || ""} ${item.source || ""}`
      .toLocaleLowerCase("vi-VN")
      .includes(query.toLocaleLowerCase("vi-VN"));
  });
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
  if (!teacher || showLandingPreview)
    return (
      <LandingPage
        theme={theme}
        busy={busy}
        state={state}
        feedback={feedback}
        isPreviewMode={!!teacher && showLandingPreview}
        onToggleTheme={toggleTheme}
        onGoogleSignIn={() =>
          void run(async () => {
            try {
              const result = await api<{ url: string }>("/auth/google/start");
              location.assign(result.url);
            } catch (e) {
              if (
                e instanceof ApiError &&
                e.failure.code === "AUTH_UNAVAILABLE"
              ) {
                if (!teacher) {
                  await signIn("teacher-a");
                }
                setShowLandingPreview(false);
                setClassOpen("");
                setReturnClass(null);
                setRoomSession("");
                setPage("dashboard");
                await reload();
                window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
                return;
              }
              throw e;
            }
          })
        }
        onDemoSignIn={(account) =>
          void run(async () => {
            await signIn(account);
            setShowLandingPreview(false);
            setClassOpen("");
            setReturnClass(null);
            setRoomSession("");
            setPage("dashboard");
            await reload();
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
          })
        }
        onRetry={() => void reload()}
        onBackToWorkspace={() => {
          setShowLandingPreview(false);
          setClassOpen("");
          setReturnClass(null);
          setRoomSession("");
          setPage("dashboard");
          window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        }}
      />
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
      room={workspace && !!roomSession}
      actions={
        <button
          type="button"
          className="button ghost"
          style={{ minHeight: 36, padding: "6px 12px", fontSize: 13 }}
          onClick={() => setShowLandingPreview(true)}
        >
          <Sparkles size={15} />
          Giới thiệu sản phẩm
        </button>
      }
    >
      <FormFeedback saving={busy} error={feedback} />
      {state === "error" ? (
        <AsyncPanel state="error" onRetry={() => void reload()} />
      ) : (
        <>
          {page === "dashboard" && (
            <DashboardHome
              classCount={allGroups.length}
              activeStudentCount={students.filter((s) => s.status === "active").length}
              materialCount={materials.length}
              onGoToClasses={() => navigate("classes")}
              onGoToStudents={() => navigate("students")}
              onGoToMaterials={() => navigate("materials")}
              onOpenClass={(id) => { navigate("classes"); setClassOpen(id); }}
              onEnterRoom={(sessionId, groupId) => {
                setRoomClass(groupId);
                void reload().then(() => openRoom(sessionId));
              }}
              onOpenStudent={(studentId) => {
                setSelectedStudent(studentId);
                setReturnClass(null);
                setPage("student");
              }}
              onReload={reload}
            />
          )}
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
              onOpenStudentProfile={(studentId, groupId, groupName) => {
                setSelectedStudent(studentId);
                setReturnClass({ id: groupId, name: groupName });
                setPage("student");
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
          {page === "students" && (
            <>
              <div className="restored-page-title">
                <div>
                  <h1>Học sinh của bạn</h1>
                  <p>
                    Quản lý hồ sơ học tập, mục tiêu, điểm mạnh, khoảng trống cần
                    củng cố và lịch sử nhận định đã duyệt (SRS M02).
                  </p>
                </div>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setName("");
                    setGrade("Lớp 9");
                    setSubject("Toán");
                    setGoal("");
                    setNewNotes("");
                    setNewStrengths("");
                    setNewGaps("");
                    setModal("student");
                  }}
                >
                  <Plus size={17} />
                  Thêm học sinh
                </button>
              </div>
              <div className="profile-metrics" style={{ marginBottom: 18 }}>
                <div className="metric-card">
                  <span>Đang theo dõi</span>
                  <strong>
                    {students.filter((s) => s.status === "active").length}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Đã lưu trữ</span>
                  <strong>
                    {students.filter((s) => s.status === "archived").length}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Cần củng cố kiến thức</span>
                  <strong>
                    {
                      students.filter(
                        (s) => s.status === "active" && s.gaps.length > 0,
                      ).length
                    }
                  </strong>
                </div>
              </div>
              <div className="filter-card">
                <label className="search-box">
                  <Search size={17} aria-hidden="true" />
                  <input
                    aria-label="Tìm học sinh"
                    placeholder="Tìm theo tên, khối lớp, môn học hoặc mục tiêu…"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
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
                  <option value="all">Tất cả trạng thái</option>
                </select>
                <select
                  aria-label="Lọc theo khối lớp"
                  value={studentGradeFilter}
                  onChange={(event) =>
                    setStudentGradeFilter(event.target.value)
                  }
                >
                  <option value="all">Mọi khối lớp</option>
                  {availableStudentGrades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo lớp học"
                  value={studentGroupFilter}
                  onChange={(event) =>
                    setStudentGroupFilter(event.target.value)
                  }
                >
                  <option value="all">Mọi lớp học</option>
                  <option value="unassigned">Chưa xếp lớp</option>
                  {allGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <span className="result-count" role="status" aria-live="polite">
                  {filteredStudents.length} học sinh
                </span>
              </div>
              <div className="restored-student-grid">
                {pagedStudents.map((item) => {
                  const enrolledGroups = allGroups.filter((g) =>
                    g.students.some((m) => m.id === item.id),
                  );
                  const sessionCount = sessions.filter((s) =>
                    s.RoomMember_sessionId_items.some(
                      (m) => m.studentId === item.id,
                    ),
                  ).length;
                  return (
                    <article
                      className="card restored-student-card"
                      key={item.id}
                    >
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
                      <div>
                        <h2>{item.name}</h2>
                        <p>
                          {item.grade} · {item.subject} · {sessionCount} buổi học
                        </p>
                      </div>
                      <div className="restored-card-tags">
                        {enrolledGroups.length > 0 ? (
                          enrolledGroups.map((grp) => (
                            <span key={grp.id}>{grp.name}</span>
                          ))
                        ) : (
                          <span>Chưa xếp lớp</span>
                        )}
                      </div>
                      <p className="student-goal">
                        <span>Mục tiêu hiện tại</span>
                        {item.goal || "Chưa ghi mục tiêu học tập."}
                      </p>
                      {(item.strengths.length > 0 || item.gaps.length > 0) && (
                        <ul
                          className="trait-pill-list"
                          role="list"
                          style={{ margin: 0 }}
                        >
                          {item.strengths.slice(0, 2).map((st, idx) => (
                            <li
                              key={`s-${idx}`}
                              className="trait-pill trait-pill--strength"
                            >
                              ✓ {st}
                            </li>
                          ))}
                          {item.gaps.slice(0, 2).map((gp, idx) => (
                            <li
                              key={`g-${idx}`}
                              className="trait-pill trait-pill--gap"
                            >
                              ! {gp}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="student-card-footer">
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setSelectedStudent(item.id);
                            setReturnClass(null);
                            navigate("student");
                          }}
                        >
                          Xem hồ sơ
                          <ChevronRight size={15} />
                        </button>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            type="button"
                            className="text-button"
                            aria-label={`Chỉnh sửa hồ sơ ${item.name}`}
                            onClick={() => {
                              setSelectedStudent(item.id);
                              setModal("profile");
                            }}
                          >
                            <Pencil size={14} /> Sửa
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            aria-label={`${item.status === "active" ? "Lưu trữ" : "Khôi phục"} hồ sơ ${item.name}`}
                            onClick={() =>
                              updateStudentById(item, {
                                status:
                                  item.status === "active"
                                    ? "archived"
                                    : "active",
                              })
                            }
                          >
                            {item.status === "active" ? "Lưu trữ" : "Khôi phục"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalStudentPages > 1 && (
                <div
                  className="row-between card"
                  style={{ marginTop: 16, padding: "12px 18px" }}
                >
                  <span className="muted">
                    Trang {safeStudentPage} / {totalStudentPages} · Hiển thị{" "}
                    {pagedStudents.length} / {filteredStudents.length} học sinh
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={safeStudentPage <= 1}
                      onClick={() =>
                        setStudentPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Trang trước
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={safeStudentPage >= totalStudentPages}
                      onClick={() =>
                        setStudentPage((p) =>
                          Math.min(totalStudentPages, p + 1),
                        )
                      }
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              )}
              {!filteredStudents.length && (
                <section className="card restored-empty">
                  <Users size={30} />
                  <h2>
                    {query ||
                    studentGradeFilter !== "all" ||
                    studentGroupFilter !== "all"
                      ? "Chưa tìm thấy học sinh phù hợp"
                      : studentFilter === "archived"
                        ? "Chưa có học sinh nào trong mục Lưu trữ"
                        : "Chưa có học sinh ở danh sách này"}
                  </h2>
                  <p>
                    Thêm hồ sơ học sinh mới hoặc điều chỉnh bộ lọc để theo dõi
                    mục tiêu và quá trình học.
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setName("");
                      setGrade("Lớp 9");
                      setSubject("Toán");
                      setGoal("");
                      setNewNotes("");
                      setNewStrengths("");
                      setNewGaps("");
                      setModal("student");
                    }}
                  >
                    Thêm học sinh
                  </button>
                </section>
              )}
            </>
          )}
          {page === "student" && student && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => navigate("students")}
                >
                  <ChevronLeft size={14} /> Danh sách học sinh
                </button>
                {returnClass && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setClassOpen(returnClass.id);
                      setReturnClass(null);
                      setPage("classes");
                    }}
                  >
                    <ChevronLeft size={14} /> Quay về lớp {returnClass.name}
                  </button>
                )}
              </div>
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
                <div className="profile-hero-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      updateStudent({
                        status:
                          student.status === "active" ? "archived" : "active",
                      })
                    }
                  >
                    {student.status === "active"
                      ? "Lưu trữ hồ sơ"
                      : "Khôi phục hồ sơ"}
                  </button>
                  <button
                    type="button"
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
                  const tabs = ["overview", "journey", "history", "evidence"] as const;
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
                    ["journey", "Lộ trình"],
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
                {profileTab === "journey" && (
                  <StudentJourney
                    student={student}
                    sessions={sessions}
                    students={students}
                    studentHistory={studentHistory}
                    onOpenSession={openLessonFromList}
                    onOpenNext={() => openPupilLesson(student)}
                    onSessionUpsert={(updated) =>
                      setSessions((items) =>
                        items.some((item) => item.id === updated.id)
                          ? items.map((item) =>
                              item.id === updated.id ? updated : item,
                            )
                          : [updated, ...items],
                      )
                    }
                  />
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
                      <div
                        className="table-wrap"
                        tabIndex={0}
                        role="region"
                        aria-label={`Các buổi học của ${student.name}`}
                      >
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">Buổi học</th>
                              <th scope="col">Ngày giờ</th>
                              <th scope="col">Trạng thái</th>
                              <th scope="col">Thao tác</th>
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
                  <h1>Kho học liệu & Đề cương (SRS M04)</h1>
                  <p>
                    Quản lý SGK, chuyên đề bồi dưỡng và đề thi thử PDF. Ghim sẵn cho lớp để mở đúng trang đang dạy và tạo câu hỏi nhanh bằng AI Copilot.
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="button primary"
                    onClick={() => openUpload()}
                  >
                    <Plus size={17} />
                    Tải tài liệu
                  </button>
                </div>
              </div>
              <div className="profile-metrics" style={{ marginBottom: 16 }}>
                <div className="metric-card">
                  <span>Tổng số học liệu</span>
                  <strong>{materials.length}</strong>
                </div>
                <div className="metric-card">
                  <span>Môn học Lớp 9</span>
                  <strong>{availableMaterialSubjects.length}</strong>
                </div>
                <div className="metric-card">
                  <span>Chuyên đề Nâng cao / Ôn vào 10</span>
                  <strong>
                    {materials.filter((m) => m.level === "NangCao").length}
                  </strong>
                </div>
              </div>
              <div className="mat-values">
                <div><Pin size={16} /><span><b>Mở sẵn khi vào lớp</b>Ghim cho lớp, bấm Mở lớp là tài liệu đã trên màn chiếu.</span></div>
                <div><BookOpen size={16} /><span><b>Nhớ trang đã dừng</b>Buổi sau mở tiếp đúng trang, không phải tìm lại.</span></div>
                <div><Sparkles size={16} /><span><b>Câu hỏi từ trang đang chiếu</b>AI soạn nháp câu hỏi nhanh, bạn sửa rồi mới gửi.</span></div>
              </div>
              <div className="filter-card">
                <label className="search-box">
                  <Search size={17} aria-hidden="true" />
                  <input
                    aria-label="Tìm tài liệu"
                    placeholder="Tìm theo tên đề cương, môn học, chủ đề hoặc trường…"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  aria-label="Lọc môn học tài liệu"
                  value={materialSubjectFilter}
                  onChange={(e) => setMaterialSubjectFilter(e.target.value)}
                >
                  <option value="all">Mọi môn học</option>
                  {availableMaterialSubjects.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc mức độ tài liệu"
                  value={materialLevelFilter}
                  onChange={(e) => setMaterialLevelFilter(e.target.value)}
                >
                  <option value="all">Mọi mức độ</option>
                  <option value="CoBan">Cơ bản</option>
                  <option value="TrungBinh">Trung bình</option>
                  <option value="NangCao">Nâng cao</option>
                </select>
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
                      <FileText size={32} />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Status tone="violet">
                          {item.kind === "PDF" ? "PDF" : "Học liệu"}
                        </Status>
                        <Status
                          tone={
                            item.level === "NangCao"
                              ? "amber"
                              : item.level === "CoBan"
                                ? "green"
                                : "neutral"
                          }
                        >
                          {item.level === "NangCao"
                            ? "Nâng cao"
                            : item.level === "CoBan"
                              ? "Cơ bản"
                              : "Trung bình"}
                        </Status>
                      </div>
                    </div>
                    <h2>{item.title}</h2>
                    <p style={{ fontWeight: 600 }}>
                      {item.subject} · {item.grade}
                      {item.source ? ` · ${item.source}` : ""}
                    </p>
                    {item.description && (
                      <p
                        className="muted"
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.5,
                          margin: "4px 0 10px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                    <div className="material-tags">
                      <span>{item.topic}</span>
                      <span>Phiên bản {item.currentVersion}</span>
                    </div>
                    <div className="row-actions" style={{ marginTop: "auto", paddingTop: 10 }}>
                      <button className="button" onClick={() => setPreview(item)}>
                        Xem tệp
                        <ArrowRight size={15} />
                      </button>
                      <button type="button" className="button secondary" onClick={() => setPinMaterial(item)}>
                        Ghim cho lớp
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filteredMaterials.length && (
                <section className="card restored-empty">
                  <BookOpen size={32} />
                  <h2>Chưa có tài liệu phù hợp</h2>
                  <p>Tải PDF hoặc nạp bộ học liệu mẫu Lớp 9 chuẩn GDPT 2018 để bắt đầu.</p>
                  <div className="row-actions" style={{ justifyContent: "center" }}>
                    <button
                      className="button primary"
                      onClick={() =>
                        void run(async () => {
                          await api("/demo-seed", { method: "POST", body: "{}" });
                          await reload();
                        })
                      }
                    >
                      Nạp bộ học liệu Lớp 9 mẫu
                    </button>
                    <button
                      className="button"
                      onClick={() => openUpload()}
                    >
                      Tải tài liệu từ máy
                    </button>
                  </div>
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
        </>
      )}
      {modal === "student" && (
        <Modal
          title="Thêm hồ sơ học sinh"
          wide
          onClose={() => !busy && setModal(null)}
        >
          <form className="form-stack" onSubmit={submitStudent}>
            <label>
              Tên học sinh
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Minh Khôi"
                required
              />
            </label>
            <div className="form-grid-two">
              <label>
                Khối lớp
                <input
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="Ví dụ: Lớp 9"
                  required
                />
              </label>
              <label>
                Môn học
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ví dụ: Toán"
                  required
                />
              </label>
            </div>
            <label>
              Mục tiêu học tập
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ví dụ: Nắm vững phương trình bậc hai và hình học đường tròn"
              />
            </label>
            <div className="form-grid-two">
              <label>
                Điểm mạnh ban đầu (mỗi dòng một mục)
                <textarea
                  value={newStrengths}
                  onChange={(e) => setNewStrengths(e.target.value)}
                  placeholder="Ví dụ: Tính toán cẩn thận"
                />
              </label>
              <label>
                Khoảng trống cần củng cố (mỗi dòng một mục)
                <textarea
                  value={newGaps}
                  onChange={(e) => setNewGaps(e.target.value)}
                  placeholder="Ví dụ: Hay quên điều kiện xác định"
                />
              </label>
            </div>
            <label>
              Ghi chú riêng của giáo viên
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Ghi chú phong cách học hoặc lưu ý sư phạm…"
              />
            </label>
            <button type="submit" className="button primary" disabled={busy}>
              Thêm học sinh
            </button>
          </form>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal
          title="Chỉnh sửa hồ sơ học sinh"
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
                    updateStudent(
                      {
                        name: editName.trim() || student.name,
                        grade: editGrade.trim() || student.grade,
                        subject: editSubject.trim() || student.subject,
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
                      },
                      true,
                    );
                  }}
                >
                  <div className="form-grid-two">
                    <label>
                      Tên học sinh
                      <input
                        aria-label="Tên học sinh"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                    </label>
                    <div className="form-grid-two">
                      <label>
                        Khối lớp
                        <input
                          aria-label="Khối lớp"
                          value={editGrade}
                          onChange={(e) => setEditGrade(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Môn học
                        <input
                          aria-label="Môn học"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          required
                        />
                      </label>
                    </div>
                  </div>
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
                  <button type="submit" className="button primary" disabled={busy}>
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
