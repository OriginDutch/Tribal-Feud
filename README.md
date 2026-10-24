# Tribal Feud

Singleplayer strategy game with Tribal Wars mechanics, played against 200+ bots that run their own guilds, wars and betrayals.

Status: **phase 1 (foundation)**. A ticking game clock, an event queue, seeded RNG, `WorldConfig` and saves. No villages yet.

## Running it

Requires Node.js.

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
    protocol.ts   messages between UI and worker
    time.ts       time units, speeds, formatting
  sim/       simulation (runs in the Web Worker)
    state.ts      WorldState: everything that gets saved
    simulation.ts pure core: advance the clock, process events
    eventQueue.ts min-heap on game time
    rng.ts        seeded RNG (sfc32)
    save.ts       save format + versioning/migrations
    worker.ts     worker loop, commands, autosave
  storage/
    saveStore.ts  IndexedDB save slots
  ui/        main thread: Preact + signals (later also the canvas map)
    store.ts      worker connection; snapshot/saves/notices as signals
    App.tsx       layout
    panels/       one component per panel
```

## Core rules

- **The worker is the single source of truth.** The UI only sends commands and draws snapshots.
- **No `Math.random()` in the simulation.** Everything random comes from the world RNG, so a seed + commands always replay the same game.
- **No hardcoded numbers.** Settings and balance values belong in `WorldConfig`.
- **Changed the shape of `WorldState`?** Bump `SAVE_VERSION` in `src/sim/save.ts` and add a migration.
- **Time only runs while you play.** Paused, auto-paused, or tab hidden means the clock stands still. Loaded saves always start paused.
