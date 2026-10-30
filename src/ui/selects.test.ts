import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every .tsx file under src/ui. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('dropdowns', () => {
  it('option values are strings: a number makes Preact reset the option on every update, which closes an open dropdown', () => {
    const bad: string[] = [];
    for (const f of files('src/ui')) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/<option\b[^>]*?value=\{([^{}]+)\}/g)) {
        const expr = m[1]!.trim();
        if (!expr.startsWith('String(') && !expr.startsWith('`')) bad.push(`${f}: value={${expr}}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
