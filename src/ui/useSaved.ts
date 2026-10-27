import { useState } from 'preact/hooks';

/**
 * useState that is remembered in this browser (localStorage, key "tf-" + key): settings you
 * choose once stay as they were, also after a reload or another world. Falls back to plain
 * state when storage is unavailable.
 */
export function useSaved<T>(key: string, initial: T): [T, (v: T | ((old: T) => T)) => void] {
  const full = `tf-${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (v: T | ((old: T) => T)) => {
    setValue((old) => {
      const next = typeof v === 'function' ? (v as (old: T) => T)(old) : v;
      try { localStorage.setItem(full, JSON.stringify(next)); } catch { /* fine */ }
      return next;
    });
  };
  return [value, set];
}
