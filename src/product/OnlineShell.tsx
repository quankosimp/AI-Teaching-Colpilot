import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, GraduationCap,
  LayoutDashboard, LibraryBig, LogOut, Menu, Moon, Settings2, ShieldCheck,
  Sparkles, Sun, Users, Video, X, type LucideIcon,
} from "lucide-react";
import "./online-restoration.css";

export type OnlineNavIcon = "dashboard" | "students" | "materials" | "plan" | "plans" | "grading" | "live" | "summary" | "account";
export type OnlineNavItem = { id: string; label: string; icon?: OnlineNavIcon; badge?: number };
export type OnlineShellProps = {
  page: string;
  title: string;
  teacher: { name: string; email?: string } | null;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  navItems: OnlineNavItem[];
  onNavigate: (id: string) => void;
  onSignOut?: () => void;
  accountAction?: () => void;
  room?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};
const icons: Record<OnlineNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, students: Users, materials: LibraryBig,
  plan: CalendarDays, plans: CalendarDays, grading: ClipboardCheck,
  live: Video, summary: CheckCircle2, account: Settings2,
};
function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map(part => part[0] || "").join("").toLocaleUpperCase("vi-VN") || "GV";
}

/** API-neutral presentation shell, matched to the original ProductApp composition. */
export function OnlineShell({ page, title, teacher, theme, onThemeToggle, navItems, onNavigate, onSignOut, accountAction, room = false, actions, children }: OnlineShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [smallScreen, setSmallScreen] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches);
  const menuId = useId();
  const sidebar = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const closeMenu = () => {
    setMobileOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const change = () => { setSmallScreen(media.matches); if (!media.matches) setMobileOpen(false); };
    change(); media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobileOpen || !smallScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closer.current?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],[tabindex='0']") || []).filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(focusFrame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", trap); opener.current?.focus(); };
  }, [mobileOpen, smallScreen]);
  const navigate = (id: string) => {
    onNavigate(id);
    if (mobileOpen) closeMenu();
  };
  const hasAccount = navItems.some(item => item.id === "account");
  const home = navItems.find(item => item.id === "dashboard")?.id || navItems[0]?.id;

  return <div className={`online-restored${room ? " online-restored--room" : ""}`} data-theme={theme}>
    <a className="restored-skip" href="#restored-page-content" onClick={() => content.current?.focus()}>Đến nội dung chính</a>
    {smallScreen && mobileOpen && <button type="button" className="restored-scrim" aria-label="Đóng menu điều hướng" onClick={closeMenu} />}
    <aside
      id={menuId} ref={sidebar}
      className={`restored-sidebar${mobileOpen ? " is-open" : ""}`}
      aria-label="Thanh điều hướng"
      role={smallScreen && mobileOpen ? "dialog" : undefined}
      aria-modal={smallScreen && mobileOpen ? true : undefined}
      inert={smallScreen && !mobileOpen}
    >
      <div className="restored-brand-row">
        <button className="restored-brand" type="button" onClick={() => home && navigate(home)} aria-label="AI Teaching Copilot — về tổng quan">
          <span className="restored-brand-mark"><Sparkles size={23} aria-hidden="true" /></span>
          <span><strong>AI Teaching</strong><small>Copilot</small></span>
        </button>
        <button ref={closer} type="button" className="restored-icon restored-mobile-close" aria-label="Đóng menu" onClick={closeMenu}><X size={19} /></button>
      </div>
      <p className="restored-nav-caption">KHÔNG GIAN LÀM VIỆC</p>
      <nav className="restored-nav" aria-label="Điều hướng chính">
        {navItems.map(item => {
          const Icon = icons[item.icon || item.id as OnlineNavIcon] || GraduationCap;
          const active = page === item.id || (page === "student" && item.id === "students");
          return <button key={item.id} type="button" className={`restored-nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => navigate(item.id)}>
            <Icon size={19} aria-hidden="true" /><span>{item.label}</span>
            {typeof item.badge === "number" && item.badge > 0 && <em aria-label={`${item.badge} mục cần xem`}>{item.badge > 99 ? "99+" : item.badge}</em>}
          </button>;
        })}
      </nav>
      <div className="restored-sidebar-footer">
        <div className="restored-approval-note"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Gia sư giữ quyền duyệt</strong><p>Gợi ý của Copilot luôn cần bạn xem và xác nhận.</p></div></div>
        {teacher && onSignOut && <button className="restored-signout" type="button" onClick={onSignOut}><LogOut size={16} aria-hidden="true" />Đăng xuất</button>}
      </div>
    </aside>
    <div className="restored-main-column" inert={smallScreen && mobileOpen}>
      <header className="restored-topbar">
        <div className="restored-breadcrumb">
          <button ref={opener} type="button" className="restored-icon restored-mobile-menu" aria-label="Mở menu" aria-controls={menuId} aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <span>Không gian làm việc</span><ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong>
        </div>
        <div className="restored-topbar-actions">
          {actions}
          <button className="restored-icon" type="button" aria-label="Đổi giao diện" title={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} onClick={onThemeToggle}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
          {teacher && <button className="restored-account-chip" type="button" aria-label={`Mở tài khoản ${teacher.name}`} onClick={accountAction || (() => { if (hasAccount) navigate("account"); })} disabled={!accountAction && !hasAccount}>
            <span className="restored-avatar">{initials(teacher.name)}</span><span className="restored-account-copy"><strong>{teacher.name}</strong><small>Gia sư</small></span>
          </button>}
        </div>
      </header>
      <main ref={content} id="restored-page-content" className="restored-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
export default OnlineShell;
