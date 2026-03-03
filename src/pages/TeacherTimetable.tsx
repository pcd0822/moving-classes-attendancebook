import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileSpreadsheet, Calendar } from 'lucide-react';
import { getCurrentWeekRange, formatWeekLabel, isToday, dateToYMD } from '@/utils/weekRange';
import { readSubjects, readTimetable } from '@/api/sheets';
import { readAttendance, setAttendanceCell } from '@/api/attendance';
import type { TimetableCell } from '@/types';
import AttendanceModal from '@/components/AttendanceModal';
import ExportClassAttendance from '@/components/ExportClassAttendance';

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const PERIOD_LABELS = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시'];

export default function TeacherTimetable() {
  const nav = useNavigate();
  const teacherName = localStorage.getItem('moving_attendance_teacher_name');
  const spreadsheetId = localStorage.getItem('moving_attendance_spreadsheet_id');
  const [subjects, setSubjects] = useState<Array<{ time: string; subject: string; subjectKey: string; room: string; teachers: string[]; students: Array<{ name: string }> }>>([]);
  const [timetableRows, setTimetableRows] = useState<Array<{ teachername: string; dayindex: number; period: number; subject: string; room: string }>>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Array<{ date: string; dayindex: number; period: number; subjectKey: string; studentName: string; status: string; note: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekRange().start);
  const [modalCell, setModalCell] = useState<{ dayindex: number; period: number; subjectKey: string; subject: string; room: string; teachers: string[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

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
        const subj = subjects.find(s => s.subjectKey === r.subject);
        grid[r.period - 1][r.dayindex] = {
          subject: subj ? subj.subject : r.subject,
          room: r.room,
          subjectKey: r.subject,
          timeLabel: `${DAY_LABELS[r.dayindex]} ${r.period}교시`,
        };
      }
    }
    return grid;
  }, [timetableRows, teacherName, subjects]);

  const handleCellClick = (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    setModalCell({
      dayindex,
      period,
      subjectKey: cell.subjectKey,
      subject: cell.subject,
      room: cell.room,
      teachers: subjects.find(s => s.subjectKey === cell.subjectKey)?.teachers ?? [],
    });
  };

  const handleSaveAttendance = async (studentName: string, status: string, note: string) => {
    if (!modalCell || !spreadsheetId || !teacherName) return;
    const date = dateToYMD(addDays(weekRange.start, modalCell.dayindex));
    await setAttendanceCell(spreadsheetId, teacherName, {
      date,
      dayindex: modalCell.dayindex,
      period: modalCell.period,
      subjectKey: modalCell.subjectKey,
      studentName,
      status,
      note,
    });
    setAttendanceRecords(prev => {
      const rest = prev.filter(
        r => !(r.date === date && r.dayindex === modalCell.dayindex && r.period === modalCell.period && r.subjectKey === modalCell.subjectKey && r.studentName === studentName)
      );
      return [...rest, { date, dayindex: modalCell.dayindex, period: modalCell.period, subjectKey: modalCell.subjectKey, studentName, status, note }];
    });
  };

  const handleDownloadXlsx = async (dayindex: number, period: number) => {
    const cell = myTimetable[period - 1]?.[dayindex];
    if (!cell) return;
    const date = dateToYMD(addDays(weekRange.start, dayindex));
    const subj = subjects.find(s => s.subjectKey === cell.subjectKey);
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
      <div style={{ flex: modalCell ? '0 0 60%' : 1, padding: 24, overflow: 'auto', transition: 'flex 0.2s', minWidth: 0 }}>
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
        <table style={{ width: '100%', maxWidth: 520, minWidth: 380, borderCollapse: 'collapse', background: 'var(--white)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px var(--shadow)', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: 8, background: 'var(--timetable-red)', color: 'var(--white)', width: 52, fontSize: 12 }}>교시</th>
              {weekRange.labels.map((l, i) => (
                <th key={i} style={{ padding: 8, background: isToday(l.date) ? 'var(--today-bg)' : 'var(--timetable-red)', color: isToday(l.date) ? 'var(--text)' : 'var(--white)', fontSize: 12 }}>
                  {l.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map(period => (
              <tr key={period}>
                <td style={{ padding: 6, background: 'var(--timetable-red-light)', fontWeight: 600, fontSize: 12 }}>{PERIOD_LABELS[period - 1]}</td>
                {[0, 1, 2, 3, 4].map(dayindex => {
                  const cell = myTimetable[period - 1]?.[dayindex];
                  const dayDate = addDays(weekRange.start, dayindex);
                  const isTodayCell = isToday(dayDate);
                  return (
                    <td
                      key={dayindex}
                      style={{
                        padding: 6,
                        minWidth: 88,
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
                          <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--yellow-400)', padding: '2px 4px', borderRadius: 4, display: 'inline-block' }}>
                            {cell.room}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadXlsx(dayindex, period); }}
                            style={{ position: 'absolute', top: 4, right: 4, padding: 2, border: 'none', background: 'transparent', cursor: 'pointer' }}
                            title="엑셀 다운로드"
                          >
                            <FileSpreadsheet size={14} color="var(--accent)" />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
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
          subjectInfo={subjects.find(s => s.subjectKey === modalCell.subjectKey)}
          attendanceRecords={attendanceRecords}
          onSave={handleSaveAttendance}
          onClose={() => setModalCell(null)}
        />
      )}

      {exportOpen && (
        <ExportClassAttendance
          subjects={subjects}
          weekStart={weekRange.start}
          attendanceRecords={attendanceRecords}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
