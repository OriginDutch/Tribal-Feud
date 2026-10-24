export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const SPEEDS = [1, 2, 5, 10] as const;
export type Speed = (typeof SPEEDS)[number];

export function isSpeed(n: number): n is Speed {
  return (SPEEDS as readonly number[]).includes(n);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Game time 0 = day 1, 00:00:00. */
export function formatGameTime(ms: number): string {
  const total = Math.floor(ms / SECOND);
  const day = Math.floor(total / 86400) + 1;
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `Dag ${day} · ${pad(h)}:${pad(m)}:${pad(s)}`;
}
