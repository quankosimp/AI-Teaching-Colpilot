import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Circle,
  Download,
  Eraser,
  Grid3X3,
  Minus,
  Pencil,
  Save,
  Share2,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
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

export function renderStrokeElement(
  s: Stroke,
  options?: {
    isErase?: boolean;
    onErase?: () => void;
  },
) {
  const isErase = options?.isErase;
  const strokeWidth = isErase
    ? Math.max(9, (s.width || 3) + 4)
    : s.width || 3;
  const strokeOpacity = isErase ? 0.7 : 1;
  const strokeStyle = {
    pointerEvents: isErase ? ("stroke" as const) : ("none" as const),
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (isErase && options?.onErase) {
      e.stopPropagation();
      options.onErase();
    }
  };

  if (s.kind === "line" && s.points.length >= 2) {
    const p1 = s.points[0];
    const p2 = s.points[1];
    return (
      <line
        key={s.id}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={s.color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        style={strokeStyle}
        onPointerDown={onPointerDown}
      />
    );
  }
  if (s.kind === "rect" && s.points.length >= 2) {
    const p1 = s.points[0];
    const p2 = s.points[1];
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.max(2, Math.abs(p2.x - p1.x));
    const h = Math.max(2, Math.abs(p2.y - p1.y));
    return (
      <rect
        key={s.id}
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={s.color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        rx="4"
        style={strokeStyle}
        onPointerDown={onPointerDown}
      />
    );
  }
  if (s.kind === "circle" && s.points.length >= 2) {
    const p1 = s.points[0];
    const p2 = s.points[1];
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const rx = Math.max(2, Math.abs(p2.x - p1.x) / 2);
    const ry = Math.max(2, Math.abs(p2.y - p1.y) / 2);
    return (
      <ellipse
        key={s.id}
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={s.color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        style={strokeStyle}
        onPointerDown={onPointerDown}
      />
    );
  }
  if (s.kind === "axes" && s.points.length >= 2) {
    const p1 = s.points[0];
    const p2 = s.points[1];
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return (
      <g key={s.id} style={strokeStyle} onPointerDown={onPointerDown}>
        <line
          x1={minX}
          y1={midY}
          x2={maxX}
          y2={midY}
          stroke={s.color}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
        <polygon
          points={`${maxX},${midY} ${maxX - 7},${midY - 4} ${maxX - 7},${midY + 4}`}
          fill={s.color}
        />
        <text
          x={maxX - 9}
          y={midY + 14}
          fontSize="11"
          fill={s.color}
          fontWeight="bold"
        >
          x
        </text>

        <line
          x1={midX}
          y1={maxY}
          x2={midX}
          y2={minY}
          stroke={s.color}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
        <polygon
          points={`${midX},${minY} ${midX - 4},${minY + 7} ${midX + 4},${minY + 7}`}
          fill={s.color}
        />
        <text
          x={midX + 6}
          y={minY + 13}
          fontSize="11"
          fill={s.color}
          fontWeight="bold"
        >
          y
        </text>
        <text x={midX - 11} y={midY + 12} fontSize="10" fill={s.color}>
          O
        </text>
      </g>
    );
  }

  return (
    <polyline
      key={s.id}
      points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={s.color}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={strokeStyle}
      onPointerDown={onPointerDown}
    />
  );
}

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
        {strokes.map((s) => renderStrokeElement(s))}
      </svg>
      {text && <pre>{text}</pre>}
    </div>
  );
}

export const BOARD_COLORS = [
  { label: "Tím thương hiệu", value: "#5849c5" },
  { label: "Xanh biển", value: "#2563eb" },
  { label: "Mực đen/ghi", value: "#1e293b" },
  { label: "Đỏ ghi chú/chấm", value: "#dc2626" },
  { label: "Xanh lá", value: "#16a34a" },
];

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
  const [tool, setTool] = useState<
    "pen" | "line" | "rect" | "circle" | "axes" | "erase"
  >("pen");
  const [color, setColor] = useState(teacher ? "#5849c5" : "#245c9e");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

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
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 800,
      y: ((event.clientY - rect.top) / rect.height) * 400,
    };
  };
  const start = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!editable || tool === "erase") return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = {
      id: uid("stroke"),
      authorId: actorId,
      color,
      width: strokeWidth,
      kind: tool,
      points: [p, p],
    };
    setDrawing(live.current);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!live.current) return;
    const p = point(e);
    if (live.current.kind === "pen") {
      live.current = {
        ...live.current,
        points: [...live.current.points, p],
      };
    } else {
      live.current = {
        ...live.current,
        points: [live.current.points[0], p],
      };
    }
    setDrawing(live.current);
  };
  const end = () => {
    const stroke = live.current;
    live.current = null;
    setDrawing(null);
    if (!stroke) return;
    if (stroke.kind === "pen" && stroke.points.length > 1) {
      write((b) => ({ ...b, strokes: [...b.strokes, stroke] }));
    } else if (
      stroke.kind &&
      stroke.kind !== "pen" &&
      stroke.points.length >= 2
    ) {
      const dx = stroke.points[1].x - stroke.points[0].x;
      const dy = stroke.points[1].y - stroke.points[0].y;
      if (Math.hypot(dx, dy) >= 3) {
        write((b) => ({ ...b, strokes: [...b.strokes, stroke] }));
      }
    }
  };
  const downloadSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bang-ve-${activityId}-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Đã tải tệp bảng vẽ (SVG).");
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
        <div className="board-tool-group">
          <button
            className={"icon-button " + (tool === "pen" ? "selected" : "")}
            aria-label="Bút viết tự do"
            title="Bút viết tự do"
            onClick={() => setTool("pen")}
            disabled={!editable}
          >
            <Pencil size={16} />
          </button>
          <button
            className={"icon-button " + (tool === "line" ? "selected" : "")}
            aria-label="Thước kẻ / Đoạn thẳng"
            title="Đoạn thẳng / Thước kẻ"
            onClick={() => setTool("line")}
            disabled={!editable}
          >
            <Minus size={16} />
          </button>
          <button
            className={"icon-button " + (tool === "rect" ? "selected" : "")}
            aria-label="Hình chữ nhật"
            title="Hình chữ nhật"
            onClick={() => setTool("rect")}
            disabled={!editable}
          >
            <Square size={16} />
          </button>
          <button
            className={"icon-button " + (tool === "circle" ? "selected" : "")}
            aria-label="Hình tròn / Elip"
            title="Hình tròn / Elip"
            onClick={() => setTool("circle")}
            disabled={!editable}
          >
            <Circle size={16} />
          </button>
          <button
            className={"icon-button " + (tool === "axes" ? "selected" : "")}
            aria-label="Hệ trục tọa độ Oxy"
            title="Hệ trục Oxy"
            onClick={() => setTool("axes")}
            disabled={!editable}
          >
            <span style={{ fontSize: 11, fontWeight: "bold" }}>Oxy</span>
          </button>
          <button
            className={"icon-button " + (tool === "erase" ? "selected" : "")}
            aria-label="Xóa nét"
            title="Tẩy xóa nét vẽ"
            onClick={() => setTool("erase")}
            disabled={!editable}
          >
            <Eraser size={16} />
          </button>
        </div>

        <div className="board-tool-group board-palette">
          {BOARD_COLORS.map((c) => (
            <button
              key={c.value}
              className={"palette-color " + (color === c.value ? "active" : "")}
              style={{ backgroundColor: c.value }}
              aria-label={c.label}
              title={c.label}
              disabled={!editable}
              onClick={() => {
                setColor(c.value);
                if (tool === "erase") setTool("pen");
              }}
            />
          ))}
        </div>

        <div className="board-tool-group board-sizes">
          {[
            { size: 2, label: "Nét mảnh" },
            { size: 4, label: "Nét vừa" },
            { size: 6, label: "Nét đậm" },
          ].map((s) => (
            <button
              key={s.size}
              className={
                "size-btn " + (strokeWidth === s.size ? "active" : "")
              }
              title={s.label}
              aria-label={s.label}
              disabled={!editable}
              onClick={() => setStrokeWidth(s.size)}
            >
              <span
                className="size-dot"
                style={{ width: s.size * 2, height: s.size * 2 }}
              />
            </button>
          ))}
        </div>

        <div className="row-actions">
          <button
            className={"icon-button " + (showGrid ? "selected" : "")}
            aria-label="Lưới ô ly toán học"
            title="Bật/Tắt lưới ô ly"
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Hoàn tác nét của mình"
            title="Hoàn tác"
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
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Xóa các nét của mình"
            title="Xóa các nét của tôi"
            disabled={!editable}
            onClick={() => setClear(true)}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="row-actions">
          <Status tone={board.shared ? "green" : "neutral"}>
            {board.shared ? "Được chia sẻ" : "Nháp cá nhân"}
          </Status>
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
              <Share2 size={15} />
              {board.shared ? "Ngừng chia sẻ" : "Chia sẻ nháp"}
            </button>
          )}
          <button
            className="button ghost small"
            onClick={downloadSvg}
            title="Tải ảnh bảng vẽ (SVG)"
          >
            <Download size={15} />
            Tải ảnh
          </button>
          <button
            className="button primary small"
            onClick={save}
            disabled={!editable}
          >
            <Save size={15} />
            Lưu lần thử
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
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
            id={"dot-grid-" + ownerId}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1.2" fill="#94a3b8" opacity="0.35" />
          </pattern>
          <pattern
            id={"math-grid-" + ownerId}
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.8"
              opacity="0.3"
            />
            <path
              d="M 20 0 L 20 40 M 0 20 L 40 20"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.4"
              opacity="0.18"
            />
          </pattern>
        </defs>
        <rect
          width="800"
          height="400"
          fill={
            showGrid
              ? `url(#math-grid-${ownerId})`
              : `url(#dot-grid-${ownerId})`
          }
        />
        {[...board.strokes, ...(drawing ? [drawing] : [])].map((s) =>
          renderStrokeElement(s, {
            isErase: tool === "erase",
            onErase: () => {
              if (editable && (teacher || s.authorId === actorId)) {
                write((b) => ({
                  ...b,
                  strokes: b.strokes.filter((x) => x.id !== s.id),
                }));
              }
            },
          }),
        )}
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
