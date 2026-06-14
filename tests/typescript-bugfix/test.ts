import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const resultDir = process.argv[2];
const filesDir = path.join(resultDir, 'files');
const testDir = path.dirname(fileURLToPath(import.meta.url));

function run(cmd: string, cwd: string, timeoutMs = 10000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message };
  }
}

const EXPECTED_CHECKS = [
  'capitalizeMixedCase', 'capitalizeLowercase', 'capitalizeEmpty',
  'truncateLong', 'truncateShort', 'truncateExact',
  'reverseWordsBasic', 'reverseWordsSingle',
];

const sourcePath = path.join(filesDir, 'src', 'strings.ts');
if (!fs.existsSync(sourcePath)) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: { error: 'src/strings.ts not found in output directory (was it moved or renamed?)' },
  }));
  process.exit(0);
}

const harnessDest = path.join(filesDir, 'harness.ts');
fs.copyFileSync(path.join(testDir, 'harness.ts'), harnessDest);

const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-bugfix-'));
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

const checks: Record<string, boolean> = {};
for (const name of EXPECTED_CHECKS) {
  checks[name] = functional[name] === true;
}
const passedChecks = Object.values(checks).filter(Boolean).length;
const score = Math.round((passedChecks / EXPECTED_CHECKS.length) * 1000) / 1000;

console.log(JSON.stringify({
  passed: passedChecks === EXPECTED_CHECKS.length,
  score,
  details: { ...details, checks },
}));
