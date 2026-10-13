import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Eraser, Pencil, Save, Share2, Trash2, Undo2 } from "lucide-react";
import type { Board, Stroke } from "./model";
import { boardKey, uid } from "./model";
import { useStore, commitData } from "./store";
import { appendEvent } from "./adapters";
import { canStudentAct } from "./permissions";
import { Banner, Modal, Status } from "./ui";

export const boardText = (board: Board) =>
  [board.text, ...(board.notes || []).map((n) => n.text)]
    .filter(Boolean)
    .join("\n");
export function BoardPreview({
  strokes,
  text,
}: {
  strokes: Stroke[];
  text: string;
}) {
  return (
    <div className="board-preview">
      <svg viewBox="0 0 800 400" aria-label="Nét viết trên bảng">
        {strokes.map((s) => (
          <polyline
            key={s.id}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {text && <pre>{text}</pre>}
    </div>
  );
}
export function Whiteboard({
  sessionId,
  activityId,
  ownerId,
  actorId,
  teacher = false,
  canWrite = true,
  token,
  evidenceStudentId,
}: {
  sessionId: string;
  activityId: string;
  ownerId: string;
  actorId: string;
  teacher?: boolean;
  canWrite?: boolean;
  token?: string;
  evidenceStudentId?: string;
}) {
  const { data, setData, toast } = useStore();
  const key = boardKey(sessionId, activityId, ownerId);
  const existing = data.boards.find((b) => b.id === key);
  const board: Board = existing || {
    id: key,
    sessionId,
    activityId,
    ownerId,
    shared: ownerId === "common",
    strokes: [],
    text: "",
    notes: [],
    updatedAt: new Date().toISOString(),
  };
  const [tool, setTool] = useState<"pen" | "erase">("pen");
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const live = useRef<Stroke | null>(null);
  const [clear, setClear] = useState(false);
  const ownNote = board.notes?.find((n) => n.authorId === actorId)?.text || "";
  const [noteValue, setNoteValue] = useState(ownNote);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const notePending = useRef(false);
  const noteSequence = useRef(0);
  useEffect(() => {
    if (!notePending.current) setNoteValue(ownNote);
  }, [ownNote]);
  const editable =
    canWrite && (teacher || ownerId === "common" || ownerId === actorId);
  const write = (
    change: (b: Board) => Board,
    label = "Bảng chung được cập nhật",
  ) => {
    return commitData((prev) => {
      const s = prev.sessions.find((s) => s.id === sessionId);
      const member = prev.members.find(
        (m) => m.sessionId === sessionId && m.studentId === actorId,
      );
      if (
        !s ||
        ["ended", "reviewed"].includes(s.status) ||
        (!teacher &&
          (!canStudentAct(prev, sessionId, actorId, "board", token) ||
            !member?.canWrite))
      )
        return prev;
      const current = prev.boards.find((b) => b.id === key) || board;
      const updated = {
        ...change(current),
        updatedAt: new Date().toISOString(),
      };
      const next = {
        ...prev,
        boards: [...prev.boards.filter((b) => b.id !== key), updated],
      };
      return updated.shared
        ? appendEvent(next, {
            sessionId,
            activityId,
            kind: "board",
            label,
            sourceId: key,
            board: { strokes: updated.strokes, text: boardText(updated) },
            shared: true,
          })
        : next;
    });
  };
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 800,
      y: ((event.clientY - rect.top) / rect.height) * 400,
    };
  };
  const start = (e: PointerEvent<SVGSVGElement>) => {
    if (!editable || tool !== "pen") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = {
      id: uid("stroke"),
      authorId: actorId,
      color: teacher ? "#5849c5" : "#245c9e",
      points: [point(e)],
    };
    setDrawing(live.current);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!live.current) return;
    live.current = {
      ...live.current,
      points: [...live.current.points, point(e)],
    };
    setDrawing(live.current);
  };
  const end = () => {
    const stroke = live.current;
    live.current = null;
    setDrawing(null);
    if (stroke && stroke.points.length > 1)
      write((b) => ({ ...b, strokes: [...b.strokes, stroke] }));
  };
  const save = async () => {
    const id = uid("attempt");
    const studentId = teacher
      ? ownerId === "common"
        ? evidenceStudentId ||
          data.sessions.find((s) => s.id === sessionId)!.studentId
        : ownerId
      : actorId;
    const saved = await commitData((prev) => {
      if (!teacher && !canStudentAct(prev, sessionId, actorId, "board", token))
        return prev;
      const current = prev.boards.find((b) => b.id === key) || board;
      const text = boardText(current);
      return {
        ...prev,
        attempts: [
          ...prev.attempts,
          {
            id,
            boardId: key,
            sessionId,
            activityId,
            studentId,
            strokes: current.strokes,
            text,
            createdAt: new Date().toISOString(),
          },
        ],
        evidence: [
          ...prev.evidence,
          {
            id: uid("ev"),
            sessionId,
            activityId,
            studentId,
            kind: "Trang nháp",
            title: "Lần nháp đã lưu",
            detail:
              text || "Bài làm trên bảng nháp được lưu để gia sư xem lại.",
            sourceId: id,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
    if (saved) toast("Đã lưu lần thử và gắn vào minh chứng.");
    else
      toast(
        "Lần nháp chưa được lưu. Hãy kiểm tra quyền và bộ nhớ trình duyệt.",
        "error",
      );
  };
  return (
    <div className="whiteboard">
      <div className="board-toolbar">
        <div className="row-actions">
          <button
            className={"icon-button " + (tool === "pen" ? "selected" : "")}
            aria-label="Bút viết"
            onClick={() => setTool("pen")}
            disabled={!editable}
          >
            <Pencil size={17} />
          </button>
          <button
            className={"icon-button " + (tool === "erase" ? "selected" : "")}
            aria-label="Xóa nét của mình"
            onClick={() => setTool("erase")}
            disabled={!editable}
          >
            <Eraser size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Hoàn tác nét của mình"
            disabled={
              !editable || !board.strokes.some((s) => s.authorId === actorId)
            }
            onClick={() =>
              write((b) => {
                const last = b.strokes
                  .filter((s) => s.authorId === actorId)
                  .at(-1);
                return {
                  ...b,
                  strokes: b.strokes.filter((s) => s.id !== last?.id),
                };
              })
            }
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Xóa các nét của mình"
            disabled={!editable}
            onClick={() => setClear(true)}
          >
            <Trash2 size={17} />
          </button>
        </div>
        <Status tone={board.shared ? "green" : "neutral"}>
          {board.shared ? "Được chia sẻ" : "Nháp cá nhân"}
        </Status>
        <div className="row-actions">
          {ownerId === actorId && (
            <button
              className="button ghost small"
              onClick={() =>
                write(
                  (b) => ({ ...b, shared: !b.shared }),
                  board.shared ? "Dừng chia sẻ nháp" : "Học sinh chia sẻ nháp",
                )
              }
              disabled={!editable}
            >
              <Share2 size={16} />
              {board.shared ? "Ngừng chia sẻ" : "Chia sẻ nháp"}
            </button>
          )}
          <button
            className="button ghost small"
            onClick={save}
            disabled={!editable}
          >
            <Save size={16} />
            Lưu lần thử
          </button>
        </div>
      </div>
      <svg
        className="drawing-surface"
        viewBox="0 0 800 400"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          live.current = null;
          setDrawing(null);
        }}
        role="img"
        aria-label="Bảng nháp. Có thể viết lời giải bằng ô văn bản bên dưới."
      >
        <defs>
          <pattern
            id={"grid-" + ownerId}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#e3e7f0" />
          </pattern>
        </defs>
        <rect width="800" height="400" fill={`url(#grid-${ownerId})`} />
        {[...board.strokes, ...(drawing ? [drawing] : [])].map((s) => (
          <polyline
            key={s.id}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={tool === "erase" ? 8 : 3}
            strokeOpacity={tool === "erase" ? 0.7 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: tool === "erase" ? "stroke" : "none" }}
            onPointerDown={(e) => {
              if (
                tool === "erase" &&
                editable &&
                (teacher || s.authorId === actorId)
              ) {
                e.stopPropagation();
                write((b) => ({
                  ...b,
                  strokes: b.strokes.filter((x) => x.id !== s.id),
                }));
              }
            }}
          />
        ))}
      </svg>
      {board.text && <pre className="board-seed-text">{board.text}</pre>}
      {board.notes
        ?.filter((n) => n.authorId !== actorId && n.text)
        .map((n) => (
          <div className="board-peer-note" key={n.authorId}>
            <small>
              {n.authorId === "teacher"
                ? "Giáo viên"
                : data.students.find((s) => s.id === n.authorId)?.name}
            </small>
            <pre>{n.text}</pre>
          </div>
        ))}
      <label className="board-note">
        Lời giải của bạn
        <textarea
          aria-label="Lời giải trên bảng"
          value={noteValue}
          disabled={!editable}
          rows={3}
          placeholder="Viết phép tính, lập luận hoặc ghi chú tại đây…"
          onChange={async (e) => {
            const text = e.target.value;
            setNoteValue(text);
            notePending.current = true;
            const sequence = ++noteSequence.current;
            setSaveStatus("saving");
            const saved = await write((b) => ({
              ...b,
              notes: [
                ...(b.notes || []).filter((n) => n.authorId !== actorId),
                { authorId: actorId, text },
              ],
            }));
            if (sequence === noteSequence.current) {
              notePending.current = false;
              setSaveStatus(saved ? "saved" : "error");
            }
          }}
        />
      </label>
      {!editable && (
        <Banner>
          Đang xem · giáo viên chưa cấp quyền viết hoặc buổi học đã kết thúc.
        </Banner>
      )}
      <div className="saved-at" aria-live="polite">
        {saveStatus === "saving"
          ? "Đang lưu…"
          : saveStatus === "error"
            ? "Chưa lưu · kiểm tra quyền hoặc bộ nhớ"
            : "Đã lưu trên trình duyệt"}{" "}
        · {new Date(board.updatedAt).toLocaleTimeString("vi-VN")}
      </div>
      {clear && (
        <Modal title="Xóa nét viết của bạn?" onClose={() => setClear(false)}>
          <p>Các nét của người khác và các lần thử đã lưu được giữ lại.</p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setClear(false)}>
              Hủy
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                write((b) => ({
                  ...b,
                  strokes: b.strokes.filter((s) => s.authorId !== actorId),
                }));
                setClear(false);
              }}
            >
              Xóa nét của tôi
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
