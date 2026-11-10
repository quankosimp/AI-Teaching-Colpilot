import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck2,
  GitBranch,
  GraduationCap,
  Layers,
  Lock,
  Moon,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Video,
  XCircle,
  Zap,
} from "lucide-react";
import {
  AsyncPanel,
  FormFeedback,
  type AsyncState,
  type Feedback,
} from "./presentation";
import { Status } from "./ui";
import "./landing-page.css";

export type LandingPageProps = {
  theme: boolean;
  busy: boolean;
  state: AsyncState;
  feedback: Feedback | null;
  isPreviewMode?: boolean;
  onToggleTheme: () => void;
  onGoogleSignIn: () => void;
  onDemoSignIn: (account: "teacher-a" | "teacher-b") => void;
  onRetry: () => void;
  onBackToWorkspace?: () => void;
};

type TourStageId = "plan" | "live" | "review" | "profile";
type HeroModeId = "board" | "handoff" | "copilot";

const TOUR_STAGES: Array<{
  id: TourStageId;
  step: string;
  title: string;
  shortDesc: string;
  badge: string;
  metric: string;
  metricLabel: string;
  headline: string;
  description: string;
  bullets: string[];
  rows: Array<{
    code: string;
    title: string;
    subtitle: string;
    tag: string;
    tone?: "emerald" | "amber";
  }>;
}> = [
  {
    id: "plan",
    step: "Bước 01 · Trước giờ dạy",
    title: "Soạn giáo án cá nhân hóa",
    shortDesc: "Kế thừa lỗ hổng đã duyệt từ buổi trước",
    badge: "SRS PLAN 001–003 · AI 001",
    metric: "8 phút",
    metricLabel: "thay vì 45 phút soạn thủ công",
    headline: "Chuẩn bị giáo án 45–90 phút chỉ trong vài cú nhấp",
    description:
      "Thay vì soạn lại từ đầu, AI Copilot tự động tổng hợp các nhận định đã duyệt (Approved Claims) và khoảng trống kiến thức của từng học sinh trong nhóm 1–5 em để gợi ý cấu trúc hoạt động kèm trang học liệu PDF chính xác.",
    bullets: [
      "Tự động nối mạch bài học từ minh chứng buổi liền kề của từng học sinh.",
      "Gắn trực tiếp trang đề cương Toán 9, phiếu bài tập và phân bổ thời lượng từng hoạt động.",
      "Kiểm tra ràng buộc sĩ số nhóm tối ưu (1–5 học sinh) và loại trừ học sinh đã lưu trữ.",
    ],
    rows: [
      {
        code: "ACT-01",
        title: "Khởi động & Rà soát điều kiện căn thức (15 phút)",
        subtitle: "Tài liệu: Chuyên đề Căn bậc hai · Trang 14 · 3 câu hỏi nhanh",
        tag: "Kế thừa từ #OBS-18",
      },
      {
        code: "ACT-02",
        title: "Hệ thức Vi-ét và bài toán tham số m (40 phút)",
        subtitle: "Trọng tâm củng cố cho Nguyễn Bảo Minh & Trần Hà My",
        tag: "Độ khớp mục tiêu 96%",
        tone: "emerald",
      },
      {
        code: "ACT-03",
        title: "Thực hành trên bảng nháp độc lập & Chốt lỗi sai (20 phút)",
        subtitle: "Thu thập minh chứng tự động cho kỳ duyệt sau buổi học",
        tag: "Chuẩn GDPT 2018",
      },
    ],
  },
  {
    id: "live",
    step: "Bước 02 · Trong phòng học",
    title: "Phòng dạy trực tiếp & Bảng nháp",
    shortDesc: "Video, PDF đồng bộ, bảng vẽ & nộp bài QR",
    badge: "SRS ROOM 001–005 · MAT 001",
    metric: "4-trong-1",
    metricLabel: "Video + PDF + Bảng nháp + Chấm bài QR",
    headline: "Phòng học chuyên biệt cho dạy kèm — không cần chuyển đổi 4 ứng dụng",
    description:
      "Giáo viên trình chiếu học liệu PDF có ghi nhớ trang, quan sát bảng nháp thời gian thực của từng học sinh, nhận ảnh chụp bài làm tay từ điện thoại qua link Handoff và ghi nhận quan sát sư phạm ngay trong luồng giảng dạy.",
    bullets: [
      "Học sinh vào thẳng phòng bằng liên kết riêng (Crypto Token), không cần tạo mật khẩu.",
      "Chế độ Bảng chung cả lớp hoặc Bảng nháp độc lập cho từng em kèm quyền cấp phép linh hoạt.",
      "Ghi nhận quan sát trực tiếp (#Observation) làm nguồn minh chứng chuẩn cho AI sau buổi học.",
    ],
    rows: [
      {
        code: "OBS-204",
        title: "Bảng nháp trực tiếp · Nguyễn Bảo Minh",
        subtitle: "Đang biến đổi Δ = (2m - 2)² - 4(m² - 3) = -8m + 16 ≥ 0 ⇔ m ≤ 2",
        tag: "Đã lưu quan sát #OBS-204",
        tone: "emerald",
      },
      {
        code: "SUB-89",
        title: "Handoff từ điện thoại · Trần Hà My",
        subtitle: "Vừa tải lên ảnh chụp vở bài tập câu 4b (1.4 MB · Đã xác thực chữ ký)",
        tag: "Sẵn sàng chấm trực tiếp",
      },
      {
        code: "AI-HINT",
        title: "Trợ lý AI trong giờ · Gợi ý câu hỏi gợi mở",
        subtitle: "Đề xuất hỏi: 'Khi m = 2 thì phương trình có nghiệm kép bằng bao nhiêu?'",
        tag: "Chỉ hiển thị với Gia sư",
        tone: "amber",
      },
    ],
  },
  {
    id: "review",
    step: "Bước 03 · Sau buổi học",
    title: "Duyệt nhận định có minh chứng",
    shortDesc: "Gia sư kiểm duyệt 100% trước khi lưu hồ sơ",
    badge: "SRS REV 001–004 · AI 003",
    metric: "0% Ảo giác",
    metricLabel: "mọi nhận định bắt buộc có nguồn #OBS",
    headline: "Chống ảo giác AI bằng cơ chế đối chiếu minh chứng bắt buộc",
    description:
      "Sau khi kết thúc buổi dạy, AI Copilot gom các quan sát thực tế thành dự thảo Nhận định (Điểm mạnh / Cần củng cố) và bản tin nhắn phụ huynh. Không một dòng nhận xét nào được phép ghi vào hồ sơ nếu thiếu minh chứng gốc hoặc chưa qua tay giáo viên duyệt.",
    bullets: [
      "Mỗi nhận định bắt buộc liên kết tới ít nhất một quan sát hoạt động hợp lệ (MF-G1-01).",
      "Nếu giáo viên sửa hoặc xóa minh chứng gốc, nhận định phụ thuộc tự động mở lại để xét duyệt (Cascade Invalidation).",
      "Tạo báo cáo tiến độ gửi phụ huynh qua Zalo chỉ trong 30 giây sau khi chốt nhận định.",
    ],
    rows: [
      {
        code: "CLM-09",
        title: "Nhận định #1 · Điểm mạnh mới ghi nhận",
        subtitle: "Nắm chắc điều kiện có nghiệm và biến đổi tổng - tích Vi-ét không sai dấu.",
        tag: "Đã duyệt · Nguồn #OBS-204",
        tone: "emerald",
      },
      {
        code: "CLM-10",
        title: "Nhận định #2 · Khoảng trống cần củng cố",
        subtitle: "Còn quên đối chiếu điều kiện m ≤ 2 sau khi tìm được giá trị tham số.",
        tag: "Chờ Gia sư xác nhận",
        tone: "amber",
      },
      {
        code: "RPT-04",
        title: "Báo cáo gửi Phụ huynh · Tự động tổng hợp",
        subtitle: "Tóm tắt nội dung buổi học, bài tập về nhà và 2 điểm lưu ý cá nhân hóa.",
        tag: "Sẵn sàng sao chép",
      },
    ],
  },
  {
    id: "profile",
    step: "Bước 04 · Tích lũy dài hạn",
    title: "Hồ sơ tri thức học sinh (SRS M02)",
    shortDesc: "Theo dõi tiến bộ xuyên suốt học kỳ",
    badge: "SRS STU 001–005 · M02",
    metric: "Lũy kế 360°",
    metricLabel: "hồ sơ sống làm đầu vào cho buổi kế tiếp",
    headline: "Biến dữ liệu rời rạc thành tài sản sư phạm có giá trị tích lũy",
    description:
      "Mỗi học sinh sở hữu một Hồ sơ Học tập độc lập lưu giữ mục tiêu, điểm mạnh, khoảng trống cần củng cố, lịch sử các buổi học và chuỗi nhận định đã duyệt — tạo nền tảng dữ liệu bền vững cho cả gia sư cá nhân lẫn trung tâm luyện thi.",
    bullets: [
      "Tìm kiếm, phân trang và lọc đa tiêu chí theo khối lớp, môn học, nhóm học và trạng thái.",
      "Cô lập dữ liệu tuyệt đối giữa các học sinh; kiểm soát quyền đồng thuận AI (AI Consent Gate) minh bạch.",
      "Khép kín vòng lặp: Hồ sơ cập nhật hôm nay trở thành đầu vào thông minh cho giáo án buổi tới.",
    ],
    rows: [
      {
        code: "STU-01",
        title: "Hồ sơ: Nguyễn Bảo Minh · Lớp 9 · Ôn thi vào 10",
        subtitle: "Mục tiêu: Đạt 8.5+ Toán kỳ thi tuyển sinh lớp 10 THPT công lập",
        tag: "Đang theo dõi · 12 minh chứng",
        tone: "emerald",
      },
      {
        code: "TRK-09",
        title: "Chuỗi tiến bộ chuyên đề Hàm số & Phương trình bậc hai",
        subtitle: "Đã khắc phục 3/4 lỗ hổng kiến thức được ghi nhận trong 4 tuần qua",
        tag: "Tăng trưởng rõ rệt",
      },
      {
        code: "SEC-AI",
        title: "Quyền riêng tư & Đồng thuận AI (Consent Gate)",
        subtitle: "Đã ghi nhận đồng thuận · Ẩn danh hóa định danh khi xử lý ngữ cảnh",
        tag: "Chuẩn bảo mật dữ liệu",
      },
    ],
  },
];

