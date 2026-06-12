import fs from 'fs/promises';
import path from 'path';
import { Run, TestResult } from '../types.js';

const TESTS_DIR = process.env.TESTS_DIR || '/app/tests';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/app/output';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');

function ensureDir(dir: string): Promise<void> {
  return fs.mkdir(dir, { recursive: true }).then(() => {});
}

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

export const storage = {
  async init(): Promise<void> {
    await Promise.all([
      ensureDir(TESTS_DIR),
      ensureDir(OUTPUT_DIR),
      ensureDir(DATA_DIR),
    ]);
  },

  // Test definitions
  async listTests(): Promise<string[]> {
    const entries = await fs.readdir(TESTS_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  },

  async getTest(name: string): Promise<{ prompt: string; script: string } | null> {
    const testDir = path.join(TESTS_DIR, name);
    try {
      const [prompt, script] = await Promise.all([
        fs.readFile(path.join(testDir, 'prompt.txt'), 'utf-8').catch(() => ''),
        fs.readFile(path.join(testDir, 'test.ts'), 'utf-8').catch(() => ''),
      ]);
      return { prompt, script };
    } catch {
      return null;
    }
  },

  async saveTest(name: string, prompt: string, script: string): Promise<void> {
    const testDir = path.join(TESTS_DIR, name);
    await ensureDir(testDir);
    await Promise.all([
      fs.writeFile(path.join(testDir, 'prompt.txt'), prompt, 'utf-8'),
      fs.writeFile(path.join(testDir, 'test.ts'), script, 'utf-8'),
    ]);
  },

  async deleteTest(name: string): Promise<void> {
    const testDir = path.join(TESTS_DIR, name);
    await fs.rm(testDir, { recursive: true, force: true });
  },

  // Runs
  async listRuns(): Promise<Run[]> {
    return readJSON<Run[]>(RUNS_FILE, []);
  },

  async saveRuns(runs: Run[]): Promise<void> {
    await ensureDir(DATA_DIR);
    await fs.writeFile(RUNS_FILE, JSON.stringify(runs, null, 2), 'utf-8');
  },

  async getRun(id: string): Promise<Run | null> {
    const runs = await this.listRuns();
    return runs.find(r => r.id === id) || null;
  },

  async saveRun(run: Run): Promise<void> {
    const runs = await this.listRuns();
    const idx = runs.findIndex(r => r.id === run.id);
    if (idx >= 0) {
      runs[idx] = run;
    } else {
      runs.push(run);
    }
    await this.saveRuns(runs);
  },

  // Results
  async saveResult(runId: string, testName: string, modelId: string, result: TestResult): Promise<void> {
    const resultDir = this.getResultDir(runId, testName, modelId);
    await ensureDir(resultDir);
    await fs.writeFile(path.join(resultDir, 'results.json'), JSON.stringify(result, null, 2), 'utf-8');
  },

  async getResult(runId: string, testName: string, modelId: string): Promise<TestResult | null> {
    const resultDir = this.getResultDir(runId, testName, modelId);
    try {
      const data = await fs.readFile(path.join(resultDir, 'results.json'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async saveTurns(runId: string, testName: string, modelId: string, turns: unknown[]): Promise<void> {
    const resultDir = this.getResultDir(runId, testName, modelId);
    await ensureDir(resultDir);
    await fs.writeFile(path.join(resultDir, 'turns.json'), JSON.stringify(turns, null, 2), 'utf-8');
  },

  getResultDir(runId: string, testName: string, modelId: string): string {
    const safeModel = modelId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(OUTPUT_DIR, testName, `${runId}_${safeModel}`);
  },

  getTestOutputDir(runId: string, testName: string, modelId: string): string {
    const dir = this.getResultDir(runId, testName, modelId);
    return path.join(dir, 'files');
  },

  async listOutputFiles(runId: string, testName: string, modelId: string): Promise<string[]> {
    const dir = this.getTestOutputDir(runId, testName, modelId);
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => path.join(e.parentPath, e.name));
    } catch {
      return [];
    }
  },
};
