// 이동반 출석부 한 과목 블록
export interface SubjectBlock {
  subject: string;      // B1 과목명
  time: string;        // B2 타임 A,B,C...
  room: string;        // B3 교실
  teachers: string[];  // B4 교사명 (쉼표 분리)
  count: number;       // B5 인원
  students: SubjectStudent[];
}

export interface SubjectStudent {
  order: number;
  grade: string;
  class: string;
  number: string;
  name: string;
}

// 교사 시간표 한 행
export interface TeacherTimetableRow {
  teachername: string;
  dayindex: number;  // 0~4
  period: number;    // 1~7
  subject: string;   // e.g. C고전문학감상
  room: string;
}

// 주간 시간표 셀
export interface TimetableCell {
  subject: string;
  room: string;
  subjectKey: string; // time+subject
  timeLabel: string;
}

// 출결 한 건
export interface AttendanceRecord {
  date: string;       // YYYY-MM-DD
  dayindex: number;
  period: number;
  subjectKey: string;
  studentName: string;
  status: string;     // '/' 등
  note: string;
}

// 과목 출석부 (DB용)
export interface SubjectAttendance {
  time: string;
  subject: string;
  subjectKey: string;
  room: string;
  teachers: string[];
  count: number;
  students: SubjectStudent[];
}
