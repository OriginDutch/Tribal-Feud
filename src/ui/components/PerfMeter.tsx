import { perfOn, perfStats } from '../perf';

/** A small box in the corner while the performance meter is on. */
export function PerfMeter() {
  const p = perfStats.value;
  if (!perfOn.value || !p) return null;
  const slow = p.speed !== null && p.setSpeed > 0 && p.speed < p.setSpeed * 0.95;
  const bad = p.fps < 30 || p.long.max > 100 || slow;
  return (
    <div class={`perf-meter ${bad ? 'bad' : ''}`} aria-hidden="true">
      <span>{p.fps} fps</span>
      <span title="Blokkades van meer dan 50 ms in de laatste 10 seconden: aantal · totaal · langste">blok {p.long.n} · {p.long.total} ms · max {p.long.max}</span>
      <span title="Game-updates per seconde, en hoe lang het verwerken van één duurde">upd {p.snaps}/s · {p.handle} ms</span>
      <span class={slow ? 'perf-slow' : ''} title="Snelheid die het spel de laatste 5 seconden echt haalde, tegenover wat je instelde">
        tempo {p.speed === null ? '–' : `${p.speed.toFixed(1)}×`} / {p.setSpeed}×
      </span>
      <span title="Simulatie per echte seconde: ms bezig (waarvan updates voor het scherm) · traagste tik · speltijd kwijt (ms) door tikken langer dan 1 s">
        sim {p.sim.busy} ms/s (upd {p.sim.snap}) · max {p.sim.max} · kwijt {p.sim.lost}
      </span>
    </div>
  );
}
