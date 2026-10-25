/** 0 = not built, 1 = level 1-9, 2 = 10-19, 3 = 20 and up. */
export function stageOf(level: number): 0 | 1 | 2 | 3;
/** The whole village as SVG markup, SCENE_W × SCENE_H units. */
export function villageSvg(levels: Record<string, number>, homes: number): string;
/** Label anchor (top centre) per building id, in scene units. */
export const LABELS: Record<string, [number, number]>;
export const SCENE_W: number;
export const SCENE_H: number;
