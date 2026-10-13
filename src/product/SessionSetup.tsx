import { useState } from "react";
import { Copy, ExternalLink, Link, ShieldCheck, Users } from "lucide-react";
import type { Invite, Session } from "./model";
import { defaultTools, sessionStudentIds, uid } from "./model";
import { useStore } from "./store";
import { Banner, Modal, SectionHead, Status } from "./ui";
export const inviteUrl = (invite: Invite) =>
  `${location.origin}${location.pathname}?invite=${encodeURIComponent(invite.token)}`;
export const inviteValid = (invite: Invite | undefined) =>
  !!invite &&
  !invite.revoked &&
  new Date(invite.expiresAt).getTime() > Date.now();
export function SessionSetup({ session }: { session: Session }) {
  const { data, setData, toast } = useStore();
  const [revoke, setRevoke] = useState<Invite | null>(null);
  const [days, setDays] = useState(7);
  const ids = sessionStudentIds(session);
  const mutable = session.status === "draft" || session.status === "scheduled";
  const tools = session.tools || defaultTools;
  const toggle = (id: string) => {
    if (!mutable) return;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (!next.length || next.length > 5) {
      toast("Chọn từ 1 đến 5 học sinh cho mỗi buổi.", "error");
      return;
    }
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id
          ? { ...s, studentId: next[0], studentIds: next }
          : s,
      ),
      members: prev.members.map((m) =>
        m.sessionId === session.id && !next.includes(m.studentId)
          ? { ...m, state: "left" }
          : m,
      ),
      invites: prev.invites.map((i) =>
        i.sessionId === session.id && !next.includes(i.studentId)
          ? { ...i, revoked: true }
          : i,
      ),
    }));
  };
  const generate = (studentId: string) => {
    const invite: Invite = {
      id: uid("invite"),
      token: crypto.randomUUID(),
      sessionId: session.id,
      studentId,
      expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      revoked: false,
    };
    setData((prev) => ({
      ...prev,
      invites: [
        ...prev.invites.map((i) =>
          i.sessionId === session.id && i.studentId === studentId
            ? { ...i, revoked: true }
            : i,
        ),
        invite,
      ],
      members: prev.members.some(
        (m) => m.sessionId === session.id && m.studentId === studentId,
      )
        ? prev.members.map((m) =>
            m.sessionId === session.id && m.studentId === studentId
              ? { ...m, state: "invited" }
              : m,
          )
        : [
            ...prev.members,
            {
              id: `${session.id}:${studentId}`,
              sessionId: session.id,
              studentId,
              state: "invited",
              canWrite: true,
              handRaised: false,
              consent: false,
            },
          ],
    }));
    toast("Đã tạo liên kết mới. Liên kết cũ đã hết quyền.");
  };
  return (
    <section className="card session-access">
      <SectionHead
        title="Học sinh & quyền tham gia"
        meta="Liên kết riêng cho từng học sinh · tối đa 5 em"
      />
      <div className="member-picker">
        {data.students
          .filter((s) => s.status === "active")
          .map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={ids.includes(s.id)}
                disabled={!mutable}
                onChange={() => toggle(s.id)}
              />
              <span>
                {s.name}
                <small>{s.grade}</small>
              </span>
            </label>
          ))}
      </div>
      {ids.length > 1 && (
        <label>
          Tên nhóm
          <input
            value={session.groupName || ""}
            placeholder="Nhóm Toán 9"
            disabled={!mutable}
            onChange={(e) =>
              setData((prev) => ({
                ...prev,
                sessions: prev.sessions.map((s) =>
                  s.id === session.id ? { ...s, groupName: e.target.value } : s,
                ),
              }))
            }
          />
        </label>
      )}
      <div className="settings-row">
        <span>
          <Link size={17} /> Hạn dùng cho liên kết mới
        </span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Hạn dùng liên kết"
        >
          <option value={1}>1 ngày</option>
          <option value={7}>7 ngày</option>
          <option value={30}>30 ngày</option>
        </select>
      </div>
      <div className="invite-list">
        {ids.map((id) => {
          const student = data.students.find((s) => s.id === id);
          const candidates = [...data.invites]
            .reverse()
            .filter((i) => i.sessionId === session.id && i.studentId === id);
          const invite = candidates.find(inviteValid) || candidates[0];
          const valid = inviteValid(invite);
          const ended = ["ended", "reviewed"].includes(session.status);
          return (
            <div className="invite-row" key={id}>
              <div>
                <strong>{student?.name}</strong>
                <small>
                  {invite
                    ? `${invite.revoked ? "Đã thu hồi" : valid ? "Hết hạn lúc" : "Đã hết hạn"} ${new Date(invite.expiresAt).toLocaleString("vi-VN")}`
                    : "Chưa có liên kết"}
                </small>
              </div>
              <div className="row-actions">
                {valid && !ended && (
                  <>
                    <button
                      className="icon-button"
                      aria-label={"Sao chép link của " + student?.name}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            inviteUrl(invite!),
                          );
                          toast("Đã sao chép liên kết.");
                        } catch {
                          toast(
                            "Không sao chép được. Dùng nút mở trang học sinh.",
                            "error",
                          );
                        }
                      }}
                    >
                      <Copy size={16} />
                    </button>
                    <a
                      className="icon-button"
                      aria-label={"Mở trang của " + student?.name}
                      href={inviteUrl(invite!)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} />
                    </a>
                    <button
                      className="text-button danger-text"
                      onClick={() => setRevoke(invite!)}
                    >
                      Thu hồi
                    </button>
                  </>
                )}
                {!ended && (
                  <button
                    className="button ghost small"
                    onClick={() => generate(id)}
                  >
                    {valid ? "Tạo lại" : "Tạo liên kết"}
                  </button>
                )}
                {ended && <Status>Đã kết thúc</Status>}
              </div>
            </div>
          );
        })}
      </div>
      <SectionHead
        title="Công cụ học sinh"
        meta="Giáo viên có thể thay đổi quyền trong buổi học."
      />
      <div className="tool-toggles">
        {(Object.keys(tools) as (keyof typeof tools)[]).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={tools[key]}
              onChange={(e) => {
                const checked = e.target.checked;
                setData((prev) => ({
                  ...prev,
                  sessions: prev.sessions.map((s) =>
                    s.id === session.id
                      ? {
                          ...s,
                          tools: {
                            ...(s.tools || defaultTools),
                            [key]: checked,
                          },
                        }
                      : s,
                  ),
                }));
              }}
            />
            {
              {
                board: "Bảng nháp",
                upload: "Gửi bài và ảnh",
                check: "Kiểm tra ngắn",
                chat: "Chat",
              }[key]
            }
          </label>
        ))}
      </div>
      <Banner>
        <ShieldCheck size={17} /> Mỗi em chỉ thấy bài của mình và nội dung giáo
        viên chia sẻ.
      </Banner>
      {revoke && (
        <Modal title="Thu hồi quyền tham gia?" onClose={() => setRevoke(null)}>
          <p>Học sinh sẽ rời phòng. Bài và minh chứng đã lưu được giữ lại.</p>
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setRevoke(null)}>
              Hủy
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                setData((prev) => ({
                  ...prev,
                  invites: prev.invites.map((i) =>
                    i.id === revoke.id ? { ...i, revoked: true } : i,
                  ),
                  members: prev.members.map((m) =>
                    m.sessionId === revoke.sessionId &&
                    m.studentId === revoke.studentId
                      ? { ...m, state: "left" }
                      : m,
                  ),
                }));
                setRevoke(null);
                toast("Đã thu hồi liên kết.");
              }}
            >
              Thu hồi
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
