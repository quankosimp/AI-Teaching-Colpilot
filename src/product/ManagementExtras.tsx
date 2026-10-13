import { useState } from "react";
import { ArrowRight, Film, Pencil, Users } from "lucide-react";
import type { Activity, Claim, Session, Submission } from "./model";
import { formatDate, sessionStudentIds, uid } from "./model";
import { useStore } from "./store";
import { Banner, Empty, Modal, SectionHead, Status } from "./ui";
import { SourceViewer } from "./SourceViewer";
export { SessionSetup } from "./SessionSetup";

export function DashboardExtras() {
  const { data, go, setSelectedSessionId } = useStore();
  const groups = data.sessions.filter((s) => sessionStudentIds(s).length > 1);
  const recordings = data.recordings
    .filter((r) => r.status === "ready")
    .slice(-3)
    .reverse();
  return (
    <div className="dashboard-extras two-column">
      <section className="card">
        <SectionHead
          title="Buổi học nhóm"
          meta="Hồ sơ và bài làm riêng cho từng em."
        />
        {groups.length ? (
          groups.slice(0, 3).map((s) => (
            <button
              className="group-session-row"
              key={s.id}
              onClick={() => {
                setSelectedSessionId(s.id);
                go(s.status === "live" ? "live" : "plan");
              }}
            >
              <Users size={22} />
              <span>
                <strong>{s.groupName || s.title}</strong>
                <small>
                  {sessionStudentIds(s)
                    .map((id) =>
                      data.students
                        .find((p) => p.id === id)
                        ?.name.split(" ")
                        .at(-1),
                    )
                    .join(", ")}{" "}
                  · {formatDate(s.date)}
                </small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))
        ) : (
          <Empty
            icon={<Users size={22} />}
            title="Chưa có buổi nhóm"
            description="Chọn nhiều học sinh khi chuẩn bị một buổi học."
          />
        )}
      </section>
      <section className="card">
        <SectionHead
          title="Bản ghi gần đây"
          meta="Nội dung chung và các mốc trong buổi."
          action={
            <button className="text-button" onClick={() => go("recordings")}>
              Xem tất cả
            </button>
          }
        />
        {recordings.length ? (
          recordings.map((r) => (
            <button
              className="group-session-row"
              key={r.id}
              onClick={() => {
                setSelectedSessionId(r.sessionId);
                go("recordings");
              }}
            >
              <Film size={22} />
              <span>
                <strong>
                  {data.sessions.find((s) => s.id === r.sessionId)?.title}
                </strong>
                <small>Mô phỏng · sẵn sàng xem lại</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))
        ) : (
          <p className="muted">Chưa có bản ghi sẵn sàng.</p>
        )}
      </section>
    </div>
  );
}
export function ActivityEditor({
  session,
  activity,
}: {
  session: Session;
  activity: Activity;
}) {
  const { data, setData, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(activity);
  const [source, setSource] = useState("");
  return (
    <>
      <button
        className="icon-button"
        aria-label={"Sửa hoạt động " + activity.title}
        onClick={() => {
          setForm(activity);
          setOpen(true);
        }}
      >
        <Pencil size={17} />
      </button>
      {open && (
        <Modal title="Sửa hoạt động" onClose={() => setOpen(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              setData((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) =>
                  s.id === session.id
                    ? {
                        ...s,
                        activities: s.activities.map((a) =>
                          a.id === activity.id
                            ? {
                                ...form,
                                title: form.title.trim(),
                                duration: Math.max(
                                  1,
                                  Math.min(240, form.duration),
                                ),
                              }
                            : a,
                        ),
                      }
                    : s,
                ),
              }));
              setOpen(false);
              toast("Đã cập nhật hoạt động.");
            }}
          >
            <label>
              Tên hoạt động
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Mô tả
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                Thời lượng
                <input
                  type="number"
                  min="1"
                  max="240"
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Loại hoạt động
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target.value as Activity["type"],
                    })
                  }
                >
                  {["Khởi động", "Lý thuyết", "Luyện tập", "Kiểm tra"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label>
              Học liệu
              <select
                value={form.materialId || ""}
                onChange={(e) =>
                  setForm({ ...form, materialId: e.target.value || undefined })
                }
              >
                <option value="">Chưa gắn tài liệu</option>
                {data.materials.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            {(form.sourceEvidenceIds || []).length > 0 && (
              <div>
                <h3>Nguồn từ buổi trước</h3>
                {(form.sourceEvidenceIds || []).map((id) => (
                  <button
                    type="button"
                    className="evidence-link"
                    key={id}
                    onClick={() => setSource(id)}
                  >
                    {data.evidence.find((e) => e.id === id)?.title ||
                      "Nguồn không còn"}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setOpen(false)}
              >
                Hủy
              </button>
              <button className="button primary">Lưu hoạt động</button>
            </div>
          </form>
        </Modal>
      )}
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}
    </>
  );
}
export function PlanSuggestions({ session }: { session: Session }) {
  const { data, setData, toast } = useStore();
  const dismissed = session.dismissedSuggestionIds || [];
  const [edit, setEdit] = useState<Claim | null>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const claims = data.claims.filter(
    (c) =>
      sessionStudentIds(session).includes(c.studentId) &&
      c.status === "approved" &&
      !dismissed.includes(c.id) &&
      !session.activities.some((a) =>
        a.sourceEvidenceIds?.some((id) => c.evidenceIds.includes(id)),
      ),
  );
  const apply = (claim: Claim, value: string) => {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              activities: [
                ...s.activities,
                {
                  id: uid("act"),
                  title: "Củng cố từ buổi trước",
                  description: value,
                  duration: 15,
                  type: "Kiểm tra",
                  sourceEvidenceIds: claim.evidenceIds,
                  materialId: prev.sessions.find(
                    (s) => s.id === claim.sessionId,
                  )?.activities[0]?.materialId,
                },
              ],
            }
          : s,
      ),
    }));
    toast("Đã thêm hoạt động có nguồn. Có thể sửa hoặc xóa trong kịch bản.");
    setEdit(null);
  };
  return (
    <section className="card plan-suggestions">
      <SectionHead
        title="Ưu tiên từ lịch sử đã duyệt"
        meta="Gợi ý mô phỏng · kiểm tra nguồn trước khi đưa vào kế hoạch."
      />
      {claims.length ? (
        claims.slice(0, 3).map((c) => (
          <div className="suggestion-row" key={c.id}>
            <div>
              <Status tone="violet">
                {data.students.find((s) => s.id === c.studentId)?.name}
              </Status>
              <p>{c.text}</p>
              <div className="row-actions">
                {c.evidenceIds.map((id) => (
                  <button
                    className="text-button"
                    key={id}
                    onClick={() => setSource(id)}
                  >
                    Xem minh chứng
                  </button>
                ))}
              </div>
            </div>
            <div className="row-actions">
              <button
                className="button ghost small"
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    sessions: prev.sessions.map((s) =>
                      s.id === session.id
                        ? {
                            ...s,
                            dismissedSuggestionIds: [
                              ...(s.dismissedSuggestionIds || []),
                              c.id,
                            ],
                          }
                        : s,
                    ),
                  }))
                }
              >
                Bỏ qua
              </button>
              <button
                className="button ghost small"
                onClick={() => {
                  setEdit(c);
                  setText(c.text);
                }}
              >
                Sửa gợi ý
              </button>
              <button
                className="button primary small"
                onClick={() => apply(c, c.text)}
              >
                Thêm vào kế hoạch
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className="muted">
          Chưa có gợi ý mới từ lịch sử đã duyệt. Bạn có thể tự thêm hoạt động và
          học liệu.
        </p>
      )}
      {edit && (
        <Modal title="Chỉnh gợi ý trước khi dùng" onClose={() => setEdit(null)}>
          <label>
            Nội dung hoạt động
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setEdit(null)}>
              Hủy
            </button>
            <button
              className="button primary"
              disabled={!text.trim()}
              onClick={() => apply(edit, text.trim())}
            >
              Thêm vào kế hoạch
            </button>
          </div>
        </Modal>
      )}
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}
    </section>
  );
}
export function RelabelSubmission({ submission }: { submission: Submission }) {
  const { data, setData, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(submission.studentId);
  const [sessionId, setSessionId] = useState(submission.sessionId);
  const [activityId, setActivityId] = useState(submission.activityId || "");
  const target = data.sessions.find((s) => s.id === sessionId);
  return (
    <>
      <button
        className="button ghost small"
        onClick={() => {
          setStudentId(submission.studentId);
          setSessionId(submission.sessionId);
          setActivityId(submission.activityId || "");
          setOpen(true);
        }}
      >
        Sửa nhãn
      </button>
      {open && (
        <Modal title="Sửa người gửi / buổi học" onClose={() => setOpen(false)}>
          <div className="form-stack">
            <Banner>
              Nhận định liên quan sẽ trở về trạng thái cần duyệt để gia sư kiểm
              tra lại.
            </Banner>
            <label>
              Học sinh
              <select
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setSessionId("");
                  setActivityId("");
                }}
              >
                {data.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Buổi học
              <select
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setActivityId("");
                }}
              >
                <option value="">Chọn buổi</option>
                {data.sessions
                  .filter((s) => sessionStudentIds(s).includes(studentId))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Hoạt động
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                <option value="">Toàn buổi</option>
                {target?.activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="button ghost" onClick={() => setOpen(false)}>
                Hủy
              </button>
              <button
                className="button primary"
                disabled={!sessionId}
                onClick={() => {
                  setData((prev) => {
                    const linked = prev.evidence
                      .filter((e) => e.submissionId === submission.id)
                      .map((e) => e.id);
                    const changedClaims = prev.claims.some((c) =>
                      c.evidenceIds.some((id) => linked.includes(id)),
                    );
                    return {
                      ...prev,
                      submissions: prev.submissions.map((s) =>
                        s.id === submission.id
                          ? {
                              ...s,
                              studentId,
                              sessionId,
                              activityId: activityId || undefined,
                            }
                          : s,
                      ),
                      evidence: prev.evidence.map((e) =>
                        linked.includes(e.id)
                          ? {
                              ...e,
                              studentId,
                              sessionId,
                              activityId: activityId || undefined,
                            }
                          : e,
                      ),
                      claims: prev.claims.map((c) =>
                        c.evidenceIds.some((id) => linked.includes(id))
                          ? { ...c, studentId, sessionId, status: "pending" }
                          : c,
                      ),
                      sessions: prev.sessions.map((s) =>
                        changedClaims &&
                        s.status === "reviewed" &&
                        [sessionId, submission.sessionId].includes(s.id)
                          ? { ...s, status: "ended" }
                          : s,
                      ),
                    };
                  });
                  setOpen(false);
                  toast("Đã sửa nhãn bài và nguồn liên quan.");
                }}
              >
                Lưu nhãn
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
