import { useState, useRef, useEffect, useId, type ReactNode } from "react";
import {
  Moon,
  Sun,
  LogOut,
  ChevronsUpDown,
  CircleHelp,
  ShieldCheck,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { Modal } from "./ui";

export type UserMenuProps = {
  teacher: { name: string; email?: string };
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onSignOut?: () => void;
  placement?: "up" | "down";
  compact?: boolean;
};

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0] || "")
      .join("")
      .toLocaleUpperCase("vi-VN") || "GV"
  );
}

export function UserMenu({
  teacher,
  theme,
  onThemeToggle,
  onSignOut,
  placement = "up",
  compact = false,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const openHelp = () => {
    setIsOpen(false);
    setHelpOpen(true);
  };

  const handleSignOut = () => {
    setIsOpen(false);
    onSignOut?.();
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // Focus management when menu opens
  useEffect(() => {
    if (isOpen) {
      const firstButton = popoverRef.current?.querySelector<HTMLButtonElement>(
        "button:not([disabled])"
      );
      firstButton?.focus();
    }
  }, [isOpen]);

  // Keyboard navigation within the menu
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!isOpen) {
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const items = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])"
      ) || []
    );
    if (!items.length) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
      items[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setIsOpen(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`restored-user-menu-wrapper${
        placement === "down" ? " restored-user-menu-wrapper--down" : ""
      }${compact ? " restored-user-menu-wrapper--compact" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        className={`restored-user-trigger${
          isOpen ? " is-active" : ""
        }${compact ? " restored-user-trigger--compact" : ""}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Menu người dùng: ${teacher.name}`}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className="restored-avatar">{getInitials(teacher.name)}</span>
        {!compact && (
          <span className="restored-account-copy">
            <strong>{teacher.name}</strong>
            <small>Gia sư</small>
          </span>
        )}
        <span className="restored-user-trigger__chevron" aria-hidden="true">
          <ChevronsUpDown size={15} />
        </span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          id={menuId}
          className={`restored-user-popover restored-user-popover--${placement}`}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {/* Menu Items */}
          <button
            type="button"
            className="restored-user-popover__item"
            role="menuitem"
            onClick={() => onThemeToggle()}
          >
            <span className="restored-user-popover__icon">
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </span>
            <span className="restored-user-popover__item-grow">
              Giao diện: {isDark ? "Tối" : "Sáng"}
            </span>
            <span className="restored-user-popover__tag">
              {isDark ? "Sáng" : "Tối"}
            </span>
          </button>

          <button
            type="button"
            className="restored-user-popover__item"
            role="menuitem"
            onClick={openHelp}
          >
            <span className="restored-user-popover__icon">
              <CircleHelp size={17} />
            </span>
            <span>Hướng dẫn & Trợ giúp</span>
          </button>

          <hr className="restored-user-popover__divider" />

          {onSignOut && (
            <button
              type="button"
              className="restored-user-popover__item restored-user-popover__item--danger"
              role="menuitem"
              onClick={handleSignOut}
            >
              <span className="restored-user-popover__icon">
                <LogOut size={17} />
              </span>
              <span>Đăng xuất</span>
            </button>
          )}
        </div>
      )}

      {/* Help / Guide Dialog */}
      {helpOpen && (
        <Modal
          title="Hướng dẫn AI Teaching Copilot"
          onClose={() => setHelpOpen(false)}
        >
          <div className="restored-help-dialog">
            <div className="restored-help-lead">
              <Sparkles size={20} className="restored-help-lead__icon" />
              <div>
                <strong>Chào mừng bạn đến với AI Teaching Copilot</strong>
                <p>Nền tảng hỗ trợ gia sư dạy kèm trực tuyến với sự trợ giúp của AI an toàn và có kiểm duyệt.</p>
              </div>
            </div>

            <div className="restored-help-list">
              <div className="restored-help-item">
                <div className="restored-help-item__icon-box">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h4>1. Lớp là phòng học cố định</h4>
                  <p>
                    Mỗi lớp học tương ứng với một phòng dạy duy nhất. Bạn chỉ cần bấm <strong>Mở lớp</strong> để vào dạy hoặc tiếp tục buổi học mà không phải tạo buổi lẻ thủ công.
                  </p>
                </div>
              </div>

              <div className="restored-help-item">
                <div className="restored-help-item__icon-box">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4>2. Gia sư luôn giữ quyền duyệt (HITL)</h4>
                  <p>
                    Copilot không tự ý đánh giá hay gửi nhận xét cho học sinh. Các gợi ý nhận định sau buổi hay câu hỏi nhanh từ tài liệu chỉ được lưu khi bạn bấm <strong>Duyệt (Giữ)</strong>.
                  </p>
                </div>
              </div>

              <div className="restored-help-item">
                <div className="restored-help-item__icon-box">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4>3. Tự nhớ trang dừng tài liệu</h4>
                  <p>
                    Khi bạn ghim tài liệu vào lớp, hệ thống ghi nhớ trang dừng của buổi trước để khi mở lớp lần tiếp theo sẽ chiếu tiếp đúng trang đã học.
                  </p>
                </div>
              </div>
            </div>

            <div className="restored-help-footer">
              <button
                type="button"
                className="button primary"
                onClick={() => setHelpOpen(false)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
