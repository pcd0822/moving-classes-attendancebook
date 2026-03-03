import { useMemo } from 'react';
import { addDays } from 'date-fns';
import { X } from 'lucide-react';
import { dateToYMD } from '@/utils/weekRange';

const DAY_LABELS = ['월', '화', '수', '목', '금'];

type Props = {
  weekStart: Date;
  cell: { dayindex: number; period: number; subjectKey: string; subject: string; room: string; teachers: string[] };
  subjectInfo?: { students: Array<{ name: string }>; teachers: string[] };
  attendanceRecords: Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }>;
  onSave: (studentName: string, status: string, note: string) => void;
  onClose: () => void;
};

export default function AttendanceModal({ weekStart, cell, subjectInfo, attendanceRecords, onSave, onClose }: Props) {
  const date = dateToYMD(addDays(weekStart, cell.dayindex));
  const timeLabel = `${DAY_LABELS[cell.dayindex]} ${cell.period}교시`;

  const recordMap = useMemo(() => {
    const map = new Map<string, { status: string; note: string }>();
    for (const r of attendanceRecords) {
      if (r.date === date && r.dayindex === cell.dayindex && r.period === cell.period && r.subjectKey === cell.subjectKey) {
        map.set(r.studentName, { status: r.status, note: r.note });
      }
    }
    return map;
  }, [attendanceRecords, date, cell.dayindex, cell.period, cell.subjectKey]);

  const students = subjectInfo?.students ?? [];

  const toggleStatus = (name: string) => {
    const cur = recordMap.get(name);
    const next = cur?.status === '/' ? '' : '/';
    onSave(name, next, cur?.note ?? '');
  };

  const handleSaveAll = () => {
    students.forEach(s => {
      const rec = recordMap.get(s.name);
      onSave(s.name, rec?.status ?? '', rec?.note ?? '');
    });
  };

  return (
    <div
      style={{
        flex: '0 0 40%',
        minWidth: 280,
        height: '100vh',
        background: 'var(--white)',
        boxShadow: '-4px 0 20px var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Open Sans', 'Malgun Gothic', sans-serif",
      }}
    >
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{cell.subject}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>수업 시간: {timeLabel}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>수업 장소: {cell.room}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>담당 교사: {cell.teachers.join(', ') || '-'}</div>
          </div>
          <button onClick={onClose} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleSaveAll}
          style={{
            marginTop: 12,
            width: '100%',
            padding: 12,
            background: 'var(--accent)',
            color: 'var(--white)',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          출결 현황 저장하기
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>수강생 이름</th>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: 72 }}>{timeLabel}</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>수강생 목록은 관리자 시트(과목출석부)에서 불러옵니다.</td></tr>
            )}
            {students.map(s => {
              const rec = recordMap.get(s.name);
              return (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}>{s.name}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => toggleStatus(s.name)}
                      style={{
                        width: 40,
                        height: 32,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: rec?.status ? 'var(--yellow-400)' : 'var(--white)',
                        cursor: 'pointer',
                        fontSize: 16,
                      }}
                    >
                      {rec?.status || ''}
                    </button>
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      type="text"
                      defaultValue={rec?.note}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (rec?.note ?? '')) onSave(s.name, rec?.status ?? '', v);
                      }}
                      placeholder="비고"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
