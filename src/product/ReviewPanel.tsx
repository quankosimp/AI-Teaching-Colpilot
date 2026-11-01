import { useState, type FormEvent } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
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
  const [detail, setDetail] = useState("");
  const [support, setSupport] = useState("DocLap");
  const [selected, setSelected] = useState<string[]>([]);
  const [claimText, setClaimText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{
    evidence: Evidence;
    source: unknown;
  } | null>(null);
  const target = student || members[0]?.studentId || "";
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
    void act(`/sessions/${sessionId}/evidence`, "POST", {
      studentId: target,
      kind: "GhiChu",
      title: "Quan sát của giáo viên",
      detail,
      support,
    }).then((ok) => {
      if (ok) setDetail("");
    });
  };
  return (
    <section>
      <h2>Minh chứng và nhận định</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Học sinh{" "}
        <select
          value={target}
          onChange={(e) => {
            setStudent(e.target.value);
            setSelected([]);
          }}
        >
          {members.map((m) => (
            <option key={m.studentId} value={m.studentId}>
              {m.displayName || m.studentIdRef?.name || m.studentId}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={createEvidence}>
        <label>
          Quan sát thực tế
          <textarea
            required
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        <label>
          Mức hỗ trợ
          <select value={support} onChange={(e) => setSupport(e.target.value)}>
            <option value="DocLap">Độc lập</option>
            <option value="CoGoiY">Có gợi ý</option>
            <option value="DuocHuongDan">Được hướng dẫn</option>
            <option value="ChuaRo">Chưa rõ</option>
          </select>
        </label>
        <button disabled={busy || !target}>Lưu quan sát</button>
      </form>
      <h3>Minh chứng</h3>
      {visible.map((e) => (
        <div key={e.id}>
          <label>
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
            {e.title}: {e.detail} · {e.support} · phiên bản {e.version} ·{" "}
            {e.status}
          </label>
          <button
            type="button"
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
        </div>
      ))}
      {source && (
        <div>
          <h4>Nguồn: {source.evidence.title}</h4>
          <p>
            Loại {source.evidence.sourceType} · phiên bản nguồn{" "}
            {source.evidence.sourceVersion ?? "không có"} · mức hỗ trợ{" "}
            {source.evidence.support}
          </p>
          <pre>
            {source.source
              ? JSON.stringify(source.source, null, 2)
              : source.evidence.detail}
          </pre>
          {source.evidence.sourceType === "submission" &&
            source.evidence.sourceId && (
              <button
                type="button"
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
          <button type="button" onClick={() => setSource(null)}>
            Đóng nguồn
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(`/sessions/${sessionId}/claims/draft`, "POST", {
            studentId: target,
            text: claimText,
            evidenceIds: chosen,
          }).then((ok) => {
            if (ok) {
              setClaimText("");
              setSelected([]);
            }
          });
        }}
      >
        <label>
          Nhận định
          <textarea
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            required
          />
        </label>
        <button disabled={busy || !chosen.length}>
          Tạo nhận định chờ duyệt
        </button>
      </form>
      {claims
        .filter((c) => c.studentId === target)
        .map((c) => (
          <div key={c.id}>
            <p>
              {c.text} · {c.status} · phiên bản {c.revision}{" "}
              {c.staleReason && `· ${c.staleReason}`}
            </p>
            <button
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
        ))}
      {status === "ended" && (
        <form
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
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button disabled={busy}>Hoàn tất duyệt</button>
        </form>
      )}
    </section>
  );
}
