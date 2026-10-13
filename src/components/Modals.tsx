import React, { useState } from 'react';
import { Activity } from '../types';

interface ImageZoomModalProps {
  imageUrl: string | null;
  title: string;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ imageUrl, title, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3525cd] text-[20px]">image</span>
            <h3 className="font-semibold text-[#0F172A] text-sm md:text-base">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-4 bg-[#F8FAFC] max-h-[75vh] overflow-auto flex items-center justify-center">
          <img src={imageUrl} alt={title} className="max-h-[68vh] object-contain rounded-lg shadow-sm" />
        </div>
        <div className="p-3 bg-white border-t border-[#E2E8F0] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#3525cd] text-white text-sm font-semibold hover:bg-[#4648d4]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

interface EditClaimModalProps {
  isOpen: boolean;
  claimId: number;
  initialText: string;
  onSave: (id: number, newText: string) => void;
  onClose: () => void;
}

export const EditClaimModal: React.FC<EditClaimModalProps> = ({
  isOpen,
  claimId,
  initialText,
  onSave,
  onClose
}) => {
  const [text, setText] = useState(initialText);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-semibold text-[#0F172A] text-base">Chỉnh sửa nhận định sư phạm #{claimId}</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="py-4">
          <label className="block text-xs font-semibold text-[#475569] mb-1.5">
            Nội dung nhận định (Sẽ lưu trữ vĩnh viễn vào Hồ sơ học sinh):
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3525cd]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#475569] hover:bg-[#F1F5F9]"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onSave(claimId, text);
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#3525cd] text-white hover:bg-[#4648d4]"
          >
            Lưu nhận định
          </button>
        </div>
      </div>
    </div>
  );
};

interface EditZaloReportModalProps {
  isOpen: boolean;
  initialReport: string;
  onSave: (updated: string) => void;
  onClose: () => void;
}

export const EditZaloReportModal: React.FC<EditZaloReportModalProps> = ({
  isOpen,
  initialReport,
  onSave,
  onClose
}) => {
  const [report, setReport] = useState(initialReport);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4648d4]">chat</span>
            <h3 className="font-semibold text-[#0F172A] text-base">Soạn thảo tin nhắn Zalo gửi Phụ huynh</h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="py-4">
          <p className="text-xs text-[#94A3B8] mb-2">
            Tip: Bản báo cáo ngắn gọn, tích cực, nêu rõ điểm tiến bộ và nhắc nhở tinh tế bài tập về nhà.
          </p>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={10}
            className="w-full p-3.5 rounded-xl border border-[#CBD5E1] text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3525cd] leading-relaxed"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#475569] hover:bg-[#F1F5F9]"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onSave(report);
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#3525cd] text-white hover:bg-[#4648d4]"
          >
            Lưu báo cáo
          </button>
        </div>
      </div>
    </div>
  );
};

interface AddActivityModalProps {
  isOpen: boolean;
  onAdd: (act: Partial<Activity>) => void;
  onClose: () => void;
}

export const AddActivityModal: React.FC<AddActivityModalProps> = ({ isOpen, onAdd, onClose }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(15);
  const [badge, setBadge] = useState('Luyện tập nâng cao');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-semibold text-[#0F172A] text-base">Thêm hoạt động mới vào giáo án</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Tên hoạt động:</label>
            <input
              type="text"
              placeholder="VD: Phân tích bài toán chuyên sâu cực trị..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm focus:outline-none focus:ring-2 focus:ring-[#3525cd]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Thời lượng (phút):</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm focus:outline-none focus:ring-2 focus:ring-[#3525cd]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Phân loại:</label>
              <select
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm focus:outline-none focus:ring-2 focus:ring-[#3525cd] bg-white"
              >
                <option value="Khởi động">Khởi động</option>
                <option value="Lý thuyết then chốt">Lý thuyết then chốt</option>
                <option value="Guided Practice">Guided Practice</option>
                <option value="Independent Practice">Independent Practice</option>
                <option value="Tổng kết & Giao bài">Tổng kết & Giao bài</option>
                <option value="Thử thách điểm 10">Thử thách điểm 10</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Mục tiêu & Hướng dẫn sư phạm:</label>
            <textarea
              placeholder="Mô tả các bước triển khai hoặc bẫy học sinh dễ mắc phải..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full p-2.5 rounded-lg border border-[#CBD5E1] text-sm focus:outline-none focus:ring-2 focus:ring-[#3525cd]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-[#475569] hover:bg-[#F1F5F9]">
            Hủy
          </button>
          <button
            onClick={() => {
              if (!title.trim()) return;
              onAdd({
                title: title.trim(),
                duration,
                badge,
                description: description.trim() || 'Thực hành dạng bài toán theo mục tiêu cá nhân hóa.',
                badgeColor: badge.includes('Guided') ? 'status-guided' : badge.includes('Lý thuyết') ? 'status-pending' : 'secondary',
                exercises: []
              });
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#3525cd] text-white hover:bg-[#4648d4]"
          >
            Thêm hoạt động
          </button>
        </div>
      </div>
    </div>
  );
};
