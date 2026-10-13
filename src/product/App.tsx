import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import {
  Activity as ActivityIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Copy,
  FilePlus2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  AppData,
  Student,
  Material,
  Session,
  Activity,
  Submission,
  Evidence,
  Claim,
} from "./model";
import {
  uid,
  formatDate,
  formatTime,
  pickMaterials,
  sessionStudentIds,
} from "./model";
import { StoreContext, useStore, useProductData, updateData } from "./store";
import type { Page, Store, Toast } from "./store";
import {
  Avatar,
  Empty,
  Modal,
  PageHeader,
  SectionHead,
  SessionSelect,
  StudentSelect,
  Status,
  fileToData,
  initials,
} from "./ui";
import { AuthScreen, AccountPage } from "./Auth";
import { useTeacherAccount } from "./adapters";
import { TeacherRoom, GuestPortal } from "./Classroom";
import {
  SessionSetup,
  ActivityEditor,
  PlanSuggestions,
  DashboardExtras,
  RelabelSubmission,
} from "./ManagementExtras";
import { SummaryWorkflow } from "./Review";
import { RecordingsPage, useRecordingJobs } from "./Recordings";
import { SourceViewer } from "./SourceViewer";
import { MaterialContent } from "./DocumentStage";
import "./product.css";
import "./refinement.css";
import "./classroom.css";

const validPages: Page[] = [
  "dashboard",
  "students",
  "student",
  "materials",
  "plan",
  "grading",
  "live",
  "summary",
  "recordings",
  "account",
];
const pageNames: Record<Page, string> = {
  dashboard: "Tổng quan",
  students: "Học sinh",
  student: "Hồ sơ học sinh",
  materials: "Kho học liệu",
  plan: "Soạn buổi học",
  grading: "Chấm bài",
  live: "Phòng dạy",
  summary: "Tổng kết & duyệt",
  recordings: "Bản ghi buổi học",
  account: "Tài khoản",
};
const getPage = (): Page => {
  const value = location.hash.replace("#", "") as Page;
  return validPages.includes(value) ? value : "dashboard";
};
const today = () =>
  new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
const navMain: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { page: "students", label: "Học sinh", icon: Users },
  { page: "materials", label: "Kho học liệu", icon: LibraryBig },
  { page: "plan", label: "Soạn buổi học", icon: CalendarDays },
  { page: "grading", label: "Chấm bài", icon: ClipboardCheck },
  { page: "live", label: "Phòng dạy", icon: Video },
  { page: "summary", label: "Tổng kết & duyệt", icon: CheckCircle2 },
  { page: "recordings", label: "Bản ghi buổi học", icon: Video },
  { page: "account", label: "Tài khoản", icon: Settings2 },
];

