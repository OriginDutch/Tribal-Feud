/**
 * Unit icons: original art for Tribal Feud, SVG markup in a 32×32 box.
 * Plain JavaScript (drawing helpers); types in unitArt.d.ts.
 */
/* eslint-disable */
const C = {
  steel: '#c9ced4', steelDark: '#8e959d', steelLight: '#eef1f4', wood: '#8a5e36', woodDark: '#5a3d26', leather: '#9a6b3e',
  gold: '#e0b04a', goldDark: '#b0842c', red: '#b5523b', redDark: '#8c3a28', blue: '#4f7f9e', cloth: '#d9cfa0',
  horse: '#7a5234', horseDark: '#553822', mane: '#3b2a1c', green: '#557a35', purple: '#7b5aa6', ink: '#1c1813',
};
const out = (d, w = 1.2) => `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
// round shield
const shield = (cx, cy, r, col, boss = C.steel) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" ${out()}/><circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="${C.ink}" stroke-width="0.6" opacity="0.4"/><circle cx="${cx}" cy="${cy}" r="${r * 0.28}" fill="${boss}" ${out(0, 0.8)}/>`;
const horseHead = (x, y, s, col = C.horse) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M2 14 L4 6 Q6 1 11 1 L14 2 Q18 4 19 8 L20 12 Q20 14 18 14 L15 13 L13 9 L11 10 L10 18 L2 18 Z" fill="${col}" ${out()}/><path d="M5 5 Q3 9 3 14" stroke="${C.mane}" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="14" cy="6" r="0.9" fill="${C.ink}"/><path d="M18 11 L20 12" stroke="${C.ink}" stroke-width="0.8"/></g>`;

