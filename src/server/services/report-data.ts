import { TestResult } from '../types.js';

export interface AnalysisResultRow extends TestResult {
  runName?: string;
}

export interface RunParamInfo {
  runId: string;
  runName: string;
  parameters?: Record<string, unknown>;
  modelRuntimeInfo?: Record<string, { args?: string[]; meta?: Record<string, unknown> }>;
}

export type SplitMode = 'auto' | 'run' | 'model';

interface SeriesEntry {
  label: string;
  modelId: string;
  results: AnalysisResultRow[];
}

function shortModelName(modelId: string): string {
  return (modelId || '').replace(/^.*[/:]/g, '').slice(0, 40);
}

function paramsSignature(parameters?: Record<string, unknown>): string {
  if (!parameters) return '';
  return JSON.stringify(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)));
}

function argsSignature(args?: string[]): string {
  return args ? JSON.stringify(args) : '';
}

function seriesSignature(info: RunParamInfo | undefined, modelId: string, splitMode: SplitMode): string {
  if (splitMode === 'model') return '';
  if (splitMode === 'run') return info?.runId || '';
  return paramsSignature(info?.parameters) + '||' + argsSignature(info?.modelRuntimeInfo?.[modelId]?.args);
}

function buildSeries(results: AnalysisResultRow[], runInfos: Map<string, RunParamInfo>, splitMode: SplitMode): SeriesEntry[] {
  const modelSigs = new Map<string, Set<string>>();
  for (const r of results) {
    const sig = seriesSignature(runInfos.get(r.runId), r.modelId, splitMode);
    if (!modelSigs.has(r.modelId)) modelSigs.set(r.modelId, new Set());
    modelSigs.get(r.modelId)!.add(sig);
  }

  const seriesMap = new Map<string, SeriesEntry>();
  for (const r of results) {
    const info = runInfos.get(r.runId);
    const sig = seriesSignature(info, r.modelId, splitMode);
    const key = `${r.modelId}::${sig}`;
    let entry = seriesMap.get(key);
    if (!entry) {
      const multi = (modelSigs.get(r.modelId)?.size || 1) > 1;
      const label = multi ? `${shortModelName(r.modelId)} (${info?.runName || r.runId})` : shortModelName(r.modelId);
      entry = { label, modelId: r.modelId, results: [] };
      seriesMap.set(key, entry);
    }
    entry.results.push(r);
  }
  return Array.from(seriesMap.values());
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  return Math.sqrt(avg(nums.map(v => (v - m) ** 2)));
}

function scoreOf(r: AnalysisResultRow): number | undefined {
  if (r.testOutput?.score !== undefined) return r.testOutput.score as number;
  if (r.status === 'passed') return 1;
  if (r.status === 'failed' || r.status === 'error') return 0;
  return undefined;
}

function totalTokensOf(r: AnalysisResultRow): number | undefined {
  const generated = r.stats?.tokenGeneratedCount;
  const prompt = r.stats?.promptTokensCount;
  if (generated === undefined && prompt === undefined) return undefined;
  return (generated ?? 0) + (prompt ?? 0);
}

/** Consistency (%) across repeats: 100% = identical score every repeat, lower = more variance. */
function consistencyOf(s: SeriesEntry): number | null {
  const byTest = new Map<string, number[]>();
  for (const r of s.results) {
    const score = scoreOf(r);
    if (score === undefined) continue;
    if (!byTest.has(r.testName)) byTest.set(r.testName, []);
    byTest.get(r.testName)!.push(score);
  }
  const stddevs = Array.from(byTest.values()).filter(scores => scores.length > 1).map(stddev);
  if (stddevs.length === 0) return null;
  return Math.max(0, 100 - avg(stddevs) * 200);
}

// Pure identifiers/connection details that are never a meaningful "setting" to compare.
const ARGS_NOISE_KEYS = new Set(['model', 'alias', 'port', 'host']);
// Path-like args worth comparing, but shown by filename only to keep things readable.
const ARGS_PATH_KEYS = new Set(['mmproj', 'chat-template-file']);

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

