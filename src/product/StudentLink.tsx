import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Camera, Check, Clock, LogOut, Send, Sparkles, X } from "lucide-react";
import "./room.css";
import "./student-link.css";

/*
 * Trang học sinh không cần đăng nhập:
 *  - ?link=…    link cố định của từng em (vào lớp khi đến giờ, hoặc chỉ nộp bài từ máy thứ hai)
 *  - ?handoff=… mã QR "Nộp bằng điện thoại" từ máy tính của em
 */
type Grant = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  studentId: string;
  memberId: string;
  displayName: string;
};
type Slot = { sessionId: string; title: string; groupName: string | null; date: string; time: string; duration: number; startedAt: string | null };
type Preview = { student: { name: string; initials: string }; live: (Slot & { inClass: boolean }) | null; next: Slot | null };

const ROOM_KEY = "classroom-grant";
const SUBMIT_KEY = "classroom-submit-grant";
const params = new URL(location.href).searchParams;
let linkToken = params.get("link") || "";
let handoffToken = params.get("handoff") || "";
if (handoffToken) {
  const url = new URL(location.href);
  url.searchParams.delete("handoff");
  history.replaceState(null, "", url);
}
export const studentPage = (): "link" | "submit" | null =>
  linkToken ? "link" : handoffToken || sessionStorage.getItem(SUBMIT_KEY) ? "submit" : null;

