import { send, snapshot } from '../store';

const HINT = {
  easy: 'Bots letten minder op (elke 2 uur) en zijn aardiger tegen jou en je stam: ze nemen je uitnodiging en aanmelding vaker aan, je stam neemt spelers tot 4 velden verder aan, ze sluiten makkelijker een verdrag met je, verklaren je stam half zo vaak de oorlog en vergeten hun wrok twee keer zo snel.',
  normal: 'Bots letten elke 45 minuten op en behandelen jou als iedere andere speler.',
  hard: 'Bots letten elke 10 minuten op en zijn kritischer tegen jou: minder vaak ja op je uitnodiging, 2 velden minder bereik, moeilijker een verdrag, en ze verklaren je stam vaker de oorlog.',
} as const;

/** Settings of the running world that may change while playing. */
export function WorldPanel() {
  const s = snapshot.value;
  if (!s) return null;
  return (
    <section class="panel">
      <h2>Deze wereld</h2>
      <label>
        Bots
        <select value={s.difficulty} onChange={(e) => send({ type: 'setDifficulty', difficulty: e.currentTarget.value as 'easy' | 'normal' | 'hard' })}>
          <option value="easy">Makkelijk</option>
          <option value="normal">Normaal</option>
          <option value="hard">Moeilijk</option>
        </select>
      </label>
      <p class="hint">{HINT[s.difficulty]} Geldt meteen, ook in een lopende wereld. Bots onderling veranderen niet.</p>
      <SpeedPicker label="Bouwsnelheid" value={s.multipliers.build} onPick={(build) => send({ type: 'setSpeeds', build, recruit: s.multipliers.recruit })} />
      <SpeedPicker label="Rekruteersnelheid" value={s.multipliers.recruit} onPick={(recruit) => send({ type: 'setSpeeds', build: s.multipliers.build, recruit })} />
      <p class="hint">Bovenop de wereldsnelheid (×{s.multipliers.world}). Geldt voor iedereen, ook de bots. Wat al in een wachtrij staat houdt zijn oude tijd.</p>
      <label class="row" title="Lopende rooftochten komen gewoon nog terug.">
        <input type="checkbox" checked={s.scavenging} onChange={(e) => send({ type: 'setScavenging', on: e.currentTarget.checked })} /> Rooftochten (ook voor bots)
      </label>
    </section>
  );
}

const SPEEDS = [0.5, 1, 1.5, 2, 3, 4, 5];

function SpeedPicker({ label, value, onPick }: { label: string; value: number; onPick: (v: number) => void }) {
  const options = SPEEDS.includes(value) ? SPEEDS : [...SPEEDS, value].sort((a, b) => a - b);
  return (
    <label>
      {label}
      <select value={String(value)} onChange={(e) => onPick(Number(e.currentTarget.value))}>
        {options.map((v) => <option key={v} value={String(v)}>×{v}</option>)}
      </select>
    </label>
  );
}
