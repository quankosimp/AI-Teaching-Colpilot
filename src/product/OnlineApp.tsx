import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AsyncPanel,
  FormFeedback,
  AISuggestionReview,
  type AsyncState,
  type Feedback,
} from "./presentation";
import { api, ApiError, googleCallback, signIn, signOut } from "./onlineApi";
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
type Page = "students" | "materials" | "plans";
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
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [state, setState] = useState<AsyncState>("loading");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("students");
  const [students, setStudents] = useState<Student[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSession, setSelectedSession] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [materialGrade, setMaterialGrade] = useState("Lớp 9");
  const [materialSubject, setMaterialSubject] = useState("Toán");
  const [materialTopic, setMaterialTopic] = useState("");
  const [materialLevel, setMaterialLevel] = useState("TrungBinh");
  const [materialDescription, setMaterialDescription] = useState("");
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(
    null,
  );
  const [suggestion, setSuggestion] = useState<{
    id: string;
    text: string;
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
  const [history, setHistory] = useState<{ id: string; text: string }[]>([]);
  const [theme, setTheme] = useState(false);
  const reload = useCallback(async () => {
    setState("loading");
    setFeedback(null);
    try {
      const [who, pupils, library, plans] = await Promise.all([
        api<{ teacher: Teacher }>("/auth/me"),
        api<{ students: Student[] }>("/students"),
        api<{ materials: Material[] }>("/materials"),
        api<{ sessions: Session[] }>("/sessions"),
      ]);
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
      if (e instanceof ApiError && e.status === 401) {
        setTeacher(null);
        setState("ready");
      } else {
        setFeedback(message(e));
        setState("error");
      }
    }
  }, []);
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
    });
  };
  const student = students.find((s) => s.id === selectedStudent);
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
    api<{ claims: { id: string; text: string }[] }>(
      `/students/${selectedStudent}/history`,
    )
      .then((r) => {
        if (active) setHistory(r.claims);
      })
      .catch((e) => {
        if (active) setFeedback(message(e));
      });
    return () => {
      active = false;
    };
  }, [selectedStudent]);
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
      await reload();
    });
  };
  const createSession = (e: FormEvent) => {
    e.preventDefault();
    if (!student) return;
    void run(async () => {
      await api("/sessions", {
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
      await reload();
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
          description: "",
          duration: 15,
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
      await reload();
    });
  };
  return (
    <main className="main-content" data-theme={theme ? "dark" : "light"}>
      <header className="page-header">
        <div>
          <h1>AI Teaching Copilot</h1>
          <p>Không gian dạy học trực tuyến</p>
        </div>
        <div className="row-actions">
          <button
            className="button ghost"
            onClick={() => {
              setTheme(!theme);
              document.body.classList.toggle("dark", !theme);
            }}
          >
            Đổi giao diện
          </button>
          {teacher && (
            <button
              className="button ghost"
              onClick={() =>
                void run(async () => {
                  await signOut();
                  setTeacher(null);
                })
              }
            >
              Đăng xuất
            </button>
          )}
        </div>
      </header>
      <FormFeedback saving={busy} error={feedback} />
      {state === "loading" ? (
        <AsyncPanel state="loading" />
      ) : state === "error" ? (
        <AsyncPanel
          state="error"
          onRetry={() => {
            void reload();
          }}
        />
      ) : !teacher ? (
        <section className="card">
          <h2>Đăng nhập giáo viên</h2>
          <p>
            Đăng nhập Google hoặc dùng tài khoản demo khi máy chủ bật chế độ cục
            bộ.
          </p>
          <div className="row-actions">
            <button
              className="button primary"
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
              Tiếp tục với Google
            </button>
            <button
              className="button ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await signIn("teacher-a");
                  await reload();
                })
              }
            >
              Demo Hoàng Nam
            </button>
            <button
              className="button ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await signIn("teacher-b");
                  await reload();
                })
              }
            >
              Demo Mai An
            </button>
          </div>
        </section>
      ) : (
        <>
          <nav className="room-tabs">
            <button onClick={() => setPage("students")}>Học sinh</button>
            <button onClick={() => setPage("materials")}>Học liệu</button>
            <button onClick={() => setPage("plans")}>Soạn buổi học</button>
          </nav>
          {page === "students" && (
            <div className="two-column">
              <section className="card">
                <h2>Học sinh</h2>
                {students.map((s) => (
                  <button
                    key={s.id}
                    className="button ghost full"
                    onClick={() => {
                      setSelectedStudent(s.id);
                      void run(async () => {
                        const result = await api<{
                          claims: { id: string; text: string }[];
                        }>(`/students/${s.id}/history`);
                        setHistory(result.claims);
                      });
                    }}
                  >
                    {s.name} ·{" "}
                    {s.status === "archived" ? "Đã lưu trữ" : s.grade}
                  </button>
                ))}
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
                    <input
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    />
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
                    <input
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    Thêm học sinh
                  </button>
                </form>
              </section>
              <section className="card">
                {student ? (
                  <>
                    <h2>{student.name}</h2>
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
                          value={editGoal}
                          onChange={(e) => setEditGoal(e.target.value)}
                        />
                      </label>
                      <label>
                        Ghi chú
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                      </label>
                      <label>
                        Điểm mạnh (mỗi dòng một mục)
                        <textarea
                          value={editStrengths}
                          onChange={(e) => setEditStrengths(e.target.value)}
                        />
                      </label>
                      <label>
                        Cần củng cố (mỗi dòng một mục)
                        <textarea
                          value={editGaps}
                          onChange={(e) => setEditGaps(e.target.value)}
                        />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Lưu hồ sơ
                      </button>
                    </form>
                    <button
                      className="button ghost"
                      onClick={() =>
                        updateStudent({
                          status:
                            student.status === "active" ? "archived" : "active",
                        })
                      }
                    >
                      {student.status === "active" ? "Lưu trữ" : "Khôi phục"}
                    </button>
                    <h3>Nhận định đã duyệt</h3>
                    {history.map((c) => (
                      <p key={c.id}>{c.text}</p>
                    ))}
                  </>
                ) : (
                  <p>Chọn học sinh.</p>
                )}
              </section>
            </div>
          )}
          {page === "materials" && (
            <div className="two-column">
              <section className="card">
                <h2>Kho học liệu</h2>
                {materials.map((m) => (
                  <div key={m.id}>
                    <strong>{m.title}</strong> · {m.grade}{" "}
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          const item = await api<{ readUrl: string }>(
                            `/materials/${m.id}/read-url`,
                          );
                          setPreview({ title: m.title, url: item.readUrl });
                        })
                      }
                    >
                      Xem tệp
                    </button>
                  </div>
                ))}
                {preview && (
                  <div>
                    <h3>{preview.title}</h3>
                    <iframe
                      className="pdf-frame"
                      title={preview.title}
                      src={preview.url}
                    />
                    <a href={preview.url} target="_blank" rel="noreferrer">
                      Mở tệp trong tab mới
                    </a>
                  </div>
                )}
              </section>
              <form className="card form-stack" onSubmit={saveMaterial}>
                <h2>Tải học liệu</h2>
                <label>
                  Tên
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
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
                <label>
                  Mô tả
                  <textarea
                    value={materialDescription}
                    onChange={(e) => setMaterialDescription(e.target.value)}
                  />
                </label>
                <label>
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
            </div>
          )}
          {page === "plans" && (
            <div className="two-column">
              <section className="card">
                <h2>Buổi học</h2>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="button ghost full"
                    onClick={() => setSelectedSession(s.id)}
                  >
                    {s.title} · {s.status}
                  </button>
                ))}
                <form className="form-stack" onSubmit={createSession}>
                  <label>
                    Học sinh
                    <select
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
              </section>
              <section className="card">
                {session ? (
                  <>
                    <h2>{session.title}</h2>
                    <p>
                      {session.date} · {session.time} · {session.duration} phút
                    </p>
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
                        <input
                          name="title"
                          defaultValue={session.title}
                          required
                        />
                      </label>
                      <label>
                        Mục tiêu riêng
                        <textarea name="goal" defaultValue={session.goal} />
                      </label>
                      <label>
                        Mục tiêu chia sẻ
                        <textarea
                          name="sharedGoal"
                          defaultValue={session.sharedGoal}
                        />
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
                    {session.RoomMember_sessionId_items.map((member) => (
                      <div key={member.studentId}>
                        {students.find((pupil) => pupil.id === member.studentId)
                          ?.name || "Học sinh"}{" "}
                        {session.status === "draft" && (
                          <button
                            className="text-button"
                            disabled={
                              busy ||
                              session.RoomMember_sessionId_items.length <= 1
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
                    ))}
                    {session.Activity_sessionId_items.map((a, index) => (
                      <div key={a.id}>
                        <p>
                          {a.title} · {a.duration} phút
                        </p>
                        <form
                          className="form-stack"
                          key={`${a.id}-${session.version}`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const fields = new FormData(event.currentTarget);
                            void run(async () => {
                              await saveActivities(
                                session.Activity_sessionId_items.map((item) =>
                                  item.id === a.id
                                    ? {
                                        ...item,
                                        title: String(fields.get("title")),
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
                            className="button ghost small"
                            disabled={busy}
                          >
                            Lưu hoạt động
                          </button>
                        </form>
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
                              session.Activity_sessionId_items.length - 1
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
                        <select
                          aria-label={`Học liệu cho ${a.title}`}
                          value={a.materialId || ""}
                          onChange={(e) => {
                            const materialId = e.target.value || null;
                            void run(async () => {
                              await saveActivities(
                                session.Activity_sessionId_items.map((item) =>
                                  item.id === a.id
                                    ? {
                                        ...item,
                                        materialId,
                                        materialVersion: materialId ? 1 : null,
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
                          <form
                            className="form-stack"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const fields = new FormData(event.currentTarget);
                              const studentId = String(
                                fields.get("studentId") || "",
                              );
                              void run(async () => {
                                await api(
                                  `/sessions/${session.id}/annotations`,
                                  {
                                    method: "POST",
                                    body: body({
                                      activityId: a.id,
                                      materialId: a.materialId,
                                      materialVersion: a.materialVersion,
                                      page: Number(fields.get("page")) - 1,
                                      x: Number(fields.get("x")),
                                      y: Number(fields.get("y")),
                                      text: String(fields.get("text")),
                                      ...(studentId ? { studentId } : {}),
                                    }),
                                  },
                                );
                              });
                            }}
                          >
                            <label>
                              Chú thích đề
                              <input name="text" required />
                            </label>
                            <label>
                              Trang
                              <input
                                name="page"
                                type="number"
                                min="1"
                                defaultValue="1"
                                required
                              />
                            </label>
                            <label>
                              Vị trí ngang (%)
                              <input
                                name="x"
                                type="number"
                                min="0"
                                max="100"
                                defaultValue="50"
                                required
                              />
                            </label>
                            <label>
                              Vị trí dọc (%)
                              <input
                                name="y"
                                type="number"
                                min="0"
                                max="100"
                                defaultValue="50"
                                required
                              />
                            </label>
                            <label>
                              Gắn học sinh
                              <select name="studentId">
                                <option value="">Chỉ chú thích</option>
                                {session.RoomMember_sessionId_items.map(
                                  (member) => (
                                    <option
                                      key={member.studentId}
                                      value={member.studentId}
                                    >
                                      {students.find(
                                        (pupil) =>
                                          pupil.id === member.studentId,
                                      )?.name || "Học sinh"}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <button
                              className="button ghost small"
                              disabled={busy}
                            >
                              Lưu chú thích
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                    <button
                      className="button ghost"
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
                              : session.RoomMember_sessionId_items[0].studentId;
                          const response = await api<{
                            suggestion: {
                              id: string;
                              text: string;
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
                      Đề xuất hoạt động từ lịch sử đã duyệt
                    </button>
                    {suggestion && (
                      <>
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
                      </>
                    )}
                    {session.Activity_sessionId_items.reduce(
                      (n, a) => n + a.duration,
                      0,
                    ) > session.duration && (
                      <p role="alert">
                        Tổng thời lượng hoạt động vượt thời lượng buổi học.
                      </p>
                    )}
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
                          onChange={(e) =>
                            setActivityDescription(e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Thời lượng hoạt động
                        <input
                          type="number"
                          min="1"
                          value={activityDuration}
                          onChange={(e) =>
                            setActivityDuration(Number(e.target.value))
                          }
                          required
                        />
                      </label>
                      <button className="button secondary" disabled={busy}>
                        Thêm hoạt động
                      </button>
                    </form>
                    <button
                      className="button ghost"
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
                  </>
                ) : (
                  <p>Chọn buổi học.</p>
                )}
              </section>
            </div>
          )}
          <p className="muted">
            Phòng học trực tuyến, video và AI đang được tích hợp; dữ liệu màn
            này được lưu trên máy chủ.
          </p>
        </>
      )}
    </main>
  );
}
function historyReplace() {
  window.history.replaceState({}, "", location.pathname + location.hash);
}
