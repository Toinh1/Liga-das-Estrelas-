import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseConfigInput {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId: string;
}

const STORAGE_KEY = 'baba_stats_firebase_config_v1';

const DEFAULT_FIREBASE_CONFIG: FirebaseConfigInput = {
  apiKey: 'AIzaSyBEZ2oEsz4xNje7nrNap9S6UKwPpX21aKU',
  authDomain: 'liga-das-estrelas.firebaseapp.com',
  projectId: 'liga-das-estrelas',
  storageBucket: 'liga-das-estrelas.firebasestorage.app',
  messagingSenderId: '588239521137',
  appId: '1:588239521137:web:924a5cff8d73bfa15ae2d0',
};

export function getResolvedFirebaseConfig(): FirebaseConfigInput | null {
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket:
        import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
  }

  // Fallback direto com a configuração oficial da Liga das Estrelas (permite rodar na Vercel sem configuração manual)
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveCustomFirebaseConfig(config: FirebaseConfigInput | null) {
  cachedServices = null;
  if (!config) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

export function parseFirebaseConfigSnippet(rawText: string): FirebaseConfigInput | null {
  const extract = (key: string): string => {
    const regex = new RegExp(`${key}\\s*[:=]\\s*["'\`]([^"'\`\\s,]+)["'\`]`, 'i');
    return rawText.match(regex)?.[1]?.trim() || '';
  };

  const apiKey = extract('apiKey') || extract('VITE_FIREBASE_API_KEY');
  const projectId = extract('projectId') || extract('VITE_FIREBASE_PROJECT_ID');
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain:
      extract('authDomain') ||
      extract('VITE_FIREBASE_AUTH_DOMAIN') ||
      `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket:
      extract('storageBucket') ||
      extract('VITE_FIREBASE_STORAGE_BUCKET') ||
      `${projectId}.firebasestorage.app`,
    messagingSenderId:
      extract('messagingSenderId') || extract('VITE_FIREBASE_MESSAGING_SENDER_ID') || '',
    appId: extract('appId') || extract('VITE_FIREBASE_APP_ID') || '',
  };
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let cachedServices: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices | null {
  if (cachedServices) return cachedServices;
  const cfg = getResolvedFirebaseConfig();
  if (!cfg) return null;

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(cfg);
  cachedServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
  return cachedServices;
}
