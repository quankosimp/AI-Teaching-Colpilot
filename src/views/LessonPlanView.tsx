import React, { useState } from 'react';
import { Activity, TabType } from '../types';

interface LessonPlanViewProps {
  activities: Activity[];
  onSetActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  onNavigate: (tab: TabType) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenImageZoom: (url: string, title: string) => void;
  onOpenAddActivity: () => void;
}

export const LessonPlanView: React.FC<LessonPlanViewProps> = ({
  activities,
  onSetActivities,
  onNavigate,
  onShowToast,
  onOpenImageZoom,
  onOpenAddActivity,
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aiOptimized, setAiOptimized] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([
    'Bảng tóm tắt Viète',
    'Bài mẫu Buổi 12'
  ]);

  const totalMinutes = activities.reduce((acc, curr) => acc + curr.duration, 0);

  const handleAiOptimize = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      setIsOptimizing(false);
      setAiOptimized(true);
      onShowToast('Đã chuẩn hóa sư phạm & tối ưu nhịp độ giáo án theo Bảo Minh!', 'success');
      setTimeout(() => setAiOptimized(false), 3000);
    }, 1300);
  };

  const handleAddRealWorldProblem = () => {
    onSetActivities((prev) =>
      prev.map((act) => {
        if (act.id === 4) {
          return {
            ...act,
            exercises: [
              ...act.exercises,
              {
                id: `ex-${Date.now()}`,
                title: 'Bài toán thực tế: Tối ưu kích thước mảnh vườn chữ nhật có diện tích đạt Max khi biết chu vi qua định lý Viète',
                duration: '10 phút',
                note: 'Tích hợp toán thực tế theo định hướng thi vào 10 mới'
              }
            ]
          };
        }
        return act;
      })
    );
    onShowToast('Đã chèn 1 bài toán thực tế cực trị vào Hoạt động 4!', 'success');
  };

  const handleAddScaffoldingToHd3 = () => {
    onSetActivities((prev) =>
      prev.map((act) => {
        if (act.id === 3) {
          return {
            ...act,
            exercises: act.exercises.map((ex, idx) =>
              idx === 0
                ? {
                    ...ex,
                    scaffolding: 'Đã bổ sung 3 nấc gợi ý: 1. Biến đổi S, P -> 2. Tách hằng đẳng thức -> 3. Biện luận delta'
                  }
                : ex
            )
          };
        }
        return act;
      })
    );
    onShowToast('Đã cập nhật hệ thống 3 nấc gợi mở (Scaffolding) cho HĐ 3!', 'success');
  };

  const handleGeneratePdf = () => {
    onShowToast('Đang kết xuất phiếu bài tập in ấn PDF kèm mã QR đáp án...', 'info');
    setTimeout(() => {
      onShowToast('Đã tạo thành công file PDF: Phieu_Bai_Tap_Buoi_13_BaoMinh.pdf', 'success');
    }, 1200);
  };

  const handleSendPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    const promptText = customPrompt.trim();
    setCustomPrompt('');
    onShowToast(`AI Copilot đang xử lý: "${promptText}"`, 'info');
    setTimeout(() => {
      onShowToast('AI Copilot đã cập nhật đề xuất sư phạm vào giáo án!', 'success');
    }, 1500);
  };

  const handleAddExerciseToActivity = (activityId: number) => {
    const title = prompt('Nhập tên bài tập hoặc nội dung câu hỏi mới:');
    if (!title || !title.trim()) return;
    const time = prompt('Thời lượng dự kiến (phút):', '5') || '5';

    onSetActivities((prev) =>
      prev.map((act) => {
        if (act.id === activityId) {
          return {
            ...act,
            exercises: [
              ...act.exercises,
              {
                id: `ex-${Date.now()}`,
                title: title.trim(),
                duration: `${time} phút`
              }
            ]
          };
        }
        return act;
      })
    );
    onShowToast('Đã thêm bài tập mới vào hoạt động!', 'success');
  };

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Top Session Meta Bar */}
      <div className="relative overflow-hidden bg-white rounded-xl shadow-xs border border-[#E2E8F0]/70 mb-6 p-6">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-[#e1e0ff]/30 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#eae6f4] text-[#3525cd] font-label-sm font-semibold tracking-wide uppercase text-xs">
                Toán Chín • Nâng Cao
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#CBD5E1]"></span>
              <span className="font-label-md text-[#475569] flex items-center gap-1 text-xs sm:text-sm">
                <span className="material-symbols-outlined text-[16px] text-[#94A3B8]">schedule</span> 90 phút
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#CBD5E1]"></span>
              <span className="font-label-md text-[#475569] flex items-center gap-1 text-xs sm:text-sm">
                <span className="material-symbols-outlined text-[16px] text-[#94A3B8]">calendar_today</span> 28/09
              </span>
            </div>
            <h1 className="font-headline-lg text-[#0F172A] tracking-tight text-xl sm:text-2xl md:text-3xl font-bold">
              Buổi 13: Phương trình bậc hai & Cực trị đại số
            </h1>
            <p className="font-body-md text-[#475569] text-sm">
              Học sinh: <span className="font-semibold text-[#0F172A]">Nguyễn Bảo Minh</span> • Mục tiêu trọng tâm: Hệ thức Viète & Kỹ thuật biến đổi đưa về tổng - tích
            </p>
          </div>

          {/* Action Group */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAiOptimize}
              disabled={isOptimizing}
              className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer ${
                aiOptimized
                  ? 'bg-[#ECFDF5] text-[#10B981]'
                  : 'bg-[#F5F3FF] text-[#8B5CF6] hover:bg-[#e1e0ff]/60'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isOptimizing ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isOptimizing ? 'refresh' : aiOptimized ? 'check' : 'auto_awesome'}
              </span>
              <span className="font-label-lg font-semibold text-xs sm:text-sm">
                {isOptimizing
                  ? 'Đang tối ưu theo Minh...'
                  : aiOptimized
                  ? 'Đã chuẩn hóa sư phạm!'
                  : 'AI Tối ưu giáo án'}
              </span>
            </button>
            <button
              onClick={() => onNavigate('phong-day-truc-tiep-ai-copilot')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3525cd] text-white hover:bg-[#4648d4] transition-all shadow-sm hover:shadow cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">play_circle</span>
              <span className="font-label-lg font-semibold text-xs sm:text-sm">Bắt đầu dạy ngay</span>
            </button>
          </div>
        </div>

        {/* AI Student Profile Context Banner */}
        <div className="mt-6 pt-5 bg-[#f5f2ff] rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-[#e1e0ff]/60">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#eae6f4] text-[#3525cd] flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                psychology
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-[#3525cd] uppercase font-bold tracking-wider text-xs">
                  Hồ sơ học tập AI (Từ Buổi 12)
                </span>
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
              </div>
              <p className="font-body-md text-[#0F172A] mt-0.5 text-xs sm:text-sm leading-relaxed">
                Minh hay quên điều kiện có nghiệm{' '}
                <code className="font-code-sm bg-white px-1.5 py-0.5 rounded text-[#3525cd] font-bold border border-[#E2E8F0]">
                  Δ ≥ 0
                </code>{' '}
                trước khi áp dụng định lý Viète và cần luyện thêm phản xạ tìm{' '}
                <span className="font-medium text-[#0F172A] underline decoration-[#F59E0B] decoration-2">
                  GTNN (Min)
                </span>{' '}
                của biểu thức đối xứng.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('ho-so-hoc-sinh-tri-thuc-tich-luy')}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white text-[#475569] hover:text-[#0F172A] text-xs font-semibold transition-colors shadow-xs border border-[#E2E8F0] cursor-pointer"
          >
            Xem chi tiết hồ sơ
          </button>
        </div>
      </div>

      {/* Main Workflow Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Timeline & Activities (Left Main - 8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <span className="font-headline-sm text-[#0F172A] font-bold tracking-tight text-base sm:text-lg">
                Kịch bản chi tiết 5 hoạt động
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#eae6f4] font-label-sm text-[#475569] font-medium text-xs">
                {totalMinutes}/90 phút
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#94A3B8] text-xs font-medium">
              <span className="material-symbols-outlined text-[16px]">drag_indicator</span> Kéo thả điều chỉnh thứ tự
            </div>
          </div>

          {/* Activity List */}
          {activities.map((act) => {
            const isHd3 = act.id === 3 || act.isCustomHighlight;

            return (
              <div
                key={act.id}
                className={`bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all group relative border ${
                  isHd3 ? 'border-[#3525cd] overflow-hidden' : 'border-[#E2E8F0]'
                }`}
              >
                {isHd3 && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#3525cd]"></div>}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <button className="mt-1 cursor-grab text-[#94A3B8] group-hover:text-[#0F172A] transition-colors">
                      <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-label-sm text-xs font-bold ${
                            isHd3
                              ? 'bg-[#3525cd] text-white'
                              : 'bg-[#f0ecf9] text-[#475569]'
                          }`}
                        >
                          {act.code}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-label-sm text-xs font-medium ${
                            act.badgeColor === 'status-approved'
                              ? 'bg-[#ECFDF5] text-[#10B981]'
                              : act.badgeColor === 'status-pending'
                              ? 'bg-[#F0F9FF] text-[#0EA5E9]'
                              : act.badgeColor === 'status-guided'
                              ? 'bg-[#FFFBEB] text-[#F59E0B]'
                              : 'bg-[#e1e0ff] text-[#07006c]'
                          }`}
                        >
                          {act.badge}
                        </span>
                        {act.customPill && (
                          <span className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#8B5CF6] font-label-sm text-xs flex items-center gap-1 font-medium">
                            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                              auto_awesome
                            </span>
                            {act.customPill}
                          </span>
                        )}
                      </div>
                      <h3 className="font-headline-sm text-[#0F172A] mt-1.5 font-semibold text-sm sm:text-base">
                        {act.title}
                      </h3>
                      <p className="font-body-sm text-[#475569] mt-1 text-xs sm:text-sm">
                        {act.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAddExerciseToActivity(act.id)}
                      className="w-8 h-8 rounded-lg bg-[#f5f2ff] hover:bg-[#f0ecf9] text-[#475569] flex items-center justify-center transition-colors"
                      title="Chỉnh sửa hoạt động"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => onShowToast(`Hoạt động ${act.code} đã sẵn sàng`, 'info')}
                      className="w-8 h-8 rounded-lg bg-[#f5f2ff] hover:bg-[#f0ecf9] text-[#475569] flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">more_vert</span>
                    </button>
                  </div>
                </div>

                {/* Exercises preview list if any */}
                {act.exercises && act.exercises.length > 0 && (
                  <div className="mt-4 pt-1 space-y-2 bg-[#f5f2ff]/60 rounded-lg p-3 border border-[#E2E8F0]/60">
                    {act.exercises.map((ex) => (
                      <div
                        key={ex.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm text-[#0F172A] gap-1 p-1.5 rounded hover:bg-white transition-colors"
                      >
                        <div className="space-y-0.5">
                          <span className="font-medium text-[#0F172A]">{ex.title}</span>
                          {ex.scaffolding && (
                            <div className="flex items-center gap-1 text-[#3525cd] text-xs">
                              <span className="material-symbols-outlined text-[14px]">tips_and_updates</span>
                              <span>{ex.scaffolding}</span>
                            </div>
                          )}
                          {ex.trapWarning && (
                            <div className="text-[#F59E0B] font-medium text-xs">
                              {ex.trapWarning}
                            </div>
                          )}
                          {ex.note && (
                            <div className="text-[#8B5CF6] text-xs">
                              {ex.note}
                            </div>
                          )}
                        </div>
                        <span className="text-[#94A3B8] font-code-sm text-xs shrink-0 self-start sm:self-center px-1.5 py-0.5 bg-white rounded border border-[#E2E8F0]">
                          {ex.duration}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Activity Action Footers */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddExerciseToActivity(act.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f5f2ff] hover:bg-[#f0ecf9] text-[#0F172A] font-label-md text-xs font-medium transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span> Thêm bài tập
                    </button>
                    <button
                      onClick={() => {
                        onShowToast(`AI đang tạo 1 bài tập tối ưu cho "${act.title}"...`, 'info');
                        setTimeout(() => {
                          onSetActivities((prev) =>
                            prev.map((item) =>
                              item.id === act.id
                                ? {
                                    ...item,
                                    exercises: [
                                      ...item.exercises,
                                      {
                                        id: `ex-ai-${Date.now()}`,
                                        title: 'Bài tập AI phân hóa: Cho x₁ + x₂ = 2m, tìm m để x₁² + x₂² - 2x₁x₂ = 12',
                                        duration: '5 phút',
                                        scaffolding: 'AI tạo sẵn gợi mở đặt ẩn phụ'
                                      }
                                    ]
                                  }
                                : item
                            )
                          );
                          onShowToast('Đã thêm bài tập do AI tạo!', 'success');
                        }, 900);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F5F3FF] hover:bg-[#e1e0ff]/60 text-[#8B5CF6] font-label-md text-xs font-medium transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        auto_awesome
                      </span>{' '}
                      Tạo bài bằng AI
                    </button>
                  </div>
                  <span className="font-label-sm text-[#94A3B8] text-xs">{act.footerInfo}</span>
                </div>
              </div>
            );
          })}

          {/* Add New Activity Button */}
          <button
            onClick={onOpenAddActivity}
            className="w-full py-3.5 rounded-xl border-2 border-dashed border-[#CBD5E1] hover:border-[#3525cd] bg-white/60 hover:bg-white text-[#475569] hover:text-[#3525cd] transition-all flex items-center justify-center gap-2 font-label-lg font-semibold text-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span> Thêm hoạt động mới vào giáo án
          </button>
        </div>

        {/* Right Sidebar: AI Copilot & Materials (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* AI Copilot Suggestion Box */}
          <div className="bg-white rounded-xl p-5 shadow-xs border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B5CF6] font-headline-sm font-bold text-sm sm:text-base">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
                <span>AI Copilot Sư phạm</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#8B5CF6] text-xs font-medium">
                Trợ lý bài giảng
              </span>
            </div>

            <p className="font-body-sm text-[#475569] leading-relaxed text-xs sm:text-sm">
              AI nhận thấy thời lượng cho phần <strong className="text-[#0F172A] font-semibold">HĐ 4 (30p)</strong> đang khá dài. Nếu Minh giải quyết nhanh, bạn có thể đẩy thêm 1 bài toán thực tế tích hợp.
            </p>

            {/* Dynamic Action Chips */}
            <div className="space-y-2">
              <span className="font-label-sm text-[#94A3B8] uppercase font-semibold text-[11px]">
                Thao tác gợi ý 1 chạm
              </span>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAddRealWorldProblem}
                  className="w-full text-left p-2.5 rounded-lg bg-[#f5f2ff] hover:bg-[#e1e0ff]/50 text-[#0F172A] transition-all flex items-center justify-between group cursor-pointer border border-[#E2E8F0]/40"
                >
                  <span className="font-label-md text-xs sm:text-sm font-medium group-hover:text-[#3525cd]">
                    ✨ Thêm bài toán thực tế cực trị
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-[#94A3B8] group-hover:text-[#3525cd]">
                    chevron_right
                  </span>
                </button>
                <button
                  onClick={handleAddScaffoldingToHd3}
                  className="w-full text-left p-2.5 rounded-lg bg-[#f5f2ff] hover:bg-[#e1e0ff]/50 text-[#0F172A] transition-all flex items-center justify-between group cursor-pointer border border-[#E2E8F0]/40"
                >
                  <span className="font-label-md text-xs sm:text-sm font-medium group-hover:text-[#3525cd]">
                    ✨ Tự động tạo 3 gợi ý theo nấc cho HĐ 3
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-[#94A3B8] group-hover:text-[#3525cd]">
                    chevron_right
                  </span>
                </button>
                <button
                  onClick={handleGeneratePdf}
                  className="w-full text-left p-2.5 rounded-lg bg-[#f5f2ff] hover:bg-[#e1e0ff]/50 text-[#0F172A] transition-all flex items-center justify-between group cursor-pointer border border-[#E2E8F0]/40"
                >
                  <span className="font-label-md text-xs sm:text-sm font-medium group-hover:text-[#3525cd]">
                    ✨ Tạo phiếu bài tập in ấn PDF
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-[#94A3B8] group-hover:text-[#3525cd]">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>

            {/* Custom Prompt Input */}
            <form onSubmit={handleSendPrompt} className="pt-2">
              <div className="relative">
                <input
                  className="w-full pl-3 pr-10 py-2.5 bg-[#f5f2ff] rounded-xl text-[#0F172A] font-body-sm text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#3525cd] placeholder:text-[#94A3B8] border border-[#E2E8F0]"
                  placeholder="Yêu cầu AI điều chỉnh bài..."
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 p-1 text-[#3525cd] hover:text-[#4648d4] transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </button>
              </div>
            </form>
          </div>

          {/* Live Lesson Assets / Evidence Quick Drop */}
          <div className="bg-white rounded-xl p-5 shadow-xs border border-[#E2E8F0] space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
                Tài liệu & Minh họa
              </span>
              <span className="font-label-sm text-[#94A3B8] text-xs">
                {attachedFiles.length} tệp đính kèm
              </span>
            </div>

            {/* Visual Asset Mini Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() =>
                  onOpenImageZoom(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuDb7dOupNXO8AQBJmlEZmRFb4uNwUI6WQhYlF9uWGiq0M-c-xNNpwlc_u_tlVbQkn0U_4hu1sUYLMqseJhJC4aTg19xGi4bUkz-lL-jWhTor2jyN6amkl9c3tNR0rl4SpC6bgDv8ZyWQGe_NovnUJIIKakdRLKixezcc6vdzWrLsopkeUy8nlLjTlJnVGVjiisjWIYhUJ8JjpdzItmlhNk7fVqy8Ox-gbUCEUniHTqvQSLR3W3Wwuip',
                    'Bảng tóm tắt Viète'
                  )
                }
                className="relative rounded-lg overflow-hidden h-24 group cursor-pointer"
              >
                <img
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt="Bảng tóm tắt Viète"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDb7dOupNXO8AQBJmlEZmRFb4uNwUI6WQhYlF9uWGiq0M-c-xNNpwlc_u_tlVbQkn0U_4hu1sUYLMqseJhJC4aTg19xGi4bUkz-lL-jWhTor2jyN6amkl9c3tNR0rl4SpC6bgDv8ZyWQGe_NovnUJIIKakdRLKixezcc6vdzWrLsopkeUy8nlLjTlJnVGVjiisjWIYhUJ8JjpdzItmlhNk7fVqy8Ox-gbUCEUniHTqvQSLR3W3Wwuip"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                  <span className="font-label-sm text-white truncate font-medium text-xs">
                    Bảng tóm tắt Viète
                  </span>
                </div>
              </div>

              <div
                onClick={() =>
                  onOpenImageZoom(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuAuGJsprLKw0tulPZXs0o8W84XHI1OAqP2yPqrjUDvqwcVs9gyxAAe1V7___G23enLuuYoevrTEP6kz_cpf2sjjDx6qK5UWASp-tP3VaKhdQzNrWTKVLZR4giRwDz8KLv9jTDaQM7Y9PKg7E7zM4yLK8W3dYP-7FQeutg2LfoECHZX5J9HzjQjUmP28VxOFfZDR-oMynDbpRjGMqSjR7GKH3QTtHFk-_dnf9y0pKss60fJyaYBLYotx',
                    'Bài mẫu Buổi 12'
                  )
                }
                className="relative rounded-lg overflow-hidden h-24 group cursor-pointer"
              >
                <img
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt="Bài mẫu Buổi 12"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAuGJsprLKw0tulPZXs0o8W84XHI1OAqP2yPqrjUDvqwcVs9gyxAAe1V7___G23enLuuYoevrTEP6kz_cpf2sjjDx6qK5UWASp-tP3VaKhdQzNrWTKVLZR4giRwDz8KLv9jTDaQM7Y9PKg7E7zM4yLK8W3dYP-7FQeutg2LfoECHZX5J9HzjQjUmP28VxOFfZDR-oMynDbpRjGMqSjR7GKH3QTtHFk-_dnf9y0pKss60fJyaYBLYotx"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                  <span className="font-label-sm text-white truncate font-medium text-xs">
                    Bài mẫu Buổi 12
                  </span>
                </div>
              </div>
            </div>

            {/* Evidence Dropzone */}
            <label className="p-4 rounded-xl bg-[#f5f2ff]/70 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#f0ecf9] transition-colors border-2 border-dashed border-[#CBD5E1]">
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    setAttachedFiles((prev) => [...prev, file.name]);
                    onShowToast(`Đã tải lên tệp: ${file.name}`, 'success');
                  }
                }}
              />
              <span className="material-symbols-outlined text-[24px] text-[#94A3B8] mb-1">
                upload_file
              </span>
              <span className="font-label-md text-[#0F172A] font-medium text-xs sm:text-sm">
                Thả đề thi hoặc dán ảnh chụp (Ctrl+V)
              </span>
              <span className="font-label-sm text-[#94A3B8] mt-0.5 text-[11px]">
                Hỗ trợ PNG, JPG, PDF (tối đa 15MB)
              </span>
            </label>
          </div>

          {/* Session Competency Goals */}
          <div className="bg-white rounded-xl p-5 shadow-xs border border-[#E2E8F0] space-y-3">
            <span className="font-headline-sm text-[#0F172A] font-bold text-sm sm:text-base">
              Chỉ số đầu ra kỳ vọng
            </span>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between font-label-sm text-xs mb-1">
                  <span className="text-[#475569]">Độ chính xác tính Δ và đặt đk</span>
                  <span className="font-bold text-[#0F172A]">100%</span>
                </div>
                <div className="w-full h-1.5 bg-[#eae6f4] rounded-full overflow-hidden">
                  <div className="h-full bg-[#10B981] w-[100%] rounded-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-label-sm text-xs mb-1">
                  <span className="text-[#475569]">Tốc độ giải bài tìm Min đối xứng</span>
                  <span className="font-bold text-[#0F172A]">&lt; 8 phút / bài</span>
                </div>
                <div className="w-full h-1.5 bg-[#eae6f4] rounded-full overflow-hidden">
                  <div className="h-full bg-[#3525cd] w-[75%] rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
