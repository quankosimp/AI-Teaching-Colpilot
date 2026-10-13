import { useEffect, useState } from "react";
import { Film, Pause, Play, RefreshCw } from "lucide-react";
import type { Recording } from "./model";
import { useStore } from "./store";
import { formatDate, formatTime } from "./model";
import { BoardPreview } from "./Board";
import { MaterialContent } from "./DocumentStage";
import { Banner, Empty, Modal, PageHeader, SectionHead, Status } from "./ui";

export function useRecordingJobs() {
  const { data, setData } = useStore();
  useEffect(() => {
    if (!data.recordings.some((r) => r.status === "processing")) return;
    const timer = setInterval(
      () =>
        setData((prev) => {
          const due = prev.recordings.some(
            (r) =>
              r.status === "processing" &&
              new Date(r.readyAt || 0).getTime() <= Date.now(),
          );
          return due
            ? {
                ...prev,
                recordings: prev.recordings.map((r) =>
                  r.status === "processing" &&
                  new Date(r.readyAt || 0).getTime() <= Date.now()
                    ? { ...r, status: "ready" }
                    : r,
                ),
              }
            : prev;
        }),
      500,
    );
    return () => clearInterval(timer);
  }, [data.recordings.some((r) => r.status === "processing")]);
}
export function RecordingsPage() {
  const { data, selectedSessionId, setData } = useStore();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("all");
  const list = data.recordings
    .filter((r) => filter === "all" || r.status === filter)
    .slice()
    .reverse();
  const recording = data.recordings.find((r) => r.id === selected);
  const statuses = {
    recording: "Đang ghi",
    processing: "Đang xử lý",
    ready: "Sẵn sàng",
    error: "Xử lý lỗi",
  };
  return (
    <>
      <PageHeader
        title="Bản ghi buổi học"
        description="Xem lại nội dung chung và các mốc quan trọng trong buổi."
      />
      <Banner>
        <Film size={18} /> Bản phát lại mô phỏng từ sự kiện lớp học. Cuộc gọi và
        âm thanh chưa được ghi thành video.
      </Banner>
      <div className="card recording-list">
        <SectionHead
          title="Các bản ghi"
          meta={`${list.length} bản · chỉ nội dung chung`}
          action={
            <select
              aria-label="Lọc bản ghi"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="ready">Sẵn sàng</option>
              <option value="processing">Đang xử lý</option>
              <option value="error">Xử lý lỗi</option>
              <option value="recording">Đang ghi</option>
            </select>
          }
        />
        {list.length ? (
          list.map((r) => {
            const session = data.sessions.find((s) => s.id === r.sessionId);
            return (
              <div className="recording-row" key={r.id}>
                <span className="recording-thumb">
                  <Film size={26} />
                </span>
                <div className="recording-info">
                  <strong>{session?.title || "Buổi học không còn"}</strong>
                  <small>
                    {session ? formatDate(session.date) : ""} ·{" "}
                    {formatTime(r.startedAt)} · {session?.groupName || "1–1"}
                  </small>
                  {r.error && <p className="error-text">{r.error}</p>}
                </div>
                <Status
                  tone={
                    r.status === "ready"
                      ? "green"
                      : r.status === "error"
                        ? "red"
                        : "amber"
                  }
                >
                  {statuses[r.status]}
                </Status>
                {r.status === "ready" ? (
                  <button
                    className="button ghost"
                    onClick={() => setSelected(r.id)}
                  >
                    <Play size={16} />
                    Xem lại
                  </button>
                ) : r.status === "error" ? (
                  <button
                    className="button ghost"
                    onClick={() =>
                      setData((prev) => ({
                        ...prev,
                        recordings: prev.recordings.map((p) =>
                          p.id === r.id
                            ? {
                                ...p,
                                status: "processing",
                                error: undefined,
                                readyAt: new Date(
                                  Date.now() + 1800,
                                ).toISOString(),
                              }
                            : p,
                        ),
                      }))
                    }
                  >
                    <RefreshCw size={16} />
                    Thử xử lý lại
                  </button>
                ) : (
                  <small className="muted">
                    {r.status === "recording"
                      ? "Dừng ghi trong phòng dạy"
                      : "Đang chuẩn bị bản phát lại…"}
                  </small>
                )}
              </div>
            );
          })
        ) : (
          <Empty
            icon={<Film size={26} />}
            title="Chưa có bản ghi"
            description="Bắt đầu ghi hình trong phòng dạy hoặc chọn bộ lọc khác."
          />
        )}
      </div>
      <details className="demo-controls">
        <summary>Tình huống xử lý bản ghi demo</summary>
        <button
          className="button ghost small"
          disabled={!data.recordings.length}
          onClick={() => {
            const target =
              data.recordings.find(
                (r) =>
                  r.sessionId === selectedSessionId && r.status !== "recording",
              ) || data.recordings.find((r) => r.status !== "recording");
            if (target)
              setData((prev) => ({
                ...prev,
                recordings: prev.recordings.map((r) =>
                  r.id === target.id
                    ? {
                        ...r,
                        status: "error",
                        error:
                          "Không tạo được bản phát lại. Nội dung buổi học vẫn được giữ.",
                      }
                    : r,
                ),
              }));
          }}
        >
          Mô phỏng lỗi xử lý
        </button>
      </details>
      {recording && (
        <Modal
          title="Xem lại buổi học · mô phỏng"
          onClose={() => setSelected("")}
          wide
        >
          <RecordingPlayer key={recording.id} recording={recording} />
        </Modal>
      )}
    </>
  );
}
function RecordingPlayer({ recording }: { recording: Recording }) {
  const { data } = useStore();
  const session = data.sessions.find((s) => s.id === recording.sessionId);
  const events = data.events
    .filter(
      (e) =>
        e.sessionId === recording.sessionId &&
        e.shared &&
        new Date(e.createdAt) >= new Date(recording.startedAt) &&
        (!recording.endedAt ||
          new Date(e.createdAt) <= new Date(recording.endedAt)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const duration = Math.max(
    1,
    Math.ceil(
      (new Date(recording.endedAt || Date.now()).getTime() -
        new Date(recording.startedAt).getTime()) /
        1000,
    ),
  );
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setTime((t) => {
          if (t >= duration) {
            setPlaying(false);
            return duration;
          }
          return Math.min(duration, t + Math.max(1, Math.ceil(duration / 45)));
        }),
      700,
    );
    return () => clearInterval(timer);
  }, [playing, duration]);
  const reached = events.filter(
    (e) =>
      (new Date(e.createdAt).getTime() -
        new Date(recording.startedAt).getTime()) /
        1000 <=
      time,
  );
  const current = reached.at(-1);
  const lastBoard = [...reached].reverse().find((e) => e.board);
  const material = data.materials.find(
    (m) =>
      m.id ===
      ([...reached].reverse().find((e) => e.materialId)?.materialId ||
        session?.activities[0]?.materialId),
  );
  const submission = data.submissions.find((s) => s.id === source);
  const annotation = data.annotations.find((a) => a.id === source);
  const check = data.checks.find((c) => c.id === source);
  return (
    <div className="recording-player">
      <Banner>
        Phát lại nhanh các mốc lớp học · camera và âm thanh là mô phỏng. Nội
        dung riêng của giáo viên không nằm trong bản phát lại.
      </Banner>
      <div className="replay-title">
        <h3>{session?.title}</h3>
        <Status tone="violet">Nội dung chung</Status>
      </div>
      <div className="replay-layout">
        <div>
          <div className="replay-video-strip">
            <span>HN · Giáo viên</span>
            <span>{session?.groupName || "Học sinh"} · camera mô phỏng</span>
          </div>
          <div className="replay-stage">
            {current?.kind === "board" && lastBoard?.board ? (
              <BoardPreview
                strokes={lastBoard.board.strokes}
                text={lastBoard.board.text}
              />
            ) : material ? (
              <MaterialContent material={material} page={current?.page || 0} />
            ) : (
              <p className="muted">Chưa có nội dung được chia sẻ ở mốc này.</p>
            )}
          </div>
          <div className="replay-controls">
            <button
              className="icon-button"
              aria-label={
                playing ? "Tạm dừng bản phát lại" : "Phát bản phát lại"
              }
              onClick={() => {
                if (time >= duration) setTime(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <input
              type="range"
              aria-label="Mốc thời gian bản ghi"
              min={0}
              max={duration}
              value={time}
              onChange={(e) => {
                setTime(Number(e.target.value));
                setPlaying(false);
              }}
            />
            <span>
              {Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
        <aside className="replay-timeline">
          <h3>Mốc hoạt động</h3>
          {events.length ? (
            events.map((e) => (
              <div
                className={
                  "timeline-moment " + (current?.id === e.id ? "active" : "")
                }
                key={e.id}
              >
                <button
                  onClick={() => {
                    setTime(
                      Math.max(
                        0,
                        Math.floor(
                          (new Date(e.createdAt).getTime() -
                            new Date(recording.startedAt).getTime()) /
                            1000,
                        ),
                      ),
                    );
                    setPlaying(false);
                  }}
                >
                  <small>{formatTime(e.createdAt)}</small>
                  <strong>{e.label}</strong>
                </button>
                {e.sourceId &&
                  ["submission", "annotation", "check"].includes(e.kind) && (
                    <button
                      className="text-button"
                      onClick={() => setSource(e.sourceId!)}
                    >
                      Mở nguồn gốc
                    </button>
                  )}
              </div>
            ))
          ) : (
            <p className="muted">
              Chưa có thao tác chia sẻ trong thời gian ghi.
            </p>
          )}
        </aside>
      </div>
      {source && (
        <Modal title="Nguồn gốc tại mốc buổi học" onClose={() => setSource("")}>
          <p>
            {submission?.title ||
              annotation?.text ||
              check?.question ||
              "Nguồn này không còn tồn tại."}
          </p>
          {submission && (
            <>
              <p>{submission.answer}</p>
              {submission.fileData && (
                <a
                  className="button ghost"
                  href={submission.fileData}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở tệp gốc
                </a>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