function Shell({ children }: { children: ReactNode }) {
  const { page, go, data, toast } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pending =
    data.submissions.filter((s) => s.status !== "reviewed").length +
    data.claims.filter((c) => c.status === "pending").length;
  const navigate = (target: Page) => {
    go(target);
    setMobileOpen(false);
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}>
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={23} />
          </div>
          <div>
            <strong>AI Teaching</strong>
            <span>Copilot</span>
          </div>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
          >
            <X size={19} />
          </button>
        </div>
        <div className="sidebar-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          {navMain.map((item) => (
            <button
              key={item.page}
              className={
                "nav-item" +
                (page === item.page ||
                (page === "student" && item.page === "students")
                  ? " active"
                  : "")
              }
              onClick={() => navigate(item.page)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.page === "grading" && pending > 0 && <em>{pending}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Gia sư giữ quyền duyệt</strong>
              <span>Nhận định AI chỉ lưu khi bạn xác nhận.</span>
            </div>
          </div>
          <button
            className="side-help"
            onClick={() =>
              toast(
                "Bản frontend lưu dữ liệu trên trình duyệt này. Kết nối backend sẽ được bổ sung ở giai đoạn phát triển.",
                "info",
              )
            }
          >
            <CircleHelp size={18} /> Giới thiệu bản xem trước
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">Không gian làm việc</span>
            <ChevronRight size={15} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span /> Dữ liệu trong trình duyệt
            </span>
            <button
              className="icon-button notification"
              aria-label="Thông báo"
              onClick={() =>
                toast(
                  pending
                    ? "Bạn có " + pending + " mục cần xem lại."
                    : "Bạn đã xử lý hết các mục cần duyệt.",
                  "info",
                )
              }
            >
              <Bell size={19} />
              {pending > 0 && <i />}
            </button>
            <button
              className="profile-chip"
              onClick={() => go("account")}
              aria-label="Mở tài khoản"
            >
              <span>HN</span>
              <div>
                <strong>Hoàng Nam</strong>
                <small>Gia sư</small>
              </div>
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data, go, setSelectedStudentId, setSelectedSessionId } = useStore();
  const upcoming = [...data.sessions]
    .filter((s) => s.status === "scheduled" || s.status === "live")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const pendingSubmissions = data.submissions.filter(
    (s) => s.status !== "reviewed",
  );
  const pendingClaims = data.claims.filter((c) => c.status === "pending");
  const latest = data.evidence.slice(-3).reverse();
  return (
    <>
      <PageHeader
        eyebrow={today()}
        title="Không gian dạy học của bạn"
        description="Chuẩn bị, đánh giá và theo dõi học sinh trong một luồng làm việc."
        action={
          <button className="button primary" onClick={() => go("plan")}>
            <Plus size={17} /> Soạn buổi học
          </button>
        }
      />
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon indigo">
            <Users size={20} />
          </div>
          <span>Học sinh đang theo dõi</span>
          <strong>
            {data.students.filter((s) => s.status === "active").length}
          </strong>
          <small>Hồ sơ có thể dùng cho buổi tiếp theo</small>
        </div>
        <div className="metric-card">
          <div className="metric-icon blue">
            <CalendarDays size={20} />
          </div>
          <span>Buổi chưa hoàn tất</span>
          <strong>{upcoming.length}</strong>
          <small>
            {upcoming[0]
              ? formatDate(upcoming[0].date) + " · " + upcoming[0].time
              : "Chưa có lịch"}
          </small>
        </div>
        <div className="metric-card">
          <div className="metric-icon amber">
            <ClipboardCheck size={20} />
          </div>
          <span>Bài cần chấm</span>
          <strong>{pendingSubmissions.length}</strong>
          <small>Kiểm tra kết quả trước khi lưu</small>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">
            <CheckCircle2 size={20} />
          </div>
          <span>Nhận định cần duyệt</span>
          <strong>{pendingClaims.length}</strong>
          <small>Chỉ bản đã duyệt vào hồ sơ</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <SectionHead
            title="Lịch dạy cần theo dõi"
            meta="Mở nhanh giáo án hoặc tiếp tục buổi học."
            action={
              <button className="text-button" onClick={() => go("plan")}>
                Xem kế hoạch <ArrowRight size={15} />
              </button>
            }
          />
          {upcoming.length ? (
            <div className="agenda-list">
              {upcoming.map((session) => {
                const student = data.students.find(
                  (s) => s.id === session.studentId,
                );
                if (!student) return null;
                const overdue =
                  session.status === "scheduled" &&
                  new Date(session.date + "T" + session.time) < new Date();
                return (
                  <div className="agenda-item" key={session.id}>
                    <div className="date-tile">
                      <strong>{session.date.slice(-2)}</strong>
                      <span>THÁNG {Number(session.date.slice(5, 7))}</span>
                    </div>
                    <div className="agenda-details">
                      <div className="agenda-title">
                        <strong>{session.title}</strong>
                        <Status
                          tone={
                            session.status === "live"
                              ? "green"
                              : overdue
                                ? "amber"
                                : "blue"
                          }
                        >
                          {session.status === "live"
                            ? "Đang dạy"
                            : overdue
                              ? "Quá lịch"
                              : "Sắp diễn ra"}
                        </Status>
                      </div>
                      <p>
                        {student.name} · {student.grade} · {session.time} ·{" "}
                        {session.duration} phút
                      </p>
                      <small>{session.goal}</small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={"Mở buổi " + session.title}
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setSelectedStudentId(student.id);
                        go(session.status === "live" ? "live" : "plan");
                      }}
                    >
                      <ArrowRight size={19} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              icon={<CalendarDays size={22} />}
              title="Chưa có buổi học"
              description="Tạo kế hoạch đầu tiên để bắt đầu."
              action={
                <button className="button primary" onClick={() => go("plan")}>
                  Soạn buổi học
                </button>
              }
            />
          )}
        </section>
        <div className="dashboard-side">
          <section className="card">
            <SectionHead title="Việc cần xử lý" />
            <div className="task-list">
              <button onClick={() => go("grading")}>
                <span className="task-icon amber">
                  <ClipboardCheck size={17} />
                </span>
                <span>
                  <strong>{pendingSubmissions.length} bài làm cần xem</strong>
                  <small>Chấm và nhận diện lỗi</small>
                </span>
                <ChevronRight size={17} />
              </button>
              <button onClick={() => go("summary")}>
                <span className="task-icon blue">
                  <CheckCircle2 size={17} />
                </span>
                <span>
                  <strong>{pendingClaims.length} nhận định cần duyệt</strong>
                  <small>Hoàn tất tổng kết buổi học</small>
                </span>
                <ChevronRight size={17} />
              </button>
            </div>
          </section>
          <section className="card purple-card">
            <div className="mini-eyebrow">
              <Sparkles size={16} /> GỢI Ý CHO BUỔI TIẾP THEO
            </div>
            <h2>Dạy tiếp từ điều đã biết</h2>
            <p>
              Dùng lỗi và minh chứng đã duyệt để chọn học liệu phù hợp cho từng
              em.
            </p>
            <button className="button light" onClick={() => go("materials")}>
              Xem học liệu <ArrowRight size={16} />
            </button>
          </section>
        </div>
      </div>
      <section className="card">
        <SectionHead
          title="Minh chứng gần đây"
          meta="Các quan sát được gắn với đúng học sinh và buổi học."
          action={
            <button className="text-button" onClick={() => go("students")}>
              Xem hồ sơ <ArrowRight size={15} />
            </button>
          }
        />
        <div className="evidence-list">
          {latest.length ? (
            latest.map((item) => (
              <div className="evidence-row" key={item.id}>
                <span className="evidence-glyph">
                  <FileText size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {data.students.find((s) => s.id === item.studentId)?.name} ·{" "}
                    {item.detail}
                  </p>
                </div>
                <small>{formatTime(item.createdAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">Chưa có minh chứng nào.</p>
          )}
        </div>
      </section>
    </>
  );
}

function StudentsPage() {
  const { data, setData, go, setSelectedStudentId, toast } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tất cả");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    grade: "Lớp 9",
    subject: "Toán",
    goal: "",
  });
  const filtered = data.students.filter(
    (s) =>
      s.status === "active" &&
      (filter === "Tất cả" || s.grade === filter) &&
      (s.name + s.goal + s.subject).toLowerCase().includes(query.toLowerCase()),
  );
  const addStudent = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.goal.trim()) return;
    const student: Student = {
      id: uid("stu"),
      name: form.name.trim(),
      grade: form.grade,
      subject: form.subject,
      goal: form.goal.trim(),
      status: "active",
      strengths: [],
      gaps: [],
      notes: "",
      initials: initials(form.name),
      color: ["violet", "blue", "mint", "peach"][data.students.length % 4],
    };
    setData((prev) => ({ ...prev, students: [...prev.students, student] }));
    setSelectedStudentId(student.id);
    setAddOpen(false);
    setForm({ name: "", grade: "Lớp 9", subject: "Toán", goal: "" });
    toast("Đã thêm hồ sơ học sinh.");
    go("student");
  };
  return (
    <>
      <PageHeader
        title="Học sinh"
        description="Theo dõi mục tiêu, bài làm và kết luận đã duyệt theo từng em."
        action={
          <button className="button primary" onClick={() => setAddOpen(true)}>
            <Plus size={17} /> Thêm học sinh
          </button>
        }
      />
      <div className="card filter-card">
        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên, môn học hoặc mục tiêu..."
            aria-label="Tìm học sinh"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Lọc lớp"
        >
          <option>Tất cả</option>
          <option>Lớp 8</option>
          <option>Lớp 9</option>
        </select>
        <span className="result-count">{filtered.length} học sinh</span>
      </div>
      <div className="student-grid">
        {filtered.map((student) => {
          const sessions = data.sessions.filter((s) =>
            sessionStudentIds(s).includes(student.id),
          );
          const approved = data.claims.filter(
            (c) => c.studentId === student.id && c.status === "approved",
          ).length;
          return (
            <button
              className="student-card"
              key={student.id}
              onClick={() => {
                setSelectedStudentId(student.id);
                go("student");
              }}
            >
              <div className="student-card-top">
                <Avatar student={student} size="lg" />
                <ArrowRight size={19} />
              </div>
              <h2>{student.name}</h2>
              <p>
                {student.grade} · {student.subject}
              </p>
              <div className="student-goal">
                <span>MỤC TIÊU HIỆN TẠI</span>
                <strong>{student.goal}</strong>
              </div>
              <div className="student-card-footer">
                <span>
                  <BookOpen size={15} /> {sessions.length} buổi học
                </span>
                <span>
                  <ShieldCheck size={15} /> {approved} nhận định đã duyệt
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty
          icon={<Users size={24} />}
          title="Không tìm thấy học sinh"
          description="Thử từ khóa khác hoặc thêm một hồ sơ mới."
        />
      )}
      {addOpen && (
        <Modal title="Thêm học sinh" onClose={() => setAddOpen(false)}>
          <form className="form-stack" onSubmit={addStudent}>
            <label>
              Họ và tên
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ví dụ: Nguyễn Bảo Minh"
              />
            </label>
            <div className="form-row">
              <label>
                Lớp
                <select
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                >
                  <option>Lớp 8</option>
                  <option>Lớp 9</option>
                  <option>Lớp 10</option>
                  <option>Lớp 11</option>
                  <option>Lớp 12</option>
                </select>
              </label>
              <label>
                Môn học
                <input
                  value={form.subject}
                  onChange={(e) =>
                    setForm({ ...form, subject: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Mục tiêu học tập
              <textarea
                required
                rows={3}
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                placeholder="Học sinh đang hướng tới điều gì?"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setAddOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary" type="submit">
                Lưu hồ sơ
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function StudentPage() {
  const { data, setData, selectedStudentId, setSelectedSessionId, go, toast } =
    useStore();
  const student =
    data.students.find((s) => s.id === selectedStudentId) || data.students[0];
  const [editOpen, setEditOpen] = useState(false);
  const [source, setSource] = useState("");
  const [goal, setGoal] = useState(student?.goal || "");
  const [notes, setNotes] = useState(student?.notes || "");
  const [gapInput, setGapInput] = useState("");
  const [tab, setTab] = useState<"overview" | "history" | "evidence">(
    "overview",
  );
  useEffect(() => {
    setGoal(student?.goal || "");
    setNotes(student?.notes || "");
  }, [student?.id, student?.goal, student?.notes]);
  if (!student)
    return (
      <Empty
        icon={<Users size={24} />}
        title="Không tìm thấy học sinh"
        description="Quay về danh sách để chọn hồ sơ khác."
        action={
          <button className="button primary" onClick={() => go("students")}>
            Xem học sinh
          </button>
        }
      />
    );
  const sessions = data.sessions
    .filter((s) => sessionStudentIds(s).includes(student.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const evidence = data.evidence
    .filter((e) => e.studentId === student.id)
    .reverse();
  const approved = data.claims.filter(
    (c) => c.studentId === student.id && c.status === "approved",
  );
  const update = (patch: Partial<Student>) =>
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) =>
        s.id === student.id ? { ...s, ...patch } : s,
      ),
    }));
  const addGap = () => {
    if (!gapInput.trim()) return;
    update({ gaps: [...student.gaps, gapInput.trim()] });
    setGapInput("");
    toast("Đã thêm nội dung cần củng cố.");
  };
  return (
    <>
      <button className="back-link" onClick={() => go("students")}>
        <ArrowLeft size={17} /> Danh sách học sinh
      </button>
      <div className="profile-hero card">
        <div className="profile-identity">
          <Avatar student={student} size="lg" />
          <div>
            <div className="eyebrow">HỒ SƠ HỌC SINH</div>
            <h1>{student.name}</h1>
            <p>
              {student.grade} · {student.subject}
            </p>
          </div>
        </div>
        <div className="profile-hero-actions">
          <button className="button ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={16} /> Chỉnh sửa
          </button>
          <button
            className="button primary"
            onClick={() => {
              setSelectedSessionId(sessions[0]?.id || "");
              go("plan");
            }}
          >
            <Plus size={16} /> Soạn buổi học
          </button>
        </div>
        <div className="profile-goal">
          <span>MỤC TIÊU ĐANG THEO ĐUỔI</span>
          <strong>{student.goal}</strong>
        </div>
      </div>
      <div className="profile-metrics">
        <div>
          <span>Buổi học</span>
          <strong>{sessions.length}</strong>
        </div>
        <div>
          <span>Minh chứng</span>
          <strong>{evidence.length}</strong>
        </div>
        <div>
          <span>Nhận định đã duyệt</span>
          <strong>{approved.length}</strong>
        </div>
        <div>
          <span>Buổi tiếp theo</span>
          <strong>
            {formatDate(
              sessions.find(
                (s) =>
                  s.status === "scheduled" &&
                  new Date(s.date + "T" + s.time) >= new Date(),
              )?.date || "",
            )}
          </strong>
        </div>
      </div>
      <div className="tabs">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          Tổng quan
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Lịch sử buổi học
        </button>
        <button
          className={tab === "evidence" ? "active" : ""}
          onClick={() => setTab("evidence")}
        >
          Minh chứng
        </button>
      </div>
      {tab === "overview" && (
        <div className="two-column">
          <section className="card">
            <SectionHead
              title="Bức tranh học tập"
              meta="Những điều gia sư đã quan sát và xác nhận."
            />
            <div className="trait-block">
              <h3 className="trait-good">
                <CheckCircle2 size={17} /> Điểm mạnh
              </h3>
              {student.strengths.length ? (
                student.strengths.map((item, i) => (
                  <div className="trait-item" key={i}>
                    {item}
                    <button
                      aria-label={"Xóa " + item}
                      onClick={() =>
                        update({
                          strengths: student.strengths.filter(
                            (x) => x !== item,
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">Chưa có điểm mạnh được ghi.</p>
              )}
            </div>
            <div className="trait-block">
              <h3 className="trait-attention">
                <ActivityIcon size={17} /> Cần củng cố
              </h3>
              {student.gaps.map((item, i) => (
                <div className="trait-item" key={i}>
                  {item}
                  <button
                    aria-label={"Xóa " + item}
                    onClick={() =>
                      update({ gaps: student.gaps.filter((x) => x !== item) })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="inline-add">
                <input
                  value={gapInput}
                  onChange={(e) => setGapInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addGap();
                  }}
                  placeholder="Thêm nội dung cần củng cố"
                />
                <button onClick={addGap} aria-label="Thêm">
                  <Plus size={17} />
                </button>
              </div>
            </div>
          </section>
          <section className="card">
            <SectionHead
              title="Ghi chú gia sư"
              meta="Riêng tư, không hiển thị cho học sinh."
            />
            <textarea
              className="notes-area"
              rows={8}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi lại cách học, điều cần lưu ý..."
            />
            <button
              className="button secondary"
              onClick={() => {
                update({ notes });
                toast("Đã lưu ghi chú.");
              }}
            >
              <Save size={16} /> Lưu ghi chú
            </button>
            <div className="approved-list">
              <h3>Nhận định đã duyệt</h3>
              {approved.length ? (
                approved.slice(-3).map((c) => (
                  <button
                    className="evidence-link"
                    key={c.id}
                    onClick={() => setSource(c.evidenceIds[0])}
                  >
                    <ShieldCheck size={16} />
                    {c.text}
                  </button>
                ))
              ) : (
                <span className="muted">Chưa có nhận định đã duyệt.</span>
              )}
            </div>
          </section>
        </div>
      )}
      {tab === "history" && (
        <section className="card">
          <SectionHead
            title="Các buổi học"
            meta="Mở kế hoạch hoặc tổng kết của từng buổi."
          />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Buổi học</th>
                  <th>Ngày giờ</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      <small>{s.goal}</small>
                    </td>
                    <td>
                      {formatDate(s.date)} · {s.time}
                    </td>
                    <td>
                      <Status
                        tone={
                          s.status === "reviewed"
                            ? "green"
                            : s.status === "ended"
                              ? "amber"
                              : "blue"
                        }
                      >
                        {
                          (
                            {
                              draft: "Bản nháp",
                              scheduled: "Sắp diễn ra",
                              live: "Đang dạy",
                              ended: "Cần tổng kết",
                              reviewed: "Đã duyệt",
                            } as const
                          )[s.status]
                        }
                      </Status>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedSessionId(s.id);
                          go(
                            s.status === "ended" || s.status === "reviewed"
                              ? "summary"
                              : "plan",
                          );
                        }}
                      >
                        Mở <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "evidence" && (
        <section className="card">
          <SectionHead
            title="Dòng minh chứng"
            meta="Mỗi mục gắn với đúng học sinh và buổi học."
          />
          <div className="evidence-list">
            {evidence.length ? (
              evidence.map((item) => (
                <button
                  className="evidence-row evidence-clickable"
                  key={item.id}
                  onClick={() => setSource(item.id)}
                >
                  <span className="evidence-glyph">
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>
                      {
                        data.sessions.find((s) => s.id === item.sessionId)
                          ?.title
                      }{" "}
                      · {item.kind}
                      {item.support ? " · " + item.support : ""}
                    </small>
                  </div>
                </button>
              ))
            ) : (
              <Empty
                icon={<FileText size={24} />}
                title="Chưa có minh chứng"
                description="Ghi nhận trong phòng dạy hoặc khi chấm bài để xây dựng hồ sơ."
              />
            )}
          </div>
        </section>
      )}
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}
      {editOpen && (
        <Modal title="Chỉnh sửa hồ sơ" onClose={() => setEditOpen(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              update({ goal, notes });
              setEditOpen(false);
              toast("Đã cập nhật hồ sơ.");
            }}
          >
            <label>
              Mục tiêu
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                required
              />
            </label>
            <label>
              Ghi chú nền
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setEditOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary">Lưu thay đổi</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function MaterialsPage() {
  const { data, setData, selectedStudentId, setSelectedStudentId, toast, go } =
    useStore();
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("Tất cả");
  const [addOpen, setAddOpen] = useState(false);
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [form, setForm] = useState({
    title: "",
    subject: "Toán",
    grade: "Lớp 9",
    topic: "",
    level: "Trung bình" as Material["level"],
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const student =
    data.students.find((s) => s.id === selectedStudentId) || data.students[0];
  const recommended = student
    ? pickMaterials(student, data.materials).slice(0, 3)
    : [];
  const filtered = data.materials.filter(
    (m) =>
      (grade === "Tất cả" || m.grade === grade) &&
      (m.title + m.topic + m.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (file && file.size > 1_000_000) {
      toast("Bản frontend chỉ lưu tệp tối đa 1 MB trên trình duyệt.", "error");
      return;
    }
    let fileData: string | undefined;
    try {
      if (file) fileData = await fileToData(file);
    } catch {
      toast("Không đọc được tệp. Vui lòng thử lại.", "error");
      return;
    }
    const kind: Material["kind"] = file
      ? file.type === "application/pdf"
        ? "PDF"
        : "Ảnh"
      : "Bài tập";
    const material: Material = {
      id: uid("mat"),
      title: form.title.trim(),
      subject: form.subject,
      grade: form.grade,
      topic: form.topic.trim() || "Khác",
      level: form.level,
      kind,
      description: form.description.trim(),
      source: file?.name || "Gia sư tạo",
      fileData,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, materials: [material, ...prev.materials] }));
    setAddOpen(false);
    setFile(null);
    setForm({
      title: "",
      subject: "Toán",
      grade: "Lớp 9",
      topic: "",
      level: "Trung bình",
      description: "",
    });
    toast("Đã thêm học liệu vào kho.");
  };
  const open = (material: Material) => setPreviewMaterial(material);
  return (
    <>
      <PageHeader
        title="Kho học liệu"
        description="Lưu tài liệu có nguồn và chọn bài phù hợp với từng học sinh."
        action={
          <button className="button primary" onClick={() => setAddOpen(true)}>
            <Upload size={17} /> Thêm học liệu
          </button>
        }
      />
      <section className="card recommendation-panel">
        <div className="recommendation-intro">
          <div className="eyebrow">
            <Sparkles size={15} /> GỢI Ý THEO NGỮ CẢNH
          </div>
          <h2>Chọn bài phù hợp cho học sinh</h2>
          <p>
            Danh sách dựa trên lớp, môn và nội dung cần củng cố trong hồ sơ.
          </p>
          <StudentSelect
            value={student?.id || ""}
            onChange={(id) => {
              setSelectedStudentId(id);
              const element = data.students.find((s) => s.id === id);
              if (element) toast("Đang xem gợi ý cho " + element.name, "info");
            }}
          />
        </div>
        <div className="recommendation-list">
          {recommended.map(({ material, score }) => (
            <div className="recommendation-item" key={material.id}>
              <span className="file-icon">
                <BookOpen size={20} />
              </span>
              <div>
                <strong>{material.title}</strong>
                <small>
                  {material.grade} · {material.topic} · {material.level}
                </small>
                <p>
                  {score >= 5
                    ? "Phù hợp với lớp và nội dung cần củng cố."
                    : "Phù hợp với chương trình học."}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => open(material)}
                aria-label={"Xem " + material.title}
              >
                <ArrowRight size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <SectionHead
          title="Tất cả học liệu"
          meta={filtered.length + " tài liệu trong kho"}
          action={
            <div className="toolbar">
              <div className="search-box compact">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm học liệu..."
                  aria-label="Tìm học liệu"
                />
              </div>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                aria-label="Lọc lớp"
              >
                <option>Tất cả</option>
                <option>Lớp 8</option>
                <option>Lớp 9</option>
                <option>Lớp 10</option>
                <option>Lớp 11</option>
                <option>Lớp 12</option>
              </select>
            </div>
          }
        />
        <div className="materials-grid">
          {filtered.map((material) => (
            <article className="material-card" key={material.id}>
              <div className="material-card-head">
                <span
                  className={
                    "material-icon " +
                    (material.kind === "PDF"
                      ? "red"
                      : material.kind === "Ảnh"
                        ? "blue"
                        : "indigo")
                  }
                >
                  <FileText size={22} />
                </span>
                <Status
                  tone={material.level === "Nâng cao" ? "violet" : "blue"}
                >
                  {material.level}
                </Status>
              </div>
              <h3>{material.title}</h3>
              <p>
                {material.description || "Học liệu do gia sư thêm vào kho."}
              </p>
              <div className="tag-row">
                <span>{material.grade}</span>
                <span>{material.topic}</span>
                <span>{material.kind}</span>
              </div>
              <div className="material-footer">
                <small>{material.source}</small>
                <button className="text-button" onClick={() => open(material)}>
                  Xem tài liệu <ArrowRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <Empty
            icon={<LibraryBig size={23} />}
            title="Không tìm thấy học liệu"
            description="Thử bộ lọc khác hoặc thêm tài liệu mới."
          />
        )}
      </section>
      <div className="hint-strip">
        <ShieldCheck size={18} />
        <span>
          Gợi ý học liệu hiện là sắp xếp theo quy tắc trong frontend. Khi tích
          hợp AI, gia sư vẫn kiểm tra nguồn và chọn trước khi đưa vào giáo án.
        </span>
        <button onClick={() => go("plan")}>
          Mở giáo án <ArrowRight size={15} />
        </button>
      </div>
      {previewMaterial && (
        <Modal
          title={previewMaterial.title}
          onClose={() => setPreviewMaterial(null)}
          wide
        >
          <MaterialContent material={previewMaterial} />
        </Modal>
      )}
      {addOpen && (
        <Modal title="Thêm học liệu" onClose={() => setAddOpen(false)}>
          <form className="form-stack" onSubmit={save}>
            <label>
              Tên tài liệu
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Ví dụ: Bài tập hệ thức Viète"
              />
            </label>
            <div className="form-row">
              <label>
                Lớp
                <select
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                >
                  {["Lớp 8", "Lớp 9", "Lớp 10", "Lớp 11", "Lớp 12"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Mức độ
                <select
                  value={form.level}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      level: e.target.value as Material["level"],
                    })
                  }
                >
                  <option>Cơ bản</option>
                  <option>Trung bình</option>
                  <option>Nâng cao</option>
                </select>
              </label>
            </div>
            <label>
              Chủ đề
              <input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="Ví dụ: Phương trình bậc hai"
              />
            </label>
            <label>
              Mô tả
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Tệp PDF hoặc ảnh (tối đa 1 MB trên bản frontend)
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setAddOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary" type="submit">
                Lưu học liệu
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function PlanPage() {
  const {
    data,
    setData,
    selectedSessionId,
    setSelectedSessionId,
    selectedStudentId,
    setSelectedStudentId,
    go,
    toast,
  } = useStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    studentId: selectedStudentId,
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "19:30",
    duration: 60,
  });
  const [newActivity, setNewActivity] = useState({
    title: "",
    duration: 15,
    description: "",
    type: "Luyện tập" as Activity["type"],
    materialId: "",
  });
  const session =
    data.sessions.find((s) => s.id === selectedSessionId) ||
    data.sessions.find((s) => s.studentId === selectedStudentId) ||
    data.sessions[0];
  const student = data.students.find((s) => s.id === session?.studentId);
  const recommendations = student
    ? pickMaterials(student, data.materials).slice(0, 3)
    : [];
  const updateSession = (patch: Partial<Session>) => {
    if (!session) return;
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id ? { ...s, ...patch } : s,
      ),
    }));
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!newSession.title.trim()) return;
    const entry: Session = {
      id: uid("ses"),
      studentId: newSession.studentId,
      title: newSession.title.trim(),
      goal: "",
      date: newSession.date,
      time: newSession.time,
      duration: Number(newSession.duration) || 60,
      meetingUrl: "",
      status: "draft",
      activities: [],
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, sessions: [entry, ...prev.sessions] }));
    setSelectedSessionId(entry.id);
    setSelectedStudentId(entry.studentId);
    setCreateOpen(false);
    toast("Đã tạo bản nháp buổi học.");
  };
  const addActivity = (event: FormEvent) => {
    event.preventDefault();
    if (!session || !newActivity.title.trim()) return;
    const entry: Activity = {
      id: uid("act"),
      title: newActivity.title.trim(),
      duration: Math.max(1, Number(newActivity.duration) || 15),
      description: newActivity.description.trim(),
      type: newActivity.type,
      materialId: newActivity.materialId || undefined,
    };
    updateSession({ activities: [...session.activities, entry] });
    setActivityOpen(false);
    setNewActivity({
      title: "",
      duration: 15,
      description: "",
      type: "Luyện tập",
      materialId: "",
    });
    toast("Đã thêm hoạt động.");
  };
  const move = (index: number, direction: number) => {
    if (!session) return;
    const next = [...session.activities];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateSession({ activities: next });
  };
  const attach = (material: Material) => {
    if (!session) return;
    if (!session.activities.length) {
      toast("Hãy thêm hoạt động trước khi gắn học liệu.", "info");
      return;
    }
    const index = session.activities.findIndex((a) => !a.materialId);
    const target = index >= 0 ? index : 0;
    updateSession({
      activities: session.activities.map((a, i) =>
        i === target ? { ...a, materialId: material.id } : a,
      ),
    });
    toast("Đã gắn học liệu vào hoạt động " + (target + 1) + ".");
  };
  if (!session)
    return (
      <Empty
        icon={<CalendarDays size={24} />}
        title="Chưa có buổi học"
        description="Tạo hồ sơ học sinh và kế hoạch để bắt đầu."
        action={
          <button
            className="button primary"
            onClick={() => {
              if (!data.students.length) {
                go("students");
                return;
              }
              const entry: Session = {
                id: uid("ses"),
                studentId: data.students[0].id,
                title: "Buổi học mới",
                goal: "",
                date: new Date().toISOString().slice(0, 10),
                time: "19:30",
                duration: 60,
                meetingUrl: "",
                status: "draft",
                activities: [],
                createdAt: new Date().toISOString(),
              };
              setData((prev) => ({
                ...prev,
                sessions: [entry, ...prev.sessions],
              }));
              setSelectedSessionId(entry.id);
            }}
          >
            {" "}
            {data.students.length ? "Tạo buổi học" : "Thêm học sinh"}{" "}
          </button>
        }
      />
    );
  const total = session.activities.reduce((sum, a) => sum + a.duration, 0);
  return (
    <>
      <PageHeader
        title="Soạn buổi học"
        description="Lập kế hoạch từ bối cảnh đã duyệt và học liệu phù hợp."
        action={
          <>
            <button
              className="button ghost"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={16} /> Buổi mới
            </button>
            <button
              className="button primary"
              onClick={() => {
                go("live");
              }}
              disabled={!session.activities.length}
            >
              <Play size={16} /> Bắt đầu dạy
            </button>
          </>
        }
      />
      <SessionSetup session={session} />
      <PlanSuggestions session={session} />
      <div className="plan-layout">
        <div className="plan-main">
          <section className="card">
            <div className="plan-topline">
              <Status
                tone={
                  session.status === "live"
                    ? "green"
                    : session.status === "draft"
                      ? "amber"
                      : "blue"
                }
              >
                {session.status === "live"
                  ? "Đang dạy"
                  : session.status === "draft"
                    ? "Bản nháp"
                    : session.status === "scheduled"
                      ? "Sắp diễn ra"
                      : "Đã kết thúc"}
              </Status>
              <span>
                <Clock3 size={15} /> {total}/{session.duration} phút
              </span>
            </div>
            <div className="form-row">
              <label>
                Chọn buổi học
                <SessionSelect
                  value={session.id}
                  onChange={(id) => {
                    setSelectedSessionId(id);
                    const target = data.sessions.find((s) => s.id === id);
                    if (target) setSelectedStudentId(target.studentId);
                  }}
                />
              </label>
              <label>
                Hình thức
                <input
                  readOnly
                  value={
                    sessionStudentIds(session).length > 1
                      ? (session.groupName || "Buổi nhóm") +
                        " · " +
                        sessionStudentIds(session).length +
                        " học sinh"
                      : "Buổi 1–1 · " + (student?.name || "")
                  }
                />
              </label>
            </div>
            <label>
              Tiêu đề buổi học
              <input
                value={session.title}
                onChange={(e) => updateSession({ title: e.target.value })}
              />
            </label>
            <label>
              Mục tiêu trọng tâm
              <textarea
                rows={2}
                value={session.goal}
                onChange={(e) => updateSession({ goal: e.target.value })}
                placeholder="Buổi học này cần đạt điều gì?"
              />
            </label>
            <div className="form-row triple">
              <label>
                Ngày
                <input
                  type="date"
                  value={session.date}
                  onChange={(e) => updateSession({ date: e.target.value })}
                />
              </label>
              <label>
                Giờ bắt đầu
                <input
                  type="time"
                  value={session.time}
                  onChange={(e) => updateSession({ time: e.target.value })}
                />
              </label>
              <label>
                Thời lượng (phút)
                <input
                  type="number"
                  min="15"
                  max="240"
                  value={session.duration}
                  onChange={(e) =>
                    updateSession({ duration: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="room-banner">
              <Video size={18} />
              Phòng gọi tích hợp · học sinh vào bằng liên kết riêng phía trên.
            </div>
            <p className="autosave">
              <Check size={15} /> Thay đổi được lưu trong trình duyệt
            </p>
          </section>
          <section className="card">
            <SectionHead
              title="Kịch bản hoạt động"
              meta={
                session.activities.length + " hoạt động · " + total + " phút"
              }
              action={
                <button
                  className="button secondary small"
                  onClick={() => setActivityOpen(true)}
                >
                  <Plus size={16} /> Thêm hoạt động
                </button>
              }
            />
            <div className="activity-list">
              {session.activities.map((activity, index) => (
                <div className="activity-card" key={activity.id}>
                  <div className="activity-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="activity-content">
                    <div className="activity-meta">
                      <Status
                        tone={
                          activity.type === "Kiểm tra"
                            ? "amber"
                            : activity.type === "Luyện tập"
                              ? "violet"
                              : "blue"
                        }
                      >
                        {activity.type}
                      </Status>
                      <span>
                        <Clock3 size={13} /> {activity.duration} phút
                      </span>
                    </div>
                    <h3>{activity.title}</h3>
                    <p>{activity.description || "Chưa có mô tả."}</p>
                    {activity.materialId && (
                      <div className="attached-material">
                        <BookOpen size={15} />
                        {data.materials.find(
                          (m) => m.id === activity.materialId,
                        )?.title || "Học liệu đã xóa"}
                      </div>
                    )}
                  </div>
                  <div className="activity-actions">
                    <ActivityEditor session={session} activity={activity} />
                    <button
                      className="icon-button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Chuyển lên"
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => move(index, 1)}
                      disabled={index === session.activities.length - 1}
                      aria-label="Chuyển xuống"
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() =>
                        updateSession({
                          activities: session.activities.filter(
                            (a) => a.id !== activity.id,
                          ),
                        })
                      }
                      aria-label="Xóa hoạt động"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!session.activities.length && (
              <Empty
                icon={<CalendarDays size={24} />}
                title="Chưa có hoạt động"
                description="Thêm một hoạt động để xây dựng kịch bản."
                action={
                  <button
                    className="button primary"
                    onClick={() => setActivityOpen(true)}
                  >
                    Thêm hoạt động
                  </button>
                }
              />
            )}
          </section>
        </div>
        <aside className="plan-side">
          <section className="card context-card">
            <div className="section-icon">
              <GraduationCap size={18} />
            </div>
            <h2>Bối cảnh học sinh</h2>
            {student ? (
              <>
                <div className="context-student">
                  <Avatar student={student} />
                  <div>
                    <strong>{student.name}</strong>
                    <small>
                      {student.grade} · {student.subject}
                    </small>
                  </div>
                </div>
                <div className="context-label">CẦN CỦNG CỐ</div>
                {student.gaps.map((gap, i) => (
                  <p className="context-gap" key={i}>
                    {gap}
                  </p>
                ))}
                <button className="text-button" onClick={() => go("student")}>
                  Xem hồ sơ <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <p>Chọn học sinh cho buổi học.</p>
            )}
          </section>
          <section className="card">
            <SectionHead
              title="Học liệu phù hợp"
              meta="Gợi ý dựa trên hồ sơ và chủ đề."
            />
            <div className="suggested-list">
              {recommendations.map(({ material }) => (
                <div className="suggested-item" key={material.id}>
                  <span className="file-icon">
                    <FileText size={17} />
                  </span>
                  <div>
                    <strong>{material.title}</strong>
                    <small>
                      {material.grade} · {material.level}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => attach(material)}
                    aria-label={"Gắn " + material.title}
                  >
                    <Plus size={17} />
                  </button>
                </div>
              ))}
            </div>
            <button className="text-button" onClick={() => go("materials")}>
              Mở kho học liệu <ArrowRight size={15} />
            </button>
          </section>
          <div className="hint-card">
            <Sparkles size={18} />
            <strong>Gia sư quyết định</strong>
            <p>
              Học liệu gợi ý không tự thêm vào giáo án. Hãy kiểm tra trước khi
              dùng.
            </p>
          </div>
        </aside>
      </div>
      {createOpen && (
        <Modal title="Tạo buổi học mới" onClose={() => setCreateOpen(false)}>
          <form className="form-stack" onSubmit={create}>
            <label>
              Học sinh
              <StudentSelect
                value={newSession.studentId}
                onChange={(id) =>
                  setNewSession({ ...newSession, studentId: id })
                }
              />
            </label>
            <label>
              Tên buổi học
              <input
                required
                value={newSession.title}
                onChange={(e) =>
                  setNewSession({ ...newSession, title: e.target.value })
                }
                placeholder="Ví dụ: Luyện phương trình bậc hai"
              />
            </label>
            <div className="form-row">
              <label>
                Ngày
                <input
                  type="date"
                  value={newSession.date}
                  onChange={(e) =>
                    setNewSession({ ...newSession, date: e.target.value })
                  }
                />
              </label>
              <label>
                Giờ
                <input
                  type="time"
                  value={newSession.time}
                  onChange={(e) =>
                    setNewSession({ ...newSession, time: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Thời lượng (phút)
              <input
                type="number"
                min="15"
                max="240"
                value={newSession.duration}
                onChange={(e) =>
                  setNewSession({
                    ...newSession,
                    duration: Number(e.target.value),
                  })
                }
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setCreateOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary">Tạo buổi học</button>
            </div>
          </form>
        </Modal>
      )}
      {activityOpen && (
        <Modal title="Thêm hoạt động" onClose={() => setActivityOpen(false)}>
          <form className="form-stack" onSubmit={addActivity}>
            <label>
              Tên hoạt động
              <input
                required
                value={newActivity.title}
                onChange={(e) =>
                  setNewActivity({ ...newActivity, title: e.target.value })
                }
                placeholder="Ví dụ: Luyện tập có hướng dẫn"
              />
            </label>
            <div className="form-row">
              <label>
                Loại hoạt động
                <select
                  value={newActivity.type}
                  onChange={(e) =>
                    setNewActivity({
                      ...newActivity,
                      type: e.target.value as Activity["type"],
                    })
                  }
                >
                  <option>Khởi động</option>
                  <option>Lý thuyết</option>
                  <option>Luyện tập</option>
                  <option>Kiểm tra</option>
                </select>
              </label>
              <label>
                Thời lượng
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={newActivity.duration}
                  onChange={(e) =>
                    setNewActivity({
                      ...newActivity,
                      duration: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Mô tả
              <textarea
                rows={3}
                value={newActivity.description}
                onChange={(e) =>
                  setNewActivity({
                    ...newActivity,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Học liệu
              <select
                value={newActivity.materialId}
                onChange={(e) =>
                  setNewActivity({ ...newActivity, materialId: e.target.value })
                }
              >
                <option value="">Chưa gắn học liệu</option>
                {data.materials.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setActivityOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary">Thêm hoạt động</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function GradingPage() {
  const { data, setData, selectedStudentId, toast } = useStore();
  const [activeId, setActiveId] = useState(data.submissions[0]?.id || "");
  const [addOpen, setAddOpen] = useState(false);
  const [studentFilter, setStudentFilter] = useState("Tất cả");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState("");
  const [newItem, setNewItem] = useState({
    studentId: selectedStudentId,
    sessionId: "",
    title: "",
    answer: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const list = data.submissions
    .filter((s) => studentFilter === "Tất cả" || s.studentId === studentFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = list.find((s) => s.id === activeId) || list[0];
  const student = data.students.find((s) => s.id === active?.studentId);
  useEffect(() => {
    setFeedback(active?.finalFeedback || active?.suggestedFeedback || "");
    setScore(active?.score || "");
  }, [
    active?.id,
    active?.finalFeedback,
    active?.suggestedFeedback,
    active?.score,
  ]);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const target =
      data.sessions.find((s) => s.id === newItem.sessionId) ||
      data.sessions.find((s) => s.studentId === newItem.studentId);
    if (!target || !newItem.title.trim()) {
      toast("Hãy chọn buổi học và tên bài.", "error");
      return;
    }
    if (file && file.size > 1_000_000) {
      toast("Bản frontend chỉ lưu ảnh tối đa 1 MB.", "error");
      return;
    }
    let fileData: string | undefined;
    try {
      if (file) fileData = await fileToData(file);
    } catch {
      toast("Không đọc được tệp.", "error");
      return;
    }
    const submission: Submission = {
      id: uid("sub"),
      studentId: newItem.studentId,
      sessionId: target.id,
      activityId: target.activities[0]?.id,
      title: newItem.title.trim(),
      answer: newItem.answer.trim(),
      fileName: file?.name,
      fileData,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      submissions: [submission, ...prev.submissions],
    }));
    setActiveId(submission.id);
    setAddOpen(false);
    setFile(null);
    setNewItem({
      studentId: selectedStudentId,
      sessionId: "",
      title: "",
      answer: "",
    });
    toast("Đã thêm bài làm.");
  };
  const suggest = () => {
    if (!active || !student) return;
    const gap = student.gaps[0] || "bước lập luận";
    const text =
      "Gợi ý xem lại " +
      gap.toLowerCase() +
      ". Đối chiếu từng bước với đề và yêu cầu học sinh giải thích lại cách làm trước khi kết luận.";
    setFeedback(text);
    setData((prev) => ({
      ...prev,
      submissions: prev.submissions.map((s) =>
        s.id === active.id
          ? { ...s, status: "draft", suggestedFeedback: text }
          : s,
      ),
    }));
    toast("Đã tạo nhận xét mẫu để gia sư kiểm tra.", "info");
  };
  const approve = () => {
    if (!active || !feedback.trim()) {
      toast("Hãy nhập nhận xét trước khi duyệt.", "error");
      return;
    }
    const evidence: Evidence = {
      id: uid("ev"),
      studentId: active.studentId,
      sessionId: active.sessionId,
      activityId: active.activityId,
      kind: "Bài làm",
      title: active.title,
      detail: feedback.trim(),
      submissionId: active.id,
      createdAt: new Date().toISOString(),
    };
    const claim: Claim = {
      id: uid("claim"),
      studentId: active.studentId,
      sessionId: active.sessionId,
      text: feedback.trim(),
      evidenceIds: [evidence.id],
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      submissions: prev.submissions.map((s) =>
        s.id === active.id
          ? {
              ...s,
              status: "reviewed",
              finalFeedback: feedback.trim(),
              score: score.trim() || undefined,
            }
          : s,
      ),
      evidence: [...prev.evidence, evidence],
      claims: [...prev.claims, claim],
    }));
    toast("Đã duyệt chấm bài. Nhận định vẫn chờ duyệt trước khi vào hồ sơ.");
  };
  return (
    <>
      <PageHeader
        title="Chấm bài & nhận diện lỗi"
        description="Xem bài gốc, sửa gợi ý và xác nhận kết quả trước khi lưu."
        action={
          <button className="button primary" onClick={() => setAddOpen(true)}>
            <Plus size={17} /> Thêm bài làm
          </button>
        }
      />
      <div className="grading-layout">
        <section className="card inbox-card">
          <SectionHead
            title="Hộp bài làm"
            meta={
              data.submissions.filter((s) => s.status !== "reviewed").length +
              " bài cần xem"
            }
          />
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            aria-label="Lọc học sinh"
          >
            <option>Tất cả</option>
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="submission-list">
            {list.map((item) => (
              <button
                key={item.id}
                className={
                  "submission-item" + (active?.id === item.id ? " active" : "")
                }
                onClick={() => setActiveId(item.id)}
              >
                <span className="submission-symbol">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {data.students.find((s) => s.id === item.studentId)?.name}
                  </small>
                  <em>{formatTime(item.createdAt)}</em>
                </span>
                <Status
                  tone={
                    item.status === "reviewed"
                      ? "green"
                      : item.status === "draft"
                        ? "violet"
                        : "amber"
                  }
                >
                  {item.status === "reviewed"
                    ? "Đã chấm"
                    : item.status === "draft"
                      ? "Bản nháp"
                      : "Mới"}
                </Status>
              </button>
            ))}
          </div>
          {!list.length && (
            <Empty
              icon={<ClipboardCheck size={22} />}
              title="Chưa có bài làm"
              description="Thêm bài hoặc thay đổi bộ lọc."
            />
          )}
        </section>
        {active ? (
          <div className="grading-main">
            <section className="card">
              <div className="grading-heading">
                <div>
                  <div className="eyebrow">BÀI LÀM GỐC</div>
                  <h2>{active.title}</h2>
                  <p>
                    {student?.name} ·{" "}
                    {
                      data.sessions.find((s) => s.id === active.sessionId)
                        ?.title
                    }
                  </p>
                </div>
                <div className="row-actions">
                  <RelabelSubmission submission={active} />
                  <Status
                    tone={active.status === "reviewed" ? "green" : "amber"}
                  >
                    {active.status === "reviewed" ? "Đã duyệt" : "Cần xem"}
                  </Status>
                </div>
              </div>
              <div className="answer-sheet">
                <div className="answer-sheet-head">
                  <FileText size={17} /> Nội dung học sinh nộp
                </div>
                {active.answer ? (
                  <p>{active.answer}</p>
                ) : (
                  <p className="muted">Học sinh chỉ gửi tệp ảnh.</p>
                )}
                {active.fileData && (
                  <div className="submission-preview">
                    {active.fileData.startsWith("data:image/") ? (
                      <img
                        src={active.fileData}
                        alt={"Bài làm " + active.title}
                      />
                    ) : (
                      <a
                        className="text-button"
                        href={active.fileData}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={16} /> Mở tệp PDF
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
            <section className="card">
              <div className="grading-heading">
                <div>
                  <div className="eyebrow">
                    <Sparkles size={14} /> HỖ TRỢ ĐÁNH GIÁ
                  </div>
                  <h2>Nhận xét và duyệt</h2>
                  <p>
                    Gợi ý mẫu không tự chấm đúng sai. Gia sư kiểm tra bài gốc
                    trước khi xác nhận.
                  </p>
                </div>
                <button
                  className="button secondary small"
                  onClick={suggest}
                  disabled={active.status === "reviewed"}
                >
                  <WandSparkles size={16} /> Tạo gợi ý
                </button>
              </div>
              <div className="grading-warning">
                <ShieldCheck size={17} /> Không có kết quả nào tự cập nhật hồ sơ
                học sinh.
              </div>
              <label>
                Nhận xét của gia sư
                <textarea
                  rows={5}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ghi rõ bước đúng, lỗi cần kiểm tra và hướng sửa..."
                  disabled={active.status === "reviewed"}
                />
              </label>
              <div className="grading-footer">
                <label>
                  Điểm (nếu cần)
                  <input
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="Ví dụ: 8/10"
                    disabled={active.status === "reviewed"}
                  />
                </label>
                <button
                  className="button primary"
                  onClick={approve}
                  disabled={active.status === "reviewed"}
                >
                  <Check size={17} /> Duyệt kết quả
                </button>
              </div>
              {active.status === "reviewed" && (
                <div className="approved-note">
                  <CheckCircle2 size={18} /> Kết quả đã được gia sư duyệt. Nhận
                  định liên quan đang chờ duyệt ở phần Tổng kết.
                </div>
              )}
            </section>
          </div>
        ) : (
          <Empty
            icon={<ClipboardCheck size={24} />}
            title="Chọn một bài làm"
            description="Bài nộp sẽ xuất hiện ở đây để gia sư xem và duyệt."
          />
        )}
      </div>
      {addOpen && (
        <Modal title="Thêm bài làm" onClose={() => setAddOpen(false)}>
          <form className="form-stack" onSubmit={add}>
            <label>
              Học sinh
              <StudentSelect
                value={newItem.studentId}
                onChange={(id) =>
                  setNewItem({ ...newItem, studentId: id, sessionId: "" })
                }
              />
            </label>
            <label>
              Buổi học
              <select
                value={newItem.sessionId}
                onChange={(e) =>
                  setNewItem({ ...newItem, sessionId: e.target.value })
                }
              >
                <option value="">Chọn buổi học</option>
                {data.sessions
                  .filter((s) =>
                    sessionStudentIds(s).includes(newItem.studentId),
                  )
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.title} · {formatDate(s.date)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tên bài
              <input
                required
                value={newItem.title}
                onChange={(e) =>
                  setNewItem({ ...newItem, title: e.target.value })
                }
                placeholder="Ví dụ: Bài 3 trang 24"
              />
            </label>
            <label>
              Nội dung bài làm
              <textarea
                rows={4}
                value={newItem.answer}
                onChange={(e) =>
                  setNewItem({ ...newItem, answer: e.target.value })
                }
                placeholder="Nhập câu trả lời hoặc mô tả bài làm..."
              />
            </label>
            <label>
              Ảnh/PDF bài làm (tối đa 1 MB)
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setAddOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary">Lưu bài làm</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export default function ProductApp() {
  const data = useProductData();
  const setData = updateData;
  const account = useTeacherAccount();
  const [page, setPage] = useState<Page>(getPage);
  const [selectedStudentId, setSelectedStudentId] = useState(
    sessionStorage.getItem("copilot-selected-student") ||
      data.students[0]?.id ||
      "",
  );
  const [selectedSessionId, setSelectedSessionId] = useState(
    sessionStorage.getItem("copilot-selected-session") ||
      data.sessions[0]?.id ||
      "",
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (text: string, kind: Toast["kind"] = "success") => {
    const id = uid("toast");
    setToasts((prev) => [...prev, { id, text, kind }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((item) => item.id !== id)),
      4200,
    );
  };
  const go = (target: Page) => {
    setPage(target);
    location.hash = target;
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  useEffect(() => {
    const handler = () => setPage(getPage());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("copilot-selected-student", selectedStudentId);
    sessionStorage.setItem("copilot-selected-session", selectedSessionId);
  }, [selectedStudentId, selectedSessionId]);
  useEffect(() => {
    const error = () =>
      toast(
        "Bộ nhớ đầy hoặc bị khóa. Thay đổi chưa được lưu; hãy dùng tệp nhỏ hơn.",
        "error",
      );
    window.addEventListener("copilot-storage-error", error);
    return () => window.removeEventListener("copilot-storage-error", error);
  }, []);
  const store = useMemo<Store>(
    () => ({
      data,
      setData,
      page,
      go,
      selectedStudentId,
      setSelectedStudentId,
      selectedSessionId,
      setSelectedSessionId,
      toast,
    }),
    [data, page, selectedStudentId, selectedSessionId],
  );
  const query = new URLSearchParams(location.search);
  const studentView = query.has("invite") || query.get("view") === "student";
  return (
    <StoreContext.Provider value={store}>
      <ProductJobs />
      {studentView ? (
        <GuestPortal />
      ) : !account ? (
        <AuthScreen />
      ) : page === "live" ? (
        <TeacherRoom />
      ) : (
        <Shell>
          {page === "dashboard" ? (
            <>
              <Dashboard />
              <DashboardExtras />
            </>
          ) : page === "students" ? (
            <StudentsPage />
          ) : page === "student" ? (
            <StudentPage />
          ) : page === "materials" ? (
            <MaterialsPage />
          ) : page === "plan" ? (
            <PlanPage />
          ) : page === "grading" ? (
            <GradingPage />
          ) : page === "recordings" ? (
            <RecordingsPage />
          ) : page === "account" ? (
            <AccountPage />
          ) : (
            <SummaryWorkflow />
          )}
        </Shell>
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div className={"toast toast-" + item.kind} key={item.id}>
            <span>
              {item.kind === "error" ? (
                <X size={16} />
              ) : item.kind === "info" ? (
                <Sparkles size={16} />
              ) : (
                <Check size={16} />
              )}
            </span>
            {item.text}
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.id !== item.id))
              }
              aria-label="Đóng thông báo"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

function ProductJobs() {
  useRecordingJobs();
  return null;
}
