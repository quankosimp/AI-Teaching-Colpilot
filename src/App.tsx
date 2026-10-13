import { useState } from 'react';
import { TabType, Activity, Claim, StudentProfile } from './types';
import {
  INITIAL_ACTIVITIES,
  INITIAL_CLAIMS,
  INITIAL_PARENT_REPORT,
  INITIAL_STUDENT_PROFILE
} from './data/mockData';
import { Header } from './components/Header';
import { ToastContainer, ToastMessage } from './components/Toast';
import {
  ImageZoomModal,
  EditClaimModal,
  EditZaloReportModal,
  AddActivityModal
} from './components/Modals';
import { LessonPlanView } from './views/LessonPlanView';
import { LiveRoomView } from './views/LiveRoomView';
import { SessionSummaryView } from './views/SessionSummaryView';
import { StudentProfileView } from './views/StudentProfileView';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('soan-giao-an-voi-ai-copilot');

  // Core state
  const [activities, setActivities] = useState<Activity[]>(INITIAL_ACTIVITIES);
  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [parentReport, setParentReport] = useState<string>(INITIAL_PARENT_REPORT);
  const [studentProfile, setStudentProfile] = useState<StudentProfile>(INITIAL_STUDENT_PROFILE);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modals state
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);
  const [editingClaim, setEditingClaim] = useState<{ id: number; text: string } | null>(null);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [isAddingActivity, setIsAddingActivity] = useState(false);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveClaimText = (id: number, newText: string) => {
    setClaims((prev) =>
      prev.map((c) => (c.id === id ? { ...c, content: newText } : c))
    );
    showToast(`Đã lưu thay đổi nhận định #${id}!`, 'success');
  };

  const handleSaveReport = (newReport: string) => {
    setParentReport(newReport);
    showToast('Đã lưu mẫu tin nhắn Zalo gửi phụ huynh!', 'success');
  };

  const handleAddNewActivity = (newActData: Partial<Activity>) => {
    const nextId = activities.length + 1;
    const newAct: Activity = {
      id: nextId,
      code: `HĐ ${nextId} • ${newActData.duration || 15} phút`,
      duration: newActData.duration || 15,
      badge: newActData.badge || 'Thực hành',
      badgeColor: newActData.badgeColor || 'secondary',
      title: newActData.title || 'Hoạt động bổ trợ',
      description: newActData.description || 'Thực hành dạng bài toán theo mục tiêu cá nhân hóa.',
      exercises: newActData.exercises || [],
      footerInfo: 'Đã thêm vào giáo án'
    };

    setActivities((prev) => [...prev, newAct]);
    showToast(`Đã thêm "${newAct.title}" vào giáo án!`, 'success');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans">
      {/* Universal Top Header */}
      <Header
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        studentName={studentProfile.name.split(' ').slice(-2).join(' ')}
        studentGrade="Lớp 9"
      />

      {/* Main Container Viewport */}
      <main className="pt-[112px] md:pt-[72px] min-h-screen w-full px-4 sm:px-6 pb-4 flex-1">
        {currentTab === 'soan-giao-an-voi-ai-copilot' && (
          <LessonPlanView
            activities={activities}
            onSetActivities={setActivities}
            onNavigate={(tab) => setCurrentTab(tab)}
            onShowToast={showToast}
            onOpenImageZoom={(url, title) => setZoomImage({ url, title })}
            onOpenAddActivity={() => setIsAddingActivity(true)}
          />
        )}

        {currentTab === 'phong-day-truc-tiep-ai-copilot' && (
          <LiveRoomView
            onNavigate={(tab) => setCurrentTab(tab)}
            onShowToast={showToast}
            onOpenImageZoom={(url, title) => setZoomImage({ url, title })}
          />
        )}

        {currentTab === 'tong-ket-buoi-day-duyet-nhan-dinh' && (
          <SessionSummaryView
            claims={claims}
            onSetClaims={setClaims}
            parentReport={parentReport}
            onSetParentReport={setParentReport}
            onNavigate={(tab) => setCurrentTab(tab)}
            onShowToast={showToast}
            onOpenEditClaim={(id, text) => setEditingClaim({ id, text })}
            onOpenEditReport={() => setIsEditingReport(true)}
            onOpenImageZoom={(url, title) => setZoomImage({ url, title })}
          />
        )}

        {currentTab === 'ho-so-hoc-sinh-tri-thuc-tich-luy' && (
          <StudentProfileView
            profile={studentProfile}
            onNavigate={(tab) => setCurrentTab(tab)}
            onShowToast={showToast}
            onOpenImageZoom={(url, title) => setZoomImage({ url, title })}
          />
        )}
      </main>

      {/* Shared Modals */}
      <ImageZoomModal
        imageUrl={zoomImage?.url || null}
        title={zoomImage?.title || 'Xem chi tiết bằng chứng học tập'}
        onClose={() => setZoomImage(null)}
      />

      {editingClaim && (
        <EditClaimModal
          isOpen={true}
          claimId={editingClaim.id}
          initialText={editingClaim.text}
          onSave={handleSaveClaimText}
          onClose={() => setEditingClaim(null)}
        />
      )}

      <EditZaloReportModal
        isOpen={isEditingReport}
        initialReport={parentReport}
        onSave={handleSaveReport}
        onClose={() => setIsEditingReport(false)}
      />

      <AddActivityModal
        isOpen={isAddingActivity}
        onAdd={handleAddNewActivity}
        onClose={() => setIsAddingActivity(false)}
      />

      {/* Toast Notification Stack */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
