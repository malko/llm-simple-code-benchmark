# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Configuration (env vars)

| Variable | Default (code) | Description |
|---|---|---|
| `LLAMA_SERVER_URL` | `http://127.0.0.1:8080` | llama.cpp server URL. Overridden at runtime by `data/settings.json` (`#/settings` page) if set. `docker-compose.yml` additionally defaults the container's env var to `http://host.docker.internal:8080`. |
| `LLAMA_API_KEY` | _(none)_ | Bearer token for the llama.cpp server; also overridable via settings. |
| `PORT` | `3000` | Web server port. |
| `TESTS_DIR` | `/app/tests` | Test definitions directory. |
| `OUTPUT_DIR` | `/app/output` | Run results / model-generated files. |
| `DATA_DIR` | `/app/data` | SQLite DB (`llm-code-bench.db`) + `settings.json`. |

## Run lifecycle (cross-file data flow)

A run ties together `routes/runs.ts`, `services/runner.ts`, `services/llamaclient.ts`, `services/tool-executor.ts`, and `services/storage.ts`:

1. `POST /api/runs` validates the `RunConfig` (`modelIds`, `testNames`, `parameters`), merges in parameter defaults, and calls `runner.start()`. This persists an initial `Run` (status `running`) via `storage.saveRun` and kicks off `runner.execute()` as a detached background task.
2. For each model, `runner` unloads any other currently-loaded model and loads the target via `llamaclient`, polling `GET /models` until that model's status is `"loaded"` (120s timeout). A switch failure marks all of that model's tests as errors and moves on.
3. For each test, `chatLoop()` drives a tool-use conversation against `/v1/chat/completions`. Assistant tool calls are dispatched to `toolExecutor`, sandboxed to that run's `output/<test>/<run>_<model>/files/` directory (path traversal blocked via `resolveSafe`). Tool results are appended as `role: 'tool'` messages; the loop continues until `finish_reason` is `stop`/`length` or `parameters.maxTurns` is reached.
4. After the chat loop, `turns.json` (full message log) and `results.json` (stats) are written to the result dir. Then `tests/<name>/test.ts` (or `.sh`) runs via `npx tsx`/`sh` (30s timeout) with the result dir as `argv[2]`; its stdout JSON becomes `testOutput` and sets `passed`/`failed`.
5. Throughout, `runEmitter` (an `EventEmitter`) fires `progress` / `model-switch` / `test-start` / `test-end` / `error` / `completed` events. `GET /api/runs/:id/events` relays events matching the run id as SSE; the client's `run-monitor.ts` consumes this via `EventSource` for live updates.
6. Cancellation: `runner.cancel(id)` aborts that run's `AbortController`. The signal is checked at loop boundaries and passed into `llamaclient.chat` to abort in-flight requests.
