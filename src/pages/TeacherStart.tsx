import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LogIn } from 'lucide-react';
import { initFirebase, signInWithGoogle, onAuthStateChanged } from '@/lib/firebase';
import { saveTeacherConfig, getTeacherConfig } from '@/api/sheets';

function getSpreadsheetIdFromUrl(url: string): string {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : url.trim();
}

export default function TeacherStart() {
  const nav = useNavigate();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uid, setUid] = useState<string | null>(null);

  initFirebase();
  useEffect(() => {
    const unsub = onAuthStateChanged((user) => setUid(user?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('moving_attendance_spreadsheet_url');
    if (stored) setSpreadsheetUrl(stored);
  }, []);

  const handleStart = async () => {
    setError('');
    const id = getSpreadsheetIdFromUrl(spreadsheetUrl);
    const name = teacherName.trim();
    if (!id) {
      setError('스프레드시트 주소를 입력해 주세요.');
      return;
    }
    if (!name) {
      setError('검색할 교사 이름을 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem('moving_attendance_spreadsheet_url', spreadsheetUrl);
      localStorage.setItem('moving_attendance_spreadsheet_id', id);
      if (uid) {
        await saveTeacherConfig(id, uid, name);
      }
      localStorage.setItem('moving_attendance_teacher_name', name);
      nav('/timetable');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.');
    }
  };

  const loadSavedName = async () => {
    const id = getSpreadsheetIdFromUrl(spreadsheetUrl) || localStorage.getItem('moving_attendance_spreadsheet_id');
    if (!id || !uid) return;
    try {
      const { teacherName: saved } = await getTeacherConfig(id, uid);
      if (saved) setTeacherName(saved);
    } catch (_) {}
  };

  useEffect(() => {
    if (uid && spreadsheetUrl) loadSavedName();
  }, [uid, spreadsheetUrl]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24, color: 'var(--text)' }}>출석부 시작</h1>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>구글 스프레드시트 주소</label>
        <input
          type="text"
          value={spreadsheetUrl}
          onChange={(e) => setSpreadsheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>검색할 교사 이름</label>
        <input
          type="text"
          value={teacherName}
          onChange={(e) => setTeacherName(e.target.value)}
          placeholder="홍길동"
          style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}
        />
      </div>
      {!uid && (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
          다른 기기에서도 같은 이름으로 사용하려면 구글 로그인을 해 주세요.
        </p>
      )}
      {!uid ? (
        <button
          type="button"
          onClick={handleGoogleLogin}
          style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <LogIn size={18} /> 구글 로그인
        </button>
      ) : null}
      {error && <p style={{ color: '#c62828', marginBottom: 12 }}>{error}</p>}
      <button
        onClick={handleStart}
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Search size={20} /> 시작하기
      </button>
    </div>
  );
}