export function LandingPage({
  theme,
  busy,
  state,
  feedback,
  isPreviewMode = false,
  onToggleTheme,
  onGoogleSignIn,
  onDemoSignIn,
  onRetry,
  onBackToWorkspace,
}: LandingPageProps) {
  const [activeStage, setActiveStage] = useState<TourStageId>("plan");
  const [heroMode, setHeroMode] = useState<HeroModeId>("board");
  const [claimApproved, setClaimApproved] = useState(false);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(14);
  const [groupSize, setGroupSize] = useState(3);

  const progressRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moatBentoRef = useRef<HTMLDivElement>(null);

  // Fallback strategies per modern-web-guidance:
  // 1) scroll-progress-indicator fallback
  // 2) shrinking-header-on-scroll fallback
  // 3) scroll-entry-exit-effects IntersectionObserver fallback
  // 4) interactive-content-reveal pointer spotlight coordinates
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const cleanups: Array<() => void> = [];

    // Spotlight pointer tracking on Moat Bento container (interactive-content-reveal guide)
    const bentoEl = moatBentoRef.current;
    if (bentoEl && !prefersReducedMotion) {
      let rect = bentoEl.getBoundingClientRect();
      const resizeObserver = new ResizeObserver(() => {
        rect = bentoEl.getBoundingClientRect();
      });
      resizeObserver.observe(bentoEl);

      const handlePointerMove = (e: PointerEvent) => {
        if (!rect.width || !rect.height) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        bentoEl.style.setProperty("--mouse-x", `${x}%`);
        bentoEl.style.setProperty("--mouse-y", `${y}%`);
      };

      bentoEl.addEventListener("pointermove", handlePointerMove, { passive: true });
      cleanups.push(() => {
        resizeObserver.disconnect();
        bentoEl.removeEventListener("pointermove", handlePointerMove);
      });
    }

    if (prefersReducedMotion) {
      return () => cleanups.forEach((fn) => fn());
    }

    if (!CSS.supports("animation-timeline", "scroll()")) {
      const handleProgressScroll = () => {
        if (!progressRef.current) return;
        const scrollable =
          document.documentElement.scrollHeight - window.innerHeight;
        const progressPercentage =
          scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        progressRef.current.style.transform = `scaleX(${progressPercentage})`;
      };
      window.addEventListener("scroll", handleProgressScroll, { passive: true });
      cleanups.push(() =>
        window.removeEventListener("scroll", handleProgressScroll)
      );
    }

    if (
      !CSS.supports(
        "(animation-timeline: scroll()) and (animation-range: 0% 100%)"
      )
    ) {
      const initialHeight = 82;
      const finalHeight = 62;
      const scrollDistance = 120;
      const handleHeaderScroll = () => {
        if (!headerRef.current) return;
        const scrollPercent = Math.min(1, Math.max(0, window.scrollY / scrollDistance));
        const newHeight =
          initialHeight - (initialHeight - finalHeight) * scrollPercent;
        headerRef.current.style.height = `${newHeight}px`;
      };
      window.addEventListener("scroll", handleHeaderScroll, { passive: true });
      cleanups.push(() =>
        window.removeEventListener("scroll", handleHeaderScroll)
      );
    }

    if (
      !CSS.supports(
        "(animation-timeline: view()) and (animation-range: entry)"
      ) &&
      rootRef.current
    ) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const ratio = Math.min(1, entry.intersectionRatio * 2.5);
            target.style.opacity = `${0.2 + ratio * 0.8}`;
            target.style.transform = `translateY(${(1 - ratio) * 20}px)`;
          }
        },
        {
          threshold: [0, 0.15, 0.3, 0.5, 1],
        }
      );
      const nodes = rootRef.current.querySelectorAll(".lp-reveal");
      nodes.forEach((el) => observer.observe(el));
      cleanups.push(() => observer.disconnect());
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const selectTourStage = (nextId: TourStageId) => {
    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (docWithVT.startViewTransition && !reduced) {
      docWithVT.startViewTransition(() => {
        setActiveStage(nextId);
      });
    } else {
      setActiveStage(nextId);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const currentStage =
    TOUR_STAGES.find((s) => s.id === activeStage) ?? TOUR_STAGES[0];

  // ROI Calculations
  const hoursSavedPerMonth = Math.round(sessionsPerWeek * 4 * 0.58);
  const evidenceCapturedPerTerm = sessionsPerWeek * 16 * groupSize * 2;
  const revenueMultiplier = (1 + (groupSize - 1) * 0.65).toFixed(1);

  return (
    <div
      ref={rootRef}
      className="lp-root restored-auth-landing"
      data-theme={theme ? "dark" : "light"}
    >
      {/* Decorative Scroll Progress Bar (aria-hidden per scroll-progress-indicator guide) */}
      <div
        ref={progressRef}
        className="lp-scroll-progress"
        aria-hidden="true"
      />

      {/* Ambient Parallax Aurora, Architectural Perspective Grid & Math Constellation Backdrop */}
      <div className="lp-ambient-bg" aria-hidden="true">
        <div className="lp-bg-orb lp-bg-orb--1" />
        <div className="lp-bg-orb lp-bg-orb--2" />
        <div className="lp-bg-orb lp-bg-orb--3" />
        <div className="lp-bg-grid" />
        <svg
          className="lp-bg-constellation"
          viewBox="0 0 1440 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="lpBeam1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.26" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lpBeam2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#db2777" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Sweeping Mathematical Curves */}
          <path
            d="M -120 680 C 320 240, 820 820, 1560 180"
            stroke="url(#lpBeam1)"
            strokeWidth="2"
          />
          <path
            d="M -80 220 C 480 660, 960 60, 1540 540"
            stroke="url(#lpBeam2)"
            strokeWidth="1.75"
            strokeDasharray="6 8"
          />
          {/* Orbital Rings around Hero Right Stage */}
          <circle
            cx="1060"
            cy="370"
            r="290"
            stroke="url(#lpBeam1)"
            strokeWidth="1.2"
            strokeDasharray="4 8"
          />
          <circle
            cx="1060"
            cy="370"
            r="390"
            stroke="url(#lpBeam2)"
            strokeWidth="1"
          />
          {/* Constellation Nodes */}
          <circle cx="240" cy="180" r="3.5" fill="currentColor" fillOpacity="0.28" />
          <circle cx="710" cy="130" r="4" fill="#06b6d4" fillOpacity="0.35" />
          <circle cx="1290" cy="190" r="4.5" fill="#db2777" fillOpacity="0.32" />
          <circle cx="660" cy="520" r="3.5" fill="currentColor" fillOpacity="0.25" />
          <circle cx="1340" cy="640" r="4" fill="#06b6d4" fillOpacity="0.3" />
        </svg>
      </div>

      {/* Shrinking Fixed Glassmorphic Header */}
      <header ref={headerRef} className="lp-header">
        <a href="#lp-top" className="lp-brand">
          <span className="lp-brand-mark" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <span className="lp-brand-copy">
            <strong>AI Teaching Copilot</strong>
            <small>EdTech Operating System · SRS v2.4</small>
          </span>
        </a>

        <nav className="lp-nav" aria-label="Điều hướng trang giới thiệu">
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => scrollToSection("lp-thesis")}
          >
            Điểm nghẽn & Giải pháp
          </button>
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => scrollToSection("lp-workflow")}
          >
            Vòng lặp 4 bước
          </button>
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => scrollToSection("lp-moat")}
          >
            Kiến trúc Minh chứng
          </button>
          <button
            type="button"
            className="lp-nav-link"
            onClick={() => scrollToSection("lp-roi")}
          >
            Bài toán Hiệu quả (ROI)
          </button>
        </nav>

        <div className="lp-header-actions">
          <button
            type="button"
            className="lp-theme-btn"
            onClick={onToggleTheme}
          >
            {theme ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme ? "Giao diện Sáng" : "Giao diện Tối"}</span>
          </button>
          {isPreviewMode && onBackToWorkspace ? (
            <button
              type="button"
              className="lp-cta-btn"
              onClick={onBackToWorkspace}
            >
              <span>Vào Trang chủ</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="lp-cta-btn"
              disabled={busy}
              onClick={() => onDemoSignIn("teacher-a")}
            >
              <Play size={14} />
              <span>Trải nghiệm Demo Ngay</span>
            </button>
          )}
        </div>
      </header>

      <main id="lp-top">
        {/* HERO SECTION */}
        <section className="lp-hero">
          <div className="lp-hero-left">
            <div className="lp-pitch-badge-row">
              <div className="lp-eyebrow-pill">
                <span className="lp-pulse-dot" aria-hidden="true" />
                <span>HỆ ĐIỀU HÀNH AI CHO DẠY KÈM CÁ NHÂN HÓA (1–5 HỌC SINH)</span>
              </div>
              <span className="lp-seed-tag">LIVE PRODUCT DEMO</span>
            </div>

            <h1 className="lp-hero-title">
              Biến mỗi buổi dạy kèm thành{" "}
              <span className="lp-gradient-text">
                trí thức tích lũy có minh chứng.
              </span>
            </h1>

            <p className="lp-hero-subtitle">
              Thay thế chuỗi công cụ rời rạc (Zoom + Zalo + Drive + Sổ tay) bằng một
              không gian dạy học duy nhất: Soạn giáo án AI kế thừa lỗ hổng cũ, giải bài
              trên bảng nháp 2 chiều và đóng dấu nhận định năng lực chuẩn hóa sau mỗi buổi.
            </p>

            {/* Quick Value Metrics Strip in Hero */}
            <div className="lp-hero-metrics">
              <div className="lp-hero-metric-item">
                <strong>−70%</strong>
                <span>Thời gian soạn bài & viết báo cáo</span>
              </div>
              <div className="lp-hero-metric-divider" aria-hidden="true" />
              <div className="lp-hero-metric-item">
                <strong>100%</strong>
                <span>Nhận định AI có minh chứng gốc</span>
              </div>
              <div className="lp-hero-metric-divider" aria-hidden="true" />
              <div className="lp-hero-metric-item">
                <strong>2.3×</strong>
                <span>Biên lợi nhuận nhờ dạy nhóm 3–5 em</span>
              </div>
            </div>

            {/* Instant Investor Demo & Teacher Auth Card */}
            <div className="lp-auth-box" id="lp-auth-card">
              <div className="lp-auth-box-header">
                <div>
                  <div className="lp-auth-eyebrow">
                    TRẢI NGHIỆM TRỰC TIẾP SẢN PHẨM SỐNG (1-CLICK SANDBOX)
                  </div>
                  <h2>Khám phá Không gian Giáo viên kèm dữ liệu mẫu Lớp 9</h2>
                </div>
                <Status tone="violet">Sẵn sàng Pitching</Status>
              </div>

              <FormFeedback saving={busy} error={feedback} />

              {state === "loading" ? (
                <AsyncPanel state="loading" />
              ) : (
                <>
                  <div className="lp-auth-grid">
                    <button
                      type="button"
                      className="demo-account is-featured"
                      aria-label="Demo Hoàng Nam"
                      disabled={busy}
                      onClick={() => onDemoSignIn("teacher-a")}
                    >
                      <span className="avatar avatar-violet">HN</span>
                      <span>
                        <strong>
                          Demo Hoàng Nam{" "}
                          <em className="lp-rec-pill">Khuyên dùng</em>
                        </strong>
                        <small>4 lớp học · 6 hồ sơ · 8 đề PDF Lớp 9</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>

                    <button
                      type="button"
                      className="demo-account"
                      aria-label="Demo Mai An"
                      disabled={busy}
                      onClick={() => onDemoSignIn("teacher-b")}
                    >
                      <span className="avatar avatar-blue">MA</span>
                      <span>
                        <strong>Demo Mai An</strong>
                        <small>Tài khoản đối chứng cô lập dữ liệu</small>
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="lp-google-btn google-button"
                    disabled={busy}
                    onClick={onGoogleSignIn}
                  >
                    <span className="lp-google-left">
                      <span className="lp-google-g" aria-hidden="true">
                        G
                      </span>
                      <span>Đăng nhập bằng Google (Dành cho Giáo viên thực tế)</span>
                    </span>
                    <ArrowRight size={16} />
                  </button>

                  {state === "error" && (
                    <button
                      type="button"
                      className="button"
                      style={{ marginTop: 10 }}
                      onClick={onRetry}
                    >
                      Thử kết nối lại
                    </button>
                  )}
                </>
              )}

              <div className="lp-auth-foot">
                <span>
                  <GraduationCap size={15} aria-hidden="true" />
                  Học sinh vào thẳng phòng học bằng liên kết định danh riêng (không cần tạo tài khoản).
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Classroom & Copilot Cockpit */}
          <div className="lp-stage-wrap">
            <div className="lp-stage-card">
              <div className="lp-stage-topbar">
                <div className="lp-stage-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="lp-stage-room-title">
                  <Video size={14} aria-hidden="true" />
                  <span>Phòng dạy: Toán 9 · Ôn thi vào 10</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <span className="lp-topbar-shield">
                    <ShieldCheck size={12} aria-hidden="true" />
                    Evidence-Gated
                  </span>
                  <span className="lp-live-pill">
                    <span className="lp-pulse-dot" style={{ background: "#ef4444" }} />
                    LIVE · 42:18
                  </span>
                </div>
              </div>

              {/* Interactive Mode Switcher inside Stage */}
              <div className="lp-stage-Subbar">
                <div className="lp-stage-modes" role="tablist" aria-label="Chế độ xem phòng học mẫu">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={heroMode === "board"}
                    className={`lp-stage-mode-btn ${heroMode === "board" ? "is-on" : ""}`}
                    onClick={() => setHeroMode("board")}
                  >
                    1. Bảng nháp
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={heroMode === "handoff"}
                    className={`lp-stage-mode-btn ${heroMode === "handoff" ? "is-on" : ""}`}
                    onClick={() => setHeroMode("handoff")}
                  >
                    2. Nộp bài QR
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={heroMode === "copilot"}
                    className={`lp-stage-mode-btn ${heroMode === "copilot" ? "is-on" : ""}`}
                    onClick={() => setHeroMode("copilot")}
                  >
                    3. Duyệt AI
                  </button>
                </div>

                <div className="lp-stage-avatars" title="3 học sinh đang trực tuyến">
                  <span className="lp-mini-av is-speaking">BM</span>
                  <span className="lp-mini-av">HM</span>
                  <span className="lp-mini-av">QK</span>
                  <small>3/3 có mặt</small>
                </div>
              </div>

              <div className="lp-stage-body">
                {/* Left Pane of Cockpit: Dynamic by heroMode */}
                <div className="lp-board-pane">
                  {heroMode === "board" && (
                    <>
                      <div>
                        <div className="lp-board-header">
                          <span>BẢNG NHÁP ĐỒNG BỘ · NGUYỄN BẢO MINH</span>
                          <span className="lp-board-page-pill">Đề cương Tr.14/32</span>
                        </div>

                        <svg
                          className="lp-math-svg"
                          viewBox="0 0 280 144"
                          role="img"
                          aria-label="Đồ thị parabol y = x² - 2x - 3 và đường thẳng cắt tại 2 nghiệm phân biệt"
                        >
                          <defs>
                            <linearGradient id="lpCurveGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#6366f1" />
                              <stop offset="100%" stopColor="#06b6d4" />
                            </linearGradient>
                          </defs>
                          {/* Subtle coordinate grid */}
                          <line x1="20" y1="35" x2="260" y2="35" stroke="#e2e8f0" strokeWidth="0.7" strokeDasharray="2 3" />
                          <line x1="20" y1="115" x2="260" y2="115" stroke="#e2e8f0" strokeWidth="0.7" strokeDasharray="2 3" />
                          <line x1="20" y1="75" x2="260" y2="75" stroke="#94a3b8" strokeWidth="1.2" />
                          <line x1="125" y1="12" x2="125" y2="134" stroke="#94a3b8" strokeWidth="1.2" />
                          {/* Secant line */}
                          <line
                            x1="45"
                            y1="95"
                            x2="235"
                            y2="42"
                            stroke="#ec4899"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                          />
                          {/* Animated Parabola */}
                          <path
                            className="lp-parabola-path"
                            d="M 55 18 Q 145 168 235 18"
                            fill="none"
                            stroke="url(#lpCurveGrad)"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                          />
                          {/* Intersection points */}
                          <circle cx="83" cy="84" r="5" fill="#10b981" />
                          <circle cx="198" cy="52" r="5" fill="#10b981" />
                          <text x="62" y="104" fontSize="10.5" fontWeight="800" fill="#10b981">
                            x₁ = -1
                          </text>
                          <text x="204" y="56" fontSize="10.5" fontWeight="800" fill="#10b981">
                            x₂ = 2m+1
                          </text>
                        </svg>
                      </div>

                      <div className="lp-board-formula">
                        <span>Biến đổi trực tiếp:</span>
                        <code>x₁ + x₂ = 2(m - 1), x₁·x₂ = m² - 3</code>
                      </div>
                    </>
                  )}

                  {heroMode === "handoff" && (
                    <div className="lp-handoff-sim">
                      <div className="lp-board-header">
                        <span>BÀI NỘP TỪ ĐIỆN THOẠI · TRẦN HÀ MY</span>
                        <span className="lp-board-page-pill">Đã xác thực Token</span>
                      </div>
                      <div className="lp-handoff-card">
                        <div className="lp-handoff-qr">
                          <QrCode size={34} />
                          <small>QR Handoff</small>
                        </div>
                        <div className="lp-handoff-steps">
                          <strong>Ảnh chụp vở bài tập Câu 4b (Hình học)</strong>
                          <p>
                            Chứng minh tứ giác nội tiếp đường tròn (O) và suy ra hệ thức
                            góc nội tiếp chắn cung AB.
                          </p>
                          <div className="lp-handoff-Annotation">
                            ✓ Gia sư đã khoanh đỏ bước thiếu điều kiện góc đối bù nhau
                          </div>
                        </div>
                      </div>
                      <div className="lp-board-formula">
                        <span>Nguồn minh chứng tự động:</span>
                        <code>#SUB-89 · BaiLam (Đã chấm)</code>
                      </div>
                    </div>
                  )}

                  {heroMode === "copilot" && (
                    <div className="lp-handoff-sim">
                      <div className="lp-board-header">
                        <span>SỔ NHẬN ĐỊNH SAU BUỔI · CHỜ GIA SƯ DUYỆT</span>
                        <span className="lp-board-page-pill">HITL Gate</span>
                      </div>
                      <div className="lp-copilot-sim-list">
                        <div className="lp-copilot-sim-item is-ok">
                          <span>Làm tốt</span>
                          <p>Biến đổi hệ thức Vi-ét chính xác, không nhầm dấu</p>
                          <small>#OBS-204</small>
                        </div>
                        <div className="lp-copilot-sim-item is-warn">
                          <span>Ôn lại</span>
                          <p>Quên đối chiếu điều kiện Δ ≥ 0 sau khi giải tìm m</p>
                          <small>#SUB-89</small>
                        </div>
                      </div>
                      <div className="lp-board-formula">
                        <span>Trạng thái:</span>
                        <code>Chỉ lưu vào M02 khi Gia sư bấm Giữ</code>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Pane of Cockpit: AI Copilot Observation & Approval Gate */}
                <div className="lp-copilot-pane">
                  <div className="lp-copilot-head">
                    <span>AI COPILOT · ĐỐI CHIẾU MINH CHỨNG</span>
                    <Sparkles size={15} aria-hidden="true" />
                  </div>

                  <div className="lp-claim-card">
                    <div className="lp-claim-meta">
                      <span>Dự thảo Nhận định #CLM-09</span>
                      <span>Nguồn: #OBS-204</span>
                    </div>
                    <strong>
                      Bảo Minh vận dụng đúng hệ thức Vi-ét để biểu diễn tổng và tích
                      hai nghiệm theo tham số m.
                    </strong>
                    <div className="lp-claim-actions">
                      <button
                        type="button"
                        className={`lp-mini-btn ${claimApproved ? "approved" : "primary"}`}
                        onClick={() => setClaimApproved((prev) => !prev)}
                      >
                        <CheckCircle2 size={13} aria-hidden="true" />
                        <span>
                          {claimApproved
                            ? "Đã duyệt vào Hồ sơ M02"
                            : "Bấm thử: Duyệt nhận định"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="lp-mastery-bar-wrap">
                    <div className="lp-mastery-top">
                      <span>Mức độ nắm vững Chuyên đề Vi-ét</span>
                      <span style={{ color: "var(--lp-brand-emerald)" }}>
                        {claimApproved ? "86% (+14%)" : "72%"}
                      </span>
                    </div>
                    <div className="lp-mastery-track">
                      <div
                        className="lp-mastery-fill"
                        style={{
                          transform: `scaleX(${claimApproved ? 0.86 : 0.72})`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="lp-trace-chain">
                    <span>Chuỗi truy vết:</span>
                    <code>#OBS-204 → #CLM-09 → M02</code>
                  </div>
                </div>
              </div>

              <div className="lp-stage-footer">
                <div className="lp-roster-chips">
                  <span className="lp-roster-chip">
                    <Users size={13} aria-hidden="true" />
                    Nhóm 3/5 học sinh: Bảo Minh · Hà My · Quốc Khánh
                  </span>
                  <span className="lp-roster-chip">
                    <FileCheck2 size={13} aria-hidden="true" />
                    Đã đồng bộ kho tài liệu Lớp 9
                  </span>
                </div>
                <span className="lp-stage-try-hint">
                  Bấm chuyển tab hoặc duyệt thử ↑
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: INVESTOR THESIS & BEFORE/AFTER PARADIGM SHIFT */}
        <section id="lp-thesis" className="lp-section lp-reveal">
          <div className="lp-section-header">
            <span className="lp-eyebrow-pill">BỨC TRANH THỊ TRƯỜNG & ĐIỂM NGHẼN DẠY KÈM</span>
            <h2>
              Tại sao 90% dữ liệu sư phạm quý giá bị thất thoát sau mỗi giờ dạy kèm?
            </h2>
            <p>
              Gia sư hiện nay phải ghép nối thủ công Zoom, Zalo, Google Drive và sổ ghi
              chép. Khi buổi học kết thúc, mọi nét nháp, lỗi sai và nhận xét bị trôi mất —
              khiến việc dạy kèm không thể mở rộng quy mô mà vẫn giữ chất lượng cá nhân hóa.
            </p>
          </div>

          {/* Before vs After Comparison Matrix for Pitching */}
          <div className="lp-compare-grid">
            <article className="lp-compare-card is-old">
              <div className="lp-compare-head">
                <span className="lp-compare-badge is-bad">
                  <XCircle size={15} /> Mô hình Dạy kèm Phân mảnh Hiện tại
                </span>
                <small>4 công cụ rời rạc · Mất dấu dữ liệu</small>
              </div>
              <ul className="lp-compare-list" role="list">
                <li>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Ghép nối thủ công Zoom + Zalo + Drive + Sổ tay</strong>
                    <span>Mất 10–15 phút đầu giờ chỉ để gửi lại link phòng, tìm file PDF và chờ học sinh chụp bài qua Zalo.</span>
                  </div>
                </li>
                <li>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Trí nhớ sư phạm đứt gãy sau mỗi buổi học</strong>
                    <span>Không nhớ chính xác tuần trước từng em trong nhóm 3–5 học sinh sai ở bước biến đổi nào.</span>
                  </div>
                </li>
                <li>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Rủi ro AI tự bịa nhận xét (Hallucination)</strong>
                    <span>Dùng ChatGPT chung chung tạo nhận xét không gắn với bài làm thực tế, dễ mất uy tín với phụ huynh.</span>
                  </div>
                </li>
              </ul>
            </article>

            <article className="lp-compare-card is-new">
              <div className="lp-compare-head">
                <span className="lp-compare-badge is-good">
                  <CheckCircle2 size={15} /> Hệ điều hành AI Teaching Copilot
                </span>
                <small>1 phòng học cố định · Hồ sơ M02 tích lũy</small>
              </div>
              <ul className="lp-compare-list" role="list">
                <li>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>Lớp học là Phòng cố định — Mở lớp 1 chạm</strong>
                    <span>Học sinh vào thẳng bằng link định danh riêng; tài liệu PDF tự mở đúng trang buổi trước đang dừng.</span>
                  </div>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>Tự động bắt minh chứng ngay trong luồng dạy</strong>
                    <span>Mỗi lần chấm bài nộp hoặc nhận xét câu hỏi nhanh tự động sinh minh chứng gắn đúng tên học sinh.</span>
                  </div>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>100% Nhận định có nguồn & Gia sư phê duyệt (HITL)</strong>
                    <span>AI chỉ tóm tắt từ minh chứng có thật; gia sư bấm Giữ / Sửa / Bỏ trong 30 giây để cập nhật Hồ sơ M02.</span>
                  </div>
                </li>
              </ul>
            </article>
          </div>

          <div className="lp-kpi-grid">
            <article className="lp-kpi-card">
              <div className="lp-kpi-value">3.2×</div>
              <div className="lp-kpi-title">Tốc độ chuẩn bị & tổng kết</div>
              <p className="lp-kpi-desc">
                Rút ngắn thời gian soạn giáo án cá nhân hóa và viết báo cáo phụ huynh từ
                45 phút xuống dưới 8 phút mỗi ca dạy.
              </p>
            </article>

            <article className="lp-kpi-card">
              <div className="lp-kpi-value">100%</div>
              <div className="lp-kpi-title">Nhận định gắn minh chứng gốc</div>
              <p className="lp-kpi-desc">
                Loại bỏ hoàn toàn rủi ro AI tự suy diễn: mọi nhận định năng lực đều bắt buộc
                trỏ về quan sát thực tế (#Observation) trong buổi học.
              </p>
            </article>

            <article className="lp-kpi-card">
              <div className="lp-kpi-value">1 → 5</div>
              <div className="lp-kpi-title">Mở rộng quy mô nhóm tối ưu</div>
              <p className="lp-kpi-desc">
                Giúp gia sư 1-kèm-1 tự tin vận hành lớp nhóm nhỏ 3–5 học sinh mà vẫn theo
                sát từng lỗ hổng kiến thức riêng biệt của mỗi em.
              </p>
            </article>

            <article className="lp-kpi-card">
              <div className="lp-kpi-value">71+</div>
              <div className="lp-kpi-title">Nguồn học liệu chuẩn tích hợp</div>
              <p className="lp-kpi-desc">
                Sẵn sàng kho SGK, Chuyên đề bồi dưỡng, Phiếu bài tập và Đề thi thử vào 10
                gắn trực tiếp vào từng hoạt động giảng dạy.
              </p>
            </article>
          </div>
        </section>

        {/* SECTION 2: INTERACTIVE 4-STAGE PEDAGOGICAL LOOP */}
        <section id="lp-workflow" className="lp-section lp-reveal">
          <div className="lp-section-header">
            <span className="lp-eyebrow-pill">KIẾN TRÚC SẢN PHẨM KHÉP KÍN</span>
            <h2>Một vòng lặp sư phạm liền mạch từ Soạn bài đến Hồ sơ Tri thức</h2>
            <p>
              Nhấp vào từng giai đoạn bên dưới để xem cách AI Teaching Copilot đồng hành
              cùng giáo viên trước, trong và sau mỗi buổi học.
            </p>
          </div>

          <div className="lp-tour-tabs" role="tablist" aria-label="Các giai đoạn của vòng lặp sư phạm">
            {TOUR_STAGES.map((stage, idx) => {
              const active = stage.id === activeStage;
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`lp-tour-tab${active ? " is-active" : ""}`}
                  onClick={() => selectTourStage(stage.id)}
                >
                  <div className="lp-tour-tab-top">
                    <span className="lp-tour-step">{stage.step}</span>
                    <span className="lp-tour-idx">0{idx + 1}</span>
                  </div>
                  <strong>{stage.title}</strong>
                  <small>{stage.shortDesc}</small>
                </button>
              );
            })}
          </div>

          <div className="lp-tour-panel" role="tabpanel">
            <div className="lp-tour-copy">
              <div className="lp-tour-badge-row">
                <span className="lp-badge">{currentStage.badge}</span>
                <span className="lp-tour-metric-pill">
                  <Clock size={13} /> <strong>{currentStage.metric}</strong> · {currentStage.metricLabel}
                </span>
              </div>
              <h3>{currentStage.headline}</h3>
              <p>{currentStage.description}</p>
              <ul className="lp-tour-bullets" role="list">
                {currentStage.bullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="lp-cta-btn"
                disabled={busy}
                onClick={() =>
                  isPreviewMode && onBackToWorkspace
                    ? onBackToWorkspace()
                    : onDemoSignIn("teacher-a")
                }
              >
                <Zap size={16} aria-hidden="true" />
                <span>Trải nghiệm trực tiếp luồng này trong Demo</span>
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="lp-tour-preview">
              <div className="lp-tour-preview-head">
                <span>MÔ PHỎNG DỮ LIỆU THỰC TẾ TRONG HỆ THỐNG</span>
                <code>{currentStage.id.toUpperCase()}_PIPELINE</code>
              </div>
              {currentStage.rows.map((row) => (
                <div key={row.title} className="lp-preview-row">
                  <div className="lp-preview-row-left">
                    <span className="lp-preview-code">{row.code}</span>
                    <div>
                      <strong>{row.title}</strong>
                      <small>{row.subtitle}</small>
                    </div>
                  </div>
                  <span className={`lp-badge ${row.tone ?? ""}`}>{row.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 3: DEFENSIBLE TECHNICAL MOAT WITH INTERACTIVE SPOTLIGHT REVEAL */}
        <section id="lp-moat" className="lp-section lp-reveal">
          <div className="lp-section-header">
            <span className="lp-eyebrow-pill">LỢI THẾ CẠNH TRANH & HÀNG RÀO CÔNG NGHỆ</span>
            <h2>Thiết kế chuyên sâu cho Giáo dục — Vượt xa các công cụ Chat AI thông thường</h2>
            <p>
              Sản phẩm được xây dựng trên kiến trúc kiểm soát trạng thái nghiêm ngặt (Contract-First
              & Evidence-Gated AI), giải quyết triệt để bài toán niềm tin của giáo viên và phụ huynh.
            </p>
          </div>

          <div ref={moatBentoRef} className="lp-moat-bento">
            {/* Interactive Pointer Spotlight Overlay (interactive-content-reveal guide) */}
            <div className="lp-moat-spotlight" aria-hidden="true" />

            {/* Architecture Pipeline Banner inside Bento */}
            <div className="lp-arch-banner">
              <div className="lp-arch-head">
                <span>
                  <Cpu size={15} /> KIẾN TRÚC ĐỐI CHIẾU MINH CHỨNG ĐỘC QUYỀN (EVIDENCE-GATED PIPELINE)
                </span>
                <small>Di chuột trên vùng này để xem hiệu ứng Spotlight kiến trúc</small>
              </div>
              <div className="lp-arch-nodes">
                <div className="lp-arch-node">
                  <code>01 · CAPTURE</code>
                  <strong>Quan sát & Bài làm</strong>
                  <span>Bảng nháp, ảnh chụp QR, câu trả lời nhanh</span>
                </div>
                <GitBranch size={18} className="lp-arch-arrow" aria-hidden="true" />
                <div className="lp-arch-node">
                  <code>02 · SYNTHESIZE</code>
                  <strong>AI Soạn Nháp Có Nguồn</strong>
                  <span>Gắn mã #OBS bắt buộc cho từng dòng nhận định</span>
                </div>
                <GitBranch size={18} className="lp-arch-arrow" aria-hidden="true" />
                <div className="lp-arch-node is-highlight">
                  <code>03 · HITL GATE</code>
                  <strong>Gia sư Duyệt 1 Chạm</strong>
                  <span>Giữ / Sửa / Bỏ — Chặn 100% ảo giác AI</span>
                </div>
                <GitBranch size={18} className="lp-arch-arrow" aria-hidden="true" />
                <div className="lp-arch-node">
                  <code>04 · COMPOUND</code>
                  <strong>Hồ sơ Tri thức M02</strong>
                  <span>Tự động nuôi dữ liệu cho giáo án buổi sau</span>
                </div>
              </div>
            </div>

            <div className="lp-moat-grid">
              <article className="lp-moat-card">
                <div className="lp-moat-icon">
                  <ShieldCheck size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="lp-moat-tag">RULE MF-G1-01 · HUMAN-IN-THE-LOOP</span>
                  <h3>Cổng kiểm duyệt Giáo viên (Teacher-in-the-Loop Gate)</h3>
                  <p>
                    AI Copilot chỉ đóng vai trò trợ lý tổng hợp và đề xuất. Mọi nhận định về
                    điểm mạnh hay lỗ hổng kiến thức đều phải được gia sư phê duyệt trước khi
                    đi vào hồ sơ chính thức hoặc gợi ý cho buổi học kế tiếp.
                  </p>
                </div>
              </article>

              <article className="lp-moat-card">
                <div className="lp-moat-icon">
                  <Layers size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="lp-moat-tag">RULE MF-G1-02 · CASCADE INVALIDATION</span>
                  <h3>Tự động đối chiếu & Vô hiệu hóa dây chuyền</h3>
                  <p>
                    Khi một minh chứng quan sát trong buổi học được giáo viên chỉnh sửa hoặc
                    thu hồi, hệ thống tự động mở lại trạng thái xét duyệt của các nhận định
                    phụ thuộc — đảm bảo tính chính xác tuyệt đối của hồ sơ học tập.
                  </p>
                </div>
              </article>

              <article className="lp-moat-card">
                <div className="lp-moat-icon">
                  <Lock size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="lp-moat-tag">ZERO-LEAKAGE · AI CONSENT GATE</span>
                  <h3>Cô lập dữ liệu đa tầng & Quyền đồng thuận AI</h3>
                  <p>
                    Màn hình phòng học của học sinh được lọc nghiêm ngặt để không bao giờ lộ
                    ghi chú riêng của giáo viên hay nhận xét của bạn cùng lớp. Dữ liệu định
                    danh được ẩn danh hóa trước khi gửi tới mô hình ngôn ngữ.
                  </p>
                </div>
              </article>

              <article className="lp-moat-card">
                <div className="lp-moat-icon">
                  <TrendingUp size={22} aria-hidden="true" />
                </div>
                <div>
                  <span className="lp-moat-tag">MULTI-TENANT · B2C TO B2B SCALE</span>
                  <h3>Sẵn sàng mở rộng từ Gia sư Độc lập tới Chuỗi Trung tâm</h3>
                  <p>
                    Kiến trúc Multi-tenant cô lập từng giáo viên, tích hợp sẵn bộ công cụ
                    quản lý lớp, lịch dạy định kỳ, kho học liệu số và xuất báo cáo chuẩn hóa
                    giúp tăng tỷ lệ giữ chân học sinh (Retention Rate) vượt trội.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* SECTION 4: INTERACTIVE ROI & UNIT ECONOMICS SIMULATOR */}
        <section id="lp-roi" className="lp-section lp-reveal">
          <div className="lp-section-header">
            <span className="lp-eyebrow-pill">BÀI TOÁN HIỆU QUẢ ĐẦU TƯ (UNIT ECONOMICS)</span>
            <h2>Mô phỏng Hiệu suất Vận hành cho Gia sư & Trung tâm Luyện thi</h2>
            <p>
              Điều chỉnh quy mô ca dạy mỗi tuần và sĩ số nhóm để ước tính thời gian tiết kiệm
              cùng giá trị dữ liệu sư phạm tích lũy được.
            </p>
          </div>

          <div className="lp-roi-card">
            <div className="lp-roi-controls">
              <div className="lp-roi-preset-bar">
                <span>Cấu hình nhanh:</span>
                <button
                  type="button"
                  className={`lp-preset-chip ${sessionsPerWeek === 8 && groupSize === 1 ? "is-on" : ""}`}
                  onClick={() => { setSessionsPerWeek(8); setGroupSize(1); }}
                >
                  Gia sư Bán thời gian (1–1)
                </button>
                <button
                  type="button"
                  className={`lp-preset-chip ${sessionsPerWeek === 14 && groupSize === 3 ? "is-on" : ""}`}
                  onClick={() => { setSessionsPerWeek(14); setGroupSize(3); }}
                >
                  Gia sư Chuyên nghiệp (Nhóm 3)
                </button>
                <button
                  type="button"
                  className={`lp-preset-chip ${sessionsPerWeek === 28 && groupSize === 5 ? "is-on" : ""}`}
                  onClick={() => { setSessionsPerWeek(28); setGroupSize(5); }}
                >
                  Lớp Luyện thi Cấp tốc (Nhóm 5)
                </button>
              </div>

              <div className="lp-slider-group">
                <label className="lp-slider-label" htmlFor="lp-sessions-range">
                  <span>Số buổi dạy mỗi tuần</span>
                  <strong>{sessionsPerWeek} buổi / tuần</strong>
                </label>
                <input
                  id="lp-sessions-range"
                  type="range"
                  className="lp-range"
                  min={4}
                  max={36}
                  step={2}
                  value={sessionsPerWeek}
                  onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
                />
              </div>

              <div className="lp-slider-group" style={{ marginBottom: 0 }}>
                <label className="lp-slider-label" htmlFor="lp-group-range">
                  <span>Quy mô nhóm học tối ưu (1–5 học sinh)</span>
                  <strong>{groupSize} học sinh / nhóm</strong>
                </label>
                <input
                  id="lp-group-range"
                  type="range"
                  className="lp-range"
                  min={1}
                  max={5}
                  step={1}
                  value={groupSize}
                  onChange={(e) => setGroupSize(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="lp-roi-outputs">
              <div className="lp-roi-stat is-featured">
                <span>Thời gian soạn bài & báo cáo tiết kiệm</span>
                <strong>{hoursSavedPerMonth} giờ/tháng</strong>
                <small>Tương đương ~{Math.round(hoursSavedPerMonth / 2)} ca dạy tăng thêm mỗi tháng</small>
              </div>

              <div className="lp-roi-stat">
                <span>Minh chứng học tập chuẩn hóa / học kỳ</span>
                <strong>{evidenceCapturedPerTerm.toLocaleString("vi-VN")}+</strong>
                <small>Lưu trữ tự động trong Hồ sơ học sinh M02</small>
              </div>

              <div className="lp-roi-stat">
                <span>Hệ số hiệu quả doanh thu / giờ dạy</span>
                <strong>{revenueMultiplier}×</strong>
                <small>Nhờ dạy nhóm nhỏ mà vẫn cá nhân hóa 1-kèm-1</small>
              </div>

              <div className="lp-roi-stat">
                <span>Thời gian chốt báo cáo phụ huynh</span>
                <strong>&lt; 60 giây</strong>
                <small>Tự động đối chiếu từ nhận định đã duyệt</small>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER CTA */}
        <footer className="lp-footer">
          <div className="lp-footer-banner">
            <div>
              <span className="lp-footer-tag">SẴN SÀNG TRÌNH DIỄN TRỰC TIẾP (LIVE DEMO)</span>
              <h2>Sẵn sàng trải nghiệm tương lai của dạy kèm cá nhân hóa?</h2>
              <p>
                Khởi chạy ngay tài khoản Giáo viên mẫu để kiểm thử toàn bộ luồng Lớp học,
                Kho tài liệu Lớp 9, Phòng dạy trực tiếp và Hồ sơ Học sinh theo chuẩn SRS.
              </p>
            </div>
            <div className="lp-footer-actions">
              {isPreviewMode && onBackToWorkspace ? (
                <button
                  type="button"
                  className="lp-cta-btn"
                  onClick={onBackToWorkspace}
                >
                  <span>Vào Trang chủ Ngay</span>
                  <ArrowRight size={17} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="lp-cta-btn"
                    disabled={busy}
                    onClick={() => onDemoSignIn("teacher-a")}
                  >
                    <Play size={16} />
                    <span>Vào Demo Hoàng Nam Ngay</span>
                  </button>
                  <button
                    type="button"
                    className="lp-theme-btn"
                    disabled={busy}
                    onClick={onGoogleSignIn}
                  >
                    <span>Đăng nhập vào Trang chủ</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default LandingPage;
