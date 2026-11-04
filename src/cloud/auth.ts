/**
 * Signing in, in the tab: the Firebase Auth SDK, loaded only when accounts are configured. The tab
 * hands its ID token to the worker (which does the cloud saves) whenever it changes; the SDK
 * renews it before the hour is up. Every open tab does this; the worker keeps the newest.
 */
import { signal } from '@preact/signals';
import type { Auth, User } from 'firebase/auth';
import { send, showNotice } from '../ui/store';
import { AUTH_EMULATOR, EMULATOR, FIREBASE, isAdmin } from './config';
import { Firestore } from './rest';
import { tr } from '../shared/i18n';

export interface Account {
  uid: string;
  email: string;
  verified: boolean;
  admin: boolean;
}

/** null = signed out; undefined = not known yet (or no accounts in this build) */
export const account = signal<Account | null | undefined>(undefined);
export const accountOpen = signal(false);
/** Which form the account window opens with. */
export const accountMode = signal<'in' | 'up'>('in');

export function openAccount(mode: 'in' | 'up' = 'in'): void {
  accountMode.value = mode;
  accountOpen.value = true;
}
export const cloudEnabled = FIREBASE !== null;

let authPromise: Promise<{ auth: Auth; mod: typeof import('firebase/auth') }> | null = null;

function load() {
  authPromise ??= (async () => {
    const [{ initializeApp }, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = initializeApp(FIREBASE!);
    const auth = mod.getAuth(app);
    if (EMULATOR) mod.connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
    return { auth, mod };
  })();
  return authPromise;
}

const db = (u: User) => new Firestore(FIREBASE!.projectId, () => u.getIdToken());

/** The account's own record: made at sign-up (the admin sees it), last seen kept up to date. */
async function touch(u: User): Promise<void> {
  const fs = db(u);
  const path = `users/${u.uid}`;
  const exists = await fs.get(path);
  await fs.commit([exists ? { set: path, fields: { email: u.email ?? '', created: exists.fields.created ?? null }, serverTime: ['lastSeen'], mustExist: true } : { set: path, fields: { email: u.email ?? '' }, serverTime: ['created', 'lastSeen'], mustExist: false }]);
}

export function initAuth(): void {
  if (!cloudEnabled) return;
  void load().then(({ auth, mod }) => {
    let touched = '';
    mod.onIdTokenChanged(auth, async (u) => {
      if (!u) {
        account.value = null;
        send({ type: 'auth', user: null });
        return;
      }
      const token = await u.getIdToken();
      account.value = { uid: u.uid, email: u.email ?? '', verified: u.emailVerified, admin: isAdmin(u.email, u.emailVerified) };
      send({ type: 'auth', user: { uid: u.uid, email: u.email ?? '', verified: u.emailVerified, token } });
      if (touched !== u.uid) {
        touched = u.uid;
        touch(u).catch(() => undefined);
      }
    });
  });
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Dat is geen geldig e-mailadres.',
  'auth/missing-password': 'Vul een wachtwoord in.',
  'auth/weak-password': 'Kies een wachtwoord van minstens 8 tekens.',
  'auth/email-already-in-use': 'Er is al een account met dit e-mailadres. Log in, of vraag een nieuw wachtwoord aan.',
  'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
  'auth/wrong-password': 'E-mailadres of wachtwoord klopt niet.',
  'auth/user-not-found': 'E-mailadres of wachtwoord klopt niet.',
  'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth/network-request-failed': 'Geen verbinding. Probeer het opnieuw.',
};

export function authError(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  const m = MESSAGES[code];
  return m ? tr(m) : tr('Dat lukte niet ({error}).', { error: code || String(e) });
}

export async function signUp(email: string, password: string): Promise<void> {
  if (password.length < 8) throw Object.assign(new Error('weak'), { code: 'auth/weak-password' });
  const { auth, mod } = await load();
  const cred = await mod.createUserWithEmailAndPassword(auth, email.trim(), password);
  await mod.sendEmailVerification(cred.user).catch(() => undefined);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { auth, mod } = await load();
  await mod.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  const { auth, mod } = await load();
  await mod.sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerification(): Promise<void> {
  const { auth, mod } = await load();
  if (auth.currentUser) await mod.sendEmailVerification(auth.currentUser);
}

/** After clicking the link in the mail: read the account again so "confirmed" shows. */
export async function reloadUser(): Promise<void> {
  const { auth } = await load();
  if (!auth.currentUser) return;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true); // fires onIdTokenChanged with the new state
}

export async function signOut(): Promise<void> {
  const { auth, mod } = await load();
  await mod.signOut(auth);
  showNotice(tr('Uitgelogd. Je saves op deze computer blijven gewoon staan.'), 'info');
}

/** Admin: every account, newest first. */
export async function listAccounts(): Promise<{ uid: string; email: string; created: Date | null; lastSeen: Date | null }[]> {
  const { auth } = await load();
  const u = auth.currentUser;
  if (!u) return [];
  const docs = await db(u).list('users');
  return docs
    .map((d) => ({ uid: d.id, email: String(d.fields.email ?? ''), created: d.fields.created instanceof Date ? d.fields.created : null, lastSeen: d.fields.lastSeen instanceof Date ? d.fields.lastSeen : null }))
    .sort((a, b) => (b.created?.getTime() ?? 0) - (a.created?.getTime() ?? 0));
}
