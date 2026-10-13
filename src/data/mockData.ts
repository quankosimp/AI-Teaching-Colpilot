import { Activity, Claim, StudentProfile } from '../types';

export const INITIAL_STUDENT_PROFILE: StudentProfile = {
  name: 'Nguyễn Bảo Minh',
  grade: 'Lớp 9 • Toán Chuyên 10',
  target: '≥ 8.5 điểm Toán Chuyên Lam Sơn',
  examDate: 'Tháng 06/2025',
  sessionsCompleted: 12,
  totalSessions: 36,
  retentionRate: 82,
  avgHelpLevel: 'Gợi ý nhỏ',
  avgHelpPercent: 65,
  nextSessionTime: 'Thứ 6, 20:00',
  strengths: [
    'Tư duy đại số sắc bén, khả năng nhẩm nhanh biểu thức đối xứng.',
    'Tiếp thu nhanh phương pháp đặt ẩn phụ hoặc biến đổi Viète đối xứng.'
  ],
  weaknesses: [
    'Dễ sai dấu khi biến đổi dài (đặc biệt khi chuyển vế nhân liên hợp).',
    'Chưa quen chọn điểm rơi và tách hạng tử khi áp dụng BĐT Bunhiacopxki.'
  ],
  supportDistribution: {
    independent: 25,
    guided: 65,
    heavy: 10
  },
  tutorNotes: [
    {
      category: 'Tâm lý & Phản ứng',
      savedFrom: 'Lưu từ Buổi 3',
      content: 'Minh thích tự tìm hướng trước 2–3 phút. Không nên ngắt mạch tư duy khi em đang nháp dở.'
    },
    {
      category: 'Kỹ năng trình bày',
      savedFrom: 'Lưu từ Buổi 7',
      content: 'Nhắc kiểm tra lại điều kiện nghiệm mẫu số và nghiệm kép trước khi kết luận nghiệm chung.'
    },
    {
      category: 'Quy ước bài tập về nhà',
      savedFrom: 'Lưu từ Buổi 9',
      content: 'Chỉ giao tối đa 4 bài nâng cao mỗi buổi nhưng yêu cầu lập luận bằng lời chi tiết từng bước.'
    }
  ],
  carryovers: [
    {
      id: 'carry-1',
      type: 'Bài tập về nhà',
      typeColor: 'status-guided',
      timing: 'Hạn: Hôm nay',
      title: 'Phiếu bài tập Viète phần 2',
      description: 'Minh chưa nộp bài 4 & 5 (dạng tìm m để x1² + x2² = 10). Cần kiểm tra vở nháp đầu giờ.',
      duration: 'Đầu giờ: 10 phút'
    },
    {
      id: 'carry-2',
      type: 'Củng cố trọng tâm',
      typeColor: 'status-pending',
      timing: 'Khởi động',
      title: 'Kỹ thuật biến đổi Bunhiacopxki',
      description: 'Tái củng cố 1 bài toán cực trị có dấu bằng không đối xứng trước khi chuyển sang hệ phương trình.',
      duration: 'Đầu giờ: 15 phút'
    }
  ],
  sessionHistory: [
    {
      sessionNumber: 12,
      dateTime: '26/09/2024 • 19:30 - 21:00',
      badge: 'Đã duyệt nhận định',
      badgeStatus: 'approved',
      title: 'Hệ thức Viète và ứng dụng Max/Min',
      summary: 'Minh đã làm chủ phương pháp biểu diễn biểu thức đối xứng qua S và P. Tuy nhiên, bài tìm giá trị nhỏ nhất của phân thức còn lúng túng khi khảo sát miền giá trị của tham số m.',
      evidenceCount: 3,
      durationMinutes: 90
    },
    {
      sessionNumber: 11,
      dateTime: '23/09/2024 • 19:30 - 21:00',
      badge: 'Đạt mục tiêu',
      badgeStatus: 'goal_met',
      title: 'Giải bài toán bằng cách lập hệ phương trình',
      summary: 'Minh phân tích dạng bài toán năng suất và chuyển động rất mạch lạc. Khả năng lập bảng số liệu trước khi ra phương trình rất tốt.',
      durationMinutes: 90
    },
    {
      sessionNumber: 10,
      dateTime: '19/09/2024 • 19:30 - 21:00',
      badge: 'Cần luyện thêm',
      badgeStatus: 'need_practice',
      title: 'Đồ thị hàm số bậc nhất và bậc hai',
      summary: 'Phần tương giao parabol và đường thẳng có hiểu bản chất, nhưng phần biện luận số giao điểm phụ thuộc vào điều kiện tiếp xúc còn nhầm lẫn khi xét delta bằng 0.',
      durationMinutes: 90
    }
  ]
};

