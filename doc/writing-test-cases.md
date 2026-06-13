# Writing Test Cases

This guide is for anyone (human or agent) adding a new test case to `tests/`.
It covers the on-disk format, what the model agent can and can't do, and how
to write a `test.ts` validation script that produces a meaningful score.

For the overall system architecture (runner, storage, SSE events), see
`/AGENTS.md` and `/CLAUDE.md` at the repo root.

## Directory layout

```
tests/<test-name>/
├── prompt.txt        # required — sent verbatim as the user message
├── test.ts           # required — validation script, run after the agent finishes
├── context/          # optional — starting codebase, copied into the agent's workspace
└── ...                # optional — hidden fixtures/harness files for test.ts (NOT visible to the agent)
```

`<test-name>` is the directory name and also the identifier used in run configs
(`config.testNames`). Use `[a-zA-Z0-9_-]` only.

## How a run uses these files (recap)

1. The server creates `output/<test>/<run>_<model>/files/` — the agent's workspace.
2. If `tests/<test-name>/context/` exists, its contents are **copied recursively as-is**
   into `files/` before the agent's first turn. The agent can see and edit these files.
3. `prompt.txt` is sent as the user message (the system prompt tells the agent the
   workspace may already contain files and to `list_files` first).
4. The agent runs a chat+tool loop (up to `maxTurns`), reading/writing inside `files/`.
5. `turns.json` (full transcript) and `results.json` (run stats) are written to
   `output/<test>/<run>_<model>/`.
6. `test.ts` is run as: `npx tsx test.ts <resultDir>` with a **30s timeout**, where
   `<resultDir>` is `output/<test>/<run>_<model>/` (the parent of `files/`).
7. Its stdout (parsed as JSON) becomes `testOutput`; `testOutput.passed` determines
   `passed`/`failed`. If `test.ts` throws or times out, the result is `"error"` instead.

## 1. Writing `prompt.txt`

- Plain text, sent verbatim — no templating.
- Be explicit about **filenames, function/export names, and signatures**. The model
  can pick any names it likes unless told otherwise, and `test.ts` needs to find/import
  a specific thing — so pin down the contract in the prompt.
- State the success criteria concretely ("the function must return `[]` for `n <= 0`",
  "write the result to `output.json`", etc.).
- If there's a `context/` codebase, point at the relevant files ("the bug is in
  `src/search.go`'s `BinarySearch` function — fix it without changing its signature").
- Don't ask the model to "explain" or produce prose as the deliverable — scoring is
  based on files/output it produces, not on the chat transcript.
- Avoid ambiguity that would make automated checking unreliable (e.g. don't say
  "name the file appropriately" — say exactly what to name it).

## 2. The agent's tools & sandbox

The agent only has these tools, scoped to `files/` (path traversal is blocked
server-side — see `src/server/services/tool-executor.ts`):

- `read_file(path)`
- `read_lines(path, start, end)`
- `write_file(path, content)`
- `grep(pattern, path)`
- `list_files(path)`

There is **no shell/exec tool**. The agent cannot compile, run, or test its own code.
All compiling/running/testing happens in `test.ts`, after the run finishes.

## 3. The `context/` directory (existing codebases)

Use `context/` for "fix this bug" / "implement this feature in an existing codebase"
style tests:

- Everything under `tests/<test-name>/context/` is copied **recursively, verbatim**
  into `files/` before the agent starts — directory structure and file contents included.
- The agent can `list_files`/`read_file`/`grep` across it and `write_file` to edit
  or add files.
- Keep it **small and dependency-free** where practical: stdlib-only TypeScript or Go.
  The validation environment (`test.ts`) may run without network access, so avoid
  anything that needs `npm install` or `go mod download` for `context/` code to
  build/run.
- **Don't put grading fixtures in `context/`** — the model can see and modify
  everything there. Keep hidden test harnesses / expected-output fixtures as plain
  files next to `test.ts` (see below) so the model never sees them.

## 4. Writing `test.ts`

### Contract

- Run as `npx tsx test.ts <resultDir>`, 30s timeout — keep it fast, no installs,
  no large compiles.
- `<resultDir>` contains:
  - `files/` — the agent's final workspace (your `context/`, plus whatever it wrote/edited)
  - `turns.json` — full transcript (array of `ChatMessage`, including tool calls/results)
  - `results.json` — run stats (`TestStats`: turn count, token counts, timings)
- Must print **exactly one JSON object to stdout** (the whole stdout is
  `JSON.parse`'d — don't `console.log` anything else):
  ```json
  { "passed": true, "score": 0.8, "details": { "compiles": true, "outputCorrect": true } }
  ```
  - `passed: boolean` — required; drives the pass/fail badge and `status`.
  - `score: number` (0–1 by convention) — used for graphs/comparisons.
  - `details: object` — free-form; surfaced in the results browser. Put each
    sub-check's result here so failures are debuggable without re-running.
