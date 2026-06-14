import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const resultDir = process.argv[2];
const filesDir = path.join(resultDir, 'files');
const testDir = path.dirname(fileURLToPath(import.meta.url));
const contextDir = path.join(testDir, 'context');

function run(cmd: string, cwd: string, timeoutMs = 10000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message };
  }
}

// Recursively list all files under `dir`, returned as paths relative to `dir`.
function listFilesRecursive(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(dir, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const TARGET = path.join('plugins', 'title-case.ts');

const sourcePath = path.join(filesDir, TARGET);
if (!fs.existsSync(sourcePath)) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: { error: `${TARGET} not found in output directory (was it moved or renamed?)` },
  }));
  process.exit(0);
}

// Check that exactly one file — the target plugin — was modified: every
// other context/ file must be present and byte-identical, and no new files
// may have been added.
const contextFiles = listFilesRecursive(contextDir);
const contextFileSet = new Set(contextFiles);
const unexpectedlyChanged: string[] = [];
const missing: string[] = [];
for (const rel of contextFiles) {
  if (rel === TARGET) continue;
  const outPath = path.join(filesDir, rel);
  if (!fs.existsSync(outPath)) {
    missing.push(rel);
    continue;
  }
  const original = fs.readFileSync(path.join(contextDir, rel));
  const actual = fs.readFileSync(outPath);
  if (!original.equals(actual)) {
    unexpectedlyChanged.push(rel);
  }
}
const extraFiles = listFilesRecursive(filesDir).filter(rel => !contextFileSet.has(rel));
const onlyTargetFileModified =
  unexpectedlyChanged.length === 0 && missing.length === 0 && extraFiles.length === 0;

// Run the hidden functional harness against the (possibly fixed) target plugin.
const harnessDest = path.join(filesDir, 'harness.ts');
fs.copyFileSync(path.join(testDir, 'harness.ts'), harnessDest);

const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'needle-in-haystack-'));
const compile = run(
  `tsc --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir "${tmpOut}" harness.ts`,
  filesDir,
);

const details: Record<string, unknown> = {};
let functional: Record<string, boolean> = {};

if (compile.ok || fs.existsSync(path.join(tmpOut, 'harness.js'))) {
  const runResult = run(`node "${path.join(tmpOut, 'harness.js')}"`, filesDir);
  if (runResult.ok) {
    try {
      functional = JSON.parse(runResult.stdout.trim());
    } catch {
      details.harnessOutput = runResult.stdout.slice(0, 1000);
    }
  } else {
    details.harnessError = (runResult.stderr || runResult.stdout).slice(0, 2000);
  }
} else {
  details.compileError = compile.stderr.slice(0, 2000);
}

fs.rmSync(harnessDest, { force: true });
fs.rmSync(tmpOut, { recursive: true, force: true });

if (unexpectedlyChanged.length > 0) details.unexpectedlyChanged = unexpectedlyChanged;
if (missing.length > 0) details.missingFiles = missing;
if (extraFiles.length > 0) details.extraFiles = extraFiles;

// Secondary metric: how many tool calls (and of which kind) the agent used
// to navigate the workspace before/while making its edit.
const toolCallCounts: Record<string, number> = {};
try {
  const turns = JSON.parse(fs.readFileSync(path.join(resultDir, 'turns.json'), 'utf-8'));
  for (const turn of turns) {
    if (turn?.role === 'assistant' && Array.isArray(turn.tool_calls)) {
      for (const call of turn.tool_calls) {
        const name = call?.function?.name ?? 'unknown';
        toolCallCounts[name] = (toolCallCounts[name] || 0) + 1;
      }
    }
  }
} catch {
  // turns.json missing/unreadable — leave toolCallCounts empty.
}
details.toolCallCounts = toolCallCounts;
details.totalToolCalls = Object.values(toolCallCounts).reduce((a, b) => a + b, 0);

const FUNCTIONAL_CHECKS = [
  'basicTwoWords', 'allCapsInput', 'threeWords', 'singleLetterWords',
  'emptyInput', 'alreadyCorrect', 'namePreserved', 'descriptionPreserved',
];

const checks: Record<string, boolean> = { onlyTargetFileModified };
for (const name of FUNCTIONAL_CHECKS) {
  checks[name] = functional[name] === true;
}
const totalChecks = FUNCTIONAL_CHECKS.length + 1; // + onlyTargetFileModified
const passedChecks = Object.values(checks).filter(Boolean).length;
const score = Math.round((passedChecks / totalChecks) * 1000) / 1000;

console.log(JSON.stringify({
  passed: FUNCTIONAL_CHECKS.every(name => checks[name]) && onlyTargetFileModified,
  score,
  details: { ...details, checks },
}));
