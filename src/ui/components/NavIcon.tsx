/** Line icons for the menu (original, 24×24, drawn with the current text colour). */
const PATHS: Record<string, string> = {
  overview: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  villages: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  manager: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/><path d="M17 4l2 2-2 2"/>',
  quests: '<path d="M6 3h12v18l-6-4-6 4z"/><path d="M9 8h6M9 12h4"/>',
  main: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M12 4V2"/>',
  barracks: '<path d="M6 21 18 3"/><path d="m16 3h3v3"/><path d="M4 14l6 6"/>',
  stable: '<path d="M6 20c0-6 3-10 6-12l3-3 2 2-1 3c2 2 3 5 3 10"/><circle cx="14.5" cy="8.5" r=".8" fill="currentColor"/>',
  garage: '<circle cx="7" cy="18" r="3"/><circle cx="17" cy="18" r="3"/><path d="M4 13h16M8 13l4-7 4 7"/>',
  statue: '<circle cx="12" cy="5" r="2.5"/><path d="M9 21v-9l3-3 3 3v9"/><path d="M6 21h12"/>',
  snob: '<path d="M5 18 4 8l4.5 3.5L12 5l3.5 6.5L20 8l-1 10z"/><path d="M5 21h14"/>',
  smith: '<path d="M3 15h10l3-4h5"/><path d="M6 15v4h8v-4"/><path d="M16 11V7"/>',
  place: '<path d="M6 21V4"/><path d="M6 4h11l-3 4 3 4H6"/>',
  market: '<path d="M3 9h18l-2-5H5z"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  farm: '<path d="M4 20c4-1 6-5 6-10"/><path d="M10 10c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M14 20c4-1 6-5 6-10"/><path d="M20 10c-3 0-5-2-5-5 3 0 5 2 5 5z"/>',
  reports: '<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  tribes: '<path d="M5 21V4"/><path d="M5 4h11l-2.5 3.5L16 11H5"/><circle cx="17" cy="17" r="2.2"/><path d="M13.5 21a3.5 3.5 0 0 1 7 0"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  ranking: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  debug: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="17" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
};

export function NavIcon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.overview ?? '' }}
    />
  );
}
