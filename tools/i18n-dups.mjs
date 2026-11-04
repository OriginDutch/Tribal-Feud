import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const files = ['terms', 'ui0', 'ui1', 'ui2', 'ui3', 'ui4', 'ui5', 'simA', 'simB', 'simC', 'simD', 'simE', 'fixes'];
const seen = new Map();
for (const f of files) {
  const m = await vite.ssrLoadModule(`/src/shared/i18n/en/${f}.ts`);
  for (const d of Object.values(m)) for (const [k, v] of Object.entries(d)) {
    if (!seen.has(k)) seen.set(k, new Map());
    seen.get(k).set(v, [...(seen.get(k).get(v) ?? []), f]);
  }
}
await vite.close();
for (const [k, vs] of seen) if (vs.size > 1) console.log(JSON.stringify(k), '=>', [...vs].map(([v, fs]) => `${JSON.stringify(v)} (${fs.join(',')})`).join(' | '));
