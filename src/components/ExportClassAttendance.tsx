import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { X, FileDown, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { SubjectStudent } from '@/types';
import { getStudentKey } from '@/utils/attendanceKey';

type SubjectRow = {
  time: string;
  subject: string;
  subjectKey: string;
  room: string;
  teachers: string[];
  students: SubjectStudent[];
};

type Props = {
  subjects: SubjectRow[];
  weekStart: Date;
  attendanceRecords: Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string; grade?: string; class?: string; number?: string }>;
  onClose: () => void;
};

export default function ExportClassAttendance({ subjects, weekStart, attendanceRecords, onClose }: Props) {
  const [subjectKey, setSubjectKey] = useState('');
  const [startDate, setStartDate] = useState(() => format(weekStart, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(addDays(weekStart, 4), 'yyyy-MM-dd'));
  const [formatType, setFormatType] = useState<'pdf' | 'csv'>('pdf');

  const subjectOptions = useMemo(() => subjects.map(s => ({ key: s.subjectKey, label: `${s.time} ${s.subject} (${s.room})` })), [subjects]);

  const datesInRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const list: { date: Date; dayindex: number }[] = [];
    let d = start;
    while (d <= end) {
      const day = d.getDay();
      const dayindex = day === 0 ? 6 : day - 1;
      if (dayindex >= 0 && dayindex <= 4) list.push({ date: new Date(d), dayindex });
      d = addDays(d, 1);
    }
    return list;
  }, [startDate, endDate]);

  const subj = useMemo(() => subjects.find(s => s.subjectKey === subjectKey), [subjects, subjectKey]);

  const buildTableData = useMemo(() => {
    if (!subj) return { headers: [] as string[], rows: [] as string[][], noteMap: new Map<string, string>() };

    // 헤더용 날짜 컬럼 키와 (date+dayindex) 매핑을 미리 만들어 둠
    const dateKeyToColLabel = new Map<string, string>();
    const dateColLabels = datesInRange.map(d => {
      const colLabel = format(d.date, 'M/d (EEE)', { locale: ko });
      const key = `${format(d.date, 'yyyy-MM-dd')}_${d.dayindex}`;
      dateKeyToColLabel.set(key, colLabel);
      return colLabel;
    });

    const headers = [
      '연번',
      '학년',
      '반',
      '번호',
      '수강생 이름',
      ...dateColLabels,
      '비고',
    ];
    const noteMap = new Map<string, string>();
    const statusMap = new Map<string, Map<string, string>>();

    const norm = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/\u00a0/g, '');
    const targetKeyNorm = norm(subjectKey);
    const targetNameNorm = norm(subj.subject);

    for (const r of attendanceRecords) {
      const rKeyNorm = norm(r.subjectKey);
      if (!(rKeyNorm === targetKeyNorm || rKeyNorm === targetNameNorm)) continue;

      // 시트에 저장된 date/dayindex 조합이 현재 선택한 기간/요일에 포함되는지 확인
      const key = `${r.date}_${r.dayindex}`;
      const colKey = dateKeyToColLabel.get(key);
      if (!colKey) continue;

      const rKey = getStudentKey(r);
      if (!statusMap.has(rKey)) statusMap.set(rKey, new Map());
      statusMap.get(rKey)!.set(colKey, r.status);
      if (r.note) noteMap.set(rKey, r.note);
    }

    const rows = subj.students.map(s => {
      const sk = getStudentKey(s);
      const note = noteMap.get(sk) ?? '';
      const cells = dateColLabels.map(colKey => statusMap.get(sk)?.get(colKey) ?? '');
      return [
        String(s.order ?? ''),
        String(s.grade ?? ''),
        String(s.class ?? ''),
        String(s.number ?? ''),
        s.name,
        ...cells,
        note,
      ];
    });
    return { headers, rows, noteMap };
  }, [subj, datesInRange, attendanceRecords, subjectKey]);

  const handleDownload = async () => {
    if (!subj) return;
    if (formatType === 'csv') {
      const { headers, rows } = buildTableData;
      const line = (arr: string[]) => arr.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
      const csv = [headers.join(','), ...rows.map(r => line(r))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `출석부_${subj.subject}_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
      return;
    }

    // PDF: 브라우저 폰트로 한글 테이블을 렌더링한 뒤 캡처해 PDF에 넣음
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const { headers, rows } = buildTableData;
    const wrap = document.createElement('div');
    wrap.setAttribute('data-pdf-capture', 'true');
    wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:1100px;background:#fff;padding:14px;font-family:"Open Sans","Malgun Gothic",sans-serif;font-size:12px;color:#1f2937;';
    wrap.innerHTML = `
      <div style="margin-bottom:10px;font-size:14px;font-weight:700;">${esc(subj.subject)} 출석부 (${esc(startDate)} ~ ${esc(endDate)})</div>
      <div style="margin-bottom:6px;font-size:10px;color:#6b7280;">수업 장소: ${esc(subj.room)}  |  담당 교사: ${esc(subj.teachers.join(', '))}</div>
      <table style="width:100%;border-collapse:collapse;font-size:9px;">
        <thead><tr>${headers.map(h => `<th style="border:1px solid #e5e7eb;padding:4px 6px;text-align:center;background:#fef2f2;">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(c => `<td style="border:1px solid #e5e7eb;padding:3px 5px;">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    `;
    document.body.appendChild(wrap);

    try {
      const canvas = await html2canvas(wrap, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      document.body.removeChild(wrap);

      const imgW = canvas.width;
      const imgH = canvas.height;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'px' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const scale = Math.min(maxW / imgW, maxH / imgH, 1);
      const w = imgW * scale;
      const h = imgH * scale;
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, w, h);
      doc.save(`출석부_${subj.subject}_${startDate}_${endDate}.pdf`);
    } catch (e) {
      document.body.removeChild(wrap);
      console.error(e);
    }
    onClose();
  };

  return (
    <div
      className="export-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 24px)',
      }}
      onClick={onClose}
    >
      <div
        className="export-modal-content"
        style={{
          background: 'var(--white)',
          borderRadius: 16,
          padding: 'clamp(16px, 4vw, 24px)',
          maxWidth: 440,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px var(--shadow)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>분반별 출석부 다운로드</h2>
          <button onClick={onClose} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>분반 선택</label>
          <select
            value={subjectKey}
            onChange={e => setSubjectKey(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
          >
            <option value="">선택하세요</option>
            {subjectOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>다운로드 형식</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="fmt" checked={formatType === 'pdf'} onChange={() => setFormatType('pdf')} />
              <FileText size={18} /> PDF
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="fmt" checked={formatType === 'csv'} onChange={() => setFormatType('csv')} />
              <FileDown size={18} /> CSV
            </label>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={!subjectKey}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--white)',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 12,
          }}
        >
          다운로드
        </button>
      </div>
    </div>
  );
}
