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

/**
 * Configuração pública do projeto Firebase (a chave web do Firebase não é segredo;
 * a proteção real dos dados está em firestore.rules e storage.rules).
 * Pode ser sobrescrita pelas variáveis VITE_FIREBASE_* no arquivo .env.
 */
const DEFAULT_FIREBASE_CONFIG: FirebaseConfigInput = {
  apiKey: 'AIzaSyBEZ2oEsz4xNje7nrNap9S6UKwPpX21aKU',
  authDomain: 'liga-das-estrelas.firebaseapp.com',
  projectId: 'liga-das-estrelas',
  storageBucket: 'liga-das-estrelas.firebasestorage.app',
  messagingSenderId: '588239521137',
  appId: '1:588239521137:web:924a5cff8d73bfa15ae2d0',
};

export function getResolvedFirebaseConfig(): FirebaseConfigInput {
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
  return DEFAULT_FIREBASE_CONFIG;
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let cachedServices: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (cachedServices) return cachedServices;
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(getResolvedFirebaseConfig());
  cachedServices = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
  return cachedServices;
}
