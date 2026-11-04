// Lists translation keys without English, and (with --left) text in screens that is not wrapped yet.
// Keys: tr('...'), T('...'), trx('...') with a plain literal. Usage: node tools/i18n-check.mjs [--left] [files...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const left = args.includes('--left');
const only = args.filter((a) => !a.startsWith('--'));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = (only.length ? only : walk('src')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.includes('/i18n/'));

// the English keys: load the dictionaries through vite
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
await vite.ssrLoadModule('/src/shared/i18n/en/index.ts');
const { englishKeys } = await vite.ssrLoadModule('/src/shared/i18n/index.ts');
await vite.close();
const have = new Set(englishKeys());

const KEY = /\b(?:tr|T|trx)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const DYN = /\b(?:tr|T|trx)\(\s*`/g;
const missing = new Map();
let dynamic = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(KEY)) {
    const k = m[2].replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
    if (!have.has(k)) missing.set(k, f);
  }
  for (const m of src.matchAll(DYN)) { dynamic++; console.log(`template literal key (use {placeholders}): ${f}:${src.slice(0, m.index).split('\n').length}`); }
}
for (const [k, f] of missing) console.log(`missing: ${JSON.stringify(k)}  (${f})`);
console.log(`${missing.size} missing, ${dynamic} template-literal keys, ${have.size} translated keys`);

if (left) {
  // JSX text and string literals that still look like Dutch words (rough)
  const DUTCH = /\b(de|het|een|en|van|je|jij|jouw|niet|geen|met|voor|naar|bij|op|dit|dat|wordt|zijn|nog|als|of|aan|uit|kan|dorp|dorpen|stam)\b/i;
  for (const f of files.filter((x) => x.endsWith('.tsx'))) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (/\b(?:tr|T|trx)\(/.test(l) || /^\s*(\/\/|\*|\/\*)/.test(l) || /^\s*import /.test(l)) return;
      const jsx = l.match(/>([^<>{}]*[A-Za-zÀ-ÿ]{2,}[^<>{}]*)</);
      const lit = l.match(/(['"`])([^'"`]{3,})\1/);
      if ((jsx && DUTCH.test(jsx[1])) || (lit && /\s/.test(lit[2]) && DUTCH.test(lit[2]) && !/class|className|style|aria-hidden/.test(l.slice(0, l.indexOf(lit[0]))))) console.log(`left: ${f}:${i + 1}: ${l.trim().slice(0, 110)}`);
    });
  }
}
