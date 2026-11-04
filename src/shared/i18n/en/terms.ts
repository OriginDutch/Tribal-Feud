/**
 * The game's own words, as English Tribal Wars players know them. Everything else uses these:
 * keep a word the same everywhere (one source for buildings, units, resources, ranks).
 */
export const terms: Record<string, string> = {
  // buildings
  Hoofdgebouw: 'Headquarters', Kazerne: 'Barracks', Stal: 'Stable', Werkplaats: 'Workshop', Adelshoeve: 'Academy',
  Smederij: 'Smithy', Verzamelplaats: 'Rally point', Standbeeld: 'Statue', Marktplaats: 'Market', Houthakker: 'Timber camp',
  Leemgroeve: 'Clay pit', IJzermijn: 'Iron mine', Boerderij: 'Farm', Opslagplaats: 'Warehouse', Schuilplaats: 'Hiding place',
  Muur: 'Wall', Kerk: 'Church', 'Eerste kerk': 'First church',
  // units
  Speerdrager: 'Spear fighter', Zwaardvechter: 'Swordsman', Bijlstrijder: 'Axeman', Boogschutter: 'Archer', Verkenner: 'Scout',
  'Lichte cavalerie': 'Light cavalry', 'Bereden boogschutter': 'Mounted archer', 'Zware cavalerie': 'Heavy cavalry',
  Ram: 'Ram', Katapult: 'Catapult', Paladijn: 'Paladin', Edelman: 'Nobleman',
  // unit short names (tables)
  Speer: 'Spear', Zwaard: 'Sword', Bijl: 'Axe', Boog: 'Archer', 'Verk.': 'Scout', LC: 'LC', BB: 'MA', ZC: 'HC', Kata: 'Cat', Pala: 'Pala', Edel: 'Noble',
  // resources
  Hout: 'Wood', Leem: 'Clay', IJzer: 'Iron', hout: 'wood', leem: 'clay', ijzer: 'iron', Grondstoffen: 'Resources', grondstoffen: 'resources',
  Opslag: 'Storage', Bevolking: 'Population', Punten: 'Points', punten: 'points', Dorp: 'Village', Dorpen: 'Villages', dorp: 'village', dorpen: 'villages',
  Barbaren: 'Barbarians', barbaren: 'barbarians', Barbarendorp: 'Barbarian village', Stam: 'Tribe', Stammen: 'Tribes', stam: 'tribe', stammen: 'tribes',
  Munten: 'Coins', munten: 'coins', munt: 'coin', Pakketten: 'Packets', pakketten: 'packets', Toestemming: 'Loyalty', Moraal: 'Morale', Geluk: 'Luck',
  // ranks
  Leider: 'Leader', Rechterhand: 'Right hand', Kapitein: 'Captain', Veteraan: 'Veteran', Krijger: 'Warrior', Rekruut: 'Recruit',
  leider: 'leader', rechterhand: 'right hand', kapitein: 'captain', veteraan: 'veteran', krijger: 'warrior', rekruut: 'recruit',
  // barbarian types
  Militair: 'Military', Verdedigend: 'Defensive', Gebalanceerd: 'Balanced',
  // flags
  Grondstofproductie: 'Resource production', Rekruteersnelheid: 'Recruitment speed', Aanvalskracht: 'Attack strength',
  Verdedigingskracht: 'Defense strength', 'Goedkopere munten': 'Cheaper coins', Buitcapaciteit: 'Haul capacity',
  // relations
  Diplomaat: 'Diplomat',
  NAP: 'NAP', Bondgenoot: 'Ally', Bondgenoten: 'Allies', Oorlog: 'War', Vrede: 'Peace',
};

/** Time and numbers shown everywhere. */
export const common: Record<string, string> = {
  'Dag {day} · {time}': 'Day {day} · {time}',
  Dag: 'Day', dag: 'day', dagen: 'days', uur: 'h', 'speldag': 'game day', 'speldagen': 'game days',
};
