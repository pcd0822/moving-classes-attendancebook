import type { TeacherTimetableRow } from '@/types';
import * as XLSX from 'xlsx';

export function parseTeacherTimetableExcel(file: File): Promise<TeacherTimetableRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) return reject(new Error('파일을 읽을 수 없습니다.'));
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) return reject(new Error('시트를 찾을 수 없습니다.'));
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        if (rows.length < 2) return resolve([]);
        const header = rows[0] as string[];
        const norm = (s: string) => String(s).toLowerCase().replace(/\s/g, '');
        const teachernameIdx = header.findIndex(h => norm(h) === 'teachername');
        const dayindexIdx = header.findIndex(h => norm(h) === 'dayindex');
        const periodIdx = header.findIndex(h => norm(h) === 'period');
        const subjectIdx = header.findIndex(h => norm(h) === 'subject');
        const roomIdx = header.findIndex(h => norm(h) === 'room');
        if ([teachernameIdx, dayindexIdx, periodIdx, subjectIdx, roomIdx].some(i => i === -1)) {
          return reject(new Error('헤더: teachername, dayindex, period, subject, room 이 필요합니다.'));
        }
        const result: TeacherTimetableRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          const teachername = row[teachernameIdx] != null ? String(row[teachernameIdx]).trim() : '';
          if (!teachername) continue;
          result.push({
            teachername,
            dayindex: Number(row[dayindexIdx]) || 0,
            period: Number(row[periodIdx]) || 0,
            subject: row[subjectIdx] != null ? String(row[subjectIdx]).trim() : '',
            room: row[roomIdx] != null ? String(row[roomIdx]).trim() : '',
          });
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}
