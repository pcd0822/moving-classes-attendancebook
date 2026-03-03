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
    const normalized = teacherName?.trim().toLowerCase() ?? '';
    const my = timetableRows.filter(
      r => r.teachername.trim().toLowerCase() === normalized
    );
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
    <div style={{ padding: 24, paddingRight: modalCell ? 420 : 24, transition: 'padding-right 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{teacherName} 선생님 시간표</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setExportOpen(true)}
            style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Calendar size={18} /> 분반별 출석부 다운로드
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{formatWeekLabel(weekRange.start)}</p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', background: 'var(--white)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px var(--shadow)' }}>
          <thead>
            <tr>
              <th style={{ padding: 12, background: 'var(--pastel-pink)', width: 64 }}>교시</th>
              {weekRange.labels.map((l, i) => (
                <th key={i} style={{ padding: 12, background: isToday(l.date) ? 'var(--today-bg)' : 'var(--pastel-pink)' }}>
                  {l.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map(period => (
              <tr key={period}>
                <td style={{ padding: 10, background: 'var(--pastel-rose)', fontWeight: 600 }}>{PERIOD_LABELS[period - 1]}</td>
                {[0, 1, 2, 3, 4].map(dayindex => {
                  const cell = myTimetable[period - 1]?.[dayindex];
                  const dayDate = addDays(weekRange.start, dayindex);
                  const isTodayCell = isToday(dayDate);
                  return (
                    <td
                      key={dayindex}
                      style={{
                        padding: 10,
                        minWidth: 120,
                        background: isTodayCell ? 'var(--today-bg)' : 'var(--white)',
                        border: '1px solid var(--border)',
                        verticalAlign: 'top',
                      }}
                    >
                      {cell ? (
                        <div
                          style={{
                            background: 'var(--pastel-rose)',
                            borderRadius: 8,
                            padding: 10,
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          onClick={() => handleCellClick(dayindex, period)}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{cell.subject}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--pastel-mint)', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                            {cell.room}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadXlsx(dayindex, period); }}
                            style={{ position: 'absolute', top: 8, right: 8, padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}
                            title="엑셀 다운로드"
                          >
                            <FileSpreadsheet size={18} color="var(--pastel-red)" />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
