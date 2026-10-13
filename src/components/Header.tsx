import React, { useState } from 'react';
import { TabType } from '../types';

interface HeaderProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  studentName?: string;
  studentGrade?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  studentName = 'Bảo Minh',
  studentGrade = 'Lớp 9'
}) => {
  const [showStudentMenu, setShowStudentMenu] = useState(false);
  const [showTutorMenu, setShowTutorMenu] = useState(false);

  const navItems: { id: TabType; label: string }[] = [
    { id: 'ho-so-hoc-sinh-tri-thuc-tich-luy', label: 'Hồ sơ học sinh' },
    { id: 'soan-giao-an-voi-ai-copilot', label: 'Soạn giáo án' },
    { id: 'phong-day-truc-tiep-ai-copilot', label: 'Phòng dạy trực tiếp' },
    { id: 'tong-ket-buoi-day-duyet-nhan-dinh', label: 'Tổng kết & Duyệt' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#E2E8F0]/60">
      <div className="h-14 w-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Brand, Student Selector, Online Status */}
        <div className="flex items-center gap-3 sm:gap-6">
          <div 
            onClick={() => onTabChange('soan-giao-an-voi-ai-copilot')} 
            className="flex items-center gap-2 cursor-pointer select-none"
            title="Về trang Soạn giáo án"
          >
            <img 
              alt="TutorPulse" 
              className="h-7 w-auto object-contain" 
              src="https://lh3.googleusercontent.com/aida/AEtjO1UrWKj5Hbk9WmMV3-OSI6_7hKNu2TluBf929itNNexTagVCN1wH2qk4fq73czxdvzG4BbbDnDc7E5O_QC7njNRdXq-5Q7pl7tJOJSyslMHrhVsvWdEXdBd9f6HZ9T9ntLfs0JnzMzeSgKVBPAezKsEprrPVYztSEGfHBW6BoGopQRqBqbBY4JrxZUTNAwd2Ep79R-KA4wODJUpkqjxY7Y0bjlVG90vyVKoJ9Egf5WGTrL28ZfdyB7MRX_g" 
            />
            <span className="font-headline-sm tracking-tight text-[#0F172A] font-bold">TutorPulse</span>
          </div>

          {/* Student Picker Pill */}
          <div className="relative">
            <button 
              onClick={() => setShowStudentMenu(!showStudentMenu)}
              className="hidden sm:flex items-center bg-[#f5f2ff] hover:bg-[#f0ecf9] px-2.5 py-1 rounded-xl transition-colors cursor-pointer gap-2 border border-transparent hover:border-[#E2E8F0]"
            >
              <span className="w-5 h-5 rounded-full bg-[#e1e0ff] text-[#07006c] flex items-center justify-center font-label-sm font-bold text-xs">
                M
              </span>
              <span className="font-label-md text-[#0F172A] font-medium">{studentName}</span>
              <span className="font-label-sm text-[#94A3B8]">{studentGrade}</span>
              <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">expand_more</span>
            </button>

            {showStudentMenu && (
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-2 z-50">
                <div className="px-2 py-1 text-xs font-semibold text-[#94A3B8] uppercase">Danh sách học sinh</div>
                <div 
                  onClick={() => {
                    onTabChange('ho-so-hoc-sinh-tri-thuc-tich-luy');
                    setShowStudentMenu(false);
                  }}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#F8FAFC] hover:bg-[#f5f2ff] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-[#3525cd] text-white flex items-center justify-center text-xs font-bold">BM</span>
                    <div>
                      <div className="font-medium text-xs text-[#0F172A]">Nguyễn Bảo Minh</div>
                      <div className="text-[11px] text-[#94A3B8]">Toán 9 Chuyên Lam Sơn</div>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                </div>
                <div className="mt-1 pt-1 border-t border-[#F1F5F9]">
                  <button 
                    onClick={() => {
                      onTabChange('ho-so-hoc-sinh-tri-thuc-tich-luy');
                      setShowStudentMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-[#3525cd] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span className="material-symbols-outlined text-[14px]">account_box</span>
                    Xem toàn bộ hồ sơ năng lực
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
            <span className="font-label-sm text-[#10B981] font-medium text-xs">Online</span>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`font-label-md px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs md:text-sm ${
                  isActive
                    ? 'bg-[#eae6f4] text-[#3525cd] font-semibold shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#f5f2ff]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right: Tutor Profile */}
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setShowTutorMenu(!showTutorMenu)}
            className="flex items-center gap-2 cursor-pointer relative"
          >
            <div className="text-right hidden xl:block">
              <div className="font-label-md text-[#0F172A] font-medium leading-none text-xs">Hoàng Nam</div>
              <div className="font-label-sm text-[#94A3B8] mt-0.5 text-[11px]">Gia sư</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#eae6f4] text-[#3525cd] flex items-center justify-center font-label-md font-semibold ring-2 ring-white shadow-xs text-xs">
              HN
            </div>

            {showTutorMenu && (
              <div className="absolute right-0 top-10 w-52 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-2 z-50 text-xs">
                <div className="p-2 border-b border-[#F1F5F9]">
                  <div className="font-semibold text-[#0F172A]">Hoàng Nam</div>
                  <div className="text-[#94A3B8]">Gia sư Toán Chuyên & Ôn thi 10</div>
                </div>
                <div className="py-1">
                  <div className="px-2 py-1.5 hover:bg-[#F8FAFC] rounded text-[#475569] cursor-pointer">
                    Cài đặt tài khoản & Zalo bot
                  </div>
                  <div className="px-2 py-1.5 hover:bg-[#F8FAFC] rounded text-[#475569] cursor-pointer">
                    Thống kê giờ dạy tháng 9 (38 giờ)
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav Bar */}
      <div className="md:hidden flex items-center justify-around border-t border-[#E2E8F0] bg-white px-2 py-1.5 overflow-x-auto">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`text-xs px-2.5 py-1 rounded-md whitespace-nowrap ${
                isActive
                  ? 'bg-[#3525cd] text-white font-medium'
                  : 'text-[#475569]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
