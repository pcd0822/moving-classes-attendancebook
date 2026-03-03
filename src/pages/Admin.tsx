import { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, Link, Copy, Check } from 'lucide-react';
import { parseAttendanceExcel } from '@/utils/excelAttendanceParser';
import { parseTeacherTimetableExcel } from '@/utils/excelTimetableParser';
import { writeSubjects, writeTimetable } from '@/api/sheets';
import type { SubjectBlock, TeacherTimetableRow } from '@/types';

const STORAGE_KEY_URL = 'admin_spreadsheet_url';
const STORAGE_KEY_ATTENDANCE = 'admin_attendance_blocks';
const STORAGE_KEY_ATTENDANCE_NAME = 'admin_attendance_filename';
const STORAGE_KEY_TIMETABLE = 'admin_timetable_rows';
const STORAGE_KEY_TIMETABLE_NAME = 'admin_timetable_filename';

function getSpreadsheetIdFromUrl(url: string): string {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : url.trim();
}

function loadStoredAttendance(): { blocks: SubjectBlock[]; fileName: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    const name = localStorage.getItem(STORAGE_KEY_ATTENDANCE_NAME) || '';
    if (!raw) return { blocks: [], fileName: name };
    const blocks = JSON.parse(raw) as SubjectBlock[];
    return { blocks: Array.isArray(blocks) ? blocks : [], fileName: name };
  } catch {
    return { blocks: [], fileName: '' };
  }
}

function loadStoredTimetable(): { rows: TeacherTimetableRow[]; fileName: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMETABLE);
    const name = localStorage.getItem(STORAGE_KEY_TIMETABLE_NAME) || '';
    if (!raw) return { rows: [], fileName: name };
    const rows = JSON.parse(raw) as TeacherTimetableRow[];
    return { rows: Array.isArray(rows) ? rows : [], fileName: name };
  } catch {
    return { rows: [], fileName: '' };
  }
}

export default function Admin() {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [attendanceBlocks, setAttendanceBlocks] = useState<SubjectBlock[]>([]);
  const [attendanceFileName, setAttendanceFileName] = useState('');
  const [timetableRows, setTimetableRows] = useState<TeacherTimetableRow[]>([]);
  const [timetableFileName, setTimetableFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const attendanceInput = useRef<HTMLInputElement>(null);
  const timetableInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = localStorage.getItem(STORAGE_KEY_URL) || '';
    setSpreadsheetUrl(url);
    const att = loadStoredAttendance();
    setAttendanceBlocks(att.blocks);
    setAttendanceFileName(att.fileName);
    const tt = loadStoredTimetable();
    setTimetableRows(tt.rows);
    setTimetableFileName(tt.fileName);
  }, []);

  useEffect(() => {
    if (spreadsheetUrl) localStorage.setItem(STORAGE_KEY_URL, spreadsheetUrl);
  }, [spreadsheetUrl]);

  const handleUploadAttendance = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    try {
      const blocks = await parseAttendanceExcel(f);
      setAttendanceBlocks(blocks);
      setAttendanceFileName(f.name);
      localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(blocks));
      localStorage.setItem(STORAGE_KEY_ATTENDANCE_NAME, f.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '출석부 파일을 읽지 못했습니다.');
    }
    e.target.value = '';
  };

  const handleUploadTimetable = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    try {
      const rows = await parseTeacherTimetableExcel(f);
      setTimetableRows(rows);
      setTimetableFileName(f.name);
      localStorage.setItem(STORAGE_KEY_TIMETABLE, JSON.stringify(rows));
      localStorage.setItem(STORAGE_KEY_TIMETABLE_NAME, f.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '시간표 파일을 읽지 못했습니다.');
    }
    e.target.value = '';
  };

  const handleBuild = async () => {
    const id = getSpreadsheetIdFromUrl(spreadsheetUrl);
    if (!id) {
      setError('구글 스프레드시트 주소를 입력해 주세요.');
      return;
    }
    if (attendanceBlocks.length === 0 && timetableRows.length === 0) {
      setError('출석부 또는 시간표 중 하나 이상의 데이터가 필요합니다. 엑셀을 업로드하거나 이전에 저장된 데이터가 있어야 합니다.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (attendanceBlocks.length > 0) await writeSubjects(id, attendanceBlocks);
      if (timetableRows.length > 0) await writeTimetable(id, timetableRows);
      setDone(true);
      const base = window.location.origin;
      setShareLink(`${base}/`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const hasAttendance = attendanceBlocks.length > 0;
  const hasTimetable = timetableRows.length > 0;
  const canBuild = getSpreadsheetIdFromUrl(spreadsheetUrl) && (hasAttendance || hasTimetable);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>관리자 페이지</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        구글 스프레드시트 주소를 입력하고, 출석부 또는 시간표 중 하나 이상 업로드 후 DB 제작을 실행하세요. 입력한 주소와 업로드한 데이터는 브라우저에 저장되어 다시 올리지 않아도 됩니다.
      </p>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
          <Link size={18} /> 구글 스프레드시트 주소
        </label>
        <input
          type="text"
          value={spreadsheetUrl}
          onChange={e => setSpreadsheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}
        />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
          <FileSpreadsheet size={18} /> 이동반 출석부 (엑셀)
        </label>
        <input ref={attendanceInput} type="file" accept=".xlsx,.xls" onChange={handleUploadAttendance} style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => attendanceInput.current?.click()}
          style={{ padding: '12px 20px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--red-100)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={18} /> {attendanceFileName || '파일 선택'}
        </button>
        {hasAttendance && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            저장됨: {attendanceBlocks.length}개 과목
          </p>
        )}
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
          <FileSpreadsheet size={18} /> 교사별 시간표 (엑셀)
        </label>
        <input ref={timetableInput} type="file" accept=".xlsx,.xls" onChange={handleUploadTimetable} style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => timetableInput.current?.click()}
          style={{ padding: '12px 20px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--red-100)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={18} /> {timetableFileName || '파일 선택'}
        </button>
        {hasTimetable && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            저장됨: {timetableRows.length}건
          </p>
        )}
      </div>
      {error && <p style={{ color: '#c62828', marginBottom: 12 }}>{error}</p>}
      <button
        onClick={handleBuild}
        disabled={loading || !canBuild}
        style={{
          width: '100%',
          padding: 14,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--white)',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 12,
        }}
      >
        {loading ? '저장 중...' : 'DB 제작 및 저장'}
      </button>
      {done && (
        <div style={{ marginTop: 24, padding: 16, background: 'var(--yellow-400)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>저장 완료</p>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>아래 링크를 교사들에게 공유하세요.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input readOnly value={shareLink} style={{ flex: 1, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }} />
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: '8px 14px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: copied ? '#22c55e' : 'var(--white)',
                color: copied ? 'var(--white)' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.2s ease, color 0.2s ease',
              }}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          {copied && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              클립보드에 복사되었습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
