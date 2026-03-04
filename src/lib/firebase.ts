import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Firestore 컬렉션: 구글 로그인 uid별로 스프레드시트 주소·이름 저장. 규칙: allow read, write if request.auth != null && request.auth.uid == userId; */
const TEACHER_CONFIG_COLLECTION = 'teacherConfig';

let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

export function initFirebase() {
  if (app) return { app, auth: auth! };
  if (!config.apiKey || !config.projectId) return { app: null, auth: null };
  app = initializeApp(config);
  auth = getAuth(app);
  return { app, auth };
}

export type TeacherConfig = { spreadsheetUrl: string; teacherName: string };

/** 구글 로그인 계정(uid) 기준으로 저장된 스프레드시트 주소·이름 불러오기 (다른 기기에서도 동일 계정으로 불러옴) */
export async function getTeacherConfigFromFirestore(uid: string): Promise<TeacherConfig | null> {
  const { app: a } = initFirebase();
  if (!a) return null;
  try {
    const db = getFirestore(a);
    const ref = doc(db, TEACHER_CONFIG_COLLECTION, uid);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (!data || typeof data.spreadsheetUrl !== 'string' || typeof data.teacherName !== 'string') return null;
    return { spreadsheetUrl: data.spreadsheetUrl, teacherName: data.teacherName };
  } catch {
    return null;
  }
}

/** 구글 로그인 계정(uid)에 스프레드시트 주소·이름 저장 (다른 기기에서 로그인 시 불러올 수 있음) */
export async function saveTeacherConfigToFirestore(uid: string, config: TeacherConfig): Promise<void> {
  const { app: a } = initFirebase();
  if (!a) return;
  const db = getFirestore(a);
  const ref = doc(db, TEACHER_CONFIG_COLLECTION, uid);
  await setDoc(ref, { spreadsheetUrl: config.spreadsheetUrl, teacherName: config.teacherName });
}

export async function signInWithGoogle(): Promise<User | null> {
  const { auth: a } = initFirebase();
  if (!a) return null;
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(a, provider);
  return result.user;
}

export function getCurrentUser(): User | null {
  const { auth: a } = initFirebase();
  return a?.currentUser ?? null;
}

export function onAuthStateChanged(cb: (user: User | null) => void) {
  const { auth: a } = initFirebase();
  if (!a) return () => {};
  return a.onAuthStateChanged(cb);
}
