import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, Copy, Check } from 'lucide-react';

const SERVICE_EMAIL = 'sgh-attendancebook@moving-classes-attendancebook.iam.gserviceaccount.com';

export default function Guide() {
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(SERVICE_EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 24, minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>📚</div>
        <h1 style={{ margin: 0, color: 'var(--text)', fontWeight: 700 }}>이동반 출석부</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>1학기 선택과목 교사용</p>
      </div>

      <section style={{ background: 'var(--white)', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px var(--shadow)', marginBottom: 24 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 18 }}>
          <BookOpen size={22} color="var(--red-600)" />
          사용 방법 안내
        </h2>

        <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px dashed var(--border)', background: 'var(--red-50)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>관리자 구글 클라우드 서비스 계정 이메일</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={SERVICE_EMAIL}
              readOnly
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={handleCopyEmail}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--white)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>

        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)', fontSize: 14 }}>
          <li>
            <strong style={{ background: 'var(--today-bg)', padding: '2px 6px', borderRadius: 6 }}>구글 스프레드시트 연동</strong>
            {' '}– 관리자가 공유한 출석부용 스프레드시트 주소를 입력합니다. 해당 시트에 관리자 구글 클라우드 서비스 계정이 편집 권한으로 공유되어 있어야 합니다.
            <br />
            위 이메일을 복사해서 구글 스프레드시트를 하나 추가한 뒤,&nbsp;
            <span style={{ background: 'var(--today-bg)', padding: '0 4px', borderRadius: 4 }}>
              "공유" → "사용자 추가 칸에 이메일 입력" → "편집자 권한 부여" → "완료"
            </span>
            {' '}순으로 진행하세요.
          </li>
          <li>
            <strong style={{ background: 'var(--today-bg)', padding: '2px 6px', borderRadius: 6 }}>출석 체크</strong>
            {' '}– 이메일을 공유한 시트를&nbsp;
            <span style={{ background: 'var(--today-bg)', padding: '0 4px', borderRadius: 4 }}>
              "공유" → "링크복사"
            </span>
            {' '}한 뒤 링크 빈 칸에 붙여넣으세요. 그리고 선생님 이름으로 검색한 뒤 나오는 주간 시간표에서 과목을 누르면 오른쪽에 출석 체크 패널이 열립니다.
            수강생 이름 옆 칸을 눌러 출결을 표시하고, 비고란에 사유를 적을 수 있습니다. 저장 버튼을 누르시면 선생님이 연동한 시트에 출결 데이터가 저장됩니다.
          </li>
          <li>
            <strong style={{ background: 'var(--today-bg)', padding: '2px 6px', borderRadius: 6 }}>데이터 확인</strong>
            {' '}– 출결 데이터는 구글 스프레드시트에 교사별 시트(출결_이름)로 저장됩니다. 다른 교사는 해당 시트를 볼 수 없도록 서비스 계정만 공유해 두었을 때,
            앱을 통해서만 본인 출결을 조회·수정할 수 있습니다.
          </li>
        </ul>
      </section>

      <button
        onClick={() => nav('/start')}
        style={{
          width: '100%',
          padding: '16px 24px',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--white)',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: '0 4px 14px var(--shadow)',
        }}
      >
        시작하기
        <ChevronRight size={20} />
      </button>
      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14 }}>
        <a href="/admin" style={{ color: 'var(--text-muted)' }}>관리자</a>
      </p>
    </div>
  );
}
