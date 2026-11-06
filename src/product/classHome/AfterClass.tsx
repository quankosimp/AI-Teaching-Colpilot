import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, Pencil, Plus, Sparkles, Users } from "lucide-react";
import { api } from "../onlineApi";
import { AttendanceDialog } from "../Classes";
import { Av, CIco, dayLabel, errText } from "./ui";
import { AiConsentControl, type AiConsentState } from "./AiConsent";
import "../classes.css";
import "./classes-v2.css";

type Kind = "review" | "good";
type Claim = { id: string; text: string; status: string; revision: number; kind: string | null; evidenceIds: string[] };
type Evidence = { id: string; title: string; kind: string; createdAt: string };
type Row = {
  studentId: string; name: string; initials: string; color: string;
  present: boolean; late: boolean; lateMinutes: number; consent: boolean; aiConsent: AiConsentState;
  evidence: Evidence[]; claims: Claim[];
};
type AfterData = {
  session: { id: string; title: string; date: string; time: string; status: string; startedAt: string | null; endedAt: string | null; groupId: string | null; groupName: string | null; attendanceConfirmedAt: string | null };
  students: Row[];
  pendingSubmissions: { id: string; studentId: string; name: string; title: string; createdAt: string }[];
};
const KIND_LABEL: Record<Kind, string> = { review: "Ôn lại", good: "Làm tốt" };
const asKind = (k: string | null): Kind | null => (k === "review" || k === "good" ? k : null);
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");

