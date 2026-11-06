import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { ApiError } from "../onlineApi";
import type { Pupil } from "./types";

const HUES: Record<string, number> = { violet: 262, sky: 200, emerald: 160, amber: 38, rose: 345, indigo: 235, teal: 175, blue: 215, green: 145, orange: 25, pink: 330 };
export const hueOf = (key: string) => HUES[key] ?? [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Không thể hoàn thành yêu cầu.");
export const weekdayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_LONG = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
export const shortDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};
export const shortCode = (name: string) =>
  name.replace(/[·\-–]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "L";
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function Av({ p, size = 28 }: { p: { initials: string; color: string; name?: string }; size?: number }) {
  return <span className="cls-av" title={p.name} style={{ width: size, height: size, fontSize: size < 26 ? 9 : 11, ["--h" as string]: hueOf(p.color || p.initials) }}>{p.initials}</span>;
}
export function Stack({ people, max = 5 }: { people: Pupil[]; max?: number }) {
  return <span className="cls-stack">{people.slice(0, max).map((p) => <Av key={p.id} p={p} size={24} />)}{people.length > max && <span className="cls-av cls-av--more">+{people.length - max}</span>}</span>;
}
export function CIco({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`cls-cico${size === "lg" ? " is-lg" : size === "sm" ? " is-sm" : ""}`} style={{ ["--h" as string]: hueOf(name) }}>{shortCode(name)}</span>;
}
export function Modal({ title, sub, onClose, children, footer, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="cls-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`cls-modal${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="cls-modal__h"><div className="cls-min"><h2>{title}</h2>{sub && <p className="cls-muted cls-one">{sub}</p>}</div><button type="button" className="cls-ib" aria-label="Đóng" onClick={onClose}><X size={18} /></button></div>
      <div className="cls-modal__b">{children}</div>
      <div className="cls-modal__f">{footer}</div>
    </div>
  </div>;
}
