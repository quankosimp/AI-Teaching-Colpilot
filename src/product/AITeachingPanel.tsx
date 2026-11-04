import { useEffect, useRef, useState } from "react";
import type { AISuggestionItem, AISuggestionResponse, AIClaimsDraftResponse, TeachingRequestMode } from "../../contracts/ai";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const modeNames: Record<TeachingRequestMode, string> = {
  explain: "Giải thích lại", leading_question: "Câu hỏi gợi mở",
  example: "Ví dụ tương tự", difficulty: "Điều chỉnh độ khó",
};
const statusNames = { ready: "Chờ giáo viên xem", used: "Đã sử dụng", ignored: "Đã bỏ qua", reported: "Đã báo chưa phù hợp", error: "Có lỗi" };

// Reuse a request key after network failure, until the actual command changes.
function useCommandKey() {
  const receipt = useRef({ signature: "", key: "" });
  const key = (body: unknown) => {
    const signature = JSON.stringify(body);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
    return receipt.current.key;
  };
  return [key, () => { receipt.current.signature = ""; }] as const;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Không thể lấy gợi ý. Có thể tiếp tục ghi chú thủ công.";
}

export function AITeachingPanel({ sessionId, studentId, activityId, active, request, reload }: {
  sessionId: string; studentId: string; activityId: string | null; active: boolean; request: Request; reload: () => Promise<unknown>;
}) {
  const [mode, setMode] = useState<TeachingRequestMode>("explain");
  const [prompt, setPrompt] = useState("");
  const [items, setItems] = useState<AISuggestionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [load, setLoad] = useState(0);
  const mounted = useRef(true);
  const [commandKey, completeCommand] = useCommandKey();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    void request<{ suggestions: AISuggestionItem[] }>(`/sessions/${sessionId}/ai/suggestions`)
      .then(data => { if (current) setItems(data.suggestions.filter(item => item.studentId === studentId && item.activityId === activityId)); })
      .catch(error => { if (current) setError(message(error)); });
    return () => { current = false; };
  }, [sessionId, studentId, activityId, request, load]);
  const generate = async () => {
    if (!activityId || busy) return;
    const body = { studentId, activityId, kind: mode, prompt };
    setBusy(true); setError(""); setResult("");
    try {
      const data = await request<AISuggestionResponse>(`/sessions/${sessionId}/ai/suggestions`, {
        method: "POST", headers: { "Idempotency-Key": commandKey(body) }, body: JSON.stringify(body),
      });
      if (mounted.current) {
        setItems(old => [data.suggestion, ...old.filter(item => item.id !== data.suggestion.id)]);
        completeCommand();
      }
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const update = async (item: AISuggestionItem, status: "used" | "ignored" | "reported", editedText: string, saveAsEvidence: boolean) => {
    setBusy(true); setError("");
    try {
      await request(`/ai-requests/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, editedText, saveAsEvidence }) });
      if (mounted.current) {
        setItems(old => old.map(row => row.id === item.id ? { ...row, status, editedText } : row));
        setResult(saveAsEvidence ? "Đã lưu gợi ý hỗ trợ giảng dạy. Đây không phải quan sát năng lực học sinh." : statusNames[status]);
      }
      await reload();
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="ai-panel" aria-label="Copilot hỗ trợ giảng dạy">
    <div className="ai-panel__head">
      <h3>Copilot giảng dạy</h3>
      <span className="ai-panel__badge">AI Copilot</span>
    </div>
    <p className="ai-panel__desc">Gợi ý dành riêng cho giáo viên. Giáo viên kiểm tra nội dung trước khi dùng.</p>
    <form className="ai-panel__form" onSubmit={event => { event.preventDefault(); void generate(); }}>
      <label>Cách hỗ trợ<select value={mode} onChange={event => setMode(event.target.value as TeachingRequestMode)} disabled={busy}>
        {Object.entries(modeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Lưu ý cho Copilot<textarea placeholder="Nhập tình huống hoặc yêu cầu gợi ý…" value={prompt} maxLength={4000} onChange={event => setPrompt(event.target.value)} disabled={busy} /></label>
      <button className="button primary small" disabled={busy || !active || !studentId || !activityId}>{busy ? "Đang xử lý…" : "Lấy gợi ý"}</button>
    </form>
    {!activityId && <p className="muted">Chọn hoạt động để lấy gợi ý phù hợp.</p>}
    {!active && <p className="muted">Gợi ý trong lớp khả dụng khi buổi học đang chuẩn bị hoặc diễn ra.</p>}
    {busy && <p role="status">Đang xử lý yêu cầu. Nội dung đang soạn được giữ lại.</p>}
    {error && <div role="alert" className="ai-panel__error"><p>{error}</p><div className="presentation-actions"><button className="button ghost small" disabled={busy || !active || !activityId} onClick={() => void generate()}>Thử lại gợi ý</button><button className="button ghost small" onClick={() => setLoad(value => value + 1)}>Tải lại lịch sử</button></div></div>}
    {result && <p role="status" className="ai-panel__status">{result}</p>}
    {items.slice(0, 5).map(item => <Suggestion key={item.id} item={item} busy={busy} update={update} />)}
  </section>;
}
function Suggestion({ item, busy, update }: { item: AISuggestionItem; busy: boolean; update: (item: AISuggestionItem, status: "used" | "ignored" | "reported", text: string, save: boolean) => Promise<void> }) {
  const [text, setText] = useState(item.editedText || item.responseText);
  const [save, setSave] = useState(false);
  return <article className="presentation-suggestion" aria-label="Gợi ý Copilot">
    <p className="presentation-suggestion__meta"><strong>{item.provider === "mock" ? "Giả lập local" : "Gemini"}</strong> · {statusNames[item.status]}</p>
    {item.status === "ready" ? <>
      <label>Nội dung gợi ý có thể chỉnh sửa<textarea value={text} maxLength={4000} onChange={event => setText(event.target.value)} disabled={busy} /></label>
      <label className="checkbox-line"><input type="checkbox" checked={save} onChange={event => setSave(event.target.checked)} disabled={busy} /> Lưu làm gợi ý giảng dạy</label>
      <div className="presentation-actions">
        <button className="button primary small" disabled={busy || !text.trim()} onClick={() => void update(item, "used", text, save)}>Đã sử dụng</button>
        <button className="button ghost small" disabled={busy} onClick={() => void update(item, "ignored", text, false)}>Bỏ qua</button>
        <button className="button ghost small" disabled={busy} onClick={() => void update(item, "reported", text, false)}>Báo chưa phù hợp</button>
      </div>
    </> : <p>{item.editedText || item.responseText}</p>}
  </article>;
}

export function AIClaimDraftPanel({ sessionId, studentId, request, reload }: {
  sessionId: string; studentId: string; request: Request; reload: () => Promise<unknown>;
}) {
  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const [commandKey] = useCommandKey();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const generate = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const body = { studentId, prompt };
    try {
      const data = await request<AIClaimsDraftResponse>(`/sessions/${sessionId}/ai/claims-draft`, {
        method: "POST", headers: { "Idempotency-Key": commandKey(body) }, body: JSON.stringify(body),
      });
      if (mounted.current) setSummary(data.claims.length ? `Đã tạo ${data.claims.length} nhận định chờ duyệt. Kiểm tra từng nguồn bên dưới trước khi duyệt.` : data.summary);
      await reload();
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="ai-panel" aria-label="Copilot dự thảo nhận định">
    <div className="ai-panel__head">
      <h3>Dự thảo từ minh chứng</h3>
      <span className="ai-panel__badge">AI Copilot</span>
    </div>
    <p className="ai-panel__desc">Copilot chỉ đề xuất nhận định chờ duyệt từ quan sát hiện hành của học sinh được chọn. Gợi ý giảng dạy không được dùng làm quan sát năng lực.</p>
    <form className="ai-panel__form" onSubmit={event => { event.preventDefault(); void generate(); }}>
      <label>Lưu ý khi dự thảo<textarea placeholder="Nhập trọng tâm cần Copilot tổng hợp từ minh chứng…" value={prompt} maxLength={2000} onChange={event => setPrompt(event.target.value)} disabled={busy} /></label>
      <button className="button primary small" disabled={busy || !studentId}>{busy ? "Đang dự thảo…" : "Dự thảo nhận định bằng Copilot"}</button>
    </form>
    {busy && <p role="status">Đang đối chiếu minh chứng; chưa có nhận định nào được tự động duyệt.</p>}
    {error && <p role="alert">{error} Nội dung đang soạn vẫn được giữ; có thể thử lại hoặc tạo nhận định thủ công.</p>}
    {summary && <p role="status" className="ai-panel__status">{summary}</p>}
  </section>;
}
