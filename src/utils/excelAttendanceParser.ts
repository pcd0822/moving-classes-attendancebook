import type { SubjectBlock, SubjectStudent } from '@/types';
import * as XLSX from 'xlsx';

function isEmptyRow(sheet: XLSX.WorkSheet, r: number): boolean {
  for (let c = 0; c <= 4; c++) {
    const v = sheet[XLSX.utils.encode_cell({ r, c })]?.v;
    if (v != null && String(v).trim() !== '') return false;
  }
  return true;
}

/** B열 값이 이동그룹 행인지 (예: "이동그룹", "3단위") */
function isMovingGroupRow(sheet: XLSX.WorkSheet, row: number): boolean {
  const b = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]?.v;
  if (b == null || String(b).trim() === '') return false;
  const s = String(b).trim();
  if (s.includes('이동그룹')) return true;
  if (/^\d*단위$/.test(s)) return true;
  if (s === '단위') return true;
  return false;
}

/**
 * 이동반 출석부 엑셀 규칙:
 * - 이동그룹(예: 3단위) 행이 있으면 그 아래 행부터 과목 블록 시작
 * - B1 과목명, B2 타임, B3 교실, B4 교사명(쉼표), B5 인원
 * - A6:E6 헤더 (순번, 학년, 반, 번호, 수강생 이름)
 * - A7:E7~ 공란 나올 때까지 수강생
 * - 공란 3행 비운 뒤 다음 블록 (또는 이동그룹 후 과목명)
 */
export function parseAttendanceExcel(file: File): Promise<SubjectBlock[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) return reject(new Error('파일을 읽을 수 없습니다.'));
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) return reject(new Error('시트를 찾을 수 없습니다.'));

        const blocks: SubjectBlock[] = [];
        let row = 0;
        const maxRow = 2000;

        while (row < maxRow) {
          const bVal = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]?.v;
          if (bVal == null || String(bVal).trim() === '') {
            row++;
            continue;
          }
          if (isMovingGroupRow(sheet, row)) {
            row++;
            continue;
          }
          const blockStart = row;

          const subject = String(sheet[XLSX.utils.encode_cell({ r: blockStart, c: 1 })]?.v ?? '').trim();
          const b2 = sheet[XLSX.utils.encode_cell({ r: blockStart + 1, c: 1 })]?.v;
          const b3 = sheet[XLSX.utils.encode_cell({ r: blockStart + 2, c: 1 })]?.v;
          const b4 = sheet[XLSX.utils.encode_cell({ r: blockStart + 3, c: 1 })]?.v;
          const b5 = sheet[XLSX.utils.encode_cell({ r: blockStart + 4, c: 1 })]?.v;
          const time = b2 != null ? String(b2).trim() : '';
          const room = b3 != null ? String(b3).trim() : '';
          const teachers = b4 != null ? String(b4).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          const count = b5 != null ? Number(b5) || 0 : 0;

          const students: SubjectStudent[] = [];
          let r = blockStart + 6;
          while (r < maxRow && !isEmptyRow(sheet, r)) {
            const a = sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
            const b = sheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
            const c = sheet[XLSX.utils.encode_cell({ r, c: 2 })]?.v;
            const d = sheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
            const e = sheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;
            students.push({
              order: a != null ? Number(a) || 0 : 0,
              grade: b != null ? String(b).trim() : '',
              class: c != null ? String(c).trim() : '',
              number: d != null ? String(d).trim() : '',
              name: e != null ? String(e).trim() : '',
            });
            r++;
          }
          blocks.push({ subject, time, room, teachers, count, students });
          row = r + 3;
        }
        resolve(blocks);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}
