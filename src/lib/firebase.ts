import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type User } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

export function initFirebase() {
  if (app) return { app, auth: auth! };
  if (!config.apiKey || !config.projectId) return { app: null, auth: null };
  app = initializeApp(config);
  auth = getAuth(app);
  return { app, auth };
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
