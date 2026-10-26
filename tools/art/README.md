# Village art pipeline

The village overview is a 3D scene (three.js, built in code) baked to 2D sprites, so the game itself stays plain 2D.

- `lib.js` – materials, textures and parts (houses, roofs, people, props)
- `buildings.js` – every building in all its stages
- `layout.js` – where everything stands in the village, and the stage level thresholds
- `bake.js` – renders one piece in place with a cropped orthographic camera (alpha + its own shadow)
- `bake.cjs` – drives headless Chromium over all pieces, writes PNGs to `/tmp/bake/<mode>`
- `pack.py` – packs them into WebP atlases + `manifest.json` in `public/village/<mode>`

Run (from this folder, after `npm install` here): `npm run serve` in one terminal, `npm run bake` in another.
The game never runs any of this; it only reads `public/village`.
