/**
 * Quest data. Copied into WorldConfig when a world is created.
 *
 * The "Opbouw" chain follows the official Tribal Wars construction questline (24 quests,
 * InnoGames support article 3020). Official rewards there are mostly none or items we
 * don't have (flags, a build booster); only the 10 scouts of quest 15 are kept.
 * The resource boost of the TW early game comes from a reward per finished building,
 * see `buildingReward`. The "Plunderen" chain is our own.
 */
import type { BuildingId, Res, UnitCounts } from './gameData';

export type QuestDemand =
  | { kind: 'building'; building: BuildingId; level: number }
  | { kind: 'plunders'; count: number }
  | { kind: 'loot'; amount: number }
  | { kind: 'rewardsClaimed'; count: number };

export interface Quest {
  id: string;
  title: string;
  text: string;
  demands: QuestDemand[];
  reward: { res?: Res; units?: UnitCounts };
}

export interface QuestChain {
  id: string;
  name: string;
  quests: Quest[];
}

const b = (building: BuildingId, level: number): QuestDemand => ({ kind: 'building', building, level });

export const CONSTRUCTION_CHAIN: QuestChain = {
  id: 'construction',
  name: 'Opbouw',
  quests: [
    { id: 'c1', title: 'Laten we beginnen', text: 'Hout heb je altijd nodig.', demands: [b('wood', 1)], reward: {} },
    { id: 'c2', title: 'Basisproductie', text: 'Zonder leem en ijzer kom je niet ver.', demands: [b('stone', 1), b('iron', 1)], reward: {} },
    { id: 'c3', title: 'Productie verbeteren', text: 'Meer productie, sneller groeien.', demands: [b('wood', 2), b('stone', 2)], reward: {} },
    { id: 'c4', title: 'Nieuw en verbeterd', text: 'Een hoger hoofdgebouw bouwt sneller.', demands: [b('main', 2)], reward: {} },
    { id: 'c5', title: 'De vruchten van je werk', text: 'Elk afgerond gebouw levert een beloning op. Haal er een op.', demands: [{ kind: 'rewardsClaimed', count: 1 }], reward: {} },
    { id: 'c6', title: 'Op snelheid komen', text: 'Blijf je productie uitbouwen.', demands: [b('wood', 3), b('stone', 3)], reward: {} },
    { id: 'c7', title: 'Militaire infrastructuur', text: 'Tijd voor je eerste troepen.', demands: [b('main', 3), b('barracks', 1)], reward: {} },
    { id: 'c8', title: 'Meer capaciteit', text: 'Ruimte voor grondstoffen en mensen.', demands: [b('storage', 2), b('farm', 2)], reward: {} },
    { id: 'c9', title: 'Doorpakken', text: 'Productie is alles in het begin.', demands: [b('wood', 4), b('stone', 4)], reward: {} },
    { id: 'c10', title: 'Productie opvoeren', text: 'Vergeet het ijzer niet.', demands: [b('wood', 5), b('stone', 5), b('iron', 3)], reward: {} },
    { id: 'c11', title: 'Kennis is macht', text: 'In de smederij ontwikkel je nieuwe eenheden.', demands: [b('main', 5), b('smith', 1)], reward: {} },
    { id: 'c12', title: 'De grenzen beveiligen', text: 'Een muur maakt elke verdediger sterker.', demands: [b('wall', 1)], reward: {} },
    { id: 'c13', title: 'Handel drijven', text: 'Een marktplaats hoort bij elk dorp.', demands: [b('market', 1)], reward: {} },
    { id: 'c14', title: 'Commandostructuur', text: 'Een sterk dorp heeft een sterke basis.', demands: [b('main', 7), b('barracks', 5), b('wall', 5)], reward: {} },
    { id: 'c15', title: 'Informatieoorlog', text: 'Weet wat je buren doen.', demands: [b('main', 10), b('smith', 5), b('stable', 1)], reward: { units: { spy: 10 } } },
    { id: 'c16', title: 'Een hoofdstad bouwen I', text: 'Je dorp groeit uit tot hoofdstad.', demands: [b('wood', 10), b('stone', 10), b('iron', 8)], reward: {} },
    { id: 'c17', title: 'Een hoofdstad bouwen II', text: 'Bescherm wat je opbouwt.', demands: [b('main', 12), b('wall', 10)], reward: {} },
    { id: 'c18', title: 'Een hoofdstad bouwen III', text: 'Meer, meer, meer.', demands: [b('wood', 16), b('stone', 16), b('iron', 15)], reward: {} },
    { id: 'c19', title: 'Een hoofdstad bouwen IV', text: 'Het hoofdgebouw als hart van je rijk.', demands: [b('main', 15)], reward: {} },
    { id: 'c20', title: 'De weg naar verovering I', text: 'Een veroveraar heeft een sterke economie.', demands: [b('wood', 20), b('stone', 20), b('iron', 20)], reward: {} },
    { id: 'c21', title: 'De weg naar verovering II', text: 'Bereid de adelshoeve voor.', demands: [b('smith', 10)], reward: {} },
    { id: 'c22', title: 'De weg naar verovering III', text: 'Bijna klaar voor edelmannen.', demands: [b('main', 20), b('smith', 15)], reward: {} },
    { id: 'c23', title: 'De weg naar verovering IV', text: 'Onneembaar.', demands: [b('wall', 20)], reward: {} },
    { id: 'c24', title: 'De weg naar verovering V', text: 'De adelshoeve opent de weg naar nieuwe dorpen.', demands: [b('snob', 1)], reward: {} },
  ],
};

export const FARMING_CHAIN: QuestChain = {
  id: 'farming',
  name: 'Plunderen',
  quests: [
    { id: 'f1', title: 'Eerste buit', text: 'Plunder een barbarendorp.', demands: [{ kind: 'plunders', count: 1 }], reward: { res: [500, 500, 500] } },
    { id: 'f2', title: 'Vaste klant', text: 'Plunder 10 keer.', demands: [{ kind: 'plunders', count: 10 }], reward: { res: [1000, 1000, 1000] } },
    { id: 'f3', title: 'Farmer', text: 'Plunder 25 keer.', demands: [{ kind: 'plunders', count: 25 }], reward: { res: [2000, 2000, 2000] } },
    { id: 'f4', title: 'Rijke oogst', text: 'Haal in totaal 10.000 grondstoffen buit binnen.', demands: [{ kind: 'loot', amount: 10000 }], reward: { res: [3000, 3000, 3000] } },
    { id: 'f5', title: 'Plaag van de streek', text: 'Plunder 100 keer.', demands: [{ kind: 'plunders', count: 100 }], reward: { res: [5000, 5000, 5000] } },
    { id: 'f6', title: 'Schatkist', text: 'Haal in totaal 100.000 grondstoffen buit binnen.', demands: [{ kind: 'loot', amount: 100000 }], reward: { res: [10000, 10000, 10000] } },
  ],
};

export interface QuestConfig {
  chains: QuestChain[];
  buildingReward: {
    /** Finished buildings up to this level give a reward. */
    maxLevel: number;
    /** Share of the building cost given back. */
    share: number;
  };
}

export function defaultQuests(): QuestConfig {
  return {
    chains: structuredClone([CONSTRUCTION_CHAIN, FARMING_CHAIN]),
    buildingReward: { maxLevel: 10, share: 0.5 },
  };
}
