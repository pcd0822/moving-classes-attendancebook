import type { SubjectBlock, SubjectStudent } from '@/types';
import * as XLSX from 'xlsx';

function isEmptyRow(sheet: XLSX.WorkSheet, r: number): boolean {
  for (let c = 0; c <= 4; c++) {
    const v = sheet[XLSX.utils.encode_cell({ r, c })]?.v;
    if (v != null && String(v).trim() !== '') return false;
  }
  return true;
}

/**
 * 이동반 출석부 엑셀 규칙:
 * - B1 과목명, B2 타임, B3 교실, B4 교사명(쉼표), B5 인원
 * - A6:E6 헤더 (순번, 학년, 반, 번호, 수강생 이름)
 * - A7:E7~ 공란 나올 때까지 수강생
 * - 공란 3행 비운 뒤 다음 블록에서 B1부터 반복
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
          const b1 = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]?.v;
          if (b1 == null || String(b1).trim() === '') {
            row++;
            continue;
          }
          const subject = String(b1).trim();
          const b2 = sheet[XLSX.utils.encode_cell({ r: row + 1, c: 1 })]?.v;
          const b3 = sheet[XLSX.utils.encode_cell({ r: row + 2, c: 1 })]?.v;
          const b4 = sheet[XLSX.utils.encode_cell({ r: row + 3, c: 1 })]?.v;
          const b5 = sheet[XLSX.utils.encode_cell({ r: row + 4, c: 1 })]?.v;
          const time = b2 != null ? String(b2).trim() : '';
          const room = b3 != null ? String(b3).trim() : '';
          const teachers = b4 != null ? String(b4).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          const count = b5 != null ? Number(b5) || 0 : 0;

          const students: SubjectStudent[] = [];
          let r = row + 6;
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
