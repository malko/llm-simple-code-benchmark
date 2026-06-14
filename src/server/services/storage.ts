import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import { Run, TestResult, Settings } from '../types.js';

const TESTS_DIR = process.env.TESTS_DIR || '/app/tests';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/app/output';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const DB_FILE = path.join(DATA_DIR, 'llm-code-bench.db');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDir(dir: string): Promise<void> {
  return fs.mkdir(dir, { recursive: true }).then(() => {});
}

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) throw new Error('Storage not initialized');
  return db;
}

async function migrateFromJson(): Promise<void> {
  const runsJson = path.join(DATA_DIR, 'runs.json');
  try {
    await fs.access(runsJson);
    const data = await fs.readFile(runsJson, 'utf-8');
    const runs: Run[] = JSON.parse(data);
    const insert = getDb().prepare('INSERT OR IGNORE INTO runs (id, data) VALUES (?, ?)');
    const tx = getDb().transaction((items: Run[]) => {
      for (const run of items) {
        insert.run(run.id, JSON.stringify(run));
      }
    });
    tx(runs);
    await fs.rename(runsJson, runsJson + '.migrated');
    console.log(`Migrated ${runs.length} runs from runs.json to SQLite`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Migration error:', err);
    }
  }
}

export const storage = {
  async init(): Promise<void> {
    await Promise.all([
      ensureDir(TESTS_DIR),
      ensureDir(OUTPUT_DIR),
      ensureDir(DATA_DIR),
    ]);
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    await migrateFromJson();
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

  // Runs (SQLite-backed)
  async listRuns(): Promise<Run[]> {
    const rows = getDb().prepare('SELECT data FROM runs ORDER BY rowid').all() as { data: string }[];
    return rows.map(r => JSON.parse(r.data) as Run);
  },

  async saveRuns(runs: Run[]): Promise<void> {
    const tx = getDb().transaction((items: Run[]) => {
      const del = getDb().prepare('DELETE FROM runs');
      const ins = getDb().prepare('INSERT INTO runs (id, data) VALUES (?, ?)');
      del.run();
      for (const run of items) {
        ins.run(run.id, JSON.stringify(run));
      }
    });
    tx(runs);
  },

  async getRun(id: string): Promise<Run | null> {
    const row = getDb().prepare('SELECT data FROM runs WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as Run : null;
  },

  async saveRun(run: Run): Promise<void> {
    getDb().prepare(
      'INSERT INTO runs (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
    ).run(run.id, JSON.stringify(run));
  },

  async deleteRun(run: Run): Promise<boolean> {
    const result = getDb().prepare('DELETE FROM runs WHERE id = ?').run(run.id);
    const repeatCount = Math.max(1, run.config.parameters?.repeatCount || 1);
    const deletions = run.config.testNames.flatMap(testName =>
      run.config.modelIds.flatMap(modelId =>
        Array.from({ length: repeatCount }, (_, i) => i + 1).map(ri => {
          const dir = this.getResultDir(run.id, testName, modelId, repeatCount > 1 ? ri : undefined);
          return fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        })
      )
    );
    await Promise.all(deletions);
    return result.changes > 0;
  },

  // Results
  async saveResult(runId: string, testName: string, modelId: string, result: TestResult, repeatIndex?: number): Promise<void> {
    const resultDir = this.getResultDir(runId, testName, modelId, repeatIndex);
    await ensureDir(resultDir);
    await fs.writeFile(path.join(resultDir, 'results.json'), JSON.stringify(result, null, 2), 'utf-8');
  },

  async getResult(runId: string, testName: string, modelId: string, repeatIndex?: number): Promise<TestResult | null> {
    const resultDir = this.getResultDir(runId, testName, modelId, repeatIndex);
    try {
      const data = await fs.readFile(path.join(resultDir, 'results.json'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async saveTurns(runId: string, testName: string, modelId: string, turns: unknown[], repeatIndex?: number): Promise<void> {
    const resultDir = this.getResultDir(runId, testName, modelId, repeatIndex);
    await ensureDir(resultDir);
    await fs.writeFile(path.join(resultDir, 'turns.json'), JSON.stringify(turns, null, 2), 'utf-8');
  },

  getResultDir(runId: string, testName: string, modelId: string, repeatIndex?: number): string {
    const safeModel = modelId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = repeatIndex !== undefined ? `_r${repeatIndex}` : '';
    return path.join(OUTPUT_DIR, testName, `${runId}_${safeModel}${suffix}`);
  },

  getTestOutputDir(runId: string, testName: string, modelId: string, repeatIndex?: number): string {
    const dir = this.getResultDir(runId, testName, modelId, repeatIndex);
    return path.join(dir, 'files');
  },

  async listOutputFiles(runId: string, testName: string, modelId: string, repeatIndex?: number): Promise<string[]> {
    const dir = this.getTestOutputDir(runId, testName, modelId, repeatIndex);
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => path.relative(dir, path.join(e.parentPath, e.name)));
    } catch {
      return [];
    }
  },

  async getOutputFileContent(runId: string, testName: string, modelId: string, filePath: string, repeatIndex?: number): Promise<string | null> {
    const dir = path.resolve(this.getTestOutputDir(runId, testName, modelId, repeatIndex));
    const resolved = path.resolve(dir, filePath);
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) return null;
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return null;
      return await fs.readFile(resolved, 'utf-8');
    } catch {
      return null;
    }
  },

  // Settings (SQLite-backed)
  async getSettings(): Promise<Settings> {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'settings'").get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value) as Settings;
    return { llamaServerUrl: '', llamaApiKey: '' };
  },

  async saveSettings(settings: Settings): Promise<void> {
    getDb().prepare(
      "INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(settings));
  },
};
