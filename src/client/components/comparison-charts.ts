import { Chart, registerables, ChartConfiguration } from 'chart.js';
import { ResultRow } from './result-types.js';
import { initCollapsibleCards } from './collapsible-cards.js';

Chart.register(...registerables);

export interface RunParamInfo {
  runId: string;
  runName: string;
  parameters?: Record<string, unknown>;
  modelRuntimeInfo?: Record<string, { args?: string[]; meta?: Record<string, unknown> }>;
}

export interface SeriesEntry {
  key: string;
  label: string;
  modelId: string;
  results: ResultRow[];
}

const AXIS_COLOR = '#aaa';
const GRID_COLOR = 'rgba(255,255,255,0.05)';

const darkBgPlugin = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart: Chart) => {
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

function shortModelName(modelId: string): string {
  return (modelId || '').replace(/^.*[/:]/g, '').slice(0, 24);
}

function paramsSignature(parameters?: Record<string, unknown>): string {
  if (!parameters) return '';
  return JSON.stringify(Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)));
}

function argsSignature(args?: string[]): string {
  return args ? JSON.stringify(args) : '';
}

export type SplitMode = 'auto' | 'run' | 'model';

function seriesSignature(info: RunParamInfo | undefined, modelId: string, splitMode: SplitMode): string {
  if (splitMode === 'model') return '';
  if (splitMode === 'run') return info?.runId || '';
  return paramsSignature(info?.parameters) + '||' + argsSignature(info?.modelRuntimeInfo?.[modelId]?.args);
}

export function buildSeries(results: ResultRow[], runInfos: Map<string, RunParamInfo>, splitMode: SplitMode): SeriesEntry[] {
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
      entry = { key, label, modelId: r.modelId, results: [] };
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

/**
 * Consistency (%) of a series across its repeats: 100% means every repeat of every
 * test produced the same score, lower values mean scores varied between repeats.
 * Returns `null` if this series has no test with more than one repeat (no data).
 */
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
  // Max stddev for values in [0,1] is 0.5, so *200 maps it onto a 0-100 scale.
  return Math.max(0, 100 - avg(stddevs) * 200);
}

function scoreOf(r: ResultRow): number | undefined {
  if (r.testOutput?.score !== undefined) return r.testOutput.score;
  if (r.status === 'passed') return 1;
  if (r.status === 'failed' || r.status === 'error') return 0;
  return undefined;
}

function totalTokensOf(r: ResultRow): number | undefined {
  const generated = r.stats?.tokenGeneratedCount;
  const prompt = r.stats?.promptTokensCount;
  if (generated === undefined && prompt === undefined) return undefined;
  return (generated ?? 0) + (prompt ?? 0);
}

function colorFor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1)) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function destroyChart(canvas: HTMLCanvasElement): void {
  const existing = (canvas as unknown as { __chart?: Chart }).__chart;
  if (existing) existing.destroy();
}

function createChart(canvas: HTMLCanvasElement, config: ChartConfiguration): void {
  destroyChart(canvas);
  (canvas as unknown as { __chart?: Chart }).__chart = new Chart(canvas.getContext('2d')!, config);
}

function barOptions(yLabel: string, opts: { min?: number; max?: number; showLegend?: boolean; xLabel?: string } = {}): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !!opts.showLegend, position: 'top', labels: { color: AXIS_COLOR } },
    },
    scales: {
      x: {
        ticks: { color: AXIS_COLOR, maxRotation: 45 },
        grid: { color: GRID_COLOR },
        title: opts.xLabel ? { display: true, text: opts.xLabel, color: AXIS_COLOR } : undefined,
      },
      y: {
        beginAtZero: true,
        min: opts.min,
        max: opts.max,
        title: { display: true, text: yLabel, color: AXIS_COLOR },
        ticks: { color: AXIS_COLOR },
        grid: { color: GRID_COLOR },
      },
    },
  };
}

function scatterOptions(xLabel: string, yLabel: string, opts: { yMin?: number; yMax?: number } = {}): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { color: AXIS_COLOR } },
    },
    scales: {
      x: {
        beginAtZero: true,
        title: { display: true, text: xLabel, color: AXIS_COLOR },
        ticks: { color: AXIS_COLOR },
        grid: { color: GRID_COLOR },
      },
      y: {
        beginAtZero: true,
        min: opts.yMin,
        max: opts.yMax,
        title: { display: true, text: yLabel, color: AXIS_COLOR },
        ticks: { color: AXIS_COLOR },
        grid: { color: GRID_COLOR },
      },
    },
  };
}

