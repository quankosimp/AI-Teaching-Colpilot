import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { AnnotationLayer } from "./presentation";
import { Modal } from "./ui";
import { api } from "./onlineApi";

type SavedAnnotation = {
  id: string;
  materialId: string;
  materialVersion: number;
  activityId: string;
  page: number;
  x: number;
  y: number;
  text: string;
};
type Annotation = {
  id: string;
  materialId?: string;
  materialVersion?: number;
  activityId?: string;
  page: number;
  x: number;
  y: number;
  text: string;
};
type Props = {
  materialId: string;
  version: number;
  title: string;
  kind: string;
  directReadUrl?: string;
  controlledPage?: number;
  onPageChange?: (zeroIndexedPage: number) => void;
  annotations?: Annotation[];
  sessionId?: string;
  activityId?: string;
  students?: { id: string; name: string }[];
  onSaved?: (annotation: SavedAnnotation) => void;
};

export function MaterialViewer({
  materialId,
  version,
  title,
  kind,
  directReadUrl,
  controlledPage,
  onPageChange,
  annotations = [],
  sessionId,
  activityId,
  students = [],
  onSaved,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [width, setWidth] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [opened, setOpened] = useState("");
  const [text, setText] = useState("");
  const [studentId, setStudentId] = useState("");
  const [sharedWithClass, setSharedWithClass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [renderedPage, setRenderedPage] = useState(0);
  const readOnly = !sessionId || !activityId || !onSaved;
  useEffect(() => {
    if (controlledPage !== undefined) {
      const target = Math.max(1, Math.min(pages || 1, controlledPage + 1));
      setPage(target);
    }
  }, [controlledPage, pages]);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let doc: PDFDocumentProxy | null = null;
    let destroyLoading: (() => Promise<void>) | null = null;
    setPage(controlledPage !== undefined ? Math.max(1, controlledPage + 1) : 1);
    setPages(1);
    setPdf(null);
    setImage(null);
    setError("");
    setLoading(true);
    (async () => {
      const read = async () => {
        if (directReadUrl) return fetch(directReadUrl);
        const signed = await api<{ readUrl: string }>(
          `/materials/${materialId}/read-url?version=${version}`,
        );
        return fetch(signed.readUrl);
      };
      let response = await read();
      if (response.status === 403 && !directReadUrl) response = await read();
      if (!response.ok) throw new Error("Không đọc được tệp. Hãy thử lại.");
      const contentType = response.headers.get("content-type") || "";
      const isPdf =
        kind === "PDF" ||
        contentType.includes("pdf") ||
        (kind === "auto" && !contentType.startsWith("image/"));
      if (isPdf) {
        const bytes = await response.arrayBuffer();
        const header = new TextDecoder().decode(bytes.slice(0, 5));
        if (header !== "%PDF-" && kind === "auto") {
          objectUrl = URL.createObjectURL(new Blob([bytes]));
          if (active) setImage(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        } else {
          const [pdfjs, worker] = await Promise.all([
            import("pdfjs-dist"),
            import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
          ]);
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const task = pdfjs.getDocument({ data: bytes });
          destroyLoading = () => task.destroy();
          doc = await task.promise;
          if (!active) {
            await doc.destroy();
            return;
          }
          setPdf(doc);
          setPages(doc.numPages);
          if (controlledPage !== undefined) {
            setPage(Math.max(1, Math.min(doc.numPages, controlledPage + 1)));
          }
        }
      } else if (kind === "Anh" || kind === "auto") {
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setImage(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } else throw new Error("Loại học liệu không hỗ trợ xem trực tiếp.");
      if (active) setLoading(false);
    })().catch(() => {
      if (active) {
        setLoading(false);
        setError("Không thể xem tệp. Hãy thử lại.");
      }
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (destroyLoading) void destroyLoading();
      else if (doc) void doc.destroy();
    };
  }, [materialId, version, kind, directReadUrl, revision]);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0]?.contentRect.width || 0),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current || !width) return;
    let active = true;
    let render: RenderTask | undefined;
    setRenderedPage(0);
    (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const requestedScale =
        (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(
        requestedScale,
        Math.sqrt(16_000_000 / (base.width * base.height)),
      );
      const viewport = pdfPage.getViewport({ scale });
      const buffer = document.createElement("canvas");
      buffer.width = Math.ceil(viewport.width);
      buffer.height = Math.ceil(viewport.height);
      const context = buffer.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      render = pdfPage.render({
        canvas: buffer,
        canvasContext: context,
        viewport,
      });
      await render.promise;
      if (!active || !canvas.current) return;
      canvas.current.width = buffer.width;
      canvas.current.height = buffer.height;
      canvas.current.getContext("2d")?.drawImage(buffer, 0, 0);
      setRenderedPage(page);
    })().catch((err: unknown) => {
      if (
        active &&
        !(err instanceof Error && err.name === "RenderingCancelledException")
      )
        setError("Không thể vẽ trang PDF.");
    });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, width]);
  const visible = annotations
    .filter(
      (item) =>
        (!item.materialId || item.materialId === materialId) &&
        (!item.materialVersion || item.materialVersion === version) &&
        (!activityId || !item.activityId || item.activityId === activityId),
    )
    .map((item) => ({ ...item, page: item.page + 1 }));
  return (
    <div ref={frame}>
      <div className="row-actions">
        <strong>{title}</strong>
        <button
          type="button"
          className="button ghost small"
          disabled={page <= 1}
          onClick={() => {
            const next = page - 1;
            setPage(next);
            onPageChange?.(next - 1);
          }}
        >
          Trang trước
        </button>
        <span>
          Trang {page}/{pages}
        </span>
        <button
          type="button"
          className="button ghost small"
          disabled={page >= pages}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            onPageChange?.(next - 1);
          }}
        >
          Trang sau
        </button>
      </div>
      {loading && <p role="status">Đang tải học liệu…</p>}
      {error && (
        <div role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Thử lại
          </button>
        </div>
      )}
      {!loading && !error && (
        <AnnotationLayer
          annotations={visible}
          currentPage={page}
          readOnly={readOnly || (!!pdf && renderedPage !== page)}
          highlightedId={opened}
          onCreatePin={(position) => {
            setText("");
            setStudentId("");
            setSharedWithClass(false);
            setPin(position);
          }}
          onOpenAnnotation={setOpened}
        >
          {pdf ? (
            <canvas ref={canvas} data-rendered-page={renderedPage} aria-label={`Trang ${page} của ${title}`} />
          ) : (
            <img src={image || ""} alt={title} />
          )}
        </AnnotationLayer>
      )}
      {pin && (
        <Modal title="Lưu chú thích" onClose={() => setPin(null)}>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              setSaveError("");
              void api<{ annotation: SavedAnnotation }>(
                `/sessions/${sessionId}/annotations`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    activityId,
                    materialId,
                    materialVersion: version,
                    page: page - 1,
                    x: pin.x,
                    y: pin.y,
                    text: text.trim(),
                    ...(studentId
                      ? { studentId }
                      : sharedWithClass
                        ? { sharedWithClass: true }
                        : {}),
                  }),
                },
              )
                .then(({ annotation }) => {
                  onSaved?.(annotation);
                  setPin(null);
                })
                .catch(() =>
                  setSaveError("Không thể lưu chú thích. Hãy thử lại."),
                )
                .finally(() => setSaving(false));
            }}
          >
            <p>
              Trang {page} · vị trí {pin.x.toFixed(1)}%, {pin.y.toFixed(1)}%
            </p>
            <label>
              Nội dung
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
              />
            </label>
            <label>
              Gắn học sinh
              <select
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  if (e.target.value) setSharedWithClass(false);
                }}
              >
                <option value="">Chỉ chú thích</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
            {!studentId && (
              <label>
                <input
                  type="checkbox"
                  checked={sharedWithClass}
                  onChange={(e) => setSharedWithClass(e.target.checked)}
                />{" "}
                Chia sẻ chú thích với cả lớp
              </label>
            )}
            {saveError && <p role="alert">{saveError}</p>}
            <button
              className="button primary"
              disabled={saving || !text.trim()}
            >
              Lưu chú thích
            </button>
          </form>
        </Modal>
      )}
      {opened && (
        <Modal title="Chú thích" onClose={() => setOpened("")}>
          <p>{visible.find((item) => item.id === opened)?.text}</p>
        </Modal>
      )}
    </div>
  );
}