export const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: 1,
    code: 'HĐ 1 • 10 phút',
    duration: 10,
    badge: 'Khởi động',
    badgeColor: 'status-approved',
    title: 'Khởi động & Kiểm tra kiến thức cũ',
    description: 'Giải nhanh 2 phương trình bậc hai đơn giản để kích hoạt phản xạ tính biệt thức Delta và kiểm tra kỹ năng phân tích nhân tử.',
    exercises: [
      { id: 'ex-1-1', title: 'Bài 1: Giải phương trình 2x² - 5x + 2 = 0', duration: '2 phút' },
      { id: 'ex-1-2', title: 'Bài 2: Tính nhẩm nghiệm với hệ số a + b + c = 0 (x² + 3x - 4 = 0)', duration: '3 phút' }
    ],
    footerInfo: 'Đã chuẩn bị: 2/2 đề mẫu'
  },
  {
    id: 2,
    code: 'HĐ 2 • 15 phút',
    duration: 15,
    badge: 'Lý thuyết then chốt',
    badgeColor: 'status-pending',
    title: 'Củng cố kiến thức trọng tâm & Bẫy thường gặp',
    description: 'Ôn tập nhanh công thức nghiệm tổng quát và định lý Viète. Nhấn mạnh bước đặt điều kiện Δ ≥ 0 khi tìm tham số m.',
    exercises: [],
    footerInfo: 'Sơ đồ tư duy Viète sẵn sàng'
  },
  {
    id: 3,
    code: 'HĐ 3 • 25 phút',
    duration: 25,
    badge: 'Guided Practice',
    badgeColor: 'status-guided',
    customPill: 'Theo nhu cầu Minh',
    isCustomHighlight: true,
    title: 'Luyện tập có hướng dẫn: Cực trị đại số & Tham số m',
    description: 'Tập trung trực diện vào điểm yếu: 2 bài toán tìm giá trị của m để biểu thức đối xứng P = x₁² + x₂² - 3x₁x₂ đạt GTNN.',
    exercises: [
      {
        id: 'ex-3-1',
        title: 'Cho pt: x² - 2(m-1)x + m - 3 = 0. Tìm m để P = x₁² + x₂² đạt GTNN.',
        duration: '12 phút',
        scaffolding: 'Có 3 gợi ý theo nấc thang (Scaffolding)'
      },
      {
        id: 'ex-3-2',
        title: 'Cho pt: x² - 2mx + m² - m + 1 = 0. Tìm m để A = (x₁ - x₂)² + 2x₁x₂ nhỏ nhất.',
        duration: '13 phút',
        trapWarning: 'Gài bẫy: Cần kiểm tra kỹ Δ ≥ 0'
      }
    ],
    footerInfo: 'Mức độ hỗ trợ: Guided (Gia sư đồng hành)'
  },
  {
    id: 4,
    code: 'HĐ 4 • 30 phút',
    duration: 30,
    badge: 'Independent Practice',
    badgeColor: 'secondary',
    title: 'Luyện tập độc lập & Thử thách phân loại',
    description: 'Học sinh tự giải 1 bài trọn vẹn trong 15 phút, sau đó mở rộng sang bài toán phân loại điểm 9-10 của đề thi tuyển sinh vào 10 chuyên.',
    exercises: [],
    footerInfo: 'Đích: Độc lập hoàn toàn'
  },
  {
    id: 5,
    code: 'HĐ 5 • 10 phút',
    duration: 10,
    badge: 'Tổng kết & Giao bài',
    badgeColor: 'surface-container-high',
    title: 'Tổng kết phương pháp & Giao nhiệm vụ tự học',
    description: 'Chốt lại 3 bước giải dạng cực trị Viète. Hệ thống tự động tạo 3 bài tập về nhà theo đúng phổ kiến thức Minh vừa tiếp thu.',
    exercises: [],
    footerInfo: 'Tự động đẩy vào sổ bài tập của Minh'
  }
];

