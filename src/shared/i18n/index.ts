/**
 * Languages. The Dutch text is the key (gettext style): `tr('Dorpen')` shows "Villages" in English and
 * the Dutch text itself in Dutch, or when a translation is missing. Placeholders: `tr('{n} dorpen', { n })`.
 *
 * - Interface text: `tr(...)` while rendering (the language signal makes screens follow a switch).
 * - Text the simulation keeps (inbox, news, tribe news): stored as `Txt` ({ t, p }: the Dutch template
 *   and its values) and rendered with `txt(...)`, so a switch also changes what is already there.
 * - Text the simulation shows once (notices, errors, the log): `tr(...)` in the worker, in the language
 *   the tab told it (setLang).
 *
 * Dictionaries live in ./en/*.ts (Dutch -> English) and are added in ./en/index.ts.
 * `npm run i18n:check` lists keys that have no English yet.
 */
import { signal } from '@preact/signals';

export type Lang = 'en' | 'nl';
export const LANGS: Lang[] = ['en', 'nl'];
export const lang = signal<Lang>('en');

export type Param = string | number | Txt | null | undefined;
export type Params = Record<string, Param>;
/** Text that may be shown in either language: plain (old saves, names) or a template with values. */
export type Txt = string | { t: string; p?: Params };

const en: Record<string, string> = {};
/** Adds English translations (Dutch text -> English text). */
export function addEnglish(d: Record<string, string>): void {
  Object.assign(en, d);
}
/** For the checker and tests. */
export const englishKeys = () => Object.keys(en);

/** A number in the current language's notation (12.345 / 12,345). */
export function fmtNum(n: number): string {
  return (lang.value === 'nl' ? NL : EN).format(n);
}
const NL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
const EN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function fill(s: string, p?: Params): string {
  if (!p) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in p)) return m;
    const v = p[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return fmtNum(v);
    return txt(v);
  });
}

/** The interface text for a Dutch key, in the current language. */
export function tr(nl: string, p?: Params): string {
  const t = lang.value === 'nl' ? nl : (en[nl] ?? nl);
  return fill(t, p);
}

/** Text to keep (inbox, news): the Dutch template and its values, translated when shown. */
export function T(nl: string, p?: Params): Txt {
  return p ? { t: nl, p } : { t: nl };
}

/** Shows kept text in the current language (plain strings: translated if the whole string is a known key). */
export function txt(x: Txt | null | undefined): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return lang.value === 'nl' ? x : (en[x] ?? x);
  return tr(x.t, x.p);
}
