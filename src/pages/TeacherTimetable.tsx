import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileSpreadsheet, Calendar } from 'lucide-react';
import { getCurrentWeekRange, formatWeekLabel, isToday, dateToYMD } from '@/utils/weekRange';
import { readSubjects, readTimetable } from '@/api/sheets';
import { readAttendance, setAttendanceCell } from '@/api/attendance';
import type { TimetableCell, SubjectStudent } from '@/types';
import AttendanceModal from '@/components/AttendanceModal';
import ExportClassAttendance from '@/components/ExportClassAttendance';

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const PERIOD_LABELS = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시'];

/** subjectKey/과목명 정규화 후 매칭 (공백·대소문자 차이 보정) */
function normKey(s: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/\u00a0/g, '');
}
function findSubject(
  subjects: Array<{ time: string; subject: string; subjectKey: string; room: string; teachers: string[]; students: SubjectStudent[] }>,
  subjectKey: string,
  subjectName?: string
) {
  const n = normKey(subjectKey);
  const byKey = subjects.find(s => normKey(s.subjectKey) === n);
  if (byKey) return byKey;
  if (subjectName) {
    const nName = normKey(subjectName);
    return subjects.find(s => normKey(s.subject) === nName || normKey(s.subjectKey) === nName);
  }
  return undefined;
}