/** Màn Sau buổi: AI soạn nháp từ những gì đã có trong buổi, gia sư quyết định từng dòng. */
export function AfterClass({ sessionId, onBack, onOpenGrading }: {
  sessionId: string;
  onBack: () => void;
  onOpenGrading: (sessionId: string) => void;
}) {
  const [data, setData] = useState<AfterData | null>(null);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState("");
  const [aiFailed, setAiFailed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<{ claimId: string; text: string } | null>(null);
  const [adding, setAdding] = useState<{ studentId: string; text: string; kind: Kind } | null>(null);
  const [attOpen, setAttOpen] = useState(false);
  const tried = useRef(new Set<string>());
  const load = useCallback(async () => {
    try { const d = await api<AfterData>(`/sessions/${sessionId}/after`); setData(d); setError(""); return d; }
    catch (e) { setError(errText(e)); return null; }
  }, [sessionId]);
  useEffect(() => { void load(); }, [load]);

  // Tự soạn nháp cho em có mặt, đã đồng ý, có nguồn mà chưa có nhận định. Mỗi em một lần, lần lượt.
  useEffect(() => {
    if (!data || drafting || data.session.status !== "ended") return;
    const next = data.students.find((s) => s.present && s.consent && s.evidence.length > 0 && s.claims.length === 0 && !tried.current.has(s.studentId));
    if (!next) return;
    tried.current.add(next.studentId);
    setDrafting(next.studentId);
    void api(`/sessions/${sessionId}/ai/claims-draft`, { method: "POST", body: JSON.stringify({ studentId: next.studentId }) })
      .catch((e) => setAiFailed((m) => ({ ...m, [next.studentId]: errText(e) })))
      .finally(async () => { await load(); setDrafting(""); });
  }, [data, drafting, load, sessionId]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError("");
    try { await fn(); await load(); } catch (e) { setError(errText(e)); } finally { setBusy(""); }
  };
  const review = (body: object, claimId: string) => api<{ claim: Claim }>(`/claims/${claimId}/review`, { method: "PATCH", body: JSON.stringify(body) });
  const keep = (c: Claim) => run(c.id, () => review({ action: "approve", revision: c.revision, evidenceIds: c.evidenceIds }, c.id));
  const drop = (c: Claim) => run(c.id, () => review({ action: "reject", revision: c.revision, reason: "Gia sư bỏ ở màn Sau buổi" }, c.id));
  const saveEdit = (c: Claim, text: string) => run(c.id, async () => {
    const edited = await review({ action: "edit", revision: c.revision, text, evidenceIds: c.evidenceIds }, c.id);
    await review({ action: "approve", revision: edited.claim.revision, evidenceIds: c.evidenceIds }, c.id);
    setEditing(null);
  });
  const setKind = (c: Claim, kind: Kind) => run(c.id, () => api(`/claims/${c.id}/kind`, { method: "PATCH", body: JSON.stringify({ kind }) }));
  const addOwn = (studentId: string, text: string, kind: Kind) => run("add" + studentId, async () => {
    const ev = await api<{ evidence: { id: string } }>(`/sessions/${sessionId}/evidence`, { method: "POST", body: JSON.stringify({ studentId, kind: "GhiChu", title: "Gia sư ghi sau buổi", detail: text, support: "ChuaRo" }) });
    const draft = await api<{ claim: Claim }>(`/sessions/${sessionId}/claims/draft`, { method: "POST", body: JSON.stringify({ studentId, text, evidenceIds: [ev.evidence.id] }) });
    await review({ action: "approve", revision: draft.claim.revision, evidenceIds: [ev.evidence.id] }, draft.claim.id);
    await api(`/claims/${draft.claim.id}/kind`, { method: "PATCH", body: JSON.stringify({ kind }) });
    setAdding(null);
  });
  const close = () => run("close", async () => {
    if (!data) return;
    if (!data.session.attendanceConfirmedAt) {
      const att = await api<{ rows: { studentId: string; present: boolean; excused: boolean }[] }>(`/sessions/${sessionId}/attendance`);
      await api(`/sessions/${sessionId}/attendance`, { method: "PUT", body: JSON.stringify({ rows: att.rows.map((r) => ({ studentId: r.studentId, present: r.present, excused: r.excused })) }) });
    }
    if (data.session.status === "ended") {
      const total = data.students.reduce((n, s) => n + s.claims.length, 0);
      await api(`/sessions/${sessionId}/complete-review`, { method: "POST", body: JSON.stringify(total ? {} : { reviewNote: "Đã xem lại sau buổi, không có điều cần ghi" }) });
    }
    onBack();
  });

  if (error && !data) return <div className="cls"><button type="button" className="cls-btn cls-btn--sec" onClick={onBack}><ChevronLeft size={16} />Về lớp</button><p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p></div>;
  if (!data) return <div className="cls"><p className="cls-muted" role="status">Đang tải buổi học…</p></div>;
  const s = data.session;
  const present = data.students.filter((x) => x.present);
  const absent = data.students.filter((x) => !x.present);
  const late = present.filter((x) => x.late);
  const pending = data.students.reduce((n, x) => n + x.claims.filter((c) => c.status === "pending").length, 0);
  const closed = s.status === "reviewed";

  const card = (st: Row) => {
    const visible = st.claims.filter((c) => c.status !== "rejected");
    const titles = (ids: string[]) => ids.map((id) => st.evidence.find((e) => e.id === id)?.title).filter((t): t is string => !!t);
    return <div key={st.studentId} className={`cls-dcard${visible.length && visible.every((c) => c.status === "approved") ? " is-kept" : ""}`}>
      <div className="cls-nm"><Av p={st} /><div className="cls-min"><b className="cls-one">{st.name}</b><span className="cls-muted cls-one">{st.evidence.length ? `${st.evidence.length} nguồn trong buổi` : "Chưa có nguồn"}</span></div></div>
      <div className="cls-min">
        {drafting === st.studentId && <p className="cls-muted" role="status"><Sparkles size={14} /> Đang soạn nháp…</p>}
        {visible.map((c) => {
          const k = asKind(c.kind);
          const srcs = titles(c.evidenceIds);
          return <div key={c.id} className="cls-draft">
            {editing?.claimId === c.id
              ? <div className="cls-editrow"><input value={editing.text} maxLength={200} onChange={(e) => setEditing({ claimId: c.id, text: e.target.value })} aria-label="Sửa dòng ghi nhớ" />
                  <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" disabled={!editing.text.trim() || busy === c.id} onClick={() => void saveEdit(c, editing.text.trim())}>Lưu</button>
                  <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => setEditing(null)}>Huỷ</button></div>
              : <div className="cls-draft__txt"><span className="cls-seg2" role="group" aria-label="Loại ghi nhớ">
                  {(["review", "good"] as Kind[]).map((kk) => <button key={kk} type="button" className={`${kk}${k === kk ? " is-on" : ""}`} aria-pressed={k === kk} disabled={busy === c.id} onClick={() => void setKind(c, kk)}>{KIND_LABEL[kk]}</button>)}
                </span><b className="cls-one" title={c.text}>{c.text}</b></div>}
            {srcs.length > 0 && <div className="cls-chips2">{srcs.slice(0, 3).map((t) => <span key={t} className="cls-chip2">{t}</span>)}</div>}
            <div className="cls-draft__acts">
              {c.status === "pending" && editing?.claimId !== c.id && <>
                <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" disabled={busy === c.id} onClick={() => void keep(c)}><Check size={14} />Giữ</button>
                <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" disabled={busy === c.id} onClick={() => setEditing({ claimId: c.id, text: c.text })}><Pencil size={14} />Sửa</button>
                <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" disabled={busy === c.id} onClick={() => void drop(c)}>Bỏ</button>
              </>}
              {c.status === "approved" && <span className="cls-st is-ok">Đã giữ</span>}
            </div>
          </div>;
        })}
        {!visible.length && drafting !== st.studentId && (st.consent || !st.evidence.length || !!aiFailed[st.studentId]) && <p className="cls-muted">{aiFailed[st.studentId] ? "Chưa soạn được, bạn tự thêm nhé." : !st.evidence.length ? "Chưa có nguồn nào trong buổi này." : !st.consent ? "" : "Không có dòng nào."}</p>}
        {!visible.length && !st.consent && st.evidence.length > 0 && <AiConsentControl compact studentId={st.studentId} name={st.name} state={st.aiConsent} onChanged={() => void load()} />}
        {adding?.studentId === st.studentId
          ? <div className="cls-editrow">
              <span className="cls-seg2">{(["review", "good"] as Kind[]).map((kk) => <button key={kk} type="button" className={`${kk}${adding.kind === kk ? " is-on" : ""}`} aria-pressed={adding.kind === kk} onClick={() => setAdding({ ...adding, kind: kk })}>{KIND_LABEL[kk]}</button>)}</span>
              <input autoFocus value={adding.text} maxLength={200} placeholder="Điều cần nhớ về em này" onChange={(e) => setAdding({ ...adding, text: e.target.value })} aria-label={`Tự thêm cho ${st.name}`} />
              <button type="button" className="cls-btn cls-btn--pri cls-btn--sm" disabled={!adding.text.trim() || busy === "add" + st.studentId} onClick={() => void addOwn(st.studentId, adding.text.trim(), adding.kind)}>Lưu</button>
              <button type="button" className="cls-btn cls-btn--txt cls-btn--sm" onClick={() => setAdding(null)}>Huỷ</button>
            </div>
          : <button type="button" className="cls-btn cls-btn--txt cls-btn--sm cls-addown" onClick={() => setAdding({ studentId: st.studentId, text: "", kind: "review" })}><Plus size={14} />Tự thêm</button>}
      </div>
    </div>;
  };

  return <div className="cls cls-after">
    <div className="cls-chead">
      <button type="button" className="cls-ib" aria-label="Về lớp" onClick={onBack}><ChevronLeft size={18} /></button>
      <CIco name={s.groupName || s.title} />
      <div className="cls-min"><h1 className="cls-one">Sau buổi · {s.groupName || s.title}</h1><p className="cls-muted cls-one">{dayLabel(s.date)} · {hhmm(s.startedAt) || s.time}{s.endedAt ? ` đến ${hhmm(s.endedAt)}` : ""} · {s.title}</p></div>
    </div>
    {error && <p className="cls-alert" role="alert"><AlertCircle size={16} />{error}</p>}

    <div className="cls-step"><span className={`cls-k${s.attendanceConfirmedAt ? " is-done" : ""}`}>{s.attendanceConfirmedAt ? <Check size={12} strokeWidth={3} /> : "1"}</span><h3>Điểm danh</h3><span className="cls-count">{s.attendanceConfirmedAt ? "đã xác nhận" : "máy đã điền theo giờ vào lớp"}</span></div>
    <section className="cls-card cls-attrow2"><span className="cls-ico cls-ico--acc"><Users size={16} /></span>
      <div className="cls-min"><b className="cls-one">{present.length}/{data.students.length} em có mặt</b><span className="cls-muted cls-one">{[late.length ? `${late.map((x) => x.name).join(", ")} vào muộn` : "", absent.length ? `Vắng: ${absent.map((x) => x.name).join(", ")}` : ""].filter(Boolean).join(" · ") || "Không ai vắng hay vào muộn"}</span></div>
      <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => setAttOpen(true)}>Sửa</button>
    </section>

    <div className="cls-step"><span className="cls-k">2</span><h3>Ghi nhớ cho từng em</h3><span className="cls-count">AI soạn nháp, bạn quyết định</span></div>
    <section className="cls-card">
      {present.length === 0 && <p className="cls-pad cls-muted">Không có em nào vào lớp buổi này.</p>}
      {present.map(card)}
      <p className="cls-hint cls-one"><Sparkles size={13} /> Chỉ những dòng bạn bấm Giữ mới vào hồ sơ. Buổi sau, chúng hiện ở trang lớp và hồ sơ em.</p>
    </section>

    {data.pendingSubmissions.length > 0 && <>
      <div className="cls-step"><span className="cls-k">3</span><h3>Bài nộp chưa nhận xét</h3><span className="cls-count">{data.pendingSubmissions.length}</span></div>
      <section className="cls-card">
        {data.pendingSubmissions.map((p) => <div key={p.id} className="cls-subrow"><div className="cls-min"><b className="cls-one">{p.name} · {p.title}</b><span className="cls-muted cls-one">Nộp lúc {hhmm(p.createdAt)}</span></div>
          <button type="button" className="cls-btn cls-btn--sec cls-btn--sm" onClick={() => onOpenGrading(sessionId)}>Nhận xét</button></div>)}
      </section>
    </>}

    <div className="cls-afoot">
      <span className="cls-muted cls-one cls-grow">{closed ? "Buổi đã đóng. Bạn vẫn sửa hoặc thêm ghi nhớ được." : pending ? `Còn ${pending} dòng chờ bạn Giữ hoặc Bỏ` : "Làm dở cũng được, lần sau mở lại từ Nhật ký buổi"}</span>
      <button type="button" className="cls-btn cls-btn--sec" onClick={onBack}>{closed ? "Về lớp" : "Để sau"}</button>
      {!closed && <button type="button" className="cls-btn cls-btn--pri" disabled={!!pending || !!drafting || busy === "close"} onClick={() => void close()}>{busy === "close" ? "Đang lưu…" : "Lưu và đóng buổi"}</button>}
    </div>
    {attOpen && <AttendanceDialog sessionId={sessionId} mode="edit" onClose={() => setAttOpen(false)} onSaved={() => { setAttOpen(false); void load(); }} />}
  </div>;
}
