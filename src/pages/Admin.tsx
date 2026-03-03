import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Link, Copy } from 'lucide-react';
import { parseAttendanceExcel } from '@/utils/excelAttendanceParser';
import { parseTeacherTimetableExcel } from '@/utils/excelTimetableParser';
import { writeSubjects, writeTimetable } from '@/api/sheets';

function getSpreadsheetIdFromUrl(url: string): string {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : url.trim();
}

export default function Admin() {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const attendanceInput = useRef<HTMLInputElement>(null);
  const timetableInput = useRef<HTMLInputElement>(null);

  const handleUploadAttendance = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setAttendanceFile(f);
  };
  const handleUploadTimetable = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setTimetableFile(f);
  };

  const handleBuild = async () => {
    const id = getSpreadsheetIdFromUrl(spreadsheetUrl);
    if (!id) {
      setError('구글 스프레드시트 주소를 입력해 주세요.');
      return;
    }
    if (!attendanceFile) {
      setError('이동반 출석부 엑셀 파일을 업로드해 주세요.');
      return;
    }
    if (!timetableFile) {
      setError('교사별 시간표 엑셀 파일을 업로드해 주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [blocks, rows] = await Promise.all([
        parseAttendanceExcel(attendanceFile),
        parseTeacherTimetableExcel(timetableFile),
      ]);
      if (blocks.length === 0) throw new Error('이동반 출석부에서 과목을 찾지 못했습니다.');
      if (rows.length === 0) throw new Error('교사별 시간표에서 데이터를 찾지 못했습니다.');
      await writeSubjects(id, blocks);
      await writeTimetable(id, rows);
      setDone(true);
      const base = window.location.origin;
      setShareLink(`${base}/`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>관리자 페이지</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        이동반 출석부 엑셀과 교사별 시간표 엑셀을 업로드한 뒤, 구글 스프레드시트 주소를 입력하고 저장하세요. 해당 스프레드시트를 서비스 계정(이메일)과 편집 권한으로 공유해야 합니다.
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
          style={{ padding: '12px 20px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--pastel-rose)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={18} /> {attendanceFile ? attendanceFile.name : '파일 선택'}
        </button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
          <FileSpreadsheet size={18} /> 교사별 시간표 (엑셀)
        </label>
        <input ref={timetableInput} type="file" accept=".xlsx,.xls" onChange={handleUploadTimetable} style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => timetableInput.current?.click()}
          style={{ padding: '12px 20px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--pastel-rose)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Upload size={18} /> {timetableFile ? timetableFile.name : '파일 선택'}
        </button>
      </div>
      {error && <p style={{ color: '#c62828', marginBottom: 12 }}>{error}</p>}
      <button
        onClick={handleBuild}
        disabled={loading}
        style={{
          width: '100%',
          padding: 14,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--white)',
          background: 'var(--pastel-red)',
          border: 'none',
          borderRadius: 12,
        }}
      >
        {loading ? '저장 중...' : 'DB 제작 및 저장'}
      </button>
      {done && (
        <div style={{ marginTop: 24, padding: 16, background: 'var(--pastel-mint)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>저장 완료</p>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>아래 링크를 교사들에게 공유하세요.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={shareLink} style={{ flex: 1, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }} />
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(shareLink); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)' }}
            >
              <Copy size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
