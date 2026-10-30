// Renders public/favicon.svg to the PNG icons (run once after changing the SVG): node tools/favicon-png.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const svg = readFileSync('public/favicon.svg', 'utf8');
const b = await chromium.launch();
for (const [size, file] of [[32, 'public/favicon-32.png'], [180, 'public/apple-touch-icon.png']]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: file, omitBackground: true });
}
await b.close();
