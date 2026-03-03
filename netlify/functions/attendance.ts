import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { google } from 'googleapis';

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

function sheetNameForTeacher(teacherName: string): string {
  const safe = teacherName.replace(/[\\/*?\[\]:]/g, '_').slice(0, 80);
  return `출결_${safe}`;
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, spreadsheetId, teacherName, ...rest } = body;
    const id = spreadsheetId || process.env.SPREADSHEET_ID;
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'spreadsheetId required' }) };
    if (!teacherName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'teacherName required' }) };
    /** 출석 조회/저장은 교사가 입력한 시트에 함. (시간표/과목은 관리자 시트에서 조회) */
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const sheetTitle = sheetNameForTeacher(teacherName);

    const ensureSheet = async () => {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
      const exists = meta.data.sheets?.some(s => s.properties?.title === sheetTitle);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: id,
          requestBody: {
            requests: [{ addSheet: { properties: { title: sheetTitle } } }],
          },
        });
      }
    };

    if (action === 'read') {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `'${sheetTitle}'!A:G`,
      }).catch(() => ({ data: { values: [] } }));
      const values = (res.data.values || []) as string[][];
      const [header, ...rows] = values;
      if (!header || header[0] !== 'date') return { statusCode: 200, headers, body: JSON.stringify({ records: [] }) };
      const records = rows.map(row => ({
        date: row[0],
        dayindex: Number(row[1]) || 0,
        period: Number(row[2]) || 0,
        subjectKey: row[3],
        studentName: row[4],
        status: row[5] || '',
        note: row[6] || '',
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ records }) };
    }

    if (action === 'write') {
      const { records } = rest as { records: Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }> };
      await ensureSheet();
      const rows = records.map(r => [r.date, r.dayindex, r.period, r.subjectKey, r.studentName, r.status, r.note]);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `'${sheetTitle}'!A:G`,
      }).catch(() => ({ data: { values: [] } }));
      const values = (res.data.values || []) as string[][];
      if (values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: id,
          range: `'${sheetTitle}'!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['date', 'dayindex', 'period', 'subjectKey', 'studentName', 'status', 'note'], ...rows] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: id,
          range: `'${sheetTitle}'!A:G`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rows },
        });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'setCell') {
      const { date, dayindex, period, subjectKey, studentName, status, note } = rest as {
        date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string;
      };
      await ensureSheet();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `'${sheetTitle}'!A:G`,
      }).catch(() => ({ data: { values: [] } }));
      let values = (res.data.values || []) as string[][];
      if (values.length === 0) {
        values = [['date', 'dayindex', 'period', 'subjectKey', 'studentName', 'status', 'note']];
        await sheets.spreadsheets.values.update({
          spreadsheetId: id,
          range: `'${sheetTitle}'!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      }
      const [header, ...dataRows] = values;
      let rowIndex = -1;
      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        if (r[0] === date && Number(r[1]) === dayindex && Number(r[2]) === period && r[3] === subjectKey && r[4] === studentName) {
          rowIndex = i + 2;
          break;
        }
      }
      if (rowIndex > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: id,
          range: `'${sheetTitle}'!F${rowIndex}:G${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[status, note || '']] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: id,
          range: `'${sheetTitle}'!A:G`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [[date, dayindex, period, subjectKey, studentName, status, note || '']] },
        });
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
  }
};
