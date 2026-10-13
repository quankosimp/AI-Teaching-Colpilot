import React, { useState } from 'react';
import { StudentProfile, TabType } from '../types';

interface StudentProfileViewProps {
  profile: StudentProfile;
  onNavigate: (tab: TabType) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenImageZoom: (url: string, title: string) => void;
}

export const StudentProfileView: React.FC<StudentProfileViewProps> = ({
  profile,
  onNavigate,
  onShowToast,
  onOpenImageZoom
}) => {
  const [showAllSessions, setShowAllSessions] = useState(false);

  const extraSessions: StudentProfile['sessionHistory'] = [
    {
      sessionNumber: 9,
      dateTime: '16/09/2024 • 19:30 - 21:00',
      badge: 'Đạt mục tiêu',
      badgeStatus: 'goal_met',
      title: 'Bất đẳng thức Cauchy (AM-GM) trong đề thi chuyên',
      summary: 'Kỹ thuật chọn điểm rơi đối xứng đã hiểu rất nhanh. Đã giải trọn vẹn 3 bài tập về nhà.',
      evidenceCount: 2,
      durationMinutes: 90
    },
    {
      sessionNumber: 8,
      dateTime: '12/09/2024 • 19:30 - 21:00',
      badge: 'Đã duyệt nhận định',
      badgeStatus: 'approved',
      title: 'Rút gọn biểu thức chứa căn thức bậc hai',
      summary: 'Hoàn thành tốt các kỹ năng nhân liên hợp và phân tích đa thức thành nhân tử.',
      evidenceCount: 1,
      durationMinutes: 90
    }
  ];

  const displayedHistory = showAllSessions
    ? [...profile.sessionHistory, ...extraSessions]
    : profile.sessionHistory;

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Minimalist Profile Header */}
      <section className="relative w-full rounded-2xl bg-white shadow-xs border border-[#E2E8F0] overflow-hidden mb-6 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Student Identity & High-Level Goal */}
          <div className="flex items-start sm:items-center gap-5">
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#eae6f4] text-[#3525cd] flex items-center justify-center font-headline-lg text-xl sm:text-2xl font-bold shadow-xs">
                BM
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#ECFDF5] flex items-center justify-center ring-2 ring-white">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <h1 className="font-headline-lg text-[#0F172A] tracking-tight font-bold text-xl sm:text-2xl">
                  {profile.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-[#f0ecf9] text-[#4648d4] font-label-sm text-xs font-semibold">
                  {profile.grade}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-[#475569] text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#4648d4] text-[18px]">flag</span>
                  <span className="font-body-md text-xs sm:text-sm">
                    Mục tiêu: <strong className="text-[#0F172A] font-semibold">{profile.target}</strong>
                  </span>
                </div>
                <span className="text-[#94A3B8] hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#94A3B8] text-[17px]">
                    calendar_today
                  </span>
                  <span className="font-body-sm text-[#94A3B8] text-xs">
                    Kỳ thi dự kiến: {profile.examDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Action Call to Action */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => onNavigate('soan-giao-an-voi-ai-copilot')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#3525cd] hover:bg-[#4648d4] text-white font-label-lg font-semibold shadow-xs transition-all cursor-pointer text-xs sm:text-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[19px]">add_circle</span>
              <span>Tạo buổi học mới</span>
            </button>
          </div>
        </div>

        {/* Quick Vital Glance Ribbons */}
        <div className="mt-8 pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0]">
          <div>
            <div className="font-label-sm text-[#94A3B8] uppercase tracking-wider mb-0.5 text-[11px]">
              Tiến độ tích luỹ
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-md text-[#0F172A] font-bold text-lg sm:text-xl">
                {profile.sessionsCompleted}
              </span>
              <span className="font-body-sm text-[#94A3B8] text-xs">
                / {profile.totalSessions} buổi
              </span>
            </div>
          </div>

          <div>
            <div className="font-label-sm text-[#94A3B8] uppercase tracking-wider mb-0.5 text-[11px]">
              Tỷ lệ nắm kiến thức
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-md text-[#10B981] font-bold text-lg sm:text-xl">
                {profile.retentionRate}%
              </span>
              <span className="font-label-sm text-[#10B981] font-medium text-xs">↑ Ổn định</span>
            </div>
          </div>

          <div>
            <div className="font-label-sm text-[#94A3B8] uppercase tracking-wider mb-0.5 text-[11px]">
              Mức trợ giúp trung bình
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-md text-[#F59E0B] font-bold text-lg sm:text-xl">
                {profile.avgHelpLevel}
              </span>
              <span className="font-label-sm text-[#94A3B8] text-xs">
                ({profile.avgHelpPercent}%)
              </span>
            </div>
          </div>

          <div>
            <div className="font-label-sm text-[#94A3B8] uppercase tracking-wider mb-0.5 text-[11px]">
              Buổi học kế tiếp
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-headline-md text-[#3525cd] font-bold text-lg sm:text-xl">
                {profile.nextSessionTime}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Clean 2-Column Core Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 40% (lg:col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card: Core Learning Traits */}
          <section className="bg-white rounded-2xl p-6 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#3525cd] text-[20px]">
                  psychology
                </span>
                <h2 className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                  Đặc điểm học tập cốt lõi
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#f0ecf9] font-label-sm text-[#475569] text-xs">
                Cập nhật buổi 12
              </span>
            </div>

            <div className="flex flex-col gap-5">
              {/* Strengths */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                  <span className="font-label-md text-[#475569] font-semibold uppercase tracking-wider text-xs">
                    Điểm mạnh
                  </span>
                </div>
                <div className="space-y-2">
                  {profile.strengths.map((str, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#ECFDF5] flex items-start gap-2.5 border border-[#A7F3D0]/60"
                    >
                      <span className="material-symbols-outlined text-[#10B981] text-[18px] shrink-0 mt-0.5">
                        check_circle
                      </span>
                      <span className="font-body-md text-[#0F172A] text-xs sm:text-sm">
                        {str}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Growth Areas */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444]"></span>
                  <span className="font-label-md text-[#475569] font-semibold uppercase tracking-wider text-xs">
                    Khó khăn cần kèm
                  </span>
                </div>
                <div className="space-y-2">
                  {profile.weaknesses.map((weak, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#FEF2F2] flex items-start gap-2.5 border border-[#FECACA]/60"
                    >
                      <span className="material-symbols-outlined text-[#EF4444] text-[18px] shrink-0 mt-0.5">
                        warning
                      </span>
                      <span className="font-body-md text-[#0F172A] text-xs sm:text-sm">
                        {weak}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Support Level Distribution Bar */}
              <div className="pt-2 border-t border-[#F1F5F9]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label-md text-[#475569] font-semibold text-xs">
                    Mức độ hỗ trợ thường gặp
                  </span>
                  <span className="font-label-md text-[#F59E0B] font-semibold text-xs">
                    {profile.supportDistribution.guided}% Cần gợi ý nhỏ
                  </span>
                </div>

                {/* Segmented Support Progress */}
                <div className="h-2 w-full rounded-full bg-[#F8FAFC] flex overflow-hidden border border-[#CBD5E1]/40">
                  <div
                    className="bg-[#10B981] h-full"
                    style={{ width: `${profile.supportDistribution.independent}%` }}
                    title={`Tự lực hoàn toàn (${profile.supportDistribution.independent}%)`}
                  />
                  <div
                    className="bg-[#F59E0B] h-full"
                    style={{ width: `${profile.supportDistribution.guided}%` }}
                    title={`Cần gợi ý nhỏ (${profile.supportDistribution.guided}%)`}
                  />
                  <div
                    className="bg-[#3525cd] h-full"
                    style={{ width: `${profile.supportDistribution.heavy}%` }}
                    title={`Hướng dẫn từng bước (${profile.supportDistribution.heavy}%)`}
                  />
                </div>

                <div className="flex items-center justify-between mt-2 font-label-sm text-[#94A3B8] text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                    Tự lực {profile.supportDistribution.independent}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
                    Gợi ý nhỏ {profile.supportDistribution.guided}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3525cd]"></span>
                    Kèm sát {profile.supportDistribution.heavy}%
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Card: Persistent Tutor Notes */}
          <section className="bg-white rounded-2xl p-6 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4648d4] text-[20px]">
                  sticky_note_2
                </span>
                <h2 className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                  Ghi chú gia sư tích lũy
                </h2>
              </div>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#10B981] font-label-sm text-xs font-medium border border-[#A7F3D0]">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Đã xác nhận
              </span>
            </div>

            <p className="font-body-sm text-[#94A3B8] mb-4 text-xs">
              Nguyên tắc sư phạm cá nhân hóa lưu giữ qua từng buổi học để bảo toàn chất lượng giảng dạy.
            </p>

            <div className="space-y-3">
              {profile.tutorNotes.map((note, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#f5f2ff] border border-[#E2E8F0]/70"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-[#3525cd] font-semibold text-xs">
                      {note.category}
                    </span>
                    <span className="font-code-sm text-[#94A3B8] text-[11px]">{note.savedFrom}</span>
                  </div>
                  <p className="font-body-md text-[#0F172A] leading-snug text-xs sm:text-sm">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: 60% (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Actionable Module: Carryover items for next session */}
          <section className="bg-white rounded-2xl p-6 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F59E0B] text-[20px]">
                  assignment_late
                </span>
                <h2 className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                  Tồn đọng cho buổi tới
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#F59E0B] font-label-sm text-xs font-semibold border border-[#FDE68A]">
                {profile.carryovers.length} việc cần xử lý
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Carryover Cards */}
              {profile.carryovers.map((item) => {
                const isHomework = item.type === 'Bài tập về nhà';
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onShowToast(`Đã đính kèm "${item.title}" vào giáo án buổi tới!`, 'success');
                      onNavigate('soan-giao-an-voi-ai-copilot');
                    }}
                    className={`p-4 rounded-xl flex flex-col justify-between cursor-pointer hover:shadow-xs transition-all border ${
                      isHomework
                        ? 'bg-[#FFFBEB] border-[#FDE68A]'
                        : 'bg-[#F0F9FF] border-[#BAE6FD]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded bg-white text-[#F59E0B] font-label-sm text-xs font-medium border border-[#E2E8F0]">
                          {item.type}
                        </span>
                        <span className="font-body-sm text-[#475569] font-medium text-xs">
                          {item.timing}
                        </span>
                      </div>
                      <h3 className="font-label-lg text-[#0F172A] font-semibold mb-1 text-sm">
                        {item.title}
                      </h3>
                      <p className="font-body-sm text-[#475569] text-xs leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-3 flex items-center justify-between text-[#475569] border-t border-black/5">
                      <span className="font-label-sm text-xs">{item.duration}</span>
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          isHomework ? 'text-[#F59E0B]' : 'text-[#0EA5E9]'
                        }`}
                      >
                        arrow_forward
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Timeline: Recent Lessons History */}
          <section className="bg-white rounded-2xl p-6 shadow-xs border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#3525cd] text-[20px]">
                  history_edu
                </span>
                <h2 className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                  Lịch sử buổi học gần nhất
                </h2>
              </div>
              <span className="font-label-sm text-[#94A3B8] text-xs">
                {profile.sessionsCompleted} buổi đã diễn ra
              </span>
            </div>

            <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-[#f0ecf9]">
              {displayedHistory.map((sess) => {
                const isLatest = sess.sessionNumber === 12;

                return (
                  <div key={sess.sessionNumber} className="relative flex items-start gap-4">
                    <div
                      className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-xs font-code-sm text-xs font-bold ${
                        isLatest
                          ? 'bg-[#10B981] text-white'
                          : 'bg-[#eae6f4] text-[#475569]'
                      }`}
                    >
                      {sess.sessionNumber}
                    </div>

                    <div className="flex-1 bg-[#F8FAFC] rounded-xl p-4 transition-all border border-[#E2E8F0]/70">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <span className="font-label-sm text-[#94A3B8] text-xs">
                          {sess.dateTime}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-label-sm text-xs font-semibold flex items-center gap-1 ${
                            sess.badgeStatus === 'approved'
                              ? 'bg-[#ECFDF5] text-[#10B981]'
                              : sess.badgeStatus === 'goal_met'
                              ? 'bg-[#ECFDF5] text-[#10B981]'
                              : 'bg-[#FFFBEB] text-[#F59E0B]'
                          }`}
                        >
                          {sess.badgeStatus === 'approved' && (
                            <span className="material-symbols-outlined text-[13px]">check</span>
                          )}
                          {sess.badge}
                        </span>
                      </div>

                      <h3 className="font-headline-sm text-[#0F172A] font-bold mb-2 text-sm sm:text-base">
                        {sess.title}
                      </h3>
                      <p className="font-body-md text-[#475569] mb-3 leading-relaxed text-xs sm:text-sm">
                        {sess.summary}
                      </p>

                      {/* Evidences Tagging & Recap Link */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 bg-white rounded-lg px-3 py-2 border border-[#E2E8F0]">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-[#94A3B8]">
                            <span className="material-symbols-outlined text-[16px] text-[#3525cd]">
                              image
                            </span>
                            <span className="font-body-sm font-medium text-[#0F172A] text-xs">
                              {sess.evidenceCount || 2} bằng chứng ảnh
                            </span>
                          </div>
                          <span className="text-[#E2E8F0] font-light">|</span>
                          <div className="flex items-center gap-1.5 text-[#94A3B8]">
                            <span className="material-symbols-outlined text-[16px] text-[#10B981]">
                              timer
                            </span>
                            <span className="font-body-sm font-medium text-[#0F172A] text-xs">
                              {sess.durationMinutes} phút dạy
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (sess.sessionNumber === 12) {
                              onOpenImageZoom(
                                'https://lh3.googleusercontent.com/aida-public/AB6AXuAuGJsprLKw0tulPZXs0o8W84XHI1OAqP2yPqrjUDvqwcVs9gyxAAe1V7___G23enLuuYoevrTEP6kz_cpf2sjjDx6qK5UWASp-tP3VaKhdQzNrWTKVLZR4giRwDz8KLv9jTDaQM7Y9PKg7E7zM4yLK8W3dYP-7FQeutg2LfoECHZX5J9HzjQjUmP28VxOFfZDR-oMynDbpRjGMqSjR7GKH3QTtHFk-_dnf9y0pKss60fJyaYBLYotx',
                                `Bằng chứng ghi chép Buổi ${sess.sessionNumber}`
                              );
                            } else {
                              onShowToast(`Đang tải dữ liệu lưu trữ Buổi #${sess.sessionNumber}...`, 'info');
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[#3525cd] hover:text-[#4648d4] font-label-md font-semibold transition-colors text-xs cursor-pointer"
                        >
                          <span>Xem lại buổi học</span>
                          <span className="material-symbols-outlined text-[16px]">
                            chevron_right
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setShowAllSessions(!showAllSessions)}
                className="inline-flex items-center gap-1.5 text-[#475569] hover:text-[#0F172A] font-label-md font-semibold transition-colors text-xs sm:text-sm cursor-pointer"
                type="button"
              >
                <span>{showAllSessions ? 'Thu gọn lịch sử' : 'Tải thêm các buổi học trước'}</span>
                <span
                  className={`material-symbols-outlined text-[16px] transition-transform ${
                    showAllSessions ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