export default function TeacherTimetable() {
  const nav = useNavigate();
  const teacherName = localStorage.getItem('moving_attendance_teacher_name');
  const spreadsheetId = localStorage.getItem('moving_attendance_spreadsheet_id');
  const [subjects, setSubjects] = useState<Array<{ time: string; subject: string; subjectKey: string; room: string; teachers: string[]; students: SubjectStudent[] }>>([]);
  const [timetableRows, setTimetableRows] = useState<Array<{ teachername: string; dayindex: number; period: number; subject: string; room: string }>>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekRange().start);
  const [modalCell, setModalCell] = useState<{ dayindex: number; period: number; subjectKey: string; subject: string; room: string; teachers: string[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [pendingCell, setPendingCell] = useState<{ dayindex: number; period: number } | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const weekRange = useMemo(() => {
    const start = weekStart;
    const labels = [0, 1, 2, 3, 4].map(d => ({
      date: addDays(start, d),
      label: format(addDays(start, d), 'M/d (EEE)', { locale: ko }),
    }));
    return { start, labels };
  }, [weekStart]);

  useEffect(() => {
    setWeekStart(getCurrentWeekRange().start);
  }, []);

  useEffect(() => {
    if (!teacherName || !spreadsheetId) {
      nav('/start');
      return;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [subj, tt, att] = await Promise.all([
          readSubjects(spreadsheetId),
          readTimetable(spreadsheetId),
          readAttendance(spreadsheetId, teacherName),
        ]);
        setSubjects(subj);
        setTimetableRows(tt);
        setAttendanceRecords(att);
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [teacherName, spreadsheetId, nav]);

  const myTimetable = useMemo(() => {
    const norm = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s/g, '');
    const normalized = norm(teacherName ?? '');
    const my = timetableRows.filter(r => norm(r.teachername) === normalized);
    const grid: (TimetableCell | null)[][] = Array(7).fill(null).map(() => Array(5).fill(null));
    for (const r of my) {
      if (r.period >= 1 && r.period <= 7 && r.dayindex >= 0 && r.dayindex <= 4) {
        const subj = findSubject(subjects, r.subject, r.subject);
        grid[r.period - 1][r.dayindex] = {
          subject: subj ? `${subj.time}${subj.subject}` : r.subject,
          room: r.room,
          subjectKey: r.subject,
          timeLabel: `${DAY_LABELS[r.dayindex]} ${r.period}교시`,
        };
      }
    }
    return grid;
  }, [timetableRows, teacherName, subjects]);

  const mySubjectKeys = useMemo(() => {
    const set = new Set<string>();
    for (const row of myTimetable) {
      for (const cell of row) {
        if (cell) set.add(cell.subjectKey);
      }
    }
    return set;
  }, [myTimetable]);

  const openModalForCell = (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    const subj = findSubject(subjects, cell.subjectKey, cell.subject);
    setModalCell({
      dayindex,
      period,
      subjectKey: cell.subjectKey,
      subject: cell.subject,
      room: cell.room,
      teachers: subj?.teachers ?? [],
    });
    setHasUnsaved(false);
  };

  const handleCellClick = (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    if (
      modalCell &&
      hasUnsaved &&
      (modalCell.dayindex !== dayindex || modalCell.period !== period || modalCell.subjectKey !== cell.subjectKey)
    ) {
      setPendingCell({ dayindex, period });
      setShowUnsavedConfirm(true);
      return;
    }
    openModalForCell(dayindex, period);
  };

  /** 모달 내 출결/비고 변경 – 로컬 상태만 갱신 (실제 저장은 저장 버튼에서 한 번에 수행) */
  const handleAttendanceChange = (studentName: string, status: string, note: string) => {
    if (!modalCell) return;
    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
    setAttendanceRecords(prev => {
      const rest = prev.filter(
        r => !(r.date === date && r.dayindex === modalCell.dayindex && r.period === modalCell.period && r.subjectKey === modalCell.subjectKey && r.studentName === studentName)
      );
      return [...rest, { date, dayindex: modalCell.dayindex, period: modalCell.period, subjectKey: modalCell.subjectKey, studentName, status, note }];
    });
    setHasUnsaved(true);
  };

  /** 현재 칸의 출결 현황을 스프레드시트에 저장 */
  const handleSaveAttendanceAll = async () => {
    if (!modalCell || !spreadsheetId || !teacherName) return;
    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
    const subj = findSubject(subjects, modalCell.subjectKey, modalCell.subject);
    const students: SubjectStudent[] = subj?.students ?? [];
    const map = new Map<string, { status: string; note: string }>();
    for (const r of attendanceRecords) {
      if (r.date === date && r.dayindex === modalCell.dayindex && r.period === modalCell.period && r.subjectKey === modalCell.subjectKey) {
        map.set(r.studentName, { status: r.status, note: r.note });
      }
    }
    await Promise.all(
      students.map(s => {
        const rec = map.get(s.name) ?? { status: '', note: '' };
        return setAttendanceCell(spreadsheetId, teacherName, {
          date,
          dayindex: modalCell.dayindex,
          period: modalCell.period,
          subjectKey: modalCell.subjectKey,
          grade: s.grade,
          class: s.class,
          number: s.number,
          studentName: s.name,
          status: rec.status,
          note: rec.note,
        });
      })
    );
    window.alert('저장되었습니다.');
    setHasUnsaved(false);
  };

  /** 현재 칸의 출결·비고 입력값을 모두 지움 (로컬 상태) */
  const handleResetAttendance = () => {
    if (!modalCell) return;
    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
    setAttendanceRecords(prev =>
      prev.filter(
        r => !(r.date === date && r.dayindex === modalCell.dayindex && r.period === modalCell.period && r.subjectKey === modalCell.subjectKey)
      )
    );
    setHasUnsaved(true);
  };

  const handleDownloadXlsx = async (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    const date = dateToYMD(addDays(weekRange.start, dayindex));
    const subj = findSubject(subjects, cell.subjectKey, cell.subject);
    const records = attendanceRecords.filter(
      r => r.date === date && r.dayindex === dayindex && r.period === period && r.subjectKey === cell.subjectKey
    );
    const map = new Map(records.map(r => [r.studentName, { status: r.status, note: r.note }]));
    const rows = (subj?.students ?? []).map(s => [s.name, map.get(s.name)?.status ?? '', map.get(s.name)?.note ?? '']);
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      [cell.subject, '', ''],
      ['수업 시간', `${DAY_LABELS[dayindex]} ${period}교시`, ''],
      ['수업 장소', cell.room, ''],
      ['담당 교사', (subj?.teachers ?? []).join(', '), ''],
      [],
      ['수강생 이름', '출결', '비고'],
      ...rows,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '출석');
    XLSX.writeFile(wb, `${cell.subject}_${date}.xlsx`);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}>불러오는 중...</div>;
  if (error) return <div style={{ padding: 48, color: '#c62828' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', fontFamily: "'Open Sans', 'Malgun Gothic', sans-serif" }}>
      <div style={{ flex: modalCell ? '0 0 50%' : 1, padding: 24, overflow: 'auto', transition: 'flex 0.2s', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{teacherName} 선생님 시간표</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setExportOpen(true)}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Calendar size={18} /> 분반별 출석부 다운로드
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>
        {formatWeekLabel(weekRange.start)}
        {timetableRows.length >= 0 && (
          <span style={{ marginLeft: 12 }}>· 교사시간표 시트 {timetableRows.length}건 조회됨</span>
        )}
      </p>

      {timetableRows.length > 0 && myTimetable.flat().every(c => c === null) && (
        <p style={{ marginBottom: 16, padding: 12, background: 'var(--red-100)', borderRadius: 8, color: 'var(--text)' }}>
          검색한 이름 &quot;{teacherName}&quot;과(와) 일치하는 시간표가 없습니다. 교사별 시간표 엑셀의 teachername 칸에 입력된 이름과 띄어쓰기·철자가 같은지 확인해 보세요.
        </p>
      )}
      {timetableRows.length === 0 && (
        <p style={{ marginBottom: 16, padding: 12, background: 'var(--red-100)', borderRadius: 8, color: 'var(--text)' }}>
          교사별 시간표 데이터가 없습니다. 관리자 페이지에서 교사별 시간표 엑셀을 업로드한 뒤 DB 제작을 실행해 주세요.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', maxWidth: 640, minWidth: 480, borderCollapse: 'collapse', background: 'var(--white)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px var(--shadow)', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: 8, background: 'var(--timetable-red)', color: 'var(--text)', width: 52, fontSize: 12, textAlign: 'center' }}>교시</th>
              {weekRange.labels.map((l, i) => (
                <th key={i} style={{ padding: 8, background: isToday(l.date) ? 'var(--today-bg)' : 'var(--timetable-red)', color: 'var(--text)', fontSize: 12 }}>
                  {l.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map(period => (
              <tr key={period}>
                <td style={{ padding: 6, background: 'var(--timetable-red-light)', fontWeight: 600, fontSize: 12, textAlign: 'center' }}>{PERIOD_LABELS[period - 1]}</td>
                {[0, 1, 2, 3, 4].map(dayindex => {
                  const cell = myTimetable[period - 1]?.[dayindex];
                  const dayDate = addDays(weekRange.start, dayindex);
                  const isTodayCell = isToday(dayDate);
                  const hasRoom = cell && cell.room && cell.room !== '-';
                  return (
                    <td
                      key={dayindex}
                      style={{
                        padding: 8,
                        minWidth: 100,
                        background: isTodayCell ? 'var(--today-bg)' : 'var(--white)',
                        border: '1px solid var(--border)',
                        verticalAlign: 'top',
                      }}
                    >
                      {cell ? (
                        <div
                          style={{
                            background: 'var(--timetable-red-light)',
                            borderRadius: 6,
                            padding: 6,
                            cursor: 'pointer',
                            position: 'relative',
                            border: '1px solid var(--timetable-red-border)',
                          }}
                          onClick={() => handleCellClick(dayindex, period)}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 12 }}>{cell.subject}</div>
                          {hasRoom && (
                            <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--yellow-400)', padding: '2px 4px', borderRadius: 4, display: 'inline-block' }}>
                              {cell.room}
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadXlsx(dayindex, period); }}
                            style={{ position: 'absolute', top: 4, right: 4, padding: 2, border: 'none', background: 'transparent', cursor: 'pointer' }}
                            title="엑셀 다운로드"
                          >
                            <FileSpreadsheet size={14} color="var(--accent)" />
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12 }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      {modalCell && (
        <AttendanceModal
          weekStart={weekRange.start}
          cell={modalCell}
          subjectInfo={findSubject(subjects, modalCell.subjectKey, modalCell.subject)}
          attendanceRecords={attendanceRecords}
          onChange={handleAttendanceChange}
          onSave={handleSaveAttendanceAll}
          onReset={handleResetAttendance}
          onClose={() => setModalCell(null)}
        />
      )}

      {exportOpen && (
        <ExportClassAttendance
          subjects={subjects.filter(s => mySubjectKeys.has(s.subjectKey))}
          weekStart={weekRange.start}
          attendanceRecords={attendanceRecords}
          onClose={() => setExportOpen(false)}
        />
      )}

      {showUnsavedConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              padding: 20,
              borderRadius: 12,
              boxShadow: '0 8px 24px var(--shadow)',
              width: 320,
            }}
          >
            <p style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
              저장하지 않은 출결 현황이 있습니다. 저장하시겠습니까?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  await handleSaveAttendanceAll();
                  setShowUnsavedConfirm(false);
                  const target = pendingCell;
                  setPendingCell(null);
                  if (target) openModalForCell(target.dayindex, target.period);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--white)',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedConfirm(false);
                  setHasUnsaved(false);
                  const target = pendingCell;
                  setPendingCell(null);
                  if (target) openModalForCell(target.dayindex, target.period);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--white)',
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
