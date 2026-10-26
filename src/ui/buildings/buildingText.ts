import type { BuildingId } from '../../shared/gameData';

/** What each building is for, in a sentence or two. */
export const BUILDING_TEXT: Record<BuildingId, string> = {
  main: 'Het hart van je dorp. Hier geef je bouwopdrachten; hoe hoger het level, hoe sneller alles gebouwd wordt.',
  barracks: 'Hier train je infanterie: speer, zwaard, bijl en boogschutters. Een hoger level traint sneller.',
  stable: 'Hier train je cavalerie: verkenners, lichte en zware cavalerie en bereden boogschutters. Een hoger level traint sneller.',
  garage: 'Hier bouw je rammen en katapulten. Een hoger level bouwt sneller.',
  snob: 'Hier sla je munten en train je edelen, waarmee je andere dorpen overneemt.',
  smith: 'Hier ontwikkel je nieuwe eenheden. Sommige eenheden hebben een hoger level nodig.',
  place: 'Vanaf hier stuur je troepen op pad: aanvallen, ondersteuning en edeltreinen.',
  statue: 'Hier train je je paladijn, die je troepen aanvoert.',
  market: 'Hier handel je grondstoffen met andere spelers en verdeel je ze over je eigen dorpen. Elk level geeft meer handelaren.',
  wood: 'Je houthakkers kappen hout in de bossen rond je dorp. Hoe hoger het level, hoe meer hout per uur.',
  stone: 'In de leemgroeve wordt leem gestoken. Hoe hoger het level, hoe meer leem per uur.',
  iron: 'In de ijzermijn wordt ijzererts gedolven. Hoe hoger het level, hoe meer ijzer per uur.',
  farm: 'De boerderij voedt je arbeiders en troepen. Elk gebouwlevel en elke eenheid kost inwoners; is de boerderij vol, dan kun je niets meer bouwen of trainen.',
  storage: 'In de opslagplaats bewaar je je grondstoffen. Wat er niet meer in past, wordt niet meer geproduceerd.',
  hide: 'In de schuilplaats verstoppen je dorpelingen een deel van de grondstoffen. Plunderaars kunnen daar niet bij.',
  wall: 'De muur beschermt je dorp. Hij geeft je verdedigers een bonus en een basisverdediging, ook als er niemand thuis is. Rammen breken hem af.',
};
