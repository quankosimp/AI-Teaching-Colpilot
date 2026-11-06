import { statusLabel } from "./statusLabels";
import { useState, type FormEvent } from "react";
import { AIClaimDraftPanel } from "./AITeachingPanel";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Draft = { detail: string; support: string; selected: string[]; claimText: string };
/** Chưa biết em làm với mức hỗ trợ nào thì để "Chưa rõ", không điền sẵn kết luận. */
const EMPTY_DRAFT: Draft = { detail: "", support: "ChuaRo", selected: [], claimText: "" };
type Evidence = {
  id: string;
  studentId: string;
  title: string;
  detail: string;
  support: string;
  sourceType: string;
  sourceId: string | null;
  sourceVersion: number | null;
  version: number;
  status: string;
  isObservation: boolean;
};
type Claim = {
  id: string;
  studentId: string;
  text: string;
  evidenceIds: string[];
  status: string;
  revision: number;
  staleReason: string | null;
};
type Member = {
  studentId: string;
  displayName: string;
  studentIdRef?: { name: string };
};
export function ReviewPanel({
  sessionId,
  status,
  members,
  evidence,
  claims,
  request,
  reload,
}: {
  sessionId: string;
  status: string;
  members: Member[];
  evidence: Evidence[];
  claims: Claim[];
  request: Request;
  reload: () => Promise<unknown>;
}) {
  const [student, setStudent] = useState("");
  // Nháp giữ riêng cho từng em: đổi em rồi quay lại vẫn còn phần đang gõ.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{
    evidence: Evidence;
    source: unknown;
  } | null>(null);
  const target = student || members[0]?.studentId || "";
  const draft = drafts[target] ?? EMPTY_DRAFT;
  const patchDraft = (id: string, next: (d: Draft) => Partial<Draft>) =>
    setDrafts((all) => {
      const cur = all[id] ?? EMPTY_DRAFT;
      return { ...all, [id]: { ...cur, ...next(cur) } };
    });
  const { detail, support, selected, claimText } = draft;
  const setDetail = (v: string, id = target) => patchDraft(id, () => ({ detail: v }));
  const setSupport = (v: string) => patchDraft(target, () => ({ support: v }));
  const setClaimText = (v: string, id = target) => patchDraft(id, () => ({ claimText: v }));
  const setSelected = (v: string[] | ((old: string[]) => string[]), id = target) =>
    patchDraft(id, (cur) => ({ selected: typeof v === "function" ? v(cur.selected) : v }));
  const hasDraft = (id: string) => {
    const d = drafts[id];
    return !!d && (!!d.detail.trim() || !!d.claimText.trim() || d.selected.length > 0);
  };
  const visible = evidence.filter((e) => e.studentId === target);
  const chosen = selected.filter((id) =>
    visible.some((e) => e.id === id && e.status === "active"),
  );
  const act = async (
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    version?: number,
  ) => {
    setBusy(true);
    setError("");
    try {
      await request(path, {
        method,
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          ...(version ? { "If-Match-Version": String(version) } : {}),
        },
        body: JSON.stringify(body),
      });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const createEvidence = (event: FormEvent) => {
    event.preventDefault();
    const owner = target;
    void act(`/sessions/${sessionId}/evidence`, "POST", {
      studentId: target,
      kind: "GhiChu",
      title: "Quan sát của giáo viên",
      detail,
      support,
    }).then((ok) => {
      if (ok) setDetail("", owner);
    });
  };
  return (
    <section className="online-room__review">
      <div className="review-panel__top">
        <div>
          <span className="eyebrow">TỔNG KẾT & DUYỆT HỒ SƠ</span>
          <h2>Minh chứng và nhận định</h2>
        </div>
        <label className="review-panel__student-picker">
          Học sinh{" "}
          <select
            aria-label="Học sinh tổng kết"
            value={target}
            onChange={(e) => {
              setStudent(e.target.value);
              setSource(null);
            }}
          >
            {members.map((m) => (
              <option key={m.studentId} value={m.studentId}>
                {m.displayName || m.studentIdRef?.name || m.studentId}
                {m.studentId !== target && hasDraft(m.studentId) ? " · còn nháp" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <form className="review-card-form" onSubmit={createEvidence}>
        <h3>Thêm quan sát mới</h3>
        <label>
          Quan sát thực tế
          <textarea
            required
            placeholder="Ghi nhận bước làm bài, thái độ hoặc mức độ hiểu bài của học sinh…"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        <div className="review-form-row">
          <label>
            Mức hỗ trợ
            <select
              value={support}
              onChange={(e) => setSupport(e.target.value)}
            >
              <option value="ChuaRo">Chưa rõ</option>
              <option value="DocLap">Độc lập</option>
              <option value="CoGoiY">Có gợi ý</option>
              <option value="DuocHuongDan">Được hướng dẫn</option>
            </select>
          </label>
          <button className="button primary small" disabled={busy || !target}>
            Lưu quan sát
          </button>
        </div>
      </form>

      <div className="review-section-head">
        <h3>Minh chứng ({visible.length})</h3>
        <small>Chọn minh chứng để làm căn cứ tạo nhận định</small>
      </div>
      {visible.map((e) => (
        <div key={e.id} className="review-evidence-item">
          <label className="review-evidence-label">
            <input
              type="checkbox"
              disabled={e.status !== "active"}
              checked={chosen.includes(e.id)}
              onChange={(event) =>
                setSelected((old) =>
                  event.target.checked
                    ? [...old, e.id]
                    : old.filter((id) => id !== e.id),
                )
              }
            />
            <span>
              <strong>{e.title}:</strong> {e.detail} · {statusLabel(e.support)}{" "}
              · phiên bản {e.version} · {statusLabel(e.status)}
            </span>
          </label>
          <span className="review-evidence-actions">
            <button
              type="button"
              className="button ghost small"
              onClick={() =>
                void request<{ evidence: Evidence; source: unknown }>(
                  `/evidence/${e.id}`,
                )
                  .then(setSource)
                  .catch((err) => setError(err.message))
              }
            >
              Xem nguồn
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={() => {
                const value = window.prompt("Điều chỉnh minh chứng", e.detail);
                if (value?.trim())
                  void act(
                    `/evidence/${e.id}`,
                    "PATCH",
                    { detail: value, reason: "Giáo viên điều chỉnh" },
                    e.version,
                  );
              }}
            >
              Điều chỉnh
            </button>
          </span>
        </div>
      ))}
      {!visible.length && (
        <p className="muted">
          Chưa có minh chứng nào được ghi nhận cho học sinh này.
        </p>
      )}

      {source && (
        <div className="review-source-box">
          <div className="review-section-head">
            <h4>Nguồn: {source.evidence.title}</h4>
            <button
              type="button"
              className="button ghost small"
              onClick={() => setSource(null)}
            >
              Đóng nguồn
            </button>
          </div>
          <p className="review-source-meta">
            Loại {statusLabel(source.evidence.sourceType)} · phiên bản nguồn{" "}
            {source.evidence.sourceVersion ?? "không có"} · mức hỗ trợ{" "}
            {statusLabel(source.evidence.support)}
          </p>
          <pre className="review-source-pre">
            {source.source
              ? JSON.stringify(source.source, null, 2)
              : source.evidence.detail}
          </pre>
          {source.evidence.sourceType === "submission" &&
            source.evidence.sourceId && (
              <button
                type="button"
                className="button secondary small"
                onClick={() =>
                  void request<{ readUrl: string }>(
                    `/submissions/${source.evidence.sourceId}/read-url`,
                  )
                    .then((r) =>
                      window.open(r.readUrl, "_blank", "noopener,noreferrer"),
                    )
                    .catch((e) => setError(e.message))
                }
              >
                Mở tệp nguồn
              </button>
            )}
        </div>
      )}

      {["ended", "reviewed"].includes(status) && (
        <AIClaimDraftPanel
          key={`${sessionId}:${target}`}
          sessionId={sessionId}
          studentId={target}
          request={request}
          reload={reload}
        />
      )}
      <form
        className="review-card-form"
        onSubmit={(e) => {
          e.preventDefault();
          const owner = target;
          void act(`/sessions/${sessionId}/claims/draft`, "POST", {
            studentId: owner,
            text: claimText,
            evidenceIds: chosen,
          }).then((ok) => {
            if (ok) {
              setClaimText("", owner);
              setSelected([], owner);
            }
          });
        }}
      >
        <label>
          Nhận định
          <textarea
            placeholder="Viết nhận định tổng kết dựa trên các minh chứng đã chọn…"
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            required
          />
        </label>
        <button
          className="button primary small"
          disabled={busy || !chosen.length}
        >
          Tạo nhận định chờ duyệt
        </button>
      </form>

      <h3>Danh sách nhận định</h3>
      {claims
        .filter((c) => c.studentId === target)
        .map((c) => (
          <div key={c.id} className="review-claim-card">
            <p className="review-claim-text">
              {c.text} · {statusLabel(c.status)} · phiên bản {c.revision}{" "}
              {c.staleReason && `· ${statusLabel(c.staleReason)}`}
            </p>
            <p className="review-claim-sources">
              Nguồn:{" "}
              {c.evidenceIds
                .map(
                  (id) =>
                    visible.find((item) => item.id === id)?.title ||
                    "Nguồn cần kiểm tra lại",
                )
                .join("; ")}
            </p>
            <div className="review-claim-actions">
              <button
                className="button primary small"
                disabled={busy || c.status !== "pending"}
                onClick={() =>
                  void act(`/claims/${c.id}/review`, "PATCH", {
                    action: "approve",
                    revision: c.revision,
                    evidenceIds: c.evidenceIds,
                  })
                }
              >
                Duyệt
              </button>
              <button
                className="button ghost small"
                disabled={busy || c.status !== "pending"}
                onClick={() =>
                  void act(`/claims/${c.id}/review`, "PATCH", {
                    action: "reject",
                    revision: c.revision,
                  })
                }
              >
                Từ chối
              </button>
              <button
                className="button ghost small"
                disabled={busy}
                onClick={() => {
                  const text = window.prompt("Sửa nhận định", c.text);
                  if (text?.trim())
                    void act(`/claims/${c.id}/review`, "PATCH", {
                      action: "edit",
                      revision: c.revision,
                      text,
                      evidenceIds: c.evidenceIds,
                    });
                }}
              >
                Sửa
              </button>
            </div>
          </div>
        ))}

      {status === "ended" && (
        <form
          className="review-card-form review-complete-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              `/sessions/${sessionId}/complete-review`,
              "POST",
              note.trim() ? { reviewNote: note } : {},
            );
          }}
        >
          <label>
            Ghi chú tổng kết (cần khi chưa có nhận định)
            <textarea
              placeholder="Ghi chú tổng kết buổi học (nếu chưa có nhận định được duyệt)…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Hoàn tất duyệt
          </button>
        </form>
      )}
    </section>
  );
}