export const ICONS = {
  spear: `<line x1="7" y1="27" x2="24" y2="6" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/><path d="M24 6 L27 2 L26.5 8 Z" fill="${C.steel}" ${out(0, 0.9)}/>` + shield(11, 19, 7.5, C.red),
  sword: `<path d="M23 4 L26 3 L25 6 L12 19 L10 17 Z" fill="${C.steelLight}" ${out(0, 1)}/><path d="M8.5 15.5 L14.5 21.5" stroke="${C.goldDark}" stroke-width="2.6" stroke-linecap="round"/><path d="M11 19 L6 24" stroke="${C.leather}" stroke-width="2.6" stroke-linecap="round"/><circle cx="5.2" cy="24.8" r="1.6" fill="${C.gold}" ${out(0, 0.7)}/>` + `<path d="M17 28 l0 -7 q5 -2 10 0 l0 7 q-5 2 -10 0z" fill="${C.blue}" ${out()}/>`,
  axe: `<line x1="8" y1="28" x2="22" y2="5" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/><path d="M19 4 Q27 3 29 11 Q24 9 20.5 11 Z" fill="${C.steel}" ${out()}/><path d="M18 6 Q14 4 12 7 L16 9z" fill="${C.steelDark}" ${out(0, 0.8)}/>`,
  archer: `<path d="M9 3 Q25 16 9 29" fill="none" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/><line x1="9.5" y1="4" x2="9.5" y2="28" stroke="${C.cloth}" stroke-width="0.9"/><line x1="6" y1="16" x2="27" y2="16" stroke="${C.woodDark}" stroke-width="1.4"/><path d="M27 16 L23 13.6 L23 18.4Z" fill="${C.steel}" ${out(0, 0.8)}/><path d="M7 16 l-2 -2 m2 2 l-2 2" stroke="${C.red}" stroke-width="1.4"/>`,
  spy: `<path d="M5 17 Q16 5 27 17 Q16 27 5 17Z" fill="${C.cloth}" ${out()}/><circle cx="16" cy="17" r="5.4" fill="${C.green}" ${out(0, 1)}/><circle cx="16" cy="17" r="2.4" fill="${C.ink}"/><circle cx="14.8" cy="15.8" r="0.9" fill="#fff"/><path d="M8 8 l2 3 M16 5 v3.5 M24 8 l-2 3" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round"/>`,
  light: horseHead(4, 6, 1.1) + `<line x1="20" y1="3" x2="27" y2="27" stroke="${C.wood}" stroke-width="1.8"/><path d="M19 1 L21.5 5 L18.5 5Z" fill="${C.steel}" ${out(0, 0.7)}/><path d="M20.5 6 l5 2 l-5 2z" fill="${C.red}"/>`,
  marcher: horseHead(2, 7, 1.05, '#8d6a48') + `<path d="M22 3 Q31 15 22 28" fill="none" stroke="${C.wood}" stroke-width="2.2" stroke-linecap="round"/><line x1="22.5" y1="4" x2="22.5" y2="27" stroke="${C.cloth}" stroke-width="0.8"/>`,
  heavy: horseHead(3, 8, 1.05, '#6b5d52') + `<path d="M7 9 L11 7 L18 7 L20 10 L18 14 L9 14Z" fill="${C.steel}" ${out(0, 0.9)} opacity="0.95"/>` + shield(24, 20, 6.5, C.blue, C.gold) + `<path d="M20 2 l4 4" stroke="${C.steelLight}" stroke-width="2"/>`,
  ram: `<rect x="3" y="12" width="24" height="7" rx="3" fill="${C.wood}" ${out()}/><path d="M27 12 h3 v7 h-3" fill="${C.steel}" ${out(0, 1)}/><path d="M6 19 l-2 7 M24 19 l2 7 M6 12 L15 4 L24 12" fill="none" stroke="${C.woodDark}" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="27" r="2.6" fill="${C.woodDark}" ${out(0, 0.8)}/><circle cx="22" cy="27" r="2.6" fill="${C.woodDark}" ${out(0, 0.8)}/><line x1="15" y1="4" x2="15" y2="12" stroke="${C.mane}" stroke-width="1"/>`,
  catapult: `<rect x="4" y="21" width="22" height="4" fill="${C.wood}" ${out()}/><circle cx="8" cy="27" r="2.6" fill="${C.woodDark}" ${out(0, 0.8)}/><circle cx="22" cy="27" r="2.6" fill="${C.woodDark}" ${out(0, 0.8)}/><path d="M9 21 L15 13 L21 21" fill="none" stroke="${C.woodDark}" stroke-width="2"/><line x1="12" y1="20" x2="25" y2="5" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/><path d="M23 3 q5 -1 5 4 q-3 1 -5 -1z" fill="${C.leather}" ${out(0, 0.8)}/><circle cx="26" cy="4.5" r="2.6" fill="#8f8678" ${out(0, 0.8)}/>`,
  knight: `<path d="M9 9 Q9 3 16 3 Q23 3 23 9 L23 17 Q16 21 9 17Z" fill="${C.steel}" ${out()}/><path d="M11 10 h10" stroke="${C.ink}" stroke-width="1.8"/><path d="M16 11 v6" stroke="${C.steelDark}" stroke-width="1"/><path d="M16 3 Q19 -1 23 1 Q20 3 18 4" fill="${C.purple}" ${out(0, 0.8)}/><path d="M8 17 L16 30 L24 17" fill="${C.gold}" ${out()}/><path d="M16 21 l1.5 3 l-1.5 3 l-1.5 -3z" fill="${C.red}"/>`,
  snob: `<path d="M6 26 L4 12 L10 17 L16 7 L22 17 L28 12 L26 26Z" fill="${C.gold}" ${out()}/><rect x="6" y="24" width="20" height="4" rx="1" fill="${C.goldDark}" ${out(0, 1)}/><circle cx="16" cy="7" r="2" fill="${C.red}" ${out(0, 0.7)}/><circle cx="4" cy="12" r="1.6" fill="${C.blue}" ${out(0, 0.6)}/><circle cx="28" cy="12" r="1.6" fill="${C.blue}" ${out(0, 0.6)}/><circle cx="16" cy="20" r="1.8" fill="${C.red}"/>`,
};
