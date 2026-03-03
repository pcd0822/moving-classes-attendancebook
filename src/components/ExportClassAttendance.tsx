import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { X, FileDown, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type SubjectRow = {
  time: string;
  subject: string;
  subjectKey: string;
  room: string;
  teachers: string[];
  students: Array<{ name: string }>;
};

type Props = {
  subjects: SubjectRow[];
  weekStart: Date;
  attendanceRecords: Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }>;
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
    const headers = ['수강생 이름', ...datesInRange.map(x => format(x.date, 'M/d (EEE)', { locale: ko })), '비고'];
    const noteMap = new Map<string, string>();
    const statusMap = new Map<string, Map<string, string>>();
    for (const r of attendanceRecords) {
      if (r.subjectKey !== subjectKey) continue;
      const dateStr = datesInRange.find(d => format(d.date, 'yyyy-MM-dd') === r.date && d.dayindex === r.dayindex);
      if (!dateStr) continue;
      const colKey = format(dateStr.date, 'M/d (EEE)', { locale: ko });
      if (!statusMap.has(r.studentName)) statusMap.set(r.studentName, new Map());
      statusMap.get(r.studentName)!.set(colKey, r.status);
      if (r.note) noteMap.set(r.studentName, r.note);
    }
    const rows = subj.students.map(s => {
      const note = noteMap.get(s.name) ?? '';
      const cells = datesInRange.map(d => {
        const colKey = format(d.date, 'M/d (EEE)', { locale: ko });
        return statusMap.get(s.name)?.get(colKey) ?? '';
      });
      return [s.name, ...cells, note];
    });
    return { headers, rows, noteMap };
  }, [subj, datesInRange, attendanceRecords, subjectKey]);

  const handleDownload = () => {
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
    } else {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text(`${subj.subject} 출석부 (${startDate} ~ ${endDate})`, 14, 12);
      doc.setFontSize(10);
      doc.text(`수업 장소: ${subj.room}  |  담당 교사: ${subj.teachers.join(', ')}`, 14, 18);
      autoTable(doc, {
        head: [buildTableData.headers],
        body: buildTableData.rows,
        startY: 24,
        margin: { left: 14 },
        styles: { fontSize: 8 },
      });
      doc.save(`출석부_${subj.subject}_${startDate}_${endDate}.pdf`);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--white)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 440,
          width: '100%',
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
            background: 'var(--pastel-red)',
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
