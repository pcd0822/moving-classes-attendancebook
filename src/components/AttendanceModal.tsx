import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { X } from 'lucide-react';
import { dateToYMD } from '@/utils/weekRange';
import type { SubjectStudent } from '@/types';

const DAY_LABELS = ['월', '화', '수', '목', '금'];

type Props = {
  weekStart: Date;
  cell: { dayindex: number; period: number; subjectKey: string; subject: string; room: string; teachers: string[] };
  subjectInfo?: { students: SubjectStudent[]; teachers: string[] };
  attendanceRecords: Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }>;
  /** 개별 학생의 출결/비고 변경 (로컬 상태만 업데이트) */
  onChange: (studentName: string, status: string, note: string) => void;
  /** 현재 칸의 출결 현황을 스프레드시트에 저장 */
  onSave: () => void;
  /** 현재 칸의 출결·비고 입력값 초기화 */
  onReset: () => void;
  onClose: () => void;
};

export default function AttendanceModal({ weekStart, cell, subjectInfo, attendanceRecords, onChange, onSave, onReset, onClose }: Props) {
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
  const teachersDisplay = (subjectInfo?.teachers ?? cell.teachers)?.filter(Boolean).join(', ') || '-';

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const toggleStatus = (name: string) => {
    const cur = recordMap.get(name);
    const next = cur?.status === '/' ? '' : '/';
    onChange(name, next, cur?.note ?? '');
  };

  const handleSaveAll = () => {
    onSave();
  };

  return (
    <div
      style={{
        flex: '0 0 50%',
        minWidth: 320,
        height: '100vh',
        background: 'var(--white)',
        boxShadow: '-4px 0 20px var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Open Sans', 'Malgun Gothic', sans-serif",
        animation: 'slideInRight 0.75s ease-out',
      }}
    >
      <div style={{ padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{cell.subject}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>수업 시간: {timeLabel}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>수업 장소: {cell.room}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>담당 교사: {teachersDisplay}</div>
          </div>
          <button onClick={onClose} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={handleSaveAll}
            style={{
              flex: 2,
              padding: 10,
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
          <button
            type="button"
            onClick={onReset}
            style={{
              flex: 1,
              padding: 10,
              background: 'var(--white)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            초기화
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: '10%', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>연번</th>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: '10%' }}>학년</th>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: '10%' }}>반</th>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: '10%' }}>번호</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)', width: '15%' }}>수강생 이름</th>
              <th style={{ textAlign: 'center', padding: 8, borderBottom: '1px solid var(--border)', width: '15%' }}>출결현황</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)', width: '30%' }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>수강생 목록은 관리자 시트(과목출석부)에서 불러옵니다.</td></tr>
            )}
            {students.map((s, idx) => {
              const rec = recordMap.get(s.name);
              return (
                <tr
                  key={s.name}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: hoverIndex === idx ? 'rgba(250, 204, 21, 0.18)' : 'transparent',
                    transition: 'background-color 0.12s ease-out',
                  }}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <td style={{ padding: 6, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{s.order}</td>
                  <td style={{ padding: 6, textAlign: 'center', fontSize: 12 }}>{s.grade}</td>
                  <td style={{ padding: 6, textAlign: 'center', fontSize: 12 }}>{s.class}</td>
                  <td style={{ padding: 6, textAlign: 'center', fontSize: 12 }}>{s.number}</td>
                  <td style={{ padding: 8 }}>{s.name}</td>
                  <td style={{ padding: 4, textAlign: 'center', verticalAlign: 'middle' }}>
                    <button
                      type="button"
                      onClick={() => toggleStatus(s.name)}
                      style={{
                        width: 56,
                        height: 30,
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
                  <td style={{ padding: 4, verticalAlign: 'middle' }}>
                    <input
                      type="text"
                      defaultValue={rec?.note}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (rec?.note ?? '')) onChange(s.name, rec?.status ?? '', v);
                      }}
                      placeholder="비고"
                      style={{ width: '100%', height: 30, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
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
