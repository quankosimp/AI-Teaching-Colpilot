import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Session, Student } from "./model";
import { formatDate, sessionStudentIds } from "./model";
import { useStore } from "./store";

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
export const fileToData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được tệp"));
    reader.readAsDataURL(file);
  });
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropDown = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        backdropDown.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (backdropDown.current && e.target === e.currentTarget) onClose();
        backdropDown.current = false;
      }}
    >
      <div
        ref={ref}
        className={"modal-panel" + (wide ? " modal-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => {
          backdropDown.current = false;
          e.stopPropagation();
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function Avatar({
  student,
  size = "md",
}: {
  student: Student;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={"avatar avatar-" + student.color + " avatar-" + size}>
      {student.initials || initials(student.name)}
    </span>
  );
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"status status-" + tone}>{children}</span>;
}
export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function SectionHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {meta && <p>{meta}</p>}
      </div>
      {action}
    </div>
  );
}
export function StudentSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data } = useStore();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Chọn học sinh"
    >
      {data.students
        .filter((s) => s.status === "active")
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.grade}
          </option>
        ))}
    </select>
  );
}
export function SessionSelect({
  value,
  onChange,
  statuses,
}: {
  value: string;
  onChange: (id: string) => void;
  statuses?: Session["status"][];
}) {
  const { data } = useStore();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Chọn buổi học"
    >
      {data.sessions
        .filter((s) => !statuses || statuses.includes(s.status))
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} ·{" "}
            {sessionStudentIds(s).length > 1
              ? s.groupName || "Nhóm học"
              : data.students.find((p) => p.id === s.studentId)?.name}{" "}
            · {formatDate(s.date)}
          </option>
        ))}
    </select>
  );
}
export function Banner({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={"room-banner" + (error ? " error" : "")}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
