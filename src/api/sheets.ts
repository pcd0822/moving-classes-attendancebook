const BASE = import.meta.env.DEV ? '' : '';

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/.netlify/functions/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function writeSubjects(spreadsheetId: string, blocks: Array<{ subject: string; time: string; room: string; teachers: string[]; count: number; students: Array<{ order: number; grade: string; class: string; number: string; name: string }> }>) {
  return post('sheets', { action: 'writeSubjects', spreadsheetId, blocks });
}

export async function writeTimetable(spreadsheetId: string, rows: Array<{ teachername: string; dayindex: number; period: number; subject: string; room: string }>) {
  return post('sheets', { action: 'writeTimetable', spreadsheetId, rows });
}

export async function readSubjects(spreadsheetId: string) {
  const r = await post('sheets', { action: 'readSubjects', spreadsheetId });
  return r.rows as Array<{ time: string; subject: string; subjectKey: string; room: string; teachers: string[]; count: number; students: Array<{ order: number; grade: string; class: string; number: string; name: string }> }>;
}

export async function readTimetable(spreadsheetId: string) {
  const r = await post('sheets', { action: 'readTimetable', spreadsheetId });
  return r.rows as Array<{ teachername: string; dayindex: number; period: number; subject: string; room: string }>;
}

export async function saveTeacherConfig(spreadsheetId: string, uid: string, teacherName: string) {
  return post('sheets', { action: 'saveTeacherConfig', spreadsheetId, uid, teacherName });
}

export async function getTeacherConfig(spreadsheetId: string, uid: string) {
  const r = await post('sheets', { action: 'getTeacherConfig', spreadsheetId, uid });
  return { teacherName: r.teacherName as string | null, spreadsheetId: r.spreadsheetId as string };
}