export const INITIAL_CLAIMS: Claim[] = [
  {
    id: 1,
    level: 'Năng lực độc lập: Cao',
    levelType: 'high',
    time: 'Thời điểm: 19:42 (HĐ 2)',
    content: 'Minh đã hiểu bản chất hệ thức Viète, tự biến đổi độc lập bài toán cơ bản đối xứng $x_1^2 + x_2^2$ mà không cần gợi ý phụ.',
    attachment: {
      type: 'latex',
      title: 'Minh_Scratchpad_HD2.latex',
      log: 'Log giải: $S = -b/a = 5$, $P = c/a = 2 \\rightarrow (x_1+x_2)^2 - 2x_1x_2 = 21$',
      details: [
        'Tốc độ hoàn thành: 3 phút 15 giây (Nhanh hơn trung bình 45s).',
        'Số lần yêu cầu gợi ý: 0 lần (Gia sư quan sát thụ động).'
      ]
    },
    status: 'pending'
  },
  {
    id: 2,
    level: 'Cần lưu ý: Bẫy sai lầm',
    levelType: 'warning',
    time: 'Thời điểm: 20:15 (HĐ 3)',
    content: 'Còn lúng túng khi đặt điều kiện $\\Delta \\ge 0$ cho phương trình có tham số $m$, quên kiểm tra hệ số $a \\ne 0$, cần gia sư nhắc 1 lần.',
    attachment: {
      type: 'image',
      title: 'Ảnh chụp nháp vở Minh (Webcam Stream)',
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDbkqudQWb683XqxNWp0eXs82waWKKLkEoZL0qn__Bt8qDKYEFk0JbMP8Hi8UrVQ9af3ghnThVyufLdgfixaiX1X4i3Aywpf3Meo8r7kz1lIVIND0wy8bmaYp1dylzd-LdgVivoODshQl9UgrcFI2bR_Q3NI2L94-XdK-w2uRbqy_3Kv6E5CrXRekwztGoLxPjapiz8fNBj5aCWKdJIJQFy6_AJBvu0bGDmLRhA5erGOuueVtCAfuPH',
      description: 'Ghi chú lúc 20:16: Minh viết biểu thức $\\Delta = m^2 - 4(m - 2)$ nhưng vội tính Viète luôn mà chưa lập luận điều kiện phương trình có 2 nghiệm.'
    },
    status: 'pending'
  },
  {
    id: 3,
    level: 'Tiến độ bài học: Chưa xong',
    levelType: 'pending',
    time: 'Thời điểm: 20:58 (Hết giờ)',
    content: 'Chưa hoàn thành dạng bài cực trị đại số nâng cao số 4 (Bài toán tìm $m$ để biểu thức đối xứng đạt giá trị nhỏ nhất) do hết thời lượng buổi học.',
    status: 'pending'
  }
];

export const INITIAL_PARENT_REPORT = `Kính gửi phụ huynh em Bảo Minh,

Gia sư xin gửi tổng kết Buổi học 13 (28/09):
- Nội dung: Phương trình bậc hai & Ứng dụng hệ thức Viète.
- Điểm tiến bộ: Minh nắm rất chắc bản chất định lý Viète, biến đổi linh hoạt và tự tin giải quyết độc lập các bài toán tìm tham số m mức độ cơ bản - khá.
- Lưu ý nhẹ: Con đôi khi còn bỏ sót bước kiểm tra điều kiện để phương trình có 2 nghiệm phân biệt (Δ ≥ 0). Thầy đã hướng dẫn mẹo ghi nhớ để không mất điểm trình bày.
- Bài tập về nhà: 3 bài tập rèn phản xạ điều kiện nghiệm (Thầy đã gửi kèm file qua Zalo, thời hạn nộp trước 18h thứ Ba).

Chúc gia đình buổi tối vui vẻ!
Gia sư Hoàng Nam.`;
