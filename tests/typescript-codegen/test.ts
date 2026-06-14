import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const resultDir = process.argv[2];
const filesDir = path.join(resultDir, 'files');
const testDir = path.dirname(fileURLToPath(import.meta.url));

function findFile(dir: string, filename: string, maxDepth = 3): string | null {
  if (maxDepth < 0) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name === filename) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findFile(path.join(dir, e.name), filename, maxDepth - 1);
      if (found) return found;
    }
  }
  return null;
}

function run(cmd: string, cwd: string, timeoutMs = 10000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message };
  }
}

const details: Record<string, unknown> = {};
const checks: Record<string, boolean> = {};

const sourcePath = findFile(filesDir, 'lru-cache.ts');
if (!sourcePath) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: { error: 'lru-cache.ts not found in output directory' },
  }));
  process.exit(0);
}
details.sourcePath = path.relative(filesDir, sourcePath);
const sourceDir = path.dirname(sourcePath);

// 1. Strict type-check (informational — functional checks below don't depend on this)
const strict = run('tsc --noEmit --strict --skipLibCheck "' + path.basename(sourcePath) + '"', sourceDir);
checks.strictCompiles = strict.ok;
if (!strict.ok) details.strictCompileError = strict.stderr.slice(0, 2000);

// 2. Compile the agent's module + hidden harness together and run it
const harnessSrc = path.join(testDir, 'harness.ts');
const harnessDest = path.join(sourceDir, 'harness.ts');
fs.copyFileSync(harnessSrc, harnessDest);

const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-codegen-'));
const compile = run(
  `tsc --module commonjs --target es2020 --esModuleInterop --skipLibCheck --outDir "${tmpOut}" harness.ts`,
  sourceDir,
);

let functional: Record<string, boolean> = {};
if (compile.ok || fs.existsSync(path.join(tmpOut, 'harness.js'))) {
  const runResult = run(`node "${path.join(tmpOut, 'harness.js')}"`, sourceDir);
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

const functionalChecks = ['basicGet', 'missingKey', 'size', 'evictsLRU', 'updateRefreshesRecency'];
for (const name of functionalChecks) {
  checks[name] = functional[name] === true;
}

const totalChecks = 1 + functionalChecks.length; // strictCompiles + functional
const passedChecks = Object.values(checks).filter(Boolean).length;
const score = Math.round((passedChecks / totalChecks) * 1000) / 1000;

console.log(JSON.stringify({
  passed: functionalChecks.every(name => checks[name]),
  score,
  details: { ...details, checks },
}));
