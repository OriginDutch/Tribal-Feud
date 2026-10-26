/** 0 = not built, 1 = level 1-9, 2 = 10-19, 3 = 20 and up. */
export function stageOf(level: number): 0 | 1 | 2 | 3;
/** The whole village as SVG markup, SCENE_W × SCENE_H units. */
export function villageSvg(levels: Record<string, number>, homes: number): string;
/** Label anchor (top centre) per building id, in scene units. */
export const LABELS: Record<string, [number, number]>;
export const SCENE_W: number;
export const SCENE_H: number;
/** The clickable box of a building at its level: [x, y, width, height] in scene units, or null. */
export function hitbox(id: string, level: number): [number, number, number, number] | null;
