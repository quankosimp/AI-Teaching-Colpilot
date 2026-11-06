import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles, X } from "lucide-react";
import { api } from "./onlineApi";

export type PageQuestion = { text: string; opened: boolean };
type Q = PageQuestion;

/** Đọc chữ của một trang PDF ngay trên trình duyệt. Trả "" nếu là ảnh hoặc PDF scan. */
async function readPageText(materialId: string, version: number, page: number): Promise<string> {
  const signed = await api<{ readUrl: string }>(`/materials/${materialId}/read-url?version=${version}`);
  const res = await fetch(signed.readUrl);
  if (!res.ok) throw new Error("Không đọc được tệp. Bạn thử lại nhé.");
  const bytes = await res.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return "";
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const p = await doc.getPage(Math.min(doc.numPages, page + 1));
    const content = await p.getTextContent();
    return content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
  } finally {
    void doc.destroy();
  }
}

/**
 * AI soạn nháp câu hỏi kiểm tra nhanh từ chữ của trang đang chiếu.
 * Gia sư sửa từng câu rồi mới mở cho lớp: không câu nào tự gửi.
 */
export function PageQuestions({ sessionId, material, page, live, canOpen, cache, onOpen, onShowAnswers, onClose }: {
  sessionId: string;
  material: { id: string; version: number; title: string };
  page: number;
  live: boolean;
  canOpen: boolean;
  /** Nháp đã soạn theo trang, để mở một câu (lớp chuyển sang Hỏi nhanh) rồi quay lại vẫn còn các câu khác. */
  cache: Map<string, PageQuestion[]>;
  onOpen: (question: string) => Promise<boolean>;
  onShowAnswers: () => void;
  onClose: () => void;
}) {
  const key = `${material.id}:${material.version}:${page}`;
  const cached = cache.get(key);
  const [state, setState] = useState<"reading" | "drafting" | "ready" | "empty" | "error">(cached ? "ready" : "reading");
  const [error, setError] = useState("");
  const [qs, setQs] = useState<Q[]>(cached ?? []);
  useEffect(() => { if (qs.length) cache.set(key, qs); }, [cache, key, qs]);
  const [busy, setBusy] = useState(-1);
  const [copied, setCopied] = useState(-1);
  const run = useRef(0);
  const draft = useCallback(async () => {
    const id = ++run.current;
    setState("reading"); setError(""); setQs([]);
    try {
      const text = await readPageText(material.id, material.version, page);
      if (id !== run.current) return;
      if (text.length < 20) { setState("empty"); return; }
      setState("drafting");
      const r = await api<{ questions: string[] }>(`/sessions/${sessionId}/ai/page-questions`, {
        method: "POST",
        body: JSON.stringify({ title: material.title, page, text: text.slice(0, 12000) }),
      });
      if (id !== run.current) return;
      if (!r.questions.length) { setState("error"); setError("AI chưa soạn được câu nào cho trang này. Bạn thử lại nhé."); return; }
      setQs(r.questions.map((t) => ({ text: t, opened: false })));
      setState("ready");
    } catch (e) {
      if (id !== run.current) return;
      setState("error");
      setError(e instanceof Error ? e.message : "Chưa soạn được câu hỏi.");
    }
  }, [material.id, material.version, material.title, page, sessionId]);
  // Chỉ gọi AI khi trang này chưa có nháp; "Soạn lại" thì gọi lại.
  // Ref giữ qua lần chạy hiệu ứng kép của StrictMode, nên không gọi AI hai lần.
  const started = useRef("");
  useEffect(() => {
    if (cache.has(key) || started.current === key) return;
    started.current = key;
    void draft();
  }, [cache, key, draft]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = async (i: number) => {
    setBusy(i);
    const ok = await onOpen(qs[i].text.trim());
    setBusy(-1);
    if (!ok) return;
    // Lớp có thể đã chuyển sang Hỏi nhanh và khung này đã đóng: ghi thẳng vào bộ nhớ nháp.
    const next = qs.map((q, k) => (k === i ? { ...q, opened: true } : q));
    cache.set(key, next);
    setQs(next);
  };
  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(qs[i].text); setCopied(i); setTimeout(() => setCopied(-1), 1500); } catch { /* trình duyệt chặn chép */ }
  };
  const anyOpened = qs.some((q) => q.opened);

  return <div className="lr-pq" role="dialog" aria-label="Câu hỏi từ trang này">
    <div className="lr-pq__h">
      <span className="lr-pq__ico"><Sparkles size={15} /></span>
      <div className="lr-pq__t"><b>Câu hỏi từ trang {page + 1}</b><span>{material.title}</span></div>
      <button type="button" className="lr-ib" aria-label="Đóng" onClick={onClose}><X size={16} /></button>
    </div>
    {(state === "reading" || state === "drafting") && <div className="lr-pq__wait" role="status">
      <span className="lr-spin" aria-hidden="true" />{state === "reading" ? "Đang đọc chữ trên trang…" : "AI đang soạn nháp…"}
    </div>}
    {state === "empty" && <p className="lr-pq__note">Trang này không có chữ đọc được (ảnh chụp hoặc PDF scan). AI chỉ soạn được từ PDF có chữ. Bạn vẫn gõ câu hỏi ở mục Hoạt động lớp như thường.</p>}
    {state === "error" && <p className="lr-pq__note is-err" role="alert">{error}</p>}
    {state === "ready" && <ol className="lr-pq__list">
      {qs.map((q, i) => <li key={i} className={q.opened ? "is-opened" : ""}>
        <span className="lr-pq__n">{q.opened ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
        <div className="lr-pq__body">
          <textarea rows={2} value={q.text} maxLength={500} aria-label={`Câu hỏi ${i + 1}`} disabled={q.opened}
            onChange={(e) => setQs((list) => list.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
          <div className="lr-pq__acts">
            {q.opened
              ? <span className="lr-pq__done">Đã mở cho lớp</span>
              : <button type="button" className="lr-btn lr-btn--sm lr-btn--pri" disabled={!live || !canOpen || !q.text.trim() || busy >= 0} onClick={() => void open(i)}>{busy === i ? "Đang mở…" : "Mở cho lớp"}</button>}
            <button type="button" className="lr-btn lr-btn--sm lr-btn--quiet" onClick={() => void copy(i)}>{copied === i ? <Check size={13} /> : <Copy size={13} />}{copied === i ? "Đã chép" : "Chép"}</button>
          </div>
        </div>
      </li>)}
    </ol>}
    {state === "ready" && !live && <p className="lr-pq__note">Câu hỏi mở được khi buổi học đang diễn ra. Bạn có thể chép trước.</p>}
    {state === "ready" && live && !canOpen && <p className="lr-pq__note">Buổi này đang tắt câu hỏi nhanh.</p>}
    <div className="lr-pq__f">
      <span>AI chỉ đọc chữ của trang này, không đọc dữ liệu học sinh. Bạn sửa câu nào cũng được.</span>
      {anyOpened
        ? <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" onClick={onShowAnswers}>Xem câu trả lời</button>
        : <button type="button" className="lr-btn lr-btn--sm lr-btn--ghost" disabled={state === "reading" || state === "drafting"} onClick={() => void draft()}><RefreshCw size={13} />Soạn lại</button>}
    </div>
  </div>;
}
