/**
 * Pixel-art icons for the resources and the farm, drawn from small pixel maps so they stay crisp
 * at any size (whole pixels, no smoothing).
 */
type Kind = 'wood' | 'stone' | 'iron' | 'pop';

const PALETTE: Record<Kind, Record<string, string>> = {
  // logs: bark, ring ends
  wood: { d: '#5a3519', r: '#e2b77e', c: '#a8703c' },
  // clay bricks
  stone: { d: '#7a3a24', m: '#b85f3f', l: '#e08a63', h: '#f2b495' },
  // iron ingots
  iron: { d: '#3b4650', m: '#6c7c89', l: '#a7b8c6', h: '#e4edf3' },
  // farmhouse
  pop: { d: '#5a2f20', r: '#b5523b', o: '#d97a52', w: '#e3cfa4', s: '#b89c6c', k: '#4a2e17' },
};

const PIXELS: Record<Kind, string[]> = {
  wood: [
    '............',
    '.....ddd....',
    '....drrrd...',
    '....drcrd...',
    '....drrrd...',
    '..dddddddd..',
    '.drrrddrrrd.',
    '.drcrddrcrd.',
    '.drrrddrrrd.',
    '..ddd..ddd..',
    '............',
    '............',
  ],
  stone: [
    '............',
    '............',
    '....dddddd..',
    '....dhllmd..',
    '....dlmmmd..',
    '..dddddddddd',
    '..dhllmdhllm',
    '..dlmmddlmmd',
    'ddddddddddd.',
    'dhllmdhllmd.',
    'dlmmmdlmmmd.',
    'ddddddddddd.',
  ],
  iron: [
    '............',
    '............',
    '............',
    '....dddddd..',
    '...dhhllld..',
    '..dlllmmmd..',
    '..dddddddddd',
    '.ddddddhhlld',
    'dhhllldlmmd.',
    'dlllmmmdddd.',
    'dddddddd....',
    '............',
  ],
  pop: [
    '.....dd.....',
    '....drrd....',
    '...drorrd...',
    '..drorrrrd..',
    '.drorrrrrrd.',
    'drrrrrrrrrrd',
    '.dwwwwwwwwd.',
    '.dwsswwsswd.',
    '.dwsswwsswd.',
    '.dwwwkkwwwd.',
    '.dwwwkkwwwd.',
    '.dddddddddd.',
  ],
};

export function ResIcon({ kind, size = 18 }: { kind: Kind; size?: number }) {
  const pal = PALETTE[kind];
  const rects: preact.JSX.Element[] = [];
  PIXELS[kind].forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = pal[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />);
    }),
  );
  return (
    <svg class="res-icon" width={size} height={size} viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}
