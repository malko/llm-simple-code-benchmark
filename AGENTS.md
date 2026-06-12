# LLM Code Bench — Agent Guide

## Commands

```sh
npm run build:server    # tsc -p tsconfig.server.json → dist/server/
npm run build:client    # esbuild bundle IIFE → dist/client/main.js
npm run build           # both, in order: server then client
npm start               # node dist/server/index.js
npm run dev:server      # node --watch dist/server/index.js
```

- No lint, typecheck, or test commands exist. Add them if needed.
- Frontend pages are hash-routed SPA with zero framework (vanilla TS, `src/client/router.ts`).

## Settings

The UI has a `#/settings` page to configure `llamaServerUrl` and `llamaApiKey`.
These are persisted in `data/settings.json` and override `LLAMA_SERVER_URL` / `LLAMA_API_KEY` env vars.
Models, health, and runs all use the saved settings automatically.

## Local dev gotchas

- Default paths (`/app/*`) are for Docker. Run locally with:
  ```
  TESTS_DIR=./tests OUTPUT_DIR=./output DATA_DIR=./data npm start
  ```
- `LLAMA_SERVER_URL` defaults to `http://host.docker.internal:8080`. Set it to your running llama.cpp server.
- No node_modules are copied to dist — `run build` expects `npm ci` first.

## Architecture

- **Server**: Express on `:3000`, serves `/api/*` + static client from `dist/client/`. Entry: `src/server/index.ts:1`.
- **Client**: esbuild bundles `src/client/main.ts` + Chart.js into a single IIFE. Monaco editor loaded from CDN at runtime (`test-editor.ts`).
- **Runner** (`src/server/services/runner.ts`): async orchestrator. Before each model, it unloads all loaded models and loads the target via `POST /models/load` / `POST /models/unload`, polling until status `"loaded"`. Then runs all tests for that model. Model switch failures skip the model's tests.
- **File storage** (`src/server/services/storage.ts`): flat JSON in `data/runs.json`, test files in `tests/<name>/`, results in `output/<test>/<run>_<model>/`.

## Conventions

- `"type": "module"` — all server-side imports use `.js` extensions even in `.ts` source.
- Routes in `src/server/routes/`, services in `src/server/services/`.
- Client pages in `src/client/pages/`, each exports `render(params) => Promise<HTMLElement>`.
- Test scripts (`tests/<name>/test.ts|sh`) receive output dir as `argv[2]`, print JSON to stdout.

## Docker

- Multi-stage build: `builder` does `npm ci && npm run build`, `runner` copies only `dist/` + `node_modules/`.
- Volumes: `./tests:/app/tests`, `./output:/app/output`, `./data:/app/data`.
- Use `npm ci` (not `npm install`) in Docker/CI since `package-lock.json` is committed.
