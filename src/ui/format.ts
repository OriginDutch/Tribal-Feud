const nf = new Intl.NumberFormat('nl-NL');

export function num(n: number): string {
  return nf.format(Math.floor(n));
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