async function post<T>(path: string, body: unknown, token = ""): Promise<T> {
  const r = await fetch(`/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw Object.assign(new Error(data?.error?.message || "Không thể hoàn thành yêu cầu"), { status: r.status });
  }
  return r.json();
}
const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function when(slot: Slot) {
  const d = new Date(`${slot.date}T${slot.time}:00`);
  if (Number.isNaN(d.getTime())) return `${slot.date} · ${slot.time}`;
  return `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${slot.time}`;
}
function untilText(slot: Slot, now: number) {
  const start = new Date(`${slot.date}T${slot.time}:00`).getTime();
  const diff = Math.round((start - now) / 60000);
  if (!Number.isFinite(diff)) return "";
  if (diff <= 0) return "Đã đến giờ, em đợi thầy cô mở lớp nhé";
  if (diff < 60) return `Còn ${diff} phút`;
  if (diff < 24 * 60) return `Còn ${Math.floor(diff / 60)} giờ ${diff % 60} phút`;
  return `Còn ${Math.floor(diff / 1440)} ngày`;
}

function Frame({ children, name }: { children: ReactNode; name?: string }) {
  return (
    <div className="online-restored online-restored--student">
      <div className="lr lr--hs lr--join sl">
        <header className="lr-top">
          <div className="lr-top__l">
            <span className="lr-cls" aria-hidden="true"><Sparkles size={17} /></span>
            <div className="lr-top__t"><h1>AI Teaching Copilot</h1><p>{name ? `Xin chào ${name}` : "Lớp học trực tuyến"}</p></div>
          </div>
        </header>
        <div className="lr-prep"><main className="lr-card lr-waitcard sl-card">{children}</main></div>
      </div>
    </div>
  );
}

/* ===================== Link cố định ===================== */
export function StudentLinkEntry() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<"submit" | "move">("submit");
  const [submitGrant, setSubmitGrant] = useState<Grant | null>(null);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(() => {
    void post<Preview>("/room/link-preview", { token: linkToken })
      .then((p) => { setPreview(p); setError(""); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 20_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [refresh]);
  const join = async (mode: "join" | "move" | "submit") => {
    if (!preview?.live) return;
    setBusy(true);
    setError("");
    try {
      const r = await post<{ mode: "join" | "submit"; grant: Grant }>("/room/link-join", { token: linkToken, sessionId: preview.live.sessionId, mode });
      if (r.mode === "submit") {
        sessionStorage.setItem(SUBMIT_KEY, r.grant.refreshToken);
        setSubmitGrant(r.grant);
        return;
      }
      // Vào lớp: dùng lại luồng phòng học sẵn có (khôi phục từ refresh token).
      sessionStorage.setItem(ROOM_KEY, r.grant.refreshToken);
      linkToken = "";
      location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa vào được lớp");
      setBusy(false);
    }
  };
  if (submitGrant) return <PhoneSubmit initial={submitGrant} />;
  const p = preview;
  return (
    <Frame name={p?.student.name}>
      {!p && !error && <p role="status" className="lr-loading"><span className="lr-spin" aria-hidden="true" />Đang mở link của em…</p>}
      {error && !p && <div role="alert" className="lr-waitbox lr-waitbox--err"><div><b>{error}</b></div></div>}
      {p?.live && !p.live.inClass && (
        <>
          <div><p className="lr-lbl">Lớp đang học</p><h2 className="sl-one">{p.live.title}</h2><p className="sl-sub">{p.live.groupName || when(p.live)}</p></div>
          <div className="sl-live"><span className="sl-dot" />Thầy cô đã mở lớp, em vào được ngay</div>
          <ul className="lr-chk">
            <li><span className="lr-chk__d" /><div>Dùng máy tính và tai nghe nếu có<small>Trình duyệt sẽ hỏi quyền camera và micro, em bấm Cho phép.</small></div></li>
            <li><span className="lr-chk__d" /><div>Để sẵn vở và bút<small>Khi nộp bài, em có thể quét mã QR để chụp bằng điện thoại.</small></div></li>
          </ul>
          <button type="button" className="lr-btn lr-btn--pri lr-btn--lg" disabled={busy} onClick={() => void join("join")}>{busy ? "Đang vào lớp…" : "Vào lớp"}</button>
        </>
      )}
      {p?.live && p.live.inClass && (
        <>
          <div><p className="lr-lbl">{p.live.groupName || "Lớp đang học"}</p><h2>Em đang ở trong lớp</h2><p className="sl-sub">Trên một máy khác. Mỗi em chỉ có một ô trong lớp.</p></div>
          <div className="sl-opts" role="radiogroup" aria-label="Dùng máy này để">
            <button type="button" role="radio" aria-checked={choice === "submit"} className={`sl-opt${choice === "submit" ? " is-on" : ""}`} onClick={() => setChoice("submit")}>
              <span className="sl-rad" /><span className="sl-min"><b>Chỉ nộp bài từ máy này</b><small>Không bật camera, micro, loa</small></span>
            </button>
            <button type="button" role="radio" aria-checked={choice === "move"} className={`sl-opt${choice === "move" ? " is-on" : ""}`} onClick={() => setChoice("move")}>
              <span className="sl-rad" /><span className="sl-min"><b>Chuyển lớp sang máy này</b><small>Máy kia sẽ tự thoát</small></span>
            </button>
          </div>
          <button type="button" className="lr-btn lr-btn--pri lr-btn--lg" disabled={busy} onClick={() => void join(choice)}>{busy ? "Đang mở…" : "Tiếp tục"}</button>
        </>
      )}
      {p && !p.live && p.next && (
        <>
          <div><p className="lr-lbl">Buổi tiếp theo</p><h2 className="sl-one">{p.next.title}</h2><p className="sl-sub">{when(p.next)} · {p.next.duration} phút</p></div>
          <div className="sl-wait"><Clock size={16} /><span>{untilText(p.next, now)}</span></div>
          <p className="sl-sub">Em giữ trang này mở. Khi thầy cô mở lớp, nút Vào lớp sẽ hiện ra.</p>
        </>
      )}
      {p && !p.live && !p.next && (
        <>
          <div><p className="lr-lbl">Link của em</p><h2>Chưa có buổi học nào sắp tới</h2></div>
          <p className="sl-sub">Link này dùng mãi cho mọi buổi. Khi thầy cô lên lịch, em mở lại link này là thấy.</p>
        </>
      )}
      {error && p && <div role="alert" className="lr-waitbox lr-waitbox--err"><div><b>{error}</b></div></div>}
    </Frame>
  );
}

/* ===================== Mã QR từ máy tính ===================== */
let handoffPromise: Promise<Grant> | null = null;
export function HandoffEntry() {
  const [grant, setGrant] = useState<Grant | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!handoffPromise) {
      const token = handoffToken || sessionStorage.getItem(SUBMIT_KEY) || "";
      handoffToken = "";
      handoffPromise = post<Grant>("/room/refresh", { refreshToken: token }).then(
        (g) => { sessionStorage.setItem(SUBMIT_KEY, g.refreshToken); return g; },
        (e) => { sessionStorage.removeItem(SUBMIT_KEY); throw e; },
      );
    }
    handoffPromise
      .then((g) => active && setGrant(g))
      .catch(() => active && setError("Mã đã hết hạn hoặc đã dùng. Em mở lại ô Nộp bài trên máy tính để lấy mã mới."));
    return () => { active = false; };
  }, []);
  if (grant) return <PhoneSubmit initial={grant} />;
  return (
    <Frame>
      {!error && <p role="status" className="lr-loading"><span className="lr-spin" aria-hidden="true" />Đang mở màn nộp bài…</p>}
      {error && <div role="alert" className="lr-waitbox lr-waitbox--err"><div><b>{error}</b></div></div>}
    </Frame>
  );
}

/* ===================== Màn chỉ nộp bài ===================== */
type Shot = { id: string; file: File; url: string };
type RoomLite = {
  session?: { title: string; status: string; currentActivityId: string | null };
  activities?: { id: string; title: string }[];
  capabilities?: { upload?: boolean };
};
async function toJpeg(file: File): Promise<File> {
  if (file.type === "image/jpeg" && file.size < 3_000_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
export function PhoneSubmit({ initial }: { initial: Grant }) {
  const grant = useRef(initial);
  const issued = useRef(Date.now());
  const [room, setRoom] = useState<RoomLite | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const token = useCallback(async () => {
    if (Date.now() - issued.current > 10 * 60_000) {
      const g = await post<Grant>("/room/refresh", { refreshToken: grant.current.refreshToken });
      grant.current = g;
      issued.current = Date.now();
      sessionStorage.setItem(SUBMIT_KEY, g.refreshToken);
    }
    return grant.current.accessToken;
  }, []);
  const call = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const r = await fetch(`/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}`, ...init.headers } });
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      throw new Error(data?.error?.message || "Không thể hoàn thành yêu cầu");
    }
    return (await r.json()) as T;
  }, [token]);
  useEffect(() => {
    const load = () => void call<RoomLite>("/room/state").then(setRoom).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [call]);
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (files: FileList | null) => {
    if (!files) return;
    // Đọc ngay: FileList bị làm trống khi ô chọn tệp được đặt lại.
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf")
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setSent(0);
    setShots((list) => [...list, ...picked]);
  };
  const s = room?.session;
  const activity = room?.activities?.find((a) => a.id === s?.currentActivityId);
  const live = s?.status === "live";
  const canUpload = live && room?.capabilities?.upload !== false;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      let n = 0;
      for (const shot of shots) {
        const file = shot.file.type === "application/pdf" ? shot.file : await toJpeg(shot.file);
        const bytes = await file.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
        const intent = await call<{ uploadId: string; uploadUrl: string }>(`/sessions/${grant.current.sessionId}/submissions/upload-intent`, {
          method: "POST",
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256: hash }),
        });
        const up = await fetch(intent.uploadUrl, { method: "PUT", body: file });
        if (!up.ok) throw new Error("Không tải được ảnh lên. Em kiểm tra mạng rồi gửi lại.");
        await call(`/sessions/${grant.current.sessionId}/submissions`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ title: `Ảnh ${n + 1} từ điện thoại`, answer: "", ...(s?.currentActivityId ? { activityId: s.currentActivityId } : {}), uploadId: intent.uploadId }),
        });
        n += 1;
        URL.revokeObjectURL(shot.url);
        setShots((list) => list.filter((x) => x.id !== shot.id));
      }
      setSent(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa gửi được bài");
    } finally {
      setBusy(false);
    }
  };
  const leave = () => {
    sessionStorage.removeItem(SUBMIT_KEY);
    location.replace("/");
  };
  return (
    <div className="online-restored online-restored--student">
      <div className="sl-phone">
        <header className="sl-ph-h">
          <span className="sl-who"><span className="sl-av">{initial.displayName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase()}</span><span className="sl-one">{initial.displayName} · chỉ nộp bài</span></span>
          <h1 className="sl-one">{activity?.title || s?.title || "Nộp bài"}</h1>
        </header>
        <main className="sl-ph-b">
          {room && !live && <div className="lr-waitbox lr-waitbox--err" role="alert"><div><b>Buổi học đã kết thúc</b><p>Em không nộp thêm từ điện thoại được nữa.</p></div></div>}
          {live && <div className="sl-live"><span className="sl-dot" />{activity ? "Hoạt động đang mở" : "Lớp đang học"}<span className="sl-grow" />{canUpload ? "" : "Thầy cô đang tắt nộp bài"}</div>}
          {sent > 0 && <div className="sl-done" role="status"><Check size={18} /><span>Đã nộp {sent} ảnh. Thầy cô thấy bài trong mục Bài nộp.</span></div>}
          <div className="sl-shots">
            {shots.map((shot) => (
              <div key={shot.id} className="sl-shot">
                {shot.file.type === "application/pdf" ? <span className="sl-pdf">PDF</span> : <img src={shot.url} alt="Ảnh bài làm" />}
                <button type="button" aria-label="Bỏ ảnh này" onClick={() => { URL.revokeObjectURL(shot.url); setShots((l) => l.filter((x) => x.id !== shot.id)); }}><X size={13} /></button>
              </div>
            ))}
            <button type="button" className={`sl-add${shots.length ? "" : " is-big"}`} disabled={!canUpload || busy} onClick={() => input.current?.click()}>
              <Camera size={shots.length ? 22 : 28} />{shots.length ? "Chụp thêm" : "Chụp bài làm"}
            </button>
          </div>
          <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <p className="sl-note"><Check size={14} />Ảnh gửi thẳng vào bài nộp của em</p>
          {error && <div className="sl-err" role="alert"><AlertCircle size={16} />{error}</div>}
        </main>
        <footer className="sl-ph-f">
          <button type="button" className="lr-btn lr-btn--pri lr-btn--lg" disabled={!shots.length || busy || !canUpload} onClick={() => void send()}>
            <Send size={16} />{busy ? "Đang gửi…" : shots.length ? `Gửi bài · ${shots.length} ảnh` : "Gửi bài"}
          </button>
          <button type="button" className="lr-btn lr-btn--ghost" onClick={leave}><LogOut size={16} />Thoát chế độ nộp bài</button>
        </footer>
      </div>
    </div>
  );
}
