# Tribal Feud

Singleplayer strategy game with Tribal Wars mechanics, played against 200+ bots that run their own guilds, wars and betrayals.

Status: **phase 3 (map and barbarians)**. One village with the full Tribal Wars economy, plus a map with ~200
(still inactive) bot villages and ~3000 growing barbarian villages, attacks with the TW battle formula, loot,
reports and a farm assistant. Bots start thinking in phase 5.

## Running it

Requires Node.js and git.

**Windows:** double-click `start.bat`. It pulls the latest version, runs `npm ci` only when
dependencies changed, starts the dev server and opens the game in your browser.

Manually:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the tests once (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck + production build to `dist/` |

## Structure

```
src/
  shared/    types and helpers used by both sides
    config.ts     WorldConfig, presets, validation
    gameData.ts   building and unit tables (TW values), copied into WorldConfig
    protocol.ts   messages between UI and worker
    time.ts       time units, speeds, formatting
  sim/       simulation (runs in the Web Worker)
    state.ts      WorldState: everything that gets saved
    simulation.ts pure core: advance the clock, process events
    formulas.ts   TW formulas: costs, build/recruit times, production, storage, farm, points
    village.ts    village rules: build queue, requirements, smithy, recruitment
    view.ts       read-only village view sent to the UI
    map.ts        world generation: bots and barbarians around 500|500
    barbarians.ts lazy, deterministic barbarian growth
    combat.ts     battle formula (pure): wall, rams, catapults, spies, luck, morale
    movement.ts   attacks, returns, loot, reports
    mapView.ts    map and movement data for the UI
    eventQueue.ts min-heap on game time
    rng.ts        seeded RNG (sfc32)
    save.ts       save format + versioning/migrations
    worker.ts     worker loop, commands, autosave
  storage/
    saveStore.ts  IndexedDB save slots
  ui/        main thread: Preact + signals (later also the canvas map)
    store.ts      worker connection; snapshot/saves/notices as signals
    App.tsx       layout
    screens/      one component per game screen (overview, HQ, barracks, ...)
    components/   shared bits (top bar, nav, cost)
    panels/       debug panels (new world, saves, events, log)
```

## Core rules

- **The worker is the single source of truth.** The UI only sends commands and draws snapshots.
- **No `Math.random()` in the simulation.** Everything random comes from the world RNG, so a seed + commands always replay the same game.
- **No hardcoded numbers.** Settings and balance values belong in `WorldConfig`.
- **Changed the shape of `WorldState`?** Bump `SAVE_VERSION` in `src/sim/save.ts` and add a migration.
- **Time only runs while you play.** Paused, auto-paused, or tab hidden means the clock stands still. Loaded saves always start paused.
