import { useState } from 'preact/hooks';
import { PRESETS, type BotDifficulty, type ConfigOverrides, type PresetId } from '../../shared/config';
import type { Command } from '../../shared/protocol';
import { autoPause, screen, send } from '../store';

type Preset = Exclude<PresetId, 'custom'>;
type Knob = 'worldSpeed' | 'unitSpeed' | 'productionMultiplier' | 'buildSpeed' | 'recruitSpeed';

const KNOBS: { key: Knob; label: string; hint: string }[] = [
  {
    key: 'worldSpeed',
    label: 'Wereldsnelheid ×',
    hint: 'Versnelt alles: productie, bouwen, rekruteren, lopen, barbaren en bots',
  },
  { key: 'unitSpeed', label: 'Loopsnelheid ×', hint: 'Alleen hoe snel troepen lopen, bovenop de wereldsnelheid' },
  { key: 'productionMultiplier', label: 'Productie ×', hint: 'Extra op grondstoffenproductie, bovenop de wereldsnelheid' },
  { key: 'buildSpeed', label: 'Bouwsnelheid ×', hint: 'Extra op gebouwen, bovenop de wereldsnelheid' },
  { key: 'recruitSpeed', label: 'Rekruteersnelheid ×', hint: 'Extra op troepen, bovenop de wereldsnelheid' },
];

function presetKnobs(preset: Preset): Record<Knob, string> {
  const p = PRESETS[preset];
  return {
    worldSpeed: String(p.worldSpeed),
    unitSpeed: String(p.unitSpeed),
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
  const [difficulty, setDifficulty] = useState<BotDifficulty>(PRESETS.classic.bots.difficulty);

  const changePreset = (p: Preset) => {
    setPreset(p);
    setKnobs(presetKnobs(p));
    setDifficulty(PRESETS[p].bots.difficulty);
  };

  const create = () => {
    // only values that differ from the preset count as overrides (and make the world "custom")
    const overrides: ConfigOverrides = {};
    for (const { key } of KNOBS) {
      const value = Number(knobs[key]);
      if (value > 0 && value !== PRESETS[preset][key]) overrides[key] = value;
    }
    if (difficulty !== PRESETS[preset].bots.difficulty) overrides.bots = { difficulty };
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
      <label title="Hoe oplettend en hebberig de bots spelen. Ze houden zich altijd aan dezelfde regels als jij.">
        Bots
        <select value={difficulty} onChange={(e) => setDifficulty(e.currentTarget.value as BotDifficulty)}>
          <option value="easy">Makkelijk</option>
          <option value="normal">Normaal</option>
          <option value="hard">Moeilijk</option>
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
      <p class="hint">
        Wereldsnelheid versnelt alles, zoals een speedwereld in TW. De andere knoppen komen daar bovenop. Ga met je muis
        over een veld voor uitleg.
      </p>
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
      <button class="primary" onClick={create}>Nieuwe wereld</button>
    </section>
  );
}
