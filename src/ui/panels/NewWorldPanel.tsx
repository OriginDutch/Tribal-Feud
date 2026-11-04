import { useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
import { PRESETS, type BotDifficulty, type ConfigOverrides, type PresetId } from '../../shared/config';
import type { Command } from '../../shared/protocol';
import { autoPause, confirmAllTabs, screen, send } from '../store';
import { lang, tr } from '../../shared/i18n';
import { num } from '../format';

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
  const [name, setName] = useState(() => tr('Wereld 1'));
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
  const [start, setStart] = useSaved<'random' | 'center'>('nw-start', 'random');
  const [botCount, setBotCount] = useSaved<number | null>('nw-bot-count', null);
  const [barbCount, setBarbCount] = useSaved<number | null>('nw-barb-count', null);
  // empty = the preset's number; barbarians follow the bots (10 each, at least 3000) unless you set them
  const bots = botCount ?? PRESETS[preset].bots.count;
  const barbs = barbCount ?? Math.max(3000, bots * 10);
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
    if (difficulty !== PRESETS[preset].bots.difficulty || bots !== PRESETS[preset].bots.count) {
      overrides.bots = { ...(difficulty !== PRESETS[preset].bots.difficulty ? { difficulty } : {}), ...(bots !== PRESETS[preset].bots.count ? { count: bots } : {}) };
    }
    if (farm !== 1) overrides.farmMultiplier = farm;
    if (curve !== 'tiered') overrides.nobleCurve = curve;
    if (research !== 'simple') overrides.research = research;
    if (paladin !== 'on') overrides.paladin = paladin;
    if (churches) overrides.churches = true;
    if (flags) overrides.flags = true;
    if (!scavenging) overrides.scavenging = false;
    if (morale !== PRESETS[preset].morale) overrides.morale = morale;
    if (night) overrides.nightBonus = true;
    if (start === 'center' || barbs !== PRESETS[preset].map.barbarianCount) {
      overrides.map = { ...(start === 'center' ? { playerStart: 'center' } : {}), ...(barbs !== PRESETS[preset].map.barbarianCount ? { barbarianCount: barbs } : {}) };
    }
    const b = PRESETS[preset].barbarians;
    if (barbCap !== b.capMode || barbMax !== b.growthCap || barbSpread !== b.capSpread || barbRate !== b.growthRate) {
      overrides.barbarians = { capMode: barbCap, growthCap: Math.max(100, barbMax), capSpread: Math.max(0, barbSpread), growthRate: barbRate };
    }
    if (winShare !== 0.75 || !winBarbs) overrides.winCondition = { villageShare: winShare, countBarbarians: winBarbs };
    const cmd: Command = { type: 'newWorld', preset, name, overrides };
    if (seed.trim() !== '') cmd.seed = Number(seed) >>> 0;
    if (!confirmAllTabs('Een nieuwe wereld')) return;
    autoPause.value = null;
    screen.value = 'overview';
    send(cmd);
  };

  return (
    <section class="panel">
      <h2>{tr('Nieuwe wereld')}</h2>
      <label>
        {tr('Naam')}
        <input type="text" maxLength={40} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label>
        {tr('Preset')}
        <select value={preset} onChange={(e) => changePreset(e.currentTarget.value as Preset)}>
          <option value="classic">Classic</option>
          <option value="speed">Speed</option>
          <option value="hardcore">Hardcore</option>
        </select>
      </label>
      <label title={tr('Willekeurig: ergens tussen de bots, niet helemaal aan de rand. De sterkste bots worden altijd over de kaart verspreid en nooit direct naast je gezet.')}>
        {tr('Startpositie')}
        <select value={start} onChange={(e) => setStart(e.currentTarget.value as typeof start)}>
          <option value="random">{tr('Willekeurig')}</option>
          <option value="center">{tr('Midden')} (500|500)</option>
        </select>
      </label>
      <label title={tr('Hoe oplettend en hebberig de bots spelen. Ze houden zich altijd aan dezelfde regels als jij.')}>
        {tr('Bots')}
        <select value={difficulty} onChange={(e) => setDifficulty(e.currentTarget.value as BotDifficulty)}>
          <option value="easy">{tr('Makkelijk')}</option>
          <option value="normal">{tr('Normaal')}</option>
          <option value="hard">{tr('Moeilijk')}</option>
        </select>
      </label>
      <div class="knobs">
        <label title={tr('Leeg = {n} (de preset). Meer bots = een levendigere wereld, maar zwaarder om te rekenen.', { n: PRESETS[preset].bots.count })}>
          {tr('Aantal bots')}
          <input type="number" min={0} max={2000} step={50} placeholder={String(PRESETS[preset].bots.count)} value={botCount ?? ''} onInput={(e) => { const v = e.currentTarget.value; setBotCount(v === '' ? null : Math.max(0, Math.min(2000, Math.floor(Number(v) || 0)))); }} />
        </label>
        <label title={tr('Leeg = automatisch: 10 per bot, minstens 3000.')}>
          {tr('Barbarendorpen')}
          <input type="number" min={0} max={20000} step={500} placeholder={`${Math.max(3000, bots * 10)} ${tr('(auto)')}`} value={barbCount ?? ''} onInput={(e) => { const v = e.currentTarget.value; setBarbCount(v === '' ? null : Math.max(0, Math.min(20000, Math.floor(Number(v) || 0)))); }} />
        </label>
        {KNOBS.map(({ key, label, hint }) => (
          <label key={key} title={tr(hint)}>
            {tr(label)}
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
      <h3>{tr('Extra')}</h3>
      <label title={tr('Simpel: een eenheid is ontwikkeld of niet. Met levels maak je eenheden in de smederij sterker.')}>
        {tr('Smederij')}
        <select value={research} onChange={(e) => setResearch(e.currentTarget.value as 'simple' | 'levels3' | 'levels10')}>
          <option value="simple">{tr('Simpel (ontwikkeld ja/nee)')}</option>
          <option value="levels3">{tr('3 levels (tot ×1,4)')}</option>
          <option value="levels10">{tr('10 levels (tot ×1,5)')}</option>
        </select>
      </label>
      <label title={tr('Met items vindt je paladijn wapens die een eenheidstype sterker maken.')}>
        {tr('Paladijn')}
        <select value={paladin} onChange={(e) => setPaladin(e.currentTarget.value as 'off' | 'on' | 'items')}>
          <option value="off">{tr('Uit')}</option>
          <option value="on">{tr('Aan')}</option>
          <option value="items">{tr('Aan, met items')}</option>
        </select>
      </label>
      <label class="row" title={tr('Troepen uit een dorp zonder kerk in de buurt vechten op halve kracht. Je begint met een eerste kerk.')}>
        <input type="checkbox" checked={churches} onChange={(e) => setChurches(e.currentTarget.checked)} /> {tr('Kerken')}
      </label>
      <label class="row" title={tr('Eén vlag per dorp: productie, rekruteren, aanval, verdediging, geluk, bevolking, munten of buit. Je verdient ze met veroveringen en verslagen vijanden.')}>
        <input type="checkbox" checked={flags} onChange={(e) => setFlags(e.currentTarget.checked)} /> {tr('Vlaggen')}
      </label>
      <label class="row" title={tr('Troepen gaan op rooftocht voor grondstoffen. Bots doen ook mee.')}>
        <input type="checkbox" checked={scavenging} onChange={(e) => setScavenging(e.currentTarget.checked)} /> {tr('Rooftochten')}
      </label>
      <label title={tr('Moraal beschermt kleine spelers: een veel grotere aanvaller vecht zwakker. Met tijd stijgt de ondergrens van 30% naar 50% in de eerste 30 dagen van de verdediger.')}>
        {tr('Moraal')}
        <select value={morale} onChange={(e) => setMorale(e.currentTarget.value as 'off' | 'points' | 'pointsTime')}>
          <option value="off">{tr('Uit')}</option>
          <option value="points">{tr('Op punten')}</option>
          <option value="pointsTime">{tr('Op punten en tijd')}</option>
        </select>
      </label>
      <label class="row" title={tr('Tussen 0:00 en 8:00 (spelklok) verdedigen spelersdorpen dubbel zo sterk.')}>
        <input type="checkbox" checked={night} onChange={(e) => setNight(e.currentTarget.checked)} /> {tr('Nachtbonus')} (0:00–8:00)
      </label>
      <h3>{tr('Barbaren')}</h3>
      <label title={tr('Hoe ver barbarendorpen doorgroeien. Ze beginnen rond de grootte van een vers spelersdorp (75% tot 125%).')}>
        {tr('Groei')}
        <select value={barbCap} onChange={(e) => setBarbCap(e.currentTarget.value as typeof barbCap)}>
          <option value="none">{tr('Groeien niet')}</option>
          <option value="fixed">{tr('Tot een vast maximum')}</option>
          <option value="varied">{tr('Tot een maximum, verschilt per dorp')}</option>
          <option value="full">{tr('Volledig uit')}</option>
        </select>
      </label>
      {(barbCap === 'fixed' || barbCap === 'varied') && (
        <label>
          {tr('Maximum (punten)')}
          <input type="number" min={100} step={100} value={barbMax} onInput={(e) => setBarbMax(Number(e.currentTarget.value) || 3000)} />
        </label>
      )}
      {barbCap === 'varied' && (
        <label title={tr('Elk dorp krijgt een eigen maximum, tot zoveel punten erboven of eronder.')}>
          {tr('Spreiding ± (punten)')}
          <input type="number" min={0} step={100} value={barbSpread} onInput={(e) => setBarbSpread(Math.max(0, Number(e.currentTarget.value) || 0))} />
        </label>
      )}
      {barbCap !== 'none' && (
        <label title={tr("Standaard groeien ze 100 punten per speldag × de wortel van de wereld- en bouwsnelheid: op speed 20 zo'n 450 per dag.")}>
          {tr('Groeisnelheid')}
          <select value={String(barbRate)} onChange={(e) => setBarbRate(Number(e.currentTarget.value))}>
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((r) => <option key={r} value={String(r)}>×{r}</option>)}
          </select>
        </label>
      )}
      <p class="hint">
        {barbCap === 'none' ? tr('Barbarendorpen blijven zo groot als ze beginnen.')
          : barbCap === 'full' ? tr('Barbarendorpen groeien tot alles uitgebouwd is.')
          : barbCap === 'varied' ? tr('Elk barbarendorp groeit tot ergens tussen {min} en {max} punten.', { min: num(barbMax - barbSpread), max: num(barbMax + barbSpread) })
          : tr('Barbarendorpen groeien tot {n} punten.', { n: num(barbMax) })}
      </p>
      <h3>{tr('Eindspel')}</h3>
      <label title={tr('Een stam die dit deel van de wereld 3 speldagen vasthoudt, wint.')}>
        {tr('Winnen bij {pct}%', { pct: Math.round(winShare * 100) })}
        <input type="range" min={0.5} max={1} step={0.05} value={winShare} onInput={(e) => setWinShare(Number(e.currentTarget.value))} />
      </label>
      <label class="row" title={tr('Tellen barbarendorpen mee in het totaal? Meetellen is strenger.')}>
        <input type="checkbox" checked={winBarbs} onChange={(e) => setWinBarbs(e.currentTarget.checked)} /> {tr('Barbarendorpen tellen mee')}
      </label>
      <h3>{tr('Fun')}</h3>
      <label title={tr('Bevolkingslimiet van de boerderij. Gebouwen gebruiken evenveel als altijd, dus de ruimte voor troepen groeit nog iets harder. Je merkt het vooral laat in het spel, als je economie de legers kan betalen.')}>
        {tr('Bevolking')} ×{farm.toLocaleString(lang.value === 'nl' ? 'nl-NL' : 'en-US', { minimumFractionDigits: 2 })}
        <input type="range" min={0.5} max={3} step={0.25} value={farm} onInput={(e) => setFarm(Number(e.currentTarget.value))} />
      </label>
      <p class="hint">
        {farm === 1
          ? tr('Gewone boerderij (24.000 inwoners op level 30).')
          : farm > 1
            ? tr('Boerderij level 30: {n} inwoners. Grotere legers aan beide kanten; edelen en schoonvegen worden zwaarder. Alleen bij het aanmaken in te stellen.', { n: num(Math.round(24000 * farm)) })
            : tr('Boerderij level 30: {n} inwoners. Grotere legers aan beide kanten; edelen en schoonvegen worden makkelijker. Alleen bij het aanmaken in te stellen.', { n: num(Math.round(24000 * farm)) })}
      </p>
      <label title={tr('Hoeveel munten een edel kost.')}>
        {tr('Edelprijs')}
        <select value={curve} onChange={(e) => setCurve(e.currentTarget.value as 'tiered' | 'classic')}>
          <option value="tiered">{tr('Getrapt: max 25 per edel (tot plek 200), dan 50, 75, ...')}</option>
          <option value="classic">{tr('TW-klassiek: edel n kost n munten')}</option>
        </select>
      </label>
      <p class="hint">
        {tr('Wereldsnelheid versnelt alles, zoals een speedwereld in TW. De andere knoppen komen daar bovenop. Ga met je muis over een veld voor uitleg.')}
      </p>
      <label>
        {tr('Seed')}
        <input
          type="number"
          min={0}
          placeholder={tr('leeg = willekeurig')}
          value={seed}
          onInput={(e) => setSeed(e.currentTarget.value)}
        />
      </label>
      <button class="primary" onClick={create}>{tr('Nieuwe wereld')}</button>
    </section>
  );
}
