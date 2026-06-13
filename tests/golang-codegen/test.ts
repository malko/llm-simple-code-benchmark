import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const resultDir = process.argv[2];
const filesDir = path.join(resultDir, 'files');

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

const EXPECTED = [
  'len: 3',
  'pop: 3',
  'peek: 2',
  'len: 2',
  'empty pop ok: false',
];

const sourcePath = findFile(filesDir, 'main.go');
if (!sourcePath) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: { error: 'main.go not found in output directory' },
  }));
  process.exit(0);
}

const sourceDir = path.dirname(sourcePath);
const result = run('go run main.go', sourceDir);

if (!result.ok) {
  console.log(JSON.stringify({
    passed: false,
    score: 0,
    details: {
      sourcePath: path.relative(filesDir, sourcePath),
      error: 'go run failed',
      stderr: result.stderr.slice(0, 2000),
    },
  }));
  process.exit(0);
}

const actual = result.stdout.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
const lineChecks = EXPECTED.map((expected, i) => actual[i] === expected);
const matched = lineChecks.filter(Boolean).length;
const extraLines = actual.length > EXPECTED.length;

const score = Math.round((matched / EXPECTED.length) * 1000) / 1000;

console.log(JSON.stringify({
  passed: matched === EXPECTED.length && !extraLines,
  score,
  details: {
    sourcePath: path.relative(filesDir, sourcePath),
    expected: EXPECTED,
    actual,
    extraLines,
  },
}));
