import { useId } from "react";
import type { ReactNode } from "react";
import type { ActionResult } from "../../../contracts/ui";

export type AsyncState = "idle" | "loading" | "ready" | "empty" | "error" | "denied" | "reconnecting" | "degraded";
export type Feedback = Extract<ActionResult<unknown>, { ok: false }>;

export function AsyncPanel({ state, children, message, onRetry }: { state: AsyncState; children?: ReactNode; message?: string; onRetry?: () => void }) {
  if (state === "ready") return <>{children}</>;
  const defaults: Record<Exclude<AsyncState, "ready">, string> = { idle: "Chưa có thao tác nào.", loading: "Đang tải…", empty: "Chưa có dữ liệu.", error: "Không thể tải dữ liệu.", denied: "Bạn không có quyền thực hiện thao tác này.", reconnecting: "Đang kết nối lại…", degraded: "Một phần dịch vụ tạm thời không khả dụng." };
  return <div className="presentation-notice" role={state === "error" || state === "denied" ? "alert" : "status"} aria-live="polite"><span>{message || defaults[state]}</span>{onRetry && (state === "error" || state === "reconnecting" || state === "degraded") && <button className="button ghost small" type="button" onClick={onRetry}>Thử lại</button>}</div>;
}

export function FormFeedback({ saving, error, onRetry }: { saving?: boolean; error?: Feedback | null; onRetry?: () => void }) {
  if (error) return <div className="presentation-notice presentation-error" role="alert"><span>{error.message} <small>Mã yêu cầu: {error.requestId}</small></span>{onRetry && <button type="button" className="button ghost small" onClick={onRetry}>Thử lại</button>}</div>;
  return saving ? <div className="presentation-notice" role="status">Đang lưu…</div> : null;
}

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "error" | "degraded" | "disconnected";
export function ConnectionStatus({ channel, state, message, onRetry }: { channel: "realtime" | "video"; state: ConnectionState; message?: string; onRetry?: () => void }) {
  const labels: Record<ConnectionState, string> = { connecting: "Đang kết nối", connected: "Đã kết nối", reconnecting: "Đang kết nối lại", error: "Lỗi kết nối", degraded: "Kết nối bị hạn chế", disconnected: "Đã ngắt kết nối" };
  return <div className="presentation-notice" role={state === "error" ? "alert" : "status"}><span><strong>{channel === "video" ? "Video" : "Đồng bộ"}:</strong> {labels[state]}{message && <> — {message}</>}</span>{onRetry && ["error", "degraded", "disconnected"].includes(state) && <button type="button" className="button ghost small" onClick={onRetry}>Thử lại</button>}</div>;
}

export function ConsentLobby({ name, consent, busy, error, onNameChange, onConsentChange, onSubmit }: { name: string; consent: boolean; busy?: boolean; error?: string; onNameChange: (value: string) => void; onConsentChange: (value: boolean) => void; onSubmit: () => void }) {
  const id = useId();
  return <form className="presentation-stack" onSubmit={e => { e.preventDefault(); onSubmit(); }}><label htmlFor={`${id}-name`}>Tên của bạn<input id={`${id}-name`} value={name} onChange={e => onNameChange(e.target.value)} autoComplete="name" required disabled={busy} /></label><label className="presentation-check"><input type="checkbox" checked={consent} onChange={e => onConsentChange(e.target.checked)} disabled={busy} required /> Tôi đồng ý tham gia buổi học theo thông báo của giáo viên.</label>{error && <div role="alert" className="presentation-notice presentation-error">{error}</div>}<button className="button primary" type="submit" disabled={busy}>{busy ? "Đang gửi…" : "Xin vào phòng học"}</button></form>;
}

export function PermissionState({ allowed, label, reason }: { allowed: boolean; label: string; reason?: string }) {
  return <div className="presentation-notice" role="status"><span><strong>{label}:</strong> {allowed ? "Được phép" : "Không được phép"}{reason && <> — {reason}</>}</span></div>;
}
export function SourceRevision({ title, revision, stale, onOpen }: { title: string; revision: number; stale: boolean; onOpen: () => void }) {
  return <div className="presentation-notice"><span><strong>{title}</strong> · Phiên bản {revision}{stale && <span className="presentation-warning"> · Nguồn đã thay đổi, cần kiểm tra lại</span>}</span><button type="button" className="button ghost small" onClick={onOpen}>Xem nguồn</button></div>;
}
export function AISuggestionReview({ text, busy, onAccept, onEdit, onDismiss }: { text: string; busy?: boolean; onAccept: () => void; onEdit: () => void; onDismiss: () => void }) {
  return <section className="presentation-suggestion" aria-label="Gợi ý AI"><strong>Gợi ý AI · Chưa áp dụng</strong><p>{text}</p><div className="presentation-actions"><button type="button" className="button primary small" disabled={busy} onClick={onAccept}>Chấp nhận</button><button type="button" className="button ghost small" disabled={busy} onClick={onEdit}>Chỉnh sửa</button><button type="button" className="button ghost small" disabled={busy} onClick={onDismiss}>Bỏ qua</button></div></section>;
}

export type AnnotationPin = { id: string; page: number; x: number; y: number; text: string };
export type AnnotationLayerProps = {
  children: ReactNode;
  annotations: readonly AnnotationPin[];
  currentPage: number;
  readOnly: boolean;
  highlightedId?: string | null;
  onCreatePin: (position: { x: number; y: number }) => void;
  onOpenAnnotation: (id: string) => void;
};

/** The child must render exactly one page without surrounding padding or an iframe. */
export function AnnotationLayer({ children, annotations, currentPage, readOnly, highlightedId, onCreatePin, onOpenAnnotation }: AnnotationLayerProps) {
  const pins = annotations.filter(pin => pin.page === currentPage && Number.isFinite(pin.x) && Number.isFinite(pin.y) && pin.x >= 0 && pin.x <= 100 && pin.y >= 0 && pin.y <= 100);
  return <div className="annotation-layer">
    {!readOnly && <button className="button ghost small annotation-center" type="button" onClick={() => onCreatePin({ x: 50, y: 50 })}>Thêm chú thích giữa trang</button>}
    <div className="annotation-page" onClick={event => {
      if (readOnly || !(event.target === event.currentTarget || event.target instanceof HTMLCanvasElement || event.target instanceof HTMLImageElement)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      onCreatePin({ x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) });
    }}>
      {children}
      {pins.map((pin, index) => <button key={pin.id} type="button" className={"annotation-pin" + (pin.id === highlightedId ? " annotation-pin-highlighted" : "")} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} aria-label={`Mở chú thích ${index + 1} trên trang ${currentPage}`} onClick={event => { event.stopPropagation(); onOpenAnnotation(pin.id); }}>{index + 1}</button>)}
    </div>
  </div>;
}
