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
  const [farm, setFarm] = useState(1);
  const [curve, setCurve] = useState<'tiered' | 'classic'>('tiered');
  const [winShare, setWinShare] = useState(0.75);
  const [winBarbs, setWinBarbs] = useState(true);
  const [research, setResearch] = useState<'simple' | 'levels3' | 'levels10'>('simple');
  const [paladin, setPaladin] = useState<'off' | 'on' | 'items'>('on');

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
    if (farm !== 1) overrides.farmMultiplier = farm;
    if (curve !== 'tiered') overrides.nobleCurve = curve;
    if (research !== 'simple') overrides.research = research;
    if (paladin !== 'on') overrides.paladin = paladin;
    if (winShare !== 0.75 || !winBarbs) overrides.winCondition = { villageShare: winShare, countBarbarians: winBarbs };
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
      <h3>Extra</h3>
      <label title="Simpel: een eenheid is ontwikkeld of niet. Met levels maak je eenheden in de smederij sterker.">
        Smederij
        <select value={research} onChange={(e) => setResearch(e.currentTarget.value as 'simple' | 'levels3' | 'levels10')}>
          <option value="simple">Simpel (ontwikkeld ja/nee)</option>
          <option value="levels3">3 levels (tot ×1,4)</option>
          <option value="levels10">10 levels (tot ×1,5)</option>
        </select>
      </label>
      <label title="Met items vindt je paladijn wapens die een eenheidstype sterker maken.">
        Paladijn
        <select value={paladin} onChange={(e) => setPaladin(e.currentTarget.value as 'off' | 'on' | 'items')}>
          <option value="off">Uit</option>
          <option value="on">Aan</option>
          <option value="items">Aan, met items</option>
        </select>
      </label>
      <h3>Eindspel</h3>
      <label title="Een stam die dit deel van de wereld 3 speldagen vasthoudt, wint.">
        Winnen bij {Math.round(winShare * 100)}%
        <input type="range" min={0.5} max={1} step={0.05} value={winShare} onInput={(e) => setWinShare(Number(e.currentTarget.value))} />
      </label>
      <label class="row" title="Tellen barbarendorpen mee in het totaal? Meetellen is strenger.">
        <input type="checkbox" checked={winBarbs} onChange={(e) => setWinBarbs(e.currentTarget.checked)} /> Barbarendorpen tellen mee
      </label>
      <h3>Fun</h3>
      <label title="Bevolkingslimiet van de boerderij. Gebouwen gebruiken evenveel als altijd, dus de ruimte voor troepen groeit nog iets harder. Je merkt het vooral laat in het spel, als je economie de legers kan betalen.">
        Bevolking ×{farm.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
        <input type="range" min={0.5} max={3} step={0.25} value={farm} onInput={(e) => setFarm(Number(e.currentTarget.value))} />
      </label>
      <p class="hint">
        {farm === 1
          ? 'Gewone boerderij (24.000 inwoners op level 30).'
          : `Boerderij level 30: ${Math.round(24000 * farm).toLocaleString('nl-NL')} inwoners. Grotere legers aan beide kanten; edelen en schoonvegen worden ${farm > 1 ? 'zwaarder' : 'makkelijker'}. Alleen bij het aanmaken in te stellen.`}
      </p>
      <label title="Hoeveel munten een edel kost.">
        Edelprijs
        <select value={curve} onChange={(e) => setCurve(e.currentTarget.value as 'tiered' | 'classic')}>
          <option value="tiered">Getrapt: max 25 per edel (tot plek 200), dan 50, 75, ...</option>
          <option value="classic">TW-klassiek: edel n kost n munten</option>
        </select>
      </label>
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
