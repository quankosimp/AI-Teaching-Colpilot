import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { z } from "zod";
import type { Stroke } from "../../contracts/domain";

export type BoardStroke = z.infer<typeof Stroke>;
export type BoardState = {
  id: string;
  ownerId: string;
  shared: boolean;
  revision: number;
  strokes: BoardStroke[];
  text: string;
};

type Props = {
  title: string;
  board: BoardState | null;
  actorId: string;
  canWrite: boolean;
  isOwnPrivateBoard?: boolean;
  busy?: boolean;
  onCommand: (cmd: {
    operation:
      | "addStroke"
      | "undoOwnStroke"
      | "clearOwnStrokes"
      | "setNote"
      | "setShared";
    stroke?: BoardStroke;
    strokeId?: string;
    text?: string;
    shared?: boolean;
  }) => Promise<void>;
  onCaptureAttempt?: () => Promise<void>;
};

const COLORS = [
  { label: "Tím", value: "#7c3aed" },
  { label: "Xanh", value: "#2563eb" },
  { label: "Lục", value: "#16a34a" },
  { label: "Đỏ", value: "#dc2626" },
];

export function OnlineBoard({
  title,
  board,
  actorId,
  canWrite,
  isOwnPrivateBoard = false,
  busy = false,
  onCommand,
  onCaptureAttempt,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [kind, setKind] = useState<"pen" | "line" | "rect" | "circle">("pen");
  const [color, setColor] = useState("#7c3aed");
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>(
    [],
  );
  const [drawing, setDrawing] = useState(false);
  const [noteText, setNoteText] = useState(board?.text ?? "");

  useEffect(() => {
    setNoteText(board?.text ?? "");
  }, [board?.id, board?.revision, board?.text]);

  const toCoords = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    const x = Math.round(
      Math.max(0, Math.min(800, ((e.clientX - rect.left) / rect.width) * 800)),
    );
    const y = Math.round(
      Math.max(0, Math.min(420, ((e.clientY - rect.top) / rect.height) * 420)),
    );
    return { x, y };
  };

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!canWrite || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCoords(e);
    setDrawing(true);
    setDraftPoints([pt, pt]);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawing || !canWrite) return;
    const pt = toCoords(e);
    setDraftPoints((prev) =>
      kind === "pen" ? [...prev, pt] : [prev[0] ?? pt, pt],
    );
  };

  const handlePointerUp = () => {
    if (!drawing || !canWrite) return;
    setDrawing(false);
    if (draftPoints.length >= 2) {
      const stroke: BoardStroke = {
        id: crypto.randomUUID(),
        authorId: actorId,
        color,
        kind,
        width: 3,
        points: draftPoints,
      };
      setDraftPoints([]);
      void onCommand({ operation: "addStroke", stroke });
    } else {
      setDraftPoints([]);
    }
  };

  const renderStroke = (s: BoardStroke, idx: number) => {
    const pts = s.points;
    if (!pts.length) return null;
    const strokeKind = s.kind ?? "pen";
    const strokeWidth = s.width ?? 3;
    if (strokeKind === "line" && pts.length >= 2) {
      const a = pts[0],
        b = pts[pts.length - 1];
      return (
        <line
          key={s.id || idx}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={s.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      );
    }
    if (strokeKind === "rect" && pts.length >= 2) {
      const a = pts[0],
        b = pts[pts.length - 1];
      return (
        <rect
          key={s.id || idx}
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.max(4, Math.abs(b.x - a.x))}
          height={Math.max(4, Math.abs(b.y - a.y))}
          stroke={s.color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    }
    if (strokeKind === "circle" && pts.length >= 2) {
      const a = pts[0],
        b = pts[pts.length - 1];
      const r = Math.max(4, Math.hypot(b.x - a.x, b.y - a.y));
      return (
        <circle
          key={s.id || idx}
          cx={a.x}
          cy={a.y}
          r={r}
          stroke={s.color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    }
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    return (
      <path
        key={s.id || idx}
        d={d}
        stroke={s.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  };

  const strokes = board?.strokes ?? [];

  return (
    <div className="form-stack" data-testid="online-board">
      <div className="row-actions">
        <strong>{title}</strong>
        <span className="muted">
          Phiên bản bảng: {board?.revision ?? 1} · {strokes.length} nét vẽ
        </span>
        {isOwnPrivateBoard && (
          <button
            type="button"
            className="button ghost small"
            disabled={!canWrite || busy}
            onClick={() =>
              void onCommand({
                operation: "setShared",
                shared: !board?.shared,
              })
            }
          >
            {board?.shared
              ? "Dừng chia sẻ nháp"
              : "Chia sẻ nháp với giáo viên/lớp"}
          </button>
        )}
        {onCaptureAttempt && (
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() => void onCaptureAttempt()}
          >
            Lưu bản nháp
          </button>
        )}
      </div>

      <div className="row-actions">
        <button
          type="button"
          className={`button ghost small ${kind === "pen" ? "active" : ""}`}
          disabled={!canWrite || busy}
          onClick={() => setKind("pen")}
        >
          Bút vẽ
        </button>
        <button
          type="button"
          className={`button ghost small ${kind === "line" ? "active" : ""}`}
          disabled={!canWrite || busy}
          onClick={() => setKind("line")}
        >
          Đoạn thẳng
        </button>
        <button
          type="button"
          className={`button ghost small ${kind === "rect" ? "active" : ""}`}
          disabled={!canWrite || busy}
          onClick={() => setKind("rect")}
        >
          Hình chữ nhật
        </button>
        <button
          type="button"
          className={`button ghost small ${kind === "circle" ? "active" : ""}`}
          disabled={!canWrite || busy}
          onClick={() => setKind("circle")}
        >
          Hình tròn
        </button>
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className="button ghost small"
            disabled={!canWrite || busy}
            onClick={() => setColor(c.value)}
            aria-label={`Màu ${c.label}`}
          >
            {color === c.value ? `● ${c.label}` : c.label}
          </button>
        ))}
        <button
          type="button"
          className="button ghost small"
          disabled={!canWrite || busy}
          onClick={() =>
            void onCommand({
              operation: "addStroke",
              stroke: {
                id: crypto.randomUUID(),
                authorId: actorId,
                color,
                kind,
                width: 3,
                points: [
                  { x: 80 + strokes.length * 15, y: 90 },
                  { x: 240 + strokes.length * 15, y: 180 },
                ],
              },
            })
          }
        >
          Thêm nét vẽ
        </button>
        <button
          type="button"
          className="button ghost small"
          disabled={!canWrite || busy}
          onClick={() => void onCommand({ operation: "undoOwnStroke" })}
        >
          Hoàn tác nét của tôi
        </button>
        <button
          type="button"
          className="button ghost small"
          disabled={!canWrite || busy}
          onClick={() => void onCommand({ operation: "clearOwnStrokes" })}
        >
          Xóa nét của tôi
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 800 420"
        aria-label={`Khung vẽ ${title}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: "100%",
          height: "280px",
          border: "1px solid var(--border, #d8b4fe)",
          borderRadius: "12px",
          background: "var(--surface, #faf5ff)",
          touchAction: "none",
          cursor: canWrite ? "crosshair" : "not-allowed",
        }}
      >
        {strokes.map((s, idx) => renderStroke(s, idx))}
        {draftPoints.length >= 2 &&
          renderStroke(
            {
              id: "draft",
              authorId: actorId,
              color,
              kind,
              width: 3,
              points: draftPoints,
            },
            -1,
          )}
      </svg>

      <div className="row-actions">
        <label style={{ flex: 1 }}>
          Ghi chú / lời giải trên bảng
          <input
            value={noteText}
            disabled={!canWrite || busy}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Nhập bước biến đổi hoặc ghi chú bảng..."
          />
        </label>
        <button
          type="button"
          className="button secondary small"
          disabled={!canWrite || busy}
          onClick={() =>
            void onCommand({ operation: "setNote", text: noteText })
          }
        >
          Lưu ghi chú bảng
        </button>
      </div>
    </div>
  );
}