/** Parses llama.cpp `--flag value` / `--flag` style args into a key/value map. */
function parseArgs(args?: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!args) return result;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      result[key] = next;
      i++;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

function settingsOf(s: SeriesEntry, runInfoMap: Map<string, RunParamInfo>): Record<string, string> {
  const info = runInfoMap.get(s.results[0]?.runId);
  const rows: Record<string, string> = {};
  for (const [k, v] of Object.entries(info?.parameters || {})) {
    rows[`bench: ${k}`] = String(v);
  }
  const parsed = parseArgs(info?.modelRuntimeInfo?.[s.modelId]?.args);
  for (const [k, v] of Object.entries(parsed)) {
    if (ARGS_NOISE_KEYS.has(k)) continue;
    rows[`llama: ${k}`] = ARGS_PATH_KEYS.has(k) ? basename(v) : v;
  }
  return rows;
}

function buildSettingsDiff(series: SeriesEntry[], runInfoMap: Map<string, RunParamInfo>): { key: string; values: string[] }[] {
  const perSeries = series.map(s => settingsOf(s, runInfoMap));
  const allKeys = new Set<string>();
  perSeries.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
  const rows: { key: string; values: string[] }[] = [];
  for (const key of allKeys) {
    const values = perSeries.map(r => r[key] ?? '—');
    if (new Set(values).size > 1) rows.push({ key, values });
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function isNumericValue(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}

function compareSettingValues(a: string, b: string): number {
  if (isNumericValue(a) && isNumericValue(b)) return parseFloat(a) - parseFloat(b);
  return a.localeCompare(b);
}

interface SettingImpactGroup {
  modelId: string;
  contextSettings: Record<string, string>;
  items: { value: string; series: SeriesEntry }[];
}

function buildSettingImpactGroups(results: AnalysisResultRow[], runInfoMap: Map<string, RunParamInfo>, key: string): SettingImpactGroup[] {
  const series = buildSeries(results, runInfoMap, 'auto');
  const groups = new Map<string, SettingImpactGroup>();
  for (const s of series) {
    const settings = settingsOf(s, runInfoMap);
    const value = settings[key] ?? '—';
    const others = Object.fromEntries(Object.entries(settings).filter(([k]) => k !== key));
    const groupKey = `${s.modelId}::${JSON.stringify(Object.entries(others).sort())}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { modelId: s.modelId, contextSettings: others, items: [] };
      groups.set(groupKey, group);
    }
    group.items.push({ value, series: s });
  }
  return Array.from(groups.values())
    .filter(g => new Set(g.items.map(i => i.value)).size > 1)
    .map(g => ({ ...g, items: g.items.slice().sort((a, b) => compareSettingValues(a.value, b.value)) }));
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function passRate(results: AnalysisResultRow[]): string {
  const evaluated = results.filter(r => r.status === 'passed' || r.status === 'failed' || r.status === 'error');
  if (evaluated.length === 0) return 'n/a';
  const passed = evaluated.filter(r => r.status === 'passed').length;
  return `${passed}/${evaluated.length} (${Math.round((passed / evaluated.length) * 100)}%)`;
}

function fmtNum(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** Summarizes all repeats of one test within a series into a single bullet line. */
function summarizeTestGroup(testName: string, results: AnalysisResultRow[]): string {
  const total = results.length;
  const passed = results.filter(r => r.status === 'passed').length;
  const scores = results.map(scoreOf).filter((v): v is number => v !== undefined);
  const failingChecks = new Set<string>();
  const errors: string[] = [];

  for (const r of results) {
    const details = r.testOutput?.details as Record<string, unknown> | undefined;
    const checks = details?.checks as Record<string, boolean> | undefined;
    if (checks) {
      for (const [name, ok] of Object.entries(checks)) if (!ok) failingChecks.add(name);
    }
    if (r.error) {
      errors.push(r.error);
    } else if (r.status !== 'passed' && details) {
      const { checks: _omit, ...rest } = details;
      const restStr = JSON.stringify(rest);
      if (restStr !== '{}') errors.push(restStr);
    }
  }

  const parts = [`**${testName}**: ${passed}/${total} passed`];
  if (scores.length) parts.push(`avg score ${fmtNum(avg(scores) * 100, 0)}%`);
  if (scores.length > 1) parts.push(`score stddev ${fmtNum(stddev(scores) * 100, 1)}pp`);
  if (failingChecks.size) parts.push(`failing checks: ${Array.from(failingChecks).join(', ')}`);
  if (errors.length) parts.push(`error: ${truncate(errors[0], 300)}`);
  return '  - ' + parts.join(' — ');
}

/**
 * Builds the system + user prompt for an LLM-generated analysis report covering the
 * given selection of results (already filtered to the chosen runs/tests/models).
 */
export function buildAnalysisPrompt(
  results: AnalysisResultRow[],
  runInfos: RunParamInfo[],
  splitMode: SplitMode,
  splitSettingKey?: string,
): { system: string; user: string } {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, splitMode);
  const settingsDiff = series.length > 1 ? buildSettingsDiff(series, runInfoMap) : [];
  const hasRepeats = results.some(r => (r.repeatCount ?? 1) > 1);

  const lines: string[] = [];

  lines.push('# Benchmark Selection Summary');
  lines.push('');
  lines.push('## Runs Included');
  for (const info of runInfos) {
    lines.push(`- "${info.runName}" (id: ${info.runId}), bench parameters: ${JSON.stringify(info.parameters || {})}`);
  }
  lines.push('');

  lines.push('## Series Overview');
  lines.push('Each "series" is one model run with one specific combination of settings.');
  lines.push('');
  lines.push('| Series | Model | Pass rate | Avg score | Avg output tokens | Avg prompt tokens | Avg total tokens | Avg speed (tok/s) | Avg turns' + (hasRepeats ? ' | Consistency' : '') + ' |');
  lines.push('|---|---|---|---|---|---|---|---|---|' + (hasRepeats ? '---|' : ''));
  for (const s of series) {
    const scores = s.results.map(scoreOf).filter((v): v is number => v !== undefined);
    const genTokens = s.results.map(r => r.stats?.tokenGeneratedCount).filter((v): v is number => v !== undefined);
    const promptTokens = s.results.map(r => r.stats?.promptTokensCount).filter((v): v is number => v !== undefined);
    const totalTokens = s.results.map(totalTokensOf).filter((v): v is number => v !== undefined);
    const speeds = s.results.map(r => r.stats?.tokenGenerationSpeed).filter((v): v is number => v !== undefined);
    const turns = s.results.map(r => r.stats?.turnCount).filter((v): v is number => v !== undefined);
    const row = [
      s.label,
      s.modelId,
      passRate(s.results),
      scores.length ? `${fmtNum(avg(scores) * 100, 1)}%` : 'n/a',
      genTokens.length ? fmtNum(avg(genTokens), 0) : 'n/a',
      promptTokens.length ? fmtNum(avg(promptTokens), 0) : 'n/a',
      totalTokens.length ? fmtNum(avg(totalTokens), 0) : 'n/a',
      speeds.length ? fmtNum(avg(speeds), 1) : 'n/a',
      turns.length ? fmtNum(avg(turns), 1) : 'n/a',
    ];
    if (hasRepeats) {
      const c = consistencyOf(s);
      row.push(c === null ? 'n/a' : `${fmtNum(c, 1)}%`);
    }
    lines.push('| ' + row.join(' | ') + ' |');
  }
  lines.push('');

  if (settingsDiff.length > 0) {
    lines.push('## Settings That Differ Between Series');
    lines.push('| Setting | ' + series.map(s => s.label).join(' | ') + ' |');
    lines.push('|---|' + series.map(() => '---').join('|') + '|');
    for (const row of settingsDiff) {
      lines.push(`| ${row.key} | ` + row.values.join(' | ') + ' |');
    }
    lines.push('');
  }

  lines.push('## Per-Test Breakdown');
  for (const s of series) {
    lines.push(`### ${s.label}`);
    const byTest = new Map<string, AnalysisResultRow[]>();
    for (const r of s.results) {
      if (!byTest.has(r.testName)) byTest.set(r.testName, []);
      byTest.get(r.testName)!.push(r);
    }
    for (const [testName, testResults] of Array.from(byTest.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(summarizeTestGroup(testName, testResults));
    }
    lines.push('');
  }

  if (splitSettingKey) {
    const groups = buildSettingImpactGroups(results, runInfoMap, splitSettingKey);
    lines.push(`## Setting Impact: ${splitSettingKey}`);
    if (groups.length === 0) {
      lines.push(`No groups found where "${splitSettingKey}" varies while the model and all other settings stay constant.`);
    } else {
      lines.push(`Each table below isolates the effect of "${splitSettingKey}" on one model, holding all other settings constant.`);
      lines.push('');
      for (const g of groups) {
        lines.push(`### ${shortModelName(g.modelId)}`);
        const context = Object.entries(g.contextSettings);
        if (context.length) {
          lines.push(`Other settings held constant: ${context.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        lines.push(`| ${splitSettingKey} | Pass rate | Avg score | Avg output tokens | Avg speed (tok/s) | Avg turns |`);
        lines.push('|---|---|---|---|---|---|');
        for (const item of g.items) {
          const scores = item.series.results.map(scoreOf).filter((v): v is number => v !== undefined);
          const genTokens = item.series.results.map(r => r.stats?.tokenGeneratedCount).filter((v): v is number => v !== undefined);
          const speeds = item.series.results.map(r => r.stats?.tokenGenerationSpeed).filter((v): v is number => v !== undefined);
          const turns = item.series.results.map(r => r.stats?.turnCount).filter((v): v is number => v !== undefined);
          lines.push('| ' + [
            item.value,
            passRate(item.series.results),
            scores.length ? `${fmtNum(avg(scores) * 100, 1)}%` : 'n/a',
            genTokens.length ? fmtNum(avg(genTokens), 0) : 'n/a',
            speeds.length ? fmtNum(avg(speeds), 1) : 'n/a',
            turns.length ? fmtNum(avg(turns), 1) : 'n/a',
          ].join(' | ') + ' |');
        }
        lines.push('');
      }
    }
    lines.push('');
  }

  const system = `You are an expert analyst for LLM coding-agent benchmarks ("LLM Code Bench"). \
You will be given a structured summary of one or more benchmark runs: for each model + settings \
combination ("series"), aggregate stats (pass rate, score, token usage, generation speed, turn \
counts, and consistency across repeats), plus a per-test breakdown listing which checks failed and \
truncated error excerpts.

Write a comprehensive Markdown report with the following sections:

1. **Executive Summary** — a short overview of the selection and the headline findings.
2. **What Worked Well** — which model/settings series performed best and on which tests, citing \
specific scores and checks.
3. **Difficulties & Failure Analysis** — for failed or low-scoring tests, explain the likely cause \
based on the failing checks and error excerpts. Also flag tests that passed but were inefficient \
(high token usage, many turns, low consistency).
4. **What Would Improve Results** — concrete suggestions (prompt clarity, test harness/checks, \
model settings such as context size/temperature/sampling, max turns, etc.) that could close the gaps \
identified above.
5. **Impact of Settings & Model Choice on Accuracy** — using the "Settings That Differ Between Series" \
table and, if present, the "Setting Impact" tables, identify which model or which single setting has \
the largest measurable effect on accuracy, with supporting numbers.
6. **Cost Efficiency** — rank the series by cost efficiency (tokens used and turns relative to score, \
and generation speed) and identify the most cost-efficient model/settings.
7. **Recommendation** — which model(s) are most worth investing time in tuning for an agentic coding \
workflow, and concrete next steps.

Base every claim on the numbers and check names provided — do not invent data that is not present in \
the summary. Use Markdown headings, tables, and bullet lists.`;

  return { system, user: lines.join('\n') };
}
