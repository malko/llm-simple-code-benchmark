import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const resultDir = process.argv[2];
const filesDir = path.join(resultDir, 'files');
const testDir = path.dirname(fileURLToPath(import.meta.url));

function run(cmd: string, cwd: string, timeoutMs = 15000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    return { ok: false, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message };
  }
}

function parseGoTestJSON(stdout: string): Record<string, boolean> {
  const results: Record<string, boolean> = {};
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.Test && (event.Action === 'pass' || event.Action === 'fail')) {
        results[event.Test] = event.Action === 'pass';
      }
    } catch {
      // ignore non-JSON output lines
    }
  }
  return results;
}

const EXPECTED_TESTS = ['TestTotalValue', 'TestLowStock', 'TestMostExpensive', 'TestMostExpensiveEmpty'];

const sourcePath = path.join(filesDir, 'inventory.go');
if (!fs.existsSync(sourcePath)) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: { error: 'inventory.go not found in output directory (was it moved or renamed?)' },
  }));
  process.exit(0);
}

const harnessDest = path.join(filesDir, 'harness_test.go');
fs.copyFileSync(path.join(testDir, 'harness_test.go'), harnessDest);

const result = run('go test ./... -json', filesDir);
const testResults = parseGoTestJSON(result.stdout);

fs.rmSync(harnessDest, { force: true });

const details: Record<string, unknown> = {};
if (Object.keys(testResults).length === 0) {
  details.buildError = (result.stderr || result.stdout).slice(0, 2000);
}

const checks: Record<string, boolean> = {};
for (const name of EXPECTED_TESTS) {
  checks[name] = testResults[name] === true;
}
const passedChecks = Object.values(checks).filter(Boolean).length;
const score = Math.round((passedChecks / EXPECTED_TESTS.length) * 1000) / 1000;

console.log(JSON.stringify({
  passed: passedChecks === EXPECTED_TESTS.length,
  score,
  details: { ...details, checks },
}));
