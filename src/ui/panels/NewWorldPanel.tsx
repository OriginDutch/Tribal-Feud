import { useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
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
  const [preset, setPreset] = useSaved<Preset>('nw-preset', 'classic');
  const [seed, setSeed] = useState('');
  const [knobs, setKnobs] = useSaved('nw-knobs', presetKnobs('classic'));
  const [difficulty, setDifficulty] = useSaved<BotDifficulty>('nw-difficulty', PRESETS.classic.bots.difficulty);
  const [farm, setFarm] = useSaved('nw-farm', 1);
  const [curve, setCurve] = useSaved<'tiered' | 'classic'>('nw-curve', 'tiered');
  const [winShare, setWinShare] = useSaved('nw-win-share', 0.75);
  const [winBarbs, setWinBarbs] = useSaved('nw-win-barbs', true);
  const [research, setResearch] = useSaved<'simple' | 'levels3' | 'levels10'>('nw-research', 'simple');
  const [paladin, setPaladin] = useSaved<'off' | 'on' | 'items'>('nw-paladin', 'on');
  const [churches, setChurches] = useSaved('nw-churches', false);
  const [flags, setFlags] = useSaved('nw-flags', false);
  const [scavenging, setScavenging] = useSaved('nw-scavenging', true);
  const [morale, setMorale] = useSaved<'off' | 'points' | 'pointsTime'>('nw-morale', PRESETS.classic.morale);
  const [night, setNight] = useSaved('nw-night', false);
  const [barbCap, setBarbCap] = useSaved<'none' | 'fixed' | 'varied' | 'full'>('nw-barb-cap', 'varied');
  const [barbMax, setBarbMax] = useSaved('nw-barb-max', 3000);
  const [barbSpread, setBarbSpread] = useSaved('nw-barb-spread', 500);
  const [barbRate, setBarbRate] = useSaved('nw-barb-rate', 1);

  const changePreset = (p: Preset) => {
    setPreset(p);
    setMorale(PRESETS[p].morale);
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
    if (churches) overrides.churches = true;
    if (flags) overrides.flags = true;
    if (!scavenging) overrides.scavenging = false;
    if (morale !== PRESETS[preset].morale) overrides.morale = morale;
    if (night) overrides.nightBonus = true;
    const b = PRESETS[preset].barbarians;
    if (barbCap !== b.capMode || barbMax !== b.growthCap || barbSpread !== b.capSpread || barbRate !== b.growthRate) {
      overrides.barbarians = { capMode: barbCap, growthCap: Math.max(100, barbMax), capSpread: Math.max(0, barbSpread), growthRate: barbRate };
    }
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
      <label class="row" title="Troepen uit een dorp zonder kerk in de buurt vechten op halve kracht. Je begint met een eerste kerk.">
        <input type="checkbox" checked={churches} onChange={(e) => setChurches(e.currentTarget.checked)} /> Kerken
      </label>
      <label class="row" title="Eén vlag per dorp: productie, rekruteren, aanval, verdediging, geluk, bevolking, munten of buit. Je verdient ze met veroveringen en verslagen vijanden.">
        <input type="checkbox" checked={flags} onChange={(e) => setFlags(e.currentTarget.checked)} /> Vlaggen
      </label>
      <label class="row" title="Troepen gaan op rooftocht voor grondstoffen. Bots doen ook mee.">
        <input type="checkbox" checked={scavenging} onChange={(e) => setScavenging(e.currentTarget.checked)} /> Rooftochten
      </label>
      <label title="Moraal beschermt kleine spelers: een veel grotere aanvaller vecht zwakker. Met tijd stijgt de ondergrens van 30% naar 50% in de eerste 30 dagen van de verdediger.">
        Moraal
        <select value={morale} onChange={(e) => setMorale(e.currentTarget.value as 'off' | 'points' | 'pointsTime')}>
          <option value="off">Uit</option>
          <option value="points">Op punten</option>
          <option value="pointsTime">Op punten en tijd</option>
        </select>
      </label>
      <label class="row" title="Tussen 0:00 en 8:00 (spelklok) verdedigen spelersdorpen dubbel zo sterk.">
        <input type="checkbox" checked={night} onChange={(e) => setNight(e.currentTarget.checked)} /> Nachtbonus (0:00–8:00)
      </label>
      <h3>Barbaren</h3>
      <label title="Hoe ver barbarendorpen doorgroeien. Ze beginnen rond de grootte van een vers spelersdorp (75% tot 125%).">
        Groei
        <select value={barbCap} onChange={(e) => setBarbCap(e.currentTarget.value as typeof barbCap)}>
          <option value="none">Groeien niet</option>
          <option value="fixed">Tot een vast maximum</option>
          <option value="varied">Tot een maximum, verschilt per dorp</option>
          <option value="full">Volledig uit</option>
        </select>
      </label>
      {(barbCap === 'fixed' || barbCap === 'varied') && (
        <label>
          Maximum (punten)
          <input type="number" min={100} step={100} value={barbMax} onInput={(e) => setBarbMax(Number(e.currentTarget.value) || 3000)} />
        </label>
      )}
      {barbCap === 'varied' && (
        <label title="Elk dorp krijgt een eigen maximum, tot zoveel punten erboven of eronder.">
          Spreiding ± (punten)
          <input type="number" min={0} step={100} value={barbSpread} onInput={(e) => setBarbSpread(Math.max(0, Number(e.currentTarget.value) || 0))} />
        </label>
      )}
      {barbCap !== 'none' && (
        <label title="Standaard groeien ze 100 punten per speldag × de wortel van de wereld- en bouwsnelheid: op speed 20 zo'n 450 per dag.">
          Groeisnelheid
          <select value={String(barbRate)} onChange={(e) => setBarbRate(Number(e.currentTarget.value))}>
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((r) => <option key={r} value={String(r)}>×{r}</option>)}
          </select>
        </label>
      )}
      <p class="hint">
        {barbCap === 'none' ? 'Barbarendorpen blijven zo groot als ze beginnen.'
          : barbCap === 'full' ? 'Barbarendorpen groeien tot alles uitgebouwd is.'
          : barbCap === 'varied' ? `Elk barbarendorp groeit tot ergens tussen ${(barbMax - barbSpread).toLocaleString('nl-NL')} en ${(barbMax + barbSpread).toLocaleString('nl-NL')} punten.`
          : `Barbarendorpen groeien tot ${barbMax.toLocaleString('nl-NL')} punten.`}
      </p>
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
