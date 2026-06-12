# LLM Code Bench

A web-based tool for benchmarking LLMs by running test prompts against models served by [llama.cpp](https://github.com/ggml-org/llama.cpp) HTTP server.

## Features

- Define test cases with a prompt and a validation script (TypeScript)
- Select models to test and configure generation parameters (temperature, max tokens, etc.)
- Models are loaded/unloaded via llama.cpp's router mode
- Model agents get read/write/grep tools scoped to an output directory
- Run multiple tests across multiple models sequentially
- Live progress via SSE with stop/cancel support
- Browse results, view generated files, compare with scatter charts
- All data stored on the filesystem — no database needed

## Quick Start

```bash
# 1. Build and start
npm run build
LLAMA_SERVER_URL=http://your-llama-server:8080 TESTS_DIR=./tests OUTPUT_DIR=./output DATA_DIR=./data npm start

# Or with Docker
LLAMA_SERVER_URL=http://host.docker.internal:8080 docker compose up -d
```

Open `http://localhost:3000` in your browser.

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Web UI (TS)     │────▶│  Express API        │────▶│  llama.cpp       │
│  Monaco editor   │     │  Runner + SSE       │     │  HTTP Server     │
│  Chart.js        │     │  Tool Executor      │     │  (router mode)   │
└──────────────────┘     └────────┬────────────┘     └──────────────────┘
                                  │
                         ┌────────┴────────┐
                         │  Volumes         │
                         │  tests/          │
                         │  output/         │
                         │  data/           │
                         └─────────────────┘
```

## Directory Layout

```
tests/                          # Test definitions (mounted volume)
  my-test/
    prompt.txt                  # Prompt sent to the model
    test.ts                     # Validation script (outputs JSON on stdout)
output/                         # Run results (mounted volume)
  my-test/
    2026-06-13T12-00-00_run-id_model/
      turns.json                # Full conversation log
      results.json              # Stats and test result
      files/                    # Model-generated files
data/
  runs.json                     # Run metadata
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tests` | List test definitions |
| `PUT` | `/api/tests/:name` | Create/update a test |
| `GET` | `/api/tests/:name` | Get a test |
| `DELETE` | `/api/tests/:name` | Delete a test |
| `GET` | `/api/models` | List models from llama server |
| `GET` | `/api/models/health` | Check llama server health |
| `POST` | `/api/runs` | Create and launch a run |
| `GET` | `/api/runs` | List runs |
| `GET` | `/api/runs/:id` | Get run details |
| `POST` | `/api/runs/:id/cancel` | Cancel a run |
| `GET` | `/api/runs/:id/events` | SSE stream for live progress |
| `GET` | `/api/results` | Query results (filters: runId, testName, modelId, status) |
| `GET` | `/api/results/stats` | Aggregate stats |

## Test Scripts

A test script (`test.ts` or `.sh`) receives the output directory path as its first argument and must output a JSON object on stdout:

```json
{
  "passed": true,
  "score": 0.95,
  "details": { "accuracy": 0.95, "completeness": 0.90 }
}
```

## Model Tools

During a test run, the model has access to these tools scoped to its output directory:

- `read_file(path)` — read a file
- `read_lines(path, start, end)` — partial read
- `write_file(path, content)` — write a file
- `grep(pattern, path)` — search with regex
- `list_files(path)` — list directory contents

Path traversal is blocked server-side.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LLAMA_SERVER_URL` | `http://host.docker.internal:8080` | llama.cpp server URL |
| `PORT` | `3000` | Web app port |
| `TESTS_DIR` | `/app/tests` | Test definitions directory |
| `OUTPUT_DIR` | `/app/output` | Results output directory |
| `DATA_DIR` | `/app/data` | Persistent data directory |

## Requirements

- Node.js LTS
- A running [llama.cpp](https://github.com/ggml-org/llama.cpp) HTTP server (router mode with `--models-dir`)
- Docker (optional, for containerized deployment)