- If stdout isn't valid JSON, the result is treated as `{ raw: <stdout> }` (no
  `passed` field) and marked **failed**.
- If `test.ts` itself throws (or the 30s timeout hits), the result is marked
  **`error`**, not `failed` — reserve this for genuine script bugs. Wrap
  `execSync`/`JSON.parse`/etc. in `try/catch` and report expected failures
  (compile errors, wrong output) as `passed: false` with details, not exceptions.

### Locating hidden fixtures / harness files

`test.ts` runs as an ES module via `tsx`, so use `import.meta.url` to find its
own directory (siblings are invisible to the model, since only `context/` gets copied):

```ts
import { fileURLToPath } from 'url';
import path from 'path';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(testDir, 'harness.ts');
```

### Common validation patterns

**A. Type-check generated TypeScript** (uses the repo's own `typescript`, no extra deps):

```ts
execSync(`npx tsc --noEmit --strict "${file}"`, { cwd: filesDir });
```

**B. Compile + run TS functionally** (avoids relying on `tsx` for arbitrary
agent-written code — plain `tsc` + `node` is more predictable):

```ts
execSync(`npx tsc --module commonjs --target es2020 --outDir "${tmpDir}" "${file}"`, { cwd: filesDir });
execSync(`node "${path.join(tmpDir, 'foo.js')}"`, { encoding: 'utf-8' });
```

A common trick: copy a hidden `harness.ts` next to the agent's file before
compiling, where the harness `import`s the agent's module and runs assertions,
printing a JSON summary to stdout that `test.ts` then parses.

**C. Build/run/test Go** (the standard library works fully offline; avoid
third-party modules so `go` never needs to fetch anything):

```ts
execSync('go build ./...', { cwd: filesDir });          // compiles
execSync('go run main.go', { cwd: filesDir, encoding: 'utf-8' }); // check stdout
// or copy a hidden _test.go into filesDir first, then:
execSync('go test ./... -v', { cwd: filesDir, encoding: 'utf-8' });
```

**D. Inspect the transcript** (e.g. did it use tools, how many turns, etc.):

```ts
const turns = JSON.parse(fs.readFileSync(path.join(resultDir, 'turns.json'), 'utf-8'));
```

### Scoring guidance

- Prefer several small, independent checks (e.g. "compiles", "runs without error",
  "produces correct output", "follows constraints") over one all-or-nothing check.
  `score` = fraction passing gives much more useful signal for comparing models
  than a binary pass/fail.
- `passed` should reflect the primary success criterion (usually "produces the
  correct result"); `score` can be more granular/partial.
- Record each sub-check's outcome in `details` for debugging from the UI.
- Be tolerant of harmless variation (formatting, comments, extra helper files,
  additional exports) unless the prompt explicitly constrains it — don't fail a
  correct solution because it isn't byte-identical to a reference.
- Avoid relying solely on the assistant's final chat message for grading (see
  `tests/sample-test`, which is intentionally minimal/naive) — checking the
  actual files written to `files/` and running them is far more reliable.

## 5. Checklist for a new test

1. `mkdir -p tests/<name>` (and `tests/<name>/context/` if the test needs a
   starting codebase).
2. Write `prompt.txt` with explicit filenames/signatures/success criteria.
3. (Optional) Populate `context/` with a minimal, dependency-free starting
   codebase.
4. Write any hidden fixtures/harness files as siblings of `test.ts` — never
   inside `context/`.
5. Write `test.ts` per the contract above. Before wiring up a real model run,
   test it by hand: create a fake `resultDir` (`files/` with hand-written
   "agent output" + empty `turns.json`/`results.json`) and run
   `npx tsx tests/<name>/test.ts /path/to/fake-resultDir` to confirm it
   parses and scores as expected.
6. Launch a run including the new test via the UI (`#/run`) or `POST /api/runs`.

## Existing tests (for reference)

- `tests/sample-test/` — minimal codegen test (write a Python file), scores
  based on the assistant's final message length — a deliberately weak example;
  prefer the artifact-based patterns above for new tests.
- `tests/typescript-codegen/` — write a TS module from scratch, validated via
  `tsc` + compiled-JS execution.
- `tests/golang-codegen/` — write a Go program from scratch, validated via `go run`.
- `tests/typescript-bugfix/` — fix a bug in a small TS module (`context/`),
  validated with a hidden harness.
- `tests/golang-bugfix/` — fix a bug in a small Go package (`context/`),
  validated with a hidden `_test.go`.
- `tests/feature-implementation/` — implement a new feature in an existing TS
  module (`context/`), validated with a hidden harness.

See `doc/test-ideas.md` for a backlog of further test case ideas.
