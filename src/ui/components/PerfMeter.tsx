import { perfOn, perfStats } from '../perf';

/** A small box in the corner while the performance meter is on. */
export function PerfMeter() {
  const p = perfStats.value;
  if (!perfOn.value || !p) return null;
  const bad = p.fps < 30 || p.long.max > 100;
  return (
    <div class={`perf-meter ${bad ? 'bad' : ''}`} aria-hidden="true">
      <span>{p.fps} fps</span>
      <span title="Blokkades van meer dan 50 ms in de laatste 10 seconden: aantal · totaal · langste">blok {p.long.n} · {p.long.total} ms · max {p.long.max}</span>
      <span title="Game-updates per seconde, en hoe lang het verwerken van één duurde">upd {p.snaps}/s · {p.handle} ms</span>
    </div>
  );
}
