import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { google } from 'googleapis';

const SHEET_SUBJECTS = '과목출석부';
const SHEET_TIMETABLE = '교사시간표';
const SHEET_TEACHER_CONFIG = '교사_설정';

/**
 * 환경변수에서 줄바꿈이 공백으로 바뀌거나 \\n으로 들어오는 경우를 PEM 형식으로 복구.
 * OpenSSL "DECODER routines::unsupported" 방지.
 */
function normalizePrivateKey(pem: string): string {
  if (!pem || typeof pem !== 'string') return pem;
  let key = pem
    .replace(/^\uFEFF/, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  key = key.replace(/\s*-----BEGIN PRIVATE KEY-----\s*/, begin + '\n').replace(/\s*-----END PRIVATE KEY-----\s*/, '\n' + end + '\n');
  const beginIdx = key.indexOf(begin);
  const endIdx = key.indexOf(end);
  if (beginIdx !== -1 && endIdx > beginIdx) {
    const middle = key.slice(beginIdx + begin.length, endIdx).replace(/\s/g, '');
    const lines: string[] = [];
    for (let i = 0; i < middle.length; i += 64) lines.push(middle.slice(i, i + 64));
    key = begin + '\n' + lines.join('\n') + '\n' + end + '\n';
  }
  if (!key.endsWith('\n')) key += '\n';
  return key;
}

function normalizeServiceAccountKey(key: Record<string, unknown>): Record<string, unknown> {
  if (key.private_key && typeof key.private_key === 'string') {
    key.private_key = normalizePrivateKey(key.private_key);
  }
  return key;
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKeyEnv = process.env.GOOGLE_PRIVATE_KEY;

  let key: Record<string, unknown>;

  if (raw) {
    key = normalizeServiceAccountKey(JSON.parse(raw) as Record<string, unknown>);
  } else if (clientEmail && privateKeyEnv) {
    key = normalizeServiceAccountKey({
      client_email: clientEmail,
      private_key: privateKeyEnv,
    } as Record<string, unknown>);
  } else {
    throw new Error('Service account credentials not set');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, spreadsheetId, ...rest } = body;
    const id = spreadsheetId || process.env.SPREADSHEET_ID;
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'spreadsheetId required' }) };
    /** 교사별 시간표/과목 조회는 관리자가 DB 제작한 시트에서 함. 환경변수 설정 시 교사 입력 URL 무시 */
    const dbId = process.env.ADMIN_DB_SPREADSHEET_ID || id;

    const sheets = getSheetsClient();

    const ensureSheet = async (title: string) => {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
      const exists = meta.data.sheets?.some(s => s.properties?.title === title);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          requestBody: { requests: [{ addSheet: { properties: { title } } }] },
        });
      }
    };

    if (action === 'writeSubjects') {
      await ensureSheet(SHEET_SUBJECTS);
      const { blocks } = rest as { blocks: Array<{ subject: string; time: string; room: string; teachers: string[]; count: number; students: Array<{ order: number; grade: string; class: string; number: string; name: string }> }> };
      const rows: (string | number)[][] = [['time', 'subject', 'subjectKey', 'room', 'teachers', 'count', 'studentsJson']];
      for (const b of blocks) {
        const subjectKey = `${b.time}${b.subject}`;
        const studentsJson = JSON.stringify(b.students);
        rows.push([b.time, b.subject, subjectKey, b.room, (b.teachers || []).join(','), b.count, studentsJson]);
      }
      await sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range: `'${SHEET_SUBJECTS}'!A:G`,
      }).catch(() => {});
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `'${SHEET_SUBJECTS}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'writeTimetable') {
      await ensureSheet(SHEET_TIMETABLE);
      const { rows: timetableRows } = rest as { rows: Array<{ teachername: string; dayindex: number; period: number; subject: string; room: string }> };
      const rows: (string | number)[][] = [['teachername', 'dayindex', 'period', 'subject', 'room']];
      for (const r of timetableRows) {
        rows.push([r.teachername, r.dayindex, r.period, r.subject, r.room]);
      }
      await sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range: `'${SHEET_TIMETABLE}'!A:E`,
      }).catch(() => {});
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `'${SHEET_TIMETABLE}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'readSubjects') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: dbId,
        range: `'${SHEET_SUBJECTS}'!A:G`,
      }).catch(() => ({ data: { values: [] } }));
      const values = (res.data.values || []) as string[][];
      const [header, ...data] = values;
      if (!header || header[0] !== 'time') return { statusCode: 200, headers, body: JSON.stringify({ rows: [] }) };
      const rows = data.map(row => {
        let students: Array<{ name: string }> = [];
        try {
          const raw = JSON.parse(row[6] || '[]');
          if (Array.isArray(raw)) {
            students = raw
              .map((s: unknown) => (typeof s === 'object' && s !== null && 'name' in s)
                ? { name: String((s as { name: unknown }).name).trim() }
                : null)
              .filter((x): x is { name: string } => x !== null && x.name !== '');
          }
        } catch { /* ignore */ }
        return {
          time: row[0],
          subject: row[1],
          subjectKey: (row[2] ?? '').toString().trim(),
          room: row[3],
          teachers: (row[4] || '').split(',').map((t: string) => t.trim()).filter(Boolean),
          count: Number(row[5]) || 0,
          students,
        };
      });
      return { statusCode: 200, headers, body: JSON.stringify({ rows }) };
    }

    if (action === 'readTimetable') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: dbId,
        range: `'${SHEET_TIMETABLE}'!A:E`,
      }).catch(() => ({ data: { values: [] } }));
      const values = (res.data.values || []) as (string | number)[][];
      if (!values.length) return { statusCode: 200, headers, body: JSON.stringify({ rows: [] }) };
      const normHeader = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s/g, '');
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(values.length, 50); i++) {
        const row = values[i];
        if (!row || !Array.isArray(row)) continue;
        const a1 = normHeader(row[0]);
        if (a1 === 'teachername') {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex < 0) return { statusCode: 200, headers, body: JSON.stringify({ rows: [] }) };
      const header = values[headerRowIndex];
      const data = values.slice(headerRowIndex + 1);
      if (!header || normHeader(header[0]) !== 'teachername') return { statusCode: 200, headers, body: JSON.stringify({ rows: [] }) };
      const rows = data
        .filter(row => row && (row[0] != null && String(row[0]).trim() !== ''))
        .map(row => ({
          teachername: String(row[0] ?? '').trim(),
          dayindex: Number(row[1]) || 0,
          period: Number(row[2]) || 0,
          subject: String(row[3] ?? '').trim(),
          room: String(row[4] ?? '').trim(),
        }));
      return { statusCode: 200, headers, body: JSON.stringify({ rows }) };
    }

    if (action === 'saveTeacherConfig') {
      const { uid, teacherName } = rest as { uid: string; teacherName: string };
      if (!uid || !teacherName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'uid, teacherName required' }) };
      const meta = await sheets.spreadsheets.get({ spreadsheetId: dbId });
      const has = meta.data.sheets?.some(s => s.properties?.title === SHEET_TEACHER_CONFIG);
      if (!has) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: dbId,
          requestBody: { requests: [{ addSheet: { properties: { title: SHEET_TEACHER_CONFIG } } }] },
        });
      }
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: dbId,
        range: `'${SHEET_TEACHER_CONFIG}'!A:C`,
      }).catch(() => ({ data: { values: [] } }));
      const values = (res.data.values || []) as string[][];
      const [h, ...dataRows] = values;
      const newRow = [uid, teacherName, dbId];
      const idx = dataRows.findIndex(r => r[0] === uid);
      if (idx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: dbId,
          range: `'${SHEET_TEACHER_CONFIG}'!A${idx + 2}:C${idx + 2}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [newRow] },
        });
      } else {
        if (!h || h[0] !== 'uid') {
          await sheets.spreadsheets.values.update({
            spreadsheetId: dbId,
            range: `'${SHEET_TEACHER_CONFIG}'!A1:C1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['uid', 'teacherName', 'spreadsheetId']] },
          });
        }
        await sheets.spreadsheets.values.append({
          spreadsheetId: dbId,
          range: `'${SHEET_TEACHER_CONFIG}'!A:C`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [newRow] },
        });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'getTeacherConfig') {
      const { uid } = rest as { uid: string };
      if (!uid) return { statusCode: 400, headers, body: JSON.stringify({ error: 'uid required' }) };
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: dbId,
        range: `'${SHEET_TEACHER_CONFIG}'!A:C`,
      });
      const values = (res.data.values || []) as string[][];
      const [, ...rows] = values;
      const row = rows.find(r => r[0] === uid);
      return { statusCode: 200, headers, body: JSON.stringify({ teacherName: row?.[1] || null, spreadsheetId: row?.[2] || dbId }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
  }
};
