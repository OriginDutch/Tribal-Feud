import { useState } from 'preact/hooks';
import { PRESETS, type ConfigOverrides, type PresetId } from '../../shared/config';
import type { Command } from '../../shared/protocol';
import { autoPause, screen, send } from '../store';

type Preset = Exclude<PresetId, 'custom'>;
type Knob = 'productionMultiplier' | 'buildSpeed' | 'recruitSpeed';

const KNOBS: { key: Knob; label: string; hint: string }[] = [
  { key: 'productionMultiplier', label: 'Productie ×', hint: 'Alleen grondstoffenproductie' },
  { key: 'buildSpeed', label: 'Bouwsnelheid ×', hint: 'Gebouwen en smederij' },
  { key: 'recruitSpeed', label: 'Rekruteersnelheid ×', hint: 'Troepen' },
];

function presetKnobs(preset: Preset): Record<Knob, string> {
  const p = PRESETS[preset];
  return {
    productionMultiplier: String(p.productionMultiplier),
    buildSpeed: String(p.buildSpeed),
    recruitSpeed: String(p.recruitSpeed),
  };
}

export function NewWorldPanel() {
  const [name, setName] = useState('Wereld 1');
  const [preset, setPreset] = useState<Preset>('classic');
  const [seed, setSeed] = useState('');
  const [knobs, setKnobs] = useState(presetKnobs('classic'));

  const changePreset = (p: Preset) => {
    setPreset(p);
    setKnobs(presetKnobs(p));
  };

  const create = () => {
    // only values that differ from the preset count as overrides (and make the world "custom")
    const overrides: ConfigOverrides = {};
    for (const { key } of KNOBS) {
      const value = Number(knobs[key]);
      if (value > 0 && value !== PRESETS[preset][key]) overrides[key] = value;
    }
    const cmd: Command = { type: 'newWorld', preset, name, overrides };
    if (seed.trim() !== '') cmd.seed = Number(seed) >>> 0;
    autoPause.value = null;
    screen.value = 'overview';
    send(cmd);
  };

  return (
    <section class="panel">
      <h2>Nieuwe wereld</h2>
      <label>
        Naam
        <input type="text" maxLength={40} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label>
        Preset
        <select value={preset} onChange={(e) => changePreset(e.currentTarget.value as Preset)}>
          <option value="classic">Classic</option>
          <option value="speed">Speed</option>
          <option value="hardcore">Hardcore</option>
        </select>
      </label>
      <div class="knobs">
        {KNOBS.map(({ key, label, hint }) => (
          <label key={key} title={hint}>
            {label}
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={knobs[key]}
              onInput={(e) => setKnobs({ ...knobs, [key]: e.currentTarget.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Seed
        <input
          type="number"
          min={0}
          placeholder="leeg = willekeurig"
          value={seed}
          onInput={(e) => setSeed(e.currentTarget.value)}
        />
      </label>
      <button onClick={create}>Nieuwe wereld</button>
    </section>
  );
}
