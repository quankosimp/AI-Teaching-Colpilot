export type TabType = 
  | 'soan-giao-an-voi-ai-copilot'
  | 'phong-day-truc-tiep-ai-copilot'
  | 'tong-ket-buoi-day-duyet-nhan-dinh'
  | 'ho-so-hoc-sinh-tri-thuc-tich-luy';

export interface Exercise {
  id: string;
  title: string;
  duration: string;
  note?: string;
  scaffolding?: string;
  trapWarning?: string;
}

export interface Activity {
  id: number;
  code: string;
  duration: number;
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  exercises: Exercise[];
  footerInfo: string;
  customPill?: string;
  isCustomHighlight?: boolean;
}

export interface Claim {
  id: number;
  level: string;
  levelType: 'high' | 'warning' | 'pending';
  time: string;
  content: string;
  attachment?: {
    type: 'latex' | 'image';
    title: string;
    log?: string;
    imageUrl?: string;
    description?: string;
    details?: string[];
  };
  status: 'pending' | 'approved' | 'rejected' | 'postponed';
}

export interface StudentProfile {
  name: string;
  grade: string;
  target: string;
  examDate: string;
  sessionsCompleted: number;
  totalSessions: number;
  retentionRate: number;
  avgHelpLevel: string;
  avgHelpPercent: number;
  nextSessionTime: string;
  strengths: string[];
  weaknesses: string[];
  supportDistribution: {
    independent: number;
    guided: number;
    heavy: number;
  };
  tutorNotes: {
    category: string;
    savedFrom: string;
    content: string;
  }[];
  carryovers: {
    id: string;
    type: string;
    typeColor: string;
    timing: string;
    title: string;
    description: string;
    duration: string;
  }[];
  sessionHistory: {
    sessionNumber: number;
    dateTime: string;
    badge: string;
    badgeStatus: 'approved' | 'goal_met' | 'need_practice';
    title: string;
    summary: string;
    evidenceCount?: number;
    durationMinutes: number;
  }[];
}
