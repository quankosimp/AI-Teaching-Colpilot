import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Claim, Session } from "./model";
import { defaultTools, formatTime, sessionStudentIds, uid } from "./model";
import { useStore } from "./store";
import {
  Banner,
  Empty,
  Modal,
  PageHeader,
  SectionHead,
  SessionSelect,
  Status,
} from "./ui";
import { SourceViewer } from "./SourceViewer";

export function SummaryWorkflow() {
  const { data, setData, selectedSessionId, setSelectedSessionId, go, toast } =
    useStore();
  const session =
    data.sessions.find(
      (s) =>
        s.id === selectedSessionId && ["ended", "reviewed"].includes(s.status),
    ) || data.sessions.find((s) => ["ended", "reviewed"].includes(s.status));
  const [studentId, setStudentId] = useState("");
  const [source, setSource] = useState("");
  const [edit, setEdit] = useState<Claim | null>(null);
  const [text, setText] = useState("");
  useEffect(() => setStudentId(session?.studentId || ""), [session?.id]);
  if (!session)
    return (
      <Empty
        icon={<ShieldCheck size={25} />}
        title="Chưa có buổi cần tổng kết"
        description="Kết thúc buổi học để xem minh chứng và duyệt nhận định."
        action={
          <button className="button primary" onClick={() => go("live")}>
            Mở phòng dạy
          </button>
        }
      />
    );
  const ids = sessionStudentIds(session);
  const selected = ids.includes(studentId) ? studentId : ids[0];
  const student = data.students.find((s) => s.id === selected);
  const allClaims = data.claims.filter((c) => c.sessionId === session.id);
  const claims = allClaims.filter((c) => c.studentId === selected);
  const approved = claims.filter((c) => c.status === "approved");
  const evidence = data.evidence.filter(
    (e) =>
      e.sessionId === session.id &&
      e.studentId === selected &&
      e.kind !== "Gợi ý giảng dạy",
  );
  const pending = allClaims.filter((c) => c.status === "pending");
  const report = approved.map((c) => "• " + c.text).join("\n");
  const generate = () => {
    setData((prev) => {
      const existing = prev.claims.filter((c) => c.sessionId === session.id);
      const unused = prev.evidence.filter(
        (e) =>
          e.sessionId === session.id &&
          e.kind !== "Gợi ý giảng dạy" &&
          !existing.some((c) => c.evidenceIds.includes(e.id)),
      );
      return {
        ...prev,
        claims: [
          ...prev.claims,
          ...unused.map((e) => ({
            id: uid("claim"),
            sessionId: session.id,
            studentId: e.studentId,
            text: `${e.detail}${e.support ? " Mức hỗ trợ quan sát: " + e.support + "." : ""}`,
            evidenceIds: [e.id],
            status: "pending" as const,
            createdAt: new Date().toISOString(),
          })),
        ],
      };
    });
    toast("Đã lập bản nháp từ minh chứng của từng học sinh.");
  };
  const review = (id: string, status: Claim["status"]) =>
    setData((prev) => ({
      ...prev,
      claims: prev.claims.map((c) => (c.id === id ? { ...c, status } : c)),
    }));
  const next = () => {
    const day = new Date(session.date + "T12:00:00");
    day.setDate(day.getDate() + 7);
    const accepted = allClaims.filter((c) => c.status === "approved");
    const nextId = uid("ses");
    const activities = ids.flatMap((id) => {
      const related = accepted.filter((c) => c.studentId === id);
      return related.length
        ? [
            {
              id: uid("act"),
              title:
                "Kiểm tra và củng cố · " +
                data.students
                  .find((s) => s.id === id)
                  ?.name.split(" ")
                  .at(-1),
              description: related.map((c) => c.text).join("\n"),
              duration: 15,
              type: "Kiểm tra" as const,
              materialId: session.activities[0]?.materialId,
              sourceEvidenceIds: related.flatMap((c) => c.evidenceIds),
            },
          ]
        : [];
    });
    const entry: Session = {
      id: nextId,
      studentId: ids[0],
      studentIds: ids,
      groupName: session.groupName,
      title: "Buổi tiếp theo · " + session.title,
      goal: accepted
        .map((c) => c.text)
        .join(" ")
        .slice(0, 240),
      date: day.toISOString().slice(0, 10),
      time: session.time,
      duration: session.duration,
      meetingUrl: "",
      status: "draft",
      activities,
      tools: { ...defaultTools },
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, sessions: [entry, ...prev.sessions] }));
    setSelectedSessionId(nextId);
    go("plan");
    toast("Đã tạo kế hoạch có nguồn từ các nhận định đã duyệt.");
  };
  return (
    <>
      <PageHeader
        title="Tổng kết & duyệt"
        description="Từ minh chứng gốc đến kết luận gia sư xác nhận."
        action={
          <button
            className="button primary"
            disabled={
              session.status === "reviewed" ||
              pending.length > 0 ||
              !allClaims.length
            }
            onClick={() => {
              setData((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) =>
                  s.id === session.id ? { ...s, status: "reviewed" } : s,
                ),
              }));
              toast("Đã hoàn tất tổng kết.");
            }}
          >
            <Check size={17} />
            {session.status === "reviewed"
              ? "Đã hoàn tất"
              : pending.length
                ? `Còn ${pending.length} nhận định`
                : "Hoàn tất tổng kết"}
          </button>
        }
      />
      <div className="summary-toolbar">
        <SessionSelect
          value={session.id}
          onChange={setSelectedSessionId}
          statuses={["ended", "reviewed"]}
        />
        <button className="button ghost" onClick={generate}>
          <Sparkles size={16} />
          Tạo bản nháp
        </button>
        <button className="text-button" onClick={() => go("recordings")}>
          Xem bản ghi buổi học
        </button>
      </div>
      <div className="room-tabs review-students">
        {ids.map((id) => (
          <button
            className={selected === id ? "active" : ""}
            key={id}
            onClick={() => setStudentId(id)}
          >
            {data.students.find((s) => s.id === id)?.name}
          </button>
        ))}
      </div>
      <div className="recap-grid">
        <section className="card">
          <SectionHead title="Nội dung đã hoàn tất" />
          {session.activities
            .filter((a) => session.completedActivityIds?.includes(a.id))
            .map((a) => (
              <p key={a.id}>{a.title}</p>
            ))}
          {!session.completedActivityIds?.length && (
            <p className="muted">Gia sư chưa đánh dấu hoạt động hoàn tất.</p>
          )}
        </section>
        <section className="card">
          <SectionHead title="Việc còn dở" />
          {session.activities
            .filter((a) => !session.completedActivityIds?.includes(a.id))
            .map((a) => (
              <p key={a.id}>{a.title}</p>
            ))}
          {session.completedActivityIds?.length ===
            session.activities.length && (
            <p className="muted">Các hoạt động đã hoàn tất.</p>
          )}
        </section>
        <section className="card">
          <SectionHead title="Quan sát cần xem lại" />
          <p>
            {evidence.length} minh chứng ·{" "}
            {evidence.filter((e) => e.support === "Độc lập").length} quan sát
            độc lập
          </p>
          <p className="muted">
            Kiểm tra nguồn và mức hỗ trợ trước khi xác nhận kết luận.
          </p>
        </section>
      </div>
      <div className="summary-grid">
        <div className="summary-main">
          <section className="card">
            <SectionHead
              title={`Minh chứng · ${student?.name}`}
              meta={`${evidence.length} nguồn · nội dung của từng em được lưu riêng`}
            />
            {evidence.length ? (
              evidence.map((e) => (
                <button
                  className="evidence-link"
                  key={e.id}
                  onClick={() => setSource(e.id)}
                >
                  <FileText size={18} />
                  <span>
                    <strong>{e.title}</strong>
                    <p>{e.detail}</p>
                    <small>
                      {e.support || e.kind} · {formatTime(e.createdAt)}
                    </small>
                  </span>
                  <span className="source-action">Mở nguồn</span>
                </button>
              ))
            ) : (
              <Banner>
                Chưa có minh chứng cho học sinh này. Bổ sung quan sát trước khi
                tạo kết luận.
              </Banner>
            )}
          </section>
          <section className="card">
            <SectionHead
              title="Nhận định cần gia sư duyệt"
              meta={`${claims.length} nhận định · ${approved.length} đã xác nhận`}
            />
            {claims.length ? (
              claims.map((c) => (
                <div className={"claim-card claim-" + c.status} key={c.id}>
                  <div className="claim-top">
                    <Status
                      tone={
                        c.status === "approved"
                          ? "green"
                          : c.status === "pending"
                            ? "violet"
                            : "neutral"
                      }
                    >
                      {
                        {
                          approved: "Đã duyệt",
                          pending: "Chờ duyệt",
                          rejected: "Đã bỏ qua",
                        }[c.status]
                      }
                    </Status>
                    <small>{c.evidenceIds.length} nguồn</small>
                  </div>
                  <p>{c.text}</p>
                  <div className="claim-source">
                    {c.evidenceIds.map((id) => (
                      <button
                        className="text-button"
                        key={id}
                        onClick={() => setSource(id)}
                      >
                        <FileText size={14} />
                        {data.evidence.find((e) => e.id === id)?.title ||
                          "Nguồn không còn"}
                      </button>
                    ))}
                  </div>
                  <div className="claim-actions">
                    {c.status === "pending" ? (
                      <>
                        <button
                          className="button ghost small"
                          onClick={() => review(c.id, "rejected")}
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
                          Sửa
                        </button>
                        <button
                          className="button primary small"
                          onClick={() => review(c.id, "approved")}
                        >
                          Duyệt
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => {
                          review(c.id, "pending");
                          setData((prev) => ({
                            ...prev,
                            sessions: prev.sessions.map((s) =>
                              s.id === session.id
                                ? { ...s, status: "ended" }
                                : s,
                            ),
                          }));
                        }}
                      >
                        Xem lại nhận định
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon={<ShieldCheck size={24} />}
                title="Chưa có bản nháp"
                description="Tạo bản nháp từ nguồn đã lưu trong buổi học."
              />
            )}
          </section>
        </div>
        <aside className="summary-side">
          <section className="card">
            <SectionHead
              title="Kết luận đã xác nhận"
              meta="Chỉ phần này được dùng vào hồ sơ và buổi sau."
            />
            {approved.length ? (
              approved.map((c) => (
                <div className="approved-claim" key={c.id}>
                  <Check size={16} />
                  {c.text}
                </div>
              ))
            ) : (
              <p className="muted">Chưa có nhận định được duyệt.</p>
            )}
            <button
              className="button ghost full"
              onClick={next}
              disabled={
                session.status !== "reviewed" ||
                !allClaims.some((c) => c.status === "approved")
              }
            >
              <CalendarDays size={16} />
              Soạn buổi tiếp theo
            </button>
          </section>
          <section className="card">
            <SectionHead
              title="Bản tin chia sẻ"
              meta={`Riêng cho ${student?.name} · từ nhận định đã duyệt`}
            />
            <pre className="report-preview">
              {report || "Duyệt nhận định để có bản tin có căn cứ."}
            </pre>
            <button
              className="button ghost full"
              disabled={!report}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `Buổi học: ${session.title}\nHọc sinh: ${student?.name}\n\n${report}`,
                  );
                  toast("Đã sao chép bản tin.");
                } catch {
                  toast(
                    "Không sao chép được. Hãy chọn nội dung thủ công.",
                    "error",
                  );
                }
              }}
            >
              <Copy size={16} />
              Sao chép
            </button>
          </section>
        </aside>
      </div>
      {source && (
        <SourceViewer evidenceId={source} onClose={() => setSource("")} />
      )}{" "}
      {edit && (
        <Modal title="Sửa bản nháp nhận định" onClose={() => setEdit(null)}>
          <label>
            Nội dung
            <textarea
              rows={5}
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
              onClick={() => {
                setData((prev) => ({
                  ...prev,
                  claims: prev.claims.map((c) =>
                    c.id === edit.id
                      ? { ...c, text: text.trim(), status: "pending" }
                      : c,
                  ),
                }));
                setEdit(null);
              }}
            >
              Lưu bản nháp
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
