import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Film,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { mockAuth, useTeacherAccount } from "./adapters";
import { useStore, resetDemo } from "./store";
import { Banner, Modal, PageHeader, Status } from "./ui";

export function AuthScreen() {
  const [signup, setSignup] = useState(false);
  const [choose, setChoose] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const login = async () => {
    setLoading(true);
    setError("");
    try {
      await mockAuth.signIn();
    } catch {
      setError(
        "Không mở được tài khoản demo. Hãy cho phép trình duyệt lưu dữ liệu rồi thử lại.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-brand">
          <span className="brand-mark">
            <Sparkles size={22} />
          </span>
          <strong>AI Teaching Copilot</strong>
        </div>
        <Status tone="violet">Không gian dạy học trực tuyến</Status>
        <h1>
          Một nơi để dạy.
          <br />
          Một mạch để học tiếp.
        </h1>
        <p>
          Chuẩn bị buổi học, cùng làm bài và lưu lại điều học sinh đã hiểu —
          trong một phòng học.
        </p>
        <div className="auth-features">
          <div>
            <VideoIcon />
            <span>Phòng giáo viên và học sinh riêng biệt</span>
          </div>
          <div>
            <BookOpen size={20} />
            <span>Đề bài, bảng nháp và minh chứng cùng một nơi</span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <span>Gia sư duyệt trước khi cập nhật hồ sơ</span>
          </div>
        </div>
        <div className="auth-preview">
          <div className="row-between">
            <strong>Buổi học hôm nay</strong>
            <Status tone="green">Sẵn sàng</Status>
          </div>
          <h3>Viète · Từ ví dụ đến tự giải</h3>
          <p>
            <Users size={16} /> Bảo Minh, Gia Huy <span>·</span>{" "}
            <CalendarDays size={16} /> 19:30
          </p>
          <div className="auth-preview-line">
            <Check size={15} /> Đề bài đã chuẩn bị <Check size={15} /> Bảng nháp
            chung
          </div>
        </div>
      </section>
      <section className="auth-form">
        <div className="eyebrow">DÀNH CHO GIÁO VIÊN</div>
        <h2>{signup ? "Tạo không gian dạy học" : "Chào mừng bạn trở lại"}</h2>
        <p>
          {signup
            ? "Bắt đầu với tài khoản Google của bạn."
            : "Đăng nhập để mở lịch dạy và các buổi học."}
        </p>
        <button
          className="button ghost google-button"
          onClick={() => setChoose(true)}
        >
          <span className="google-g" aria-hidden="true">
            G
          </span>
          {signup ? "Đăng ký bằng Google" : "Tiếp tục với Google"}
          <ArrowRight size={18} />
        </button>
        <p className="auth-switch">
          {signup ? "Đã có tài khoản?" : "Lần đầu sử dụng?"}{" "}
          <button className="text-button" onClick={() => setSignup(!signup)}>
            {signup ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </p>
        <div className="auth-demo">
          <Status tone="violet">Bản demo</Status>
          <p>
            Đăng nhập mô phỏng, không kết nối tài khoản Google thật. Dữ liệu
            được lưu trên trình duyệt này.
          </p>
        </div>
        <p className="auth-student-note">
          <GraduationCap size={18} /> Học sinh dùng liên kết buổi học do giáo
          viên cung cấp.
        </p>
      </section>
      {choose && (
        <Modal
          title="Chọn tài khoản demo"
          onClose={() => !loading && setChoose(false)}
        >
          <p className="muted">
            Dùng tài khoản mẫu để khám phá không gian giáo viên.
          </p>
          <button className="demo-account" onClick={login} disabled={loading}>
            <span className="avatar avatar-violet">HN</span>
            <span>
              <strong>Hoàng Nam</strong>
              <small>nam.giasu@example.com</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <p aria-live="polite">
            {loading ? "Đang mở không gian dạy học…" : ""}
          </p>
          {error && <Banner error>{error}</Banner>}
        </Modal>
      )}
    </main>
  );
}
function VideoIcon() {
  return <Film size={20} />;
}
export function AccountPage() {
  const account = useTeacherAccount();
  const { toast } = useStore();
  const [confirm, setConfirm] = useState<"reset" | "logout" | null>(null);
  return (
    <>
      <PageHeader
        title="Tài khoản & dữ liệu demo"
        description="Quản lý không gian giáo viên của bạn."
      />
      <section className="card account-panel">
        <div className="profile-identity">
          <span className="avatar avatar-violet avatar-lg">HN</span>
          <div>
            <h2>{account?.name}</h2>
            <p>{account?.email}</p>
            <Status tone="violet">Google · mô phỏng</Status>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>Đồng bộ buổi học</strong>
            <p>
              Hai tab cùng trình duyệt dùng chung đề, bảng nháp và bài nộp. Mỗi
              học sinh vào bằng liên kết riêng.
            </p>
          </div>
          <Status tone="green">Đang hoạt động</Status>
        </div>
        <div className="settings-row">
          <div>
            <strong>Khôi phục bộ dữ liệu mẫu</strong>
            <p>
              Thay dữ liệu demo hiện tại bằng các buổi 1–1, buổi nhóm, minh
              chứng và bản ghi mẫu.
            </p>
          </div>
          <button
            className="button danger-button"
            onClick={() => setConfirm("reset")}
          >
            Khôi phục mẫu
          </button>
        </div>
        <button
          className="button danger-button"
          onClick={() => setConfirm("logout")}
        >
          Đăng xuất
        </button>
      </section>
      {confirm && (
        <Modal
          title={
            confirm === "reset"
              ? "Khôi phục dữ liệu mẫu?"
              : "Đăng xuất khỏi không gian?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm === "reset"
              ? "Các thay đổi trên bộ demo hiện tại sẽ được thay thế."
              : "Dữ liệu buổi học vẫn được lưu trong trình duyệt này."}
          </p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setConfirm(null)}>
              Hủy
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                if (confirm === "reset") {
                  resetDemo();
                  toast("Đã khôi phục bộ dữ liệu mẫu.");
                } else mockAuth.signOut();
                setConfirm(null);
              }}
            >
              {confirm === "reset" ? "Khôi phục" : "Đăng xuất"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
