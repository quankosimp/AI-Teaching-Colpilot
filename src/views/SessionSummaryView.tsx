import React, { useState } from 'react';
import { Claim, TabType } from '../types';

interface SessionSummaryViewProps {
  claims: Claim[];
  onSetClaims: React.Dispatch<React.SetStateAction<Claim[]>>;
  parentReport: string;
  onSetParentReport: (report: string) => void;
  onNavigate: (tab: TabType) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenEditClaim: (id: number, text: string) => void;
  onOpenEditReport: () => void;
  onOpenImageZoom: (url: string, title: string) => void;
}

export const SessionSummaryView: React.FC<SessionSummaryViewProps> = ({
  claims,
  onSetClaims,
  parentReport,
  onNavigate,
  onShowToast,
  onOpenEditClaim,
  onOpenEditReport,
  onOpenImageZoom
}) => {
  const [openEvidenceDrawer, setOpenEvidenceDrawer] = useState<{ [key: number]: boolean }>({});
  const [privateNote, setPrivateNote] = useState(
    'Minh học tập trung tốt nhất trong 60 phút đầu, sau đó cần giải lao ngắn 2 phút để tái tạo năng lượng. Nắm chắc Viète nhưng cần lưu ý hệ số a.'
  );
  const [isCopiedZalo, setIsCopiedZalo] = useState(false);

  // Resolved claims count
  const resolvedCount = claims.filter((c) => c.status !== 'pending').length;
  const allResolved = resolvedCount === claims.length;

  const handleApprove = (id: number) => {
    onSetClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'approved' } : c))
    );
    onShowToast(`Đã duyệt nhận định #${id} vào Hồ sơ học sinh!`, 'success');
  };

  const handleReject = (id: number) => {
    onSetClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'rejected' } : c))
    );
    onShowToast(`Đã bỏ qua nhận định #${id}.`, 'info');
  };

  const handlePostpone = (id: number) => {
    onSetClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'postponed' } : c))
    );
    onShowToast('Đã chuyển dạng bài nâng cao sang Giáo án Buổi 14.', 'success');
  };

  const handleApproveAll = () => {
    onSetClaims((prev) => prev.map((c) => ({ ...c, status: 'approved' })));
    onShowToast('Toàn bộ nhận định đã được phê duyệt và lưu vào Hồ sơ tích lũy!', 'success');
  };

  const handleCopyZalo = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(parentReport);
    }
    setIsCopiedZalo(true);
    onShowToast('Đã sao chép tin nhắn Zalo gửi phụ huynh!', 'success');
    setTimeout(() => setIsCopiedZalo(false), 2000);
  };

  const toggleEvidence = (id: number) => {
    setOpenEvidenceDrawer((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Top Session Summary Ribbon */}
      <div className="bg-white rounded-xl p-5 mb-5 shadow-xs border border-[#E2E8F0] relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[#e2dfff]/30 blur-2xl pointer-events-none"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-[#f0ecf9] font-code-sm text-xs text-[#3525cd] font-medium tracking-wide">
                SESSION #13
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#10B981] font-label-sm text-xs border border-[#A7F3D0]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                Đã hoàn thành 92 phút
              </span>
              <span className="font-label-sm text-[#94A3B8] text-xs">• 28/09/2024</span>
            </div>
            <h1 className="font-headline-lg tracking-tight text-[#0F172A] text-xl sm:text-2xl font-bold">
              Tổng kết Buổi 13: Phương trình bậc hai & Cực trị đại số
            </h1>
            <div className="flex items-center gap-3 font-body-sm text-[#475569] text-xs sm:text-sm flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#94A3B8]">person</span>
                Học sinh: <strong className="text-[#0F172A] font-semibold">Nguyễn Bảo Minh</strong> (Lớp 9A2)
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#8B5CF6]">psychology</span>
                AI Copilot trích xuất:{' '}
                <strong className="text-[#8B5CF6] font-semibold">3 nhận định cần thẩm định</strong>
              </span>
            </div>
          </div>

          {/* Quick Action CTA Group */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 pt-1 lg:pt-0">
            <button
              onClick={handleCopyZalo}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#eae6f4] hover:bg-[#e4e1ee] text-[#0F172A] font-label-md text-xs sm:text-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-[#4648d4]">chat</span>
              <span>{isCopiedZalo ? 'Đã sao chép ✓' : 'Sao chép báo cáo Zalo'}</span>
            </button>
            <button
              onClick={handleApproveAll}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-white font-label-md text-xs sm:text-sm shadow-xs transition-all cursor-pointer ${
                allResolved
                  ? 'bg-[#10B981] hover:bg-[#10B981]/90'
                  : 'bg-[#3525cd] hover:bg-[#4648d4]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {allResolved ? 'done_all' : 'verified'}
              </span>
              <span>{allResolved ? 'Đã lưu toàn bộ vào Hồ sơ' : 'Duyệt & Lưu vào Hồ sơ học sinh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Claim Approval Stream (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Section Header with Review Velocity Hint */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]"></div>
              <h2 className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                Nhận định AI đề xuất cần duyệt
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#8B5CF6] font-label-sm text-xs font-medium">
                2 phút phê duyệt
              </span>
            </div>
            <div className="font-label-sm text-[#94A3B8] text-xs">
              <span className="font-semibold text-[#0F172A]">{resolvedCount}</span>/{claims.length} đã xử lý
            </div>
          </div>

          {/* CLAIM CARDS */}
          {claims.map((claim) => {
            const isResolved = claim.status !== 'pending';

            return (
              <div
                key={claim.id}
                className={`bg-white rounded-xl p-4 shadow-xs transition-all duration-200 border border-[#E2E8F0] ${
                  isResolved ? 'opacity-70 bg-[#F8FAFC]' : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center font-code-sm text-xs font-semibold ${
                        claim.levelType === 'high'
                          ? 'bg-[#ECFDF5] text-[#10B981]'
                          : claim.levelType === 'warning'
                          ? 'bg-[#FFFBEB] text-[#F59E0B]'
                          : 'bg-[#eae6f4] text-[#475569]'
                      }`}
                    >
                      0{claim.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-label-sm text-xs ${
                        claim.levelType === 'high'
                          ? 'bg-[#ECFDF5] text-[#10B981]'
                          : claim.levelType === 'warning'
                          ? 'bg-[#FFFBEB] text-[#F59E0B]'
                          : 'bg-[#F0F9FF] text-[#0EA5E9]'
                      }`}
                    >
                      {claim.level}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-code-sm text-xs text-[#94A3B8]">{claim.time}</span>
                    {claim.status === 'approved' && (
                      <span className="px-1.5 py-0.5 rounded bg-[#ECFDF5] text-[#10B981] text-[11px] font-bold">
                        Đã duyệt ✓
                      </span>
                    )}
                    {claim.status === 'rejected' && (
                      <span className="px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#EF4444] text-[11px] font-bold">
                        Bỏ qua
                      </span>
                    )}
                    {claim.status === 'postponed' && (
                      <span className="px-1.5 py-0.5 rounded bg-[#e1e0ff] text-[#07006c] text-[11px] font-bold">
                        Đã dời Buổi 14
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-[#0F172A] font-body-md text-xs sm:text-sm leading-relaxed">
                  <p>{claim.content}</p>
                </div>

                {/* Evidence Attachment Preview if any */}
                {claim.attachment && (
                  <div className="mt-3.5 bg-[#f5f2ff] rounded-lg p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-[#E2E8F0]/70">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {claim.attachment.type === 'latex' ? (
                        <div className="w-8 h-8 rounded-lg bg-[#eae6f4] text-[#3525cd] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[18px]">terminal</span>
                        </div>
                      ) : (
                        <div
                          onClick={() =>
                            claim.attachment?.imageUrl &&
                            onOpenImageZoom(claim.attachment.imageUrl, claim.attachment.title)
                          }
                          className="relative w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-[#eae6f4] cursor-pointer group"
                        >
                          <img
                            src={claim.attachment.imageUrl}
                            alt="Evidence thumbnail"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-white font-code-sm text-[9px]">
                            HĐ 3
                          </div>
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="font-label-md text-xs sm:text-sm text-[#0F172A] truncate font-medium">
                          {claim.attachment.title}
                        </div>
                        {claim.attachment.log && (
                          <div className="font-code-sm text-[11px] text-[#94A3B8] truncate">
                            {claim.attachment.log}
                          </div>
                        )}
                        {claim.attachment.description && (
                          <div className="font-body-sm text-[11px] text-[#475569] line-clamp-1">
                            {claim.attachment.description}
                          </div>
                        )}
                      </div>
                    </div>

                    {claim.attachment.details && (
                      <button
                        onClick={() => toggleEvidence(claim.id)}
                        className="px-2 py-1 rounded bg-white font-label-sm text-xs text-[#4648d4] hover:text-[#3525cd] transition-colors flex items-center gap-1 shrink-0 border border-[#E2E8F0] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                        <span>{openEvidenceDrawer[claim.id] ? 'Thu gọn' : 'Chi tiết'}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Detail Evidence Drawer */}
                {claim.attachment?.details && openEvidenceDrawer[claim.id] && (
                  <div className="mt-2 p-3 bg-[#f0ecf9] rounded-lg font-code-sm text-xs text-[#475569] border border-[#E2E8F0]">
                    <div className="font-semibold text-[#0F172A] mb-1">Dữ liệu quan sát thời gian thực:</div>
                    {claim.attachment.details.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                )}

                {/* Inline Action Buttons */}
                <div className="mt-4 pt-3 flex items-center justify-between gap-2 bg-[#f5f2ff]/60 rounded-lg p-2 border border-[#E2E8F0]/40">
                  <span className="font-label-sm text-[#94A3B8] italic px-1 text-xs">
                    {claim.id === 3
                      ? 'Tự động đính kèm vào Giáo án Buổi 14:'
                      : claim.id === 2
                      ? 'Lưu nhận định vào hồ sơ theo dõi lỗi:'
                      : 'Xác nhận chuyển vào bộ nhớ dài hạn:'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {claim.id === 3 ? (
                      <button
                        onClick={() => handlePostpone(3)}
                        disabled={claim.status === 'postponed'}
                        className="px-3.5 py-1.5 rounded-lg bg-[#4648d4] text-white hover:bg-[#3525cd] font-label-md text-xs font-medium transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">fast_forward</span>
                        <span>Chuyển sang buổi sau ✓</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleReject(claim.id)}
                          className="px-2.5 py-1.5 rounded-lg hover:bg-[#FEF2F2] text-[#475569] hover:text-[#EF4444] font-label-md text-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          <span className="hidden sm:inline">Bỏ qua</span>
                        </button>
                        <button
                          onClick={() => onOpenEditClaim(claim.id, claim.content)}
                          className="px-2.5 py-1.5 rounded-lg hover:bg-[#eae6f4] text-[#475569] hover:text-[#0F172A] font-label-md text-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          <span className="hidden sm:inline">Sửa</span>
                        </button>
                        <button
                          onClick={() => handleApprove(claim.id)}
                          disabled={claim.status === 'approved'}
                          className="px-3.5 py-1.5 rounded-lg bg-[#10B981] text-white hover:bg-[#10B981]/90 font-label-md text-xs font-semibold transition-all shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>Duyệt ✓</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT COLUMN: Parent Report & Next Session Blueprint (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Card: Parent Report Card (Zalo Formatted) */}
          <div className="bg-white rounded-xl p-4 shadow-xs border border-[#E2E8F0] relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#e1e0ff] text-[#07006c] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">family_restroom</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-[#0F172A] font-bold text-sm">
                    Báo cáo gửi Phụ huynh
                  </h3>
                  <p className="font-label-sm text-[#94A3B8] text-xs">
                    Định dạng chuẩn Zalo • Dễ đọc & Tích cực
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyZalo}
                className="p-1.5 rounded-lg hover:bg-[#f0ecf9] text-[#4648d4] transition-colors cursor-pointer"
                title="Sao chép nhanh"
              >
                <span className="material-symbols-outlined text-[20px]">content_copy</span>
              </button>
            </div>

            {/* Report Bubble Area */}
            <div className="bg-[#f5f2ff] rounded-xl p-3.5 space-y-3 font-body-sm text-xs text-[#0F172A] relative border border-[#E2E8F0]/70">
              <div className="flex items-center justify-between pb-2 text-[#94A3B8] font-label-sm text-xs">
                <span>
                  Người nhận: <strong className="text-[#0F172A]">Mẹ Bảo Minh (Chị Lan)</strong>
                </span>
                <span className="font-code-sm text-[#10B981] font-semibold">Sẵn sàng gửi</span>
              </div>

              <div className="space-y-2 whitespace-pre-line leading-relaxed bg-white p-3 rounded-lg shadow-xs border border-[#E2E8F0] text-xs font-sans">
                {parentReport}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-label-sm text-[#94A3B8] flex items-center gap-1 text-xs">
                  <span className="material-symbols-outlined text-[14px] text-[#10B981]">check_circle</span>
                  Đã cá nhân hoá theo tiến độ thực tế
                </span>
                <button
                  onClick={onOpenEditReport}
                  className="font-label-sm text-[#4648d4] hover:underline flex items-center gap-0.5 text-xs font-semibold cursor-pointer"
                >
                  <span>Chỉnh sửa câu chữ</span>
                  <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* 1-Click Zalo Direct Copy Button */}
            <button
              onClick={handleCopyZalo}
              className="w-full mt-3.5 py-2.5 px-3 rounded-lg bg-[#eae6f4] hover:bg-[#e4e1ee] text-[#0F172A] font-label-md text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-[#4648d4]">send</span>
              <span>{isCopiedZalo ? 'Đã sao chép vào bộ nhớ tạm ✓' : 'Sao chép toàn bộ tin nhắn Zalo'}</span>
            </button>
          </div>

          {/* Card: Next Session Blueprint (Buổi 14) */}
          <div className="bg-white rounded-xl p-4 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#F5F3FF] text-[#8B5CF6] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">event_repeat</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-[#0F172A] font-bold text-sm">
                    Đề xuất cho Buổi 14
                  </h3>
                  <p className="font-label-sm text-[#94A3B8] text-xs">
                    Dự kiến: Thứ Tư, 02/10 (19:30 - 21:00)
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#8B5CF6] font-label-sm text-xs font-medium">
                AI Tự động lên khung
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Item 1 */}
              <div className="p-2.5 rounded-lg bg-[#f5f2ff] flex items-start gap-2.5 border border-[#E2E8F0]/60">
                <div className="w-5 h-5 rounded-full bg-[#FFFBEB] text-[#F59E0B] flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5 border border-[#FDE68A]">
                  1
                </div>
                <div className="text-[#0F172A] text-xs leading-snug">
                  <span className="font-semibold text-[#0F172A]">10 phút đầu giờ:</span> Khởi động nhanh với 2 bài trắc nghiệm lừa bẫy điều kiện có nghiệm $\Delta \ge 0$ và hệ số $a \ne 0$.
                </div>
              </div>

              {/* Item 2 */}
              <div className="p-2.5 rounded-lg bg-[#f5f2ff] flex items-start gap-2.5 border border-[#E2E8F0]/60">
                <div className="w-5 h-5 rounded-full bg-[#e2dfff] text-[#0f0069] flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5">
                  2
                </div>
                <div className="text-[#0F172A] text-xs leading-snug">
                  <span className="font-semibold text-[#0F172A]">Trọng tâm 45 phút:</span> Hoàn thiện Dạng bài cực trị nâng cao số 4 (chuyển tiếp từ Buổi 13) kết hợp bất đẳng thức AM-GM.
                </div>
              </div>

              {/* Item 3 */}
              <div className="p-2.5 rounded-lg bg-[#f5f2ff] flex items-start gap-2.5 border border-[#E2E8F0]/60">
                <div className="w-5 h-5 rounded-full bg-[#e1e0ff] text-[#07006c] flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5">
                  3
                </div>
                <div className="text-[#0F172A] text-xs leading-snug">
                  <span className="font-semibold text-[#0F172A]">Chốt buổi & Đánh giá:</span> Mini-test 15 phút tổng kết toàn bộ Chuyên đề Phương trình bậc hai.
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 flex items-center justify-between border-t border-[#F1F5F9]">
              <span className="font-label-sm text-[#94A3B8] text-xs">
                Đã liên kết hồ sơ năng lực Bảo Minh
              </span>
              <button
                onClick={() => onNavigate('soan-giao-an-voi-ai-copilot')}
                className="font-label-sm text-[#3525cd] font-semibold hover:underline flex items-center gap-1 text-xs cursor-pointer"
              >
                <span>Mở trang Soạn giáo án #14</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>
          </div>

          {/* Quick Tutor Session Notes (Autosaved) */}
          <div className="bg-white rounded-xl p-4 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
              <label
                className="font-headline-sm text-[#0F172A] flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
                htmlFor="privateNote"
              >
                <span className="material-symbols-outlined text-[18px] text-[#94A3B8]">lock</span>
                Ghi chú bảo mật của gia sư
              </label>
              <div className="flex items-center gap-1 font-label-sm text-[#10B981] text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                <span>Đã tự động lưu</span>
              </div>
            </div>
            <textarea
              className="w-full bg-[#f5f2ff] rounded-lg p-2.5 text-xs sm:text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white transition-all border border-[#E2E8F0]"
              id="privateNote"
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value)}
              placeholder="Ghi chú riêng tư (Phụ huynh không thấy): Minh học tập trung tốt nhất trong 60 phút đầu, sau đó cần giải lao ngắn 2 phút..."
              rows={2}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
