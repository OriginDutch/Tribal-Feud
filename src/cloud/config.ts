/**
 * Accounts and cloud saves: Firebase Authentication (in the tab) and Firestore over its REST API
 * (in the worker, which holds the world). Without a Firebase config the whole feature stays hidden.
 *
 * A build with VITE_FB_EMULATOR=1 talks to the local emulators instead (tests, CI).
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/** The live project. Not a secret: every Firebase web app ships this; the security rules guard the data. */
const LIVE: FirebaseConfig | null = null;

export const EMULATOR = import.meta.env.VITE_FB_EMULATOR === '1';
const EMU_HOST = (import.meta.env.VITE_FB_EMULATOR_HOST as string | undefined) ?? '127.0.0.1';
export const AUTH_EMULATOR = `http://${EMU_HOST}:9099`;
const FIRESTORE_EMULATOR = `http://${EMU_HOST}:8080`;

export const FIREBASE: FirebaseConfig | null = EMULATOR
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-tribal-feud', appId: 'demo-app' }
  : LIVE;

/** This account sees the list of new accounts (only with a confirmed address). Also in firestore.rules. */
export const ADMIN_EMAIL = 'admin@tribal-feud.test';

export const isAdmin = (email: string | null, verified: boolean) => !!email && verified && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

/** Document root of the Firestore REST API. */
export function firestoreRoot(projectId: string): string {
  const host = EMULATOR ? FIRESTORE_EMULATOR : 'https://firestore.googleapis.com';
  return `${host}/v1/projects/${projectId}/databases/(default)/documents`;
}

/** A world goes to the cloud at most this often while playing (and also on pause, the save button and a hidden tab). */
export const CLOUD_EVERY_MS = 5 * 60_000;
/** Firestore documents hold 1 MiB; a gzipped world is cut in pieces of this size. */
export const CHUNK_BYTES = 700_000;
/** Pieces per world: 8 × 700 KB gzipped is roughly a 50–70 MB world. The rules allow no more. */
export const MAX_CHUNKS = 8;
/** Worlds per account in the cloud (the rules allow slots 1–3). */
export const MAX_WORLDS = 3;
