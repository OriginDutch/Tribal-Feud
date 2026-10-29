import { signal } from '@preact/signals';

/** News style for the ticker and the news screen: dry text or headlines. Remembered in the browser. */
const KEY = 'news-style';
function load(): 'dry' | 'head' {
  try { return localStorage.getItem(KEY) === 'dry' ? 'dry' : 'head'; } catch { return 'head'; }
}
export const newsStyle = signal<'dry' | 'head'>(load());
export function setNewsStyle(v: 'dry' | 'head'): void {
  newsStyle.value = v;
  try { localStorage.setItem(KEY, v); } catch { /* private mode: just for this visit */ }
}
