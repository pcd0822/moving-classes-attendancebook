async function post(body: Record<string, unknown>) {
  const res = await fetch('/.netlify/functions/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export type AttendanceRecord = {
  date: string;
  dayindex: number;
  period: number;
  subjectKey: string;
  studentName: string;
  status: string;
  note: string;
  grade?: string;
  class?: string;
  number?: string;
};

export async function readAttendance(spreadsheetId: string, teacherName: string) {
  const r = await post({ action: 'read', spreadsheetId, teacherName });
  return r.records as AttendanceRecord[];
}

export async function setAttendanceCell(
  spreadsheetId: string,
  teacherName: string,
  p: {
    date: string;
    dayindex: number;
    period: number;
    subjectKey: string;
    studentName: string;
    status: string;
    note: string;
    grade?: string;
    class?: string;
    number?: string;
  }
) {
  return post({ action: 'setCell', spreadsheetId, teacherName, ...p });
}
