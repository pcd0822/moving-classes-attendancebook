import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileSpreadsheet, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentWeekRange, formatWeekLabel, isToday, dateToYMD } from '@/utils/weekRange';
import { readSubjects, readTimetable } from '@/api/sheets';
import { readAttendance, setAttendanceCell } from '@/api/attendance';
import type { TimetableCell, SubjectStudent } from '@/types';
import { getStudentKey } from '@/utils/attendanceKey';
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
  const [attendanceRecords, setAttendanceRecords] = useState<Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string; grade?: string; class?: string; number?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekRange().start);
  const [modalCell, setModalCell] = useState<{ dayindex: number; period: number; subjectKey: string; subject: string; room: string; teachers: string[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [pendingCell, setPendingCell] = useState<{ dayindex: number; period: number } | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [baselineCellRecords, setBaselineCellRecords] = useState<
    { date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string; grade?: string; class?: string; number?: string }[] | null
  >(null);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [showSavingModal, setShowSavingModal] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  const savingModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRunIdRef = useRef(0);

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

  const shiftWeek = (delta: number) => {
    setWeekStart(prev => addDays(prev, 7 * delta));
    // 주차를 이동할 때는 모달/임시 상태를 초기화
    setModalCell(null);
    setHasUnsaved(false);
    setPendingCell(null);
    setShowUnsavedConfirm(false);
    setBaselineCellRecords(null);
  };

  const handlePrevWeek = () => shiftWeek(-1);
  const handleNextWeek = () => shiftWeek(1);

  const reloadAttendance = async () => {
    if (!spreadsheetId || !teacherName) return;
    try {
      const att = await readAttendance(spreadsheetId, teacherName);
      setAttendanceRecords(att);
    } catch {
      // ignore
    }
  };

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
    const norm = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s/g, '');
    const normalized = norm(teacherName ?? '');
    const my = timetableRows.filter(r => norm(r.teachername) === normalized);
    const set = new Set<string>();
    for (const r of my) {
      if (r.period >= 1 && r.period <= 7 && r.dayindex >= 0 && r.dayindex <= 4) {
        const subj = findSubject(subjects, r.subject, r.subject);
        if (subj) set.add(subj.subjectKey);
      }
    }
    return set;
  }, [timetableRows, teacherName, subjects]);

  const openModalForCell = (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    const subj = findSubject(subjects, cell.subjectKey, cell.subject);
    const date = dateToYMD(addDays(weekRange.start, dayindex));
    const snapshot = attendanceRecords.filter(r => {
      if (r.date !== date || r.dayindex !== dayindex || r.period !== period) return false;
      if (!subj) return r.subjectKey === cell.subjectKey;
      const norm = (s: string) =>
        (s || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/\u00a0/g, '');
      const rKey = norm(r.subjectKey);
      return rKey === norm(subj.subjectKey) || rKey === norm(subj.subject) || rKey === norm(cell.subjectKey);
    });
    setModalCell({
      dayindex,
      period,
      subjectKey: subj?.subjectKey ?? cell.subjectKey,
      subject: cell.subject,
      room: cell.room,
      teachers: subj?.teachers ?? [],
    });
    setBaselineCellRecords(snapshot);
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

  /** 모달 내 출결/비고 변경 – 로컬 상태만 갱신 (실제 저장은 저장 버튼에서 한 번에 수행). 학번(학년|반|번호) 기준으로 학생 구분. */
  const handleAttendanceChange = (student: SubjectStudent, status: string, note: string) => {
    if (!modalCell) return;
    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
    const key = getStudentKey(student);
    setAttendanceRecords(prev => {
      const rest = prev.filter(r => {
        if (r.date !== date || r.dayindex !== modalCell.dayindex || r.period !== modalCell.period || r.subjectKey !== modalCell.subjectKey) return true;
        return getStudentKey(r) !== key;
      });
      return [...rest, { date, dayindex: modalCell.dayindex, period: modalCell.period, subjectKey: modalCell.subjectKey, studentName: student.name, grade: student.grade, class: student.class, number: student.number, status, note }];
    });
    setHasUnsaved(true);
  };

  /** 현재 칸의 출결 현황을 스프레드시트에 저장 */
  const handleSaveAttendanceAll = async (opts?: { silent?: boolean }) => {
    if (!modalCell || !spreadsheetId || !teacherName) return;
    if (savingModalTimeoutRef.current != null) {
      clearTimeout(savingModalTimeoutRef.current);
      savingModalTimeoutRef.current = null;
    }
    saveRunIdRef.current += 1;
    const thisRunId = saveRunIdRef.current;
    setShowSavingModal(true);
    setSavingProgress(0);
    const cellToSave = modalCell;
    const date = dateToYMD(addDays(weekRange.start, cellToSave.dayindex));
    const subj = findSubject(subjects, cellToSave.subjectKey, cellToSave.subject);
    const students: SubjectStudent[] = [...(subj?.students ?? [])].sort((a, b) => {
      const g = (a.grade || '').localeCompare(b.grade || '');
      if (g !== 0) return g;
      const c = (a.class || '').localeCompare(b.class || '');
      if (c !== 0) return c;
      const na = Number(a.number) || 0;
      const nb = Number(b.number) || 0;
      if (na !== nb) return na - nb;
      return (a.name || '').localeCompare(b.name || '');
    });
    const map = new Map<string, { status: string; note: string }>();
    for (const r of attendanceRecords) {
      if (r.date === date && r.dayindex === cellToSave.dayindex && r.period === cellToSave.period && r.subjectKey === cellToSave.subjectKey) {
        map.set(getStudentKey(r), { status: r.status, note: r.note });
      }
    }
    const newBaseline: {
      date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string; grade?: string; class?: string; number?: string;
    }[] = [];
    const total = students.length || 1;
    let index = 0;
    try {
      for (const s of students) {
        const rec = map.get(getStudentKey(s)) ?? { status: '', note: '' };
        await setAttendanceCell(spreadsheetId, teacherName, {
          date,
          dayindex: cellToSave.dayindex,
          period: cellToSave.period,
          subjectKey: cellToSave.subjectKey,
          grade: s.grade,
          class: s.class,
          number: s.number,
          studentName: s.name,
          status: rec.status,
          note: rec.note,
        });
        newBaseline.push({
          date,
          dayindex: cellToSave.dayindex,
          period: cellToSave.period,
          subjectKey: cellToSave.subjectKey,
          studentName: s.name,
          grade: s.grade,
          class: s.class,
          number: s.number,
          status: rec.status,
          note: rec.note,
        });
        index += 1;
        setSavingProgress(Math.round((index / total) * 100));
      }
      setBaselineCellRecords(newBaseline);
      if (!opts?.silent) setShowSavedModal(true);
      setHasUnsaved(false);
      await reloadAttendance();
    } finally {
      savingModalTimeoutRef.current = setTimeout(() => {
        if (saveRunIdRef.current === thisRunId) setShowSavingModal(false);
        savingModalTimeoutRef.current = null;
      }, 300);
    }
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
    const map = new Map(records.map(r => [getStudentKey(r), { status: r.status, note: r.note }]));
    const rows = (subj?.students ?? []).map(s => [s.name, map.get(getStudentKey(s))?.status ?? '', map.get(getStudentKey(s))?.note ?? '']);
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
    <div className={modalCell ? 'timetable-page with-modal' : 'timetable-page'} style={{ display: 'flex', width: '100%', minHeight: '100vh', maxWidth: '100vw', fontFamily: "'Open Sans', 'Malgun Gothic', sans-serif" }}>
      <div className="timetable-panel" style={{ flex: modalCell ? '0 0 50%' : 1, padding: 'clamp(12px, 4vw, 24px)', overflow: 'auto', transition: 'flex 0.2s', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 4vw, 1.25rem)' }}>{teacherName} 선생님 시간표</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setExportOpen(true)}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Calendar size={18} /> 분반별 출석부 다운로드
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={handlePrevWeek}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
            {formatWeekLabel(weekRange.start)}
          </div>
          <button
            type="button"
            onClick={handleNextWeek}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {timetableRows.length >= 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            교사시간표 시트 {timetableRows.length}건 조회됨
          </div>
        )}
      </div>

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

      <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%' }}>
        <table style={{ width: '100%', maxWidth: 640, minWidth: 320, borderCollapse: 'collapse', background: 'var(--white)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px var(--shadow)', fontSize: 'clamp(12px, 2.5vw, 13px)' }}>
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
              <tr key={period} style={{ height: 64 }}>
                <td style={{ padding: 6, background: 'var(--timetable-red-light)', fontWeight: 600, fontSize: 12, textAlign: 'center', height: 64, boxSizing: 'border-box' }}>{PERIOD_LABELS[period - 1]}</td>
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
                        height: 64,
                        boxSizing: 'border-box',
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
          onChange={(student, status, note) => handleAttendanceChange(student, status, note)}
          onSave={() => handleSaveAttendanceAll()}
          onReset={handleResetAttendance}
          onReload={reloadAttendance}
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

      {showSavingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 1550,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              padding: 20,
              borderRadius: 16,
              boxShadow: '0 8px 24px var(--shadow)',
              width: 280,
              textAlign: 'center',
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <img
                src="/assets/attendance-saving.png"
                alt="saving"
                style={{ width: 56, height: 56, objectFit: 'contain' }}
              />
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 14 }}>저장중입니다...</p>
            <div
              style={{
                width: '100%',
                height: 8,
                borderRadius: 999,
                background: '#f3f4f6',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${savingProgress}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 999,
                  transition: 'width 0.15s ease-out',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showSavedModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              padding: 24,
              borderRadius: 16,
              boxShadow: '0 10px 30px var(--shadow)',
              width: 320,
              textAlign: 'center',
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <img
                src="/assets/attendance-saved.png"
                alt="saved"
                style={{ width: 72, height: 72, objectFit: 'contain' }}
              />
            </div>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>저장되었습니다</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>연동된 스프레드시트에 출결 데이터가 반영되었어요.</p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setShowSavedModal(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--white)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
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
                  await handleSaveAttendanceAll({ silent: true });
                  setShowUnsavedConfirm(false);
                  const target = pendingCell;
                  setBaselineCellRecords(null);
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
                  if (modalCell && baselineCellRecords) {
                    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
                    setAttendanceRecords(prev => {
                      const rest = prev.filter(
                        r => !(r.date === date && r.dayindex === modalCell.dayindex && r.period === modalCell.period && r.subjectKey === modalCell.subjectKey)
                      );
                      return [...rest, ...baselineCellRecords];
                    });
                  }
                  setHasUnsaved(false);
                  const target = pendingCell;
                  setBaselineCellRecords(null);
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
