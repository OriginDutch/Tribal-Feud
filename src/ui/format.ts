import { lang } from '../shared/i18n';

// formatters are costly to make: one set per language, made once (toLocaleString with options makes a new one per call)
const make = (loc: string) => ({
  nf: new Intl.NumberFormat(loc),
  nf1: new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
  upTo1: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }),
  upTo2: new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }),
});
const F = { nl: make('nl-NL'), en: make('en-US') };
const f = () => F[lang.value];

/** Always one decimal: 3,0 / 3.0 */
export const dec1 = (n: number): string => f().nf1.format(n);
/** Up to one decimal: 3 or 3,5 */
export const upToDec1 = (n: number): string => f().upTo1.format(n);
/** Up to two decimals. */
export const upToDec2 = (n: number): string => f().upTo2.format(n);

export function num(n: number): string {
  return f().nf.format(Math.floor(n));
}

/** Duration in game ms as h:mm:ss (or d:hh:mm:ss past a day). */
export function duration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${h}:${pad(m)}:${pad(s)}`;
}