function buildByTestDatasets(
  series: SeriesEntry[],
  testNames: string[],
  colors: string[],
  pick: (r: ResultRow) => number | undefined,
  round: (avgValue: number) => number,
): { label: string; data: (number | null)[]; backgroundColor: string }[] {
  return series.map((s, i) => ({
    label: s.label,
    data: testNames.map(testName => {
      const vals = s.results.filter(r => r.testName === testName).map(pick).filter((v): v is number => v !== undefined);
      return vals.length ? round(avg(vals)) : null;
    }),
    backgroundColor: colors[i],
  }));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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

// Pure identifiers/connection details that are never a meaningful "setting" to compare.
const ARGS_NOISE_KEYS = new Set(['model', 'alias', 'port', 'host']);
// Path-like args worth comparing, but shown by filename only to keep the table readable.
const ARGS_PATH_KEYS = new Set(['mmproj', 'chat-template-file']);

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export function settingsOf(s: SeriesEntry, runInfoMap: Map<string, RunParamInfo>): Record<string, string> {
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

/** Returns only the settings (bench parameters + llama.cpp launch args) that differ across series. */
export function buildSettingsDiff(series: SeriesEntry[], runInfoMap: Map<string, RunParamInfo>): { key: string; values: string[] }[] {
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

/**
 * Returns the list of bench-parameter / llama.cpp setting keys that differ across the
 * selected results (using "auto" series, i.e. one series per unique settings combination).
 * Used to populate the "Split charts by setting" selector.
 */
export function getDifferingSettingKeys(results: ResultRow[], runInfos: RunParamInfo[]): string[] {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, 'auto');
  if (series.length < 2) return [];
  return buildSettingsDiff(series, runInfoMap).map(row => row.key);
}

function isNumericValue(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}

function compareSettingValues(a: string, b: string): number {
  if (isNumericValue(a) && isNumericValue(b)) return parseFloat(a) - parseFloat(b);
  return a.localeCompare(b);
}

export interface SettingImpactGroup {
  modelId: string;
  /** Settings (other than the split key) that are identical across all items in this group. */
  contextSettings: Record<string, string>;
  /** One entry per distinct value of the split key, sorted by that value. */
  items: { value: string; series: SeriesEntry }[];
}

/**
 * Groups "auto" series by (model + all settings except `key`), keeping only groups where
 * `key` actually takes more than one value — isolating the effect of varying just that
 * one setting while everything else (model, other bench params, llama.cpp args) stays fixed.
 */
export function buildSettingImpactGroups(results: ResultRow[], runInfos: RunParamInfo[], key: string): SettingImpactGroup[] {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
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

/**
 * Groups model-vs-settings comparison charts into two sections:
 * "Performance" (score, speed, execution time, score by test) and
 * "Cost" (token usage, turn counts, and a score-vs-tokens efficiency view).
 * Each (model, run parameters) combination becomes its own series so the
 * same model run with different settings shows up as separate bars/points.
 */
export function renderComparisonCharts(container: HTMLElement, results: ResultRow[], runInfos: RunParamInfo[], splitMode: SplitMode = 'auto', splitSettingKey?: string): void {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, splitMode);

  if (series.length === 0) {
    container.innerHTML = '<p class="text-muted">No data to display for the current selection.</p>';
    return;
  }

  const hasRepeats = results.some(r => (r.repeatCount ?? 1) > 1);
  const settingsRows = series.length > 1
    ? buildSettingsDiff(series, runInfoMap)
    : Object.entries(settingsOf(series[0], runInfoMap)).map(([key, value]) => ({ key, values: [value] }));
  const impactGroups = splitSettingKey ? buildSettingImpactGroups(results, runInfos, splitSettingKey) : [];

  const mainHtml = `
    <details class="card">
      <summary><h2>Compared LLM Settings</h2></summary>
      ${settingsRows.length > 0 ? `
      ${series.length > 1 ? '<p class="text-muted">Settings that differ between the series below:</p>' : ''}
      <div style="overflow-x:auto">
        <table class="stats-table">
          <thead><tr><th>Setting</th>${series.map(s => `<th>${escapeHtml(s.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${settingsRows.map(row => `<tr><td>${escapeHtml(row.key)}</td>${row.values.map(v => `<td class="text-mono">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      ` : `<p class="text-muted">${series.length > 1 ? 'No bench-parameter or llama.cpp setting differences detected between the selected series.' : 'No bench-parameter or llama.cpp settings captured for this series.'}</p>`}
    </details>

    <details class="card" open>
      <summary><h2>Performance</h2></summary>
      <div class="grid-2">
        <div class="chart-container"><h3>Average Score</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-score"></canvas></div></div>
        <div class="chart-container"><h3>Average Speed (tokens/s)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-speed"></canvas></div></div>
        <div class="chart-container"><h3>Total Execution Time (s)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-time"></canvas></div></div>
        <div class="chart-container"><h3>Score by Test</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-by-test"></canvas></div></div>
      </div>
    </details>

    <details class="card" open>
      <summary><h2>Cost</h2></summary>
      <div class="grid-3">
        <div class="chart-container"><h3>Average Output Tokens</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-gen"></canvas></div></div>
        <div class="chart-container"><h3>Average Total Tokens (Prompt + Output)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-total"></canvas></div></div>
        <div class="chart-container"><h3>Average Turn Count</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-turns"></canvas></div></div>
      </div>
      <div class="grid-2">
        <div class="chart-container"><h3>Output Tokens by Test</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-by-test"></canvas></div></div>
        <div class="chart-container"><h3>Score vs Output Tokens</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-efficiency"></canvas></div></div>
      </div>
    </details>

    ${hasRepeats ? `
    <details class="card" open>
      <summary><h2>Consistency</h2></summary>
      <div class="grid-2">
        <div class="chart-container"><h3>Score Consistency (%, 100% = identical across repeats)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-consistency"></canvas></div></div>
      </div>
    </details>
    ` : ''}
  `;

  const impactHtml = splitSettingKey ? (impactGroups.length > 0 ? `
    <details class="card" open>
      <summary><h2>Setting Impact: ${escapeHtml(splitSettingKey)}</h2></summary>
      <p class="text-muted">Each section below isolates the effect of "${escapeHtml(splitSettingKey)}" while holding the model and all other settings constant.</p>
      ${impactGroups.map((g, gi) => renderImpactGroupHtml(g, gi, splitSettingKey)).join('')}
    </details>
  ` : `
    <details class="card" open>
      <summary><h2>Setting Impact: ${escapeHtml(splitSettingKey)}</h2></summary>
      <p class="text-muted">No groups found where "${escapeHtml(splitSettingKey)}" varies while the model and all other settings stay constant.</p>
    </details>
  `) : '';

  container.innerHTML = mainHtml + impactHtml;
  initCollapsibleCards(container);

  const labels = series.map(s => s.label);
  const colors = series.map((_, i) => colorFor(i, series.length));

  const scoreData = series.map(s => {
    const scores = s.results.map(scoreOf).filter((v): v is number => v !== undefined);
    return scores.length ? Math.round(avg(scores) * 1000) / 10 : 0;
  });

  const speedData = series.map(s => {
    const speeds = s.results.map(r => r.stats?.tokenGenerationSpeed).filter((v): v is number => v !== undefined);
    return speeds.length ? Math.round(avg(speeds) * 10) / 10 : 0;
  });

  const timeData = series.map(s => {
    const total = s.results.reduce((sum, r) => sum + (r.stats?.elapsedMs ?? 0), 0);
    return Math.round((total / 1000) * 10) / 10;
  });

  const tokensGenData = series.map(s => {
    const vals = s.results.map(r => r.stats?.tokenGeneratedCount).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(avg(vals)) : 0;
  });

  const tokensTotalData = series.map(s => {
    const vals = s.results.map(totalTokensOf).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(avg(vals)) : 0;
  });

  const turnCountData = series.map(s => {
    const vals = s.results.map(r => r.stats?.turnCount).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(avg(vals) * 10) / 10 : 0;
  });

  createChart(container.querySelector('#cmp-chart-score') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Score (%)', data: scoreData, backgroundColor: colors }] },
    options: barOptions('Score (%)', { min: 0, max: 100 }),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-speed') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tokens/s', data: speedData, backgroundColor: colors }] },
    options: barOptions('Tokens/s'),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-time') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Seconds', data: timeData, backgroundColor: colors }] },
    options: barOptions('Seconds'),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-tokens-gen') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tokens', data: tokensGenData, backgroundColor: colors }] },
    options: barOptions('Tokens'),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-tokens-total') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tokens', data: tokensTotalData, backgroundColor: colors }] },
    options: barOptions('Tokens'),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-turns') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Turns', data: turnCountData, backgroundColor: colors }] },
    options: barOptions('Turns'),
    plugins: [darkBgPlugin],
  });

  const testNames = Array.from(new Set(results.map(r => r.testName))).sort();
  const byTestDatasets = buildByTestDatasets(series, testNames, colors, scoreOf, v => Math.round(v * 1000) / 10);
  const tokensByTestDatasets = buildByTestDatasets(series, testNames, colors, r => r.stats?.tokenGeneratedCount, v => Math.round(v));

  createChart(container.querySelector('#cmp-chart-by-test') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels: testNames, datasets: byTestDatasets },
    options: barOptions('Score (%)', { min: 0, max: 100, showLegend: true }),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector('#cmp-chart-tokens-by-test') as HTMLCanvasElement, {
    type: 'bar',
    data: { labels: testNames, datasets: tokensByTestDatasets },
    options: barOptions('Tokens', { showLegend: true }),
    plugins: [darkBgPlugin],
  });

  const efficiencyDatasets = series.map((s, i) => ({
    label: s.label,
    data: [{ x: tokensGenData[i], y: scoreData[i] }],
    backgroundColor: colors[i],
    pointRadius: 8,
  }));

  createChart(container.querySelector('#cmp-chart-efficiency') as HTMLCanvasElement, {
    type: 'scatter',
    data: { datasets: efficiencyDatasets },
    options: scatterOptions('Avg Output Tokens', 'Score (%)', { yMin: 0, yMax: 100 }),
    plugins: [darkBgPlugin],
  });

  if (hasRepeats) {
    const consistencyData = series.map(s => {
      const c = consistencyOf(s);
      return c === null ? null : Math.round(c * 10) / 10;
    });
    createChart(container.querySelector('#cmp-chart-consistency') as HTMLCanvasElement, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Consistency (%)', data: consistencyData, backgroundColor: colors }] },
      options: barOptions('Consistency (%)', { min: 0, max: 100 }),
      plugins: [darkBgPlugin],
    });
  }

  if (splitSettingKey) {
    impactGroups.forEach((g, gi) => createImpactCharts(container, g, gi, splitSettingKey));
  }
}

/** Renders one "impact" sub-section: charts comparing values of `key` for a fixed model + other-settings context. */
function renderImpactGroupHtml(g: SettingImpactGroup, gi: number, key: string): string {
  const contextEntries = Object.entries(g.contextSettings);
  return `
    <div class="card" style="background:var(--surface2)">
      <h3>${escapeHtml(shortModelName(g.modelId))}</h3>
      ${contextEntries.length > 0 ? `
      <p class="text-muted">Other settings held constant:</p>
      <table class="stats-table">
        <tbody>
          ${contextEntries.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="text-mono">${escapeHtml(v)}</td></tr>`).join('')}
        </tbody>
      </table>
      ` : ''}
      <div class="grid-2">
        <div class="chart-container"><h3>Average Score</h3><div class="chart-canvas-wrap"><canvas id="impact-${gi}-score"></canvas></div></div>
        <div class="chart-container"><h3>Average Speed (tokens/s)</h3><div class="chart-canvas-wrap"><canvas id="impact-${gi}-speed"></canvas></div></div>
        <div class="chart-container"><h3>Average Output Tokens</h3><div class="chart-canvas-wrap"><canvas id="impact-${gi}-tokens"></canvas></div></div>
        <div class="chart-container"><h3>Score by Test</h3><div class="chart-canvas-wrap"><canvas id="impact-${gi}-by-test"></canvas></div></div>
      </div>
    </div>
  `;
}

function createImpactCharts(container: HTMLElement, g: SettingImpactGroup, gi: number, key: string): void {
  const labels = g.items.map(i => i.value);
  const colors = g.items.map((_, i) => colorFor(i, g.items.length));

  const scoreData = g.items.map(i => {
    const scores = i.series.results.map(scoreOf).filter((v): v is number => v !== undefined);
    return scores.length ? Math.round(avg(scores) * 1000) / 10 : 0;
  });
  const speedData = g.items.map(i => {
    const speeds = i.series.results.map(r => r.stats?.tokenGenerationSpeed).filter((v): v is number => v !== undefined);
    return speeds.length ? Math.round(avg(speeds) * 10) / 10 : 0;
  });
  const tokensData = g.items.map(i => {
    const vals = i.series.results.map(r => r.stats?.tokenGeneratedCount).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(avg(vals)) : 0;
  });

  createChart(container.querySelector(`#impact-${gi}-score`) as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Score (%)', data: scoreData, backgroundColor: colors }] },
    options: barOptions('Score (%)', { min: 0, max: 100, xLabel: key }),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector(`#impact-${gi}-speed`) as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tokens/s', data: speedData, backgroundColor: colors }] },
    options: barOptions('Tokens/s', { xLabel: key }),
    plugins: [darkBgPlugin],
  });

  createChart(container.querySelector(`#impact-${gi}-tokens`) as HTMLCanvasElement, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tokens', data: tokensData, backgroundColor: colors }] },
    options: barOptions('Tokens', { xLabel: key }),
    plugins: [darkBgPlugin],
  });

  const testNames = Array.from(new Set(g.items.flatMap(i => i.series.results.map(r => r.testName)))).sort();
  const byTestSeries: SeriesEntry[] = g.items.map(i => ({ ...i.series, label: i.value }));
  const byTestDatasets = buildByTestDatasets(byTestSeries, testNames, colors, scoreOf, v => Math.round(v * 1000) / 10);

  createChart(container.querySelector(`#impact-${gi}-by-test`) as HTMLCanvasElement, {
    type: 'bar',
    data: { labels: testNames, datasets: byTestDatasets },
    options: barOptions('Score (%)', { min: 0, max: 100, showLegend: true }),
    plugins: [darkBgPlugin],
  });
}
