/**
 * Admin: the list of accounts, and how many are new since the admin last looked. Checked when the
 * admin signs in and every 10 minutes after; never for anyone else (the rules would refuse anyway).
 */
import { computed, effect, signal } from '@preact/signals';
import { account, listAccounts } from './auth';

export interface AccountRow {
  uid: string;
  email: string;
  created: Date | null;
  lastSeen: Date | null;
}

const SEEN_KEY = 'tf-admin-seen';
export const accounts = signal<AccountRow[] | null>(null);
export const adminError = signal('');
const seen = signal<number>((() => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } })());

/** New accounts since the admin last opened the list. */
export const newAccounts = computed(() => (accounts.value ?? []).filter((a) => (a.created?.getTime() ?? 0) > seen.value).length);

export function isNew(a: AccountRow): boolean {
  return (a.created?.getTime() ?? 0) > seen.value;
}

export async function refreshAccounts(): Promise<void> {
  try {
    accounts.value = await listAccounts();
    adminError.value = '';
  } catch (e) {
    adminError.value = `Lijst ophalen mislukt: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** The admin has seen the list: the badge goes away. */
export function markSeen(): void {
  const newest = Math.max(0, ...(accounts.value ?? []).map((a) => a.created?.getTime() ?? 0));
  if (newest <= seen.value) return;
  seen.value = newest;
  try { localStorage.setItem(SEEN_KEY, String(newest)); } catch { /* fine */ }
}

let timer: number | undefined;
export function watchAdmin(): void {
  effect(() => {
    const admin = account.value?.admin ?? false;
    window.clearInterval(timer);
    if (!admin) { accounts.value = null; return; }
    void refreshAccounts();
    timer = window.setInterval(() => void refreshAccounts(), 10 * 60_000);
  });
}
