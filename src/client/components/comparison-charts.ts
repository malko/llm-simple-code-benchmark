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
export type ViewMode = 'auto' | 'model' | 'run' | 'setting';

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
 * Returns only the setting keys for which at least one model was run more than once
 * with different values — i.e. keys that will actually produce impact groups in the
 * "Setting impact" view. Keys that differ only across models are excluded.
 */
export function getImpactableSettingKeys(results: ResultRow[], runInfos: RunParamInfo[]): string[] {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, 'auto');
  const byModel = new Map<string, SeriesEntry[]>();
  for (const s of series) {
    if (!byModel.has(s.modelId)) byModel.set(s.modelId, []);
    byModel.get(s.modelId)!.push(s);
  }
  const keys = new Set<string>();
  for (const modelSeries of byModel.values()) {
    if (modelSeries.length < 2) continue;
    const allSettings = modelSeries.map(s => settingsOf(s, runInfoMap));
    const allKeys = new Set(allSettings.flatMap(s => Object.keys(s)));
    for (const key of allKeys) {
      const vals = new Set(allSettings.map(s => s[key] ?? '—'));
      if (vals.size > 1) keys.add(key);
    }
  }
  return Array.from(keys).sort();
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
 * Groups "auto" series by model, keeping only groups where `key` takes more than one
 * value across the series for that model. Other settings may differ between items;
 * `contextSettings` captures only the settings that are identical across all items.
 */
export function buildSettingImpactGroups(results: ResultRow[], runInfos: RunParamInfo[], key: string): SettingImpactGroup[] {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, 'auto');

  const byModel = new Map<string, { value: string; settings: Record<string, string>; series: SeriesEntry }[]>();
  for (const s of series) {
    const settings = settingsOf(s, runInfoMap);
    const value = settings[key] ?? '—';
    if (!byModel.has(s.modelId)) byModel.set(s.modelId, []);
    byModel.get(s.modelId)!.push({ value, settings, series: s });
  }

  const groups: SettingImpactGroup[] = [];
  for (const [modelId, items] of byModel) {
    if (new Set(items.map(i => i.value)).size <= 1) continue;
    // contextSettings = settings (other than key) that are constant across all items
    const otherKeys = new Set(items.flatMap(i => Object.keys(i.settings).filter(k => k !== key)));
    const contextSettings: Record<string, string> = {};
    for (const k of otherKeys) {
      const vals = new Set(items.map(i => i.settings[k] ?? '—'));
      if (vals.size === 1) contextSettings[k] = [...vals][0];
    }
    // Merge series that share the same value for the key into one bar.
    const valueMap = new Map<string, ResultRow[]>();
    for (const { value, series: s } of items) {
      if (!valueMap.has(value)) valueMap.set(value, []);
      valueMap.get(value)!.push(...s.results);
    }
    const mergedItems = Array.from(valueMap.entries())
      .sort(([a], [b]) => compareSettingValues(a, b))
      .map(([value, results]) => ({
        value,
        series: { key: `${modelId}::${value}`, label: value, modelId, results } as SeriesEntry,
      }));
    groups.push({ modelId, contextSettings, items: mergedItems });
  }
  return groups;
}

function buildSettingsCardHtml(
  settingsRows: { key: string; values: string[] }[],
  autoSeries: SeriesEntry[],
  runInfoMap: Map<string, RunParamInfo>,
  viewMode: ViewMode,
  chartSeries: SeriesEntry[],
): string {
  // Colors derived from chartSeries so they match the bars exactly.
  const seriesColor = (key: string, modelId: string): string => {
    const byKey = chartSeries.findIndex(s => s.key === key);
    if (byKey >= 0) return colorFor(byKey, chartSeries.length);
    const byModel = chartSeries.findIndex(s => s.modelId === modelId);
    return colorFor(byModel >= 0 ? byModel : 0, Math.max(chartSeries.length, 1));
  };

  // In "by model" mode with intra-model variation: one column per model, cells show all values.
  const modelIds = Array.from(new Set(autoSeries.map(s => s.modelId)));
  const useModelCols = viewMode === 'model' && modelIds.length < autoSeries.length;

  if (useModelCols) {
    const cols = modelIds.map(modelId => {
      const modelSeries = autoSeries.filter(s => s.modelId === modelId);
      const byKey = new Map<string, Set<string>>();
      for (const s of modelSeries) {
        for (const [k, v] of Object.entries(settingsOf(s, runInfoMap))) {
          if (!byKey.has(k)) byKey.set(k, new Set());
          byKey.get(k)!.add(v);
        }
      }
      const repKey = chartSeries.find(s => s.modelId === modelId)?.key ?? modelId;
      return { modelId, label: shortModelName(modelId), byKey, color: seriesColor(repKey, modelId) };
    });

    const diffRows = settingsRows.map(({ key }) => {
      const cells = cols.map(col => {
        const vals = [...(col.byKey.get(key) ?? new Set(['—']))].sort(compareSettingValues);
        return { vals, varies: vals.length > 1 };
      });
      return { key, cells };
    });

    return `
      <details class="card">
        <summary><h2>Compared LLM Settings</h2></summary>
        <p class="text-muted">Settings per model. Highlighted cells indicate the setting varied across multiple runs of that model.</p>
        <div style="overflow-x:auto">
          <table class="stats-table">
            <thead><tr><th>Setting</th>${cols.map(c => `<th style="border-top:3px solid ${c.color}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
            <tbody>
              ${diffRows.map(row => `<tr><td>${escapeHtml(row.key)}</td>${row.cells.map(c =>
                c.varies
                  ? `<td class="text-mono" style="background:rgba(255,200,50,0.12);color:#e6b800">${escapeHtml(c.vals.join(' / '))}</td>`
                  : `<td class="text-mono">${escapeHtml(c.vals[0] ?? '—')}</td>`
              ).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>`;
  }

  // Default: one column per auto-split series, color matches the corresponding chart bar.
  return `
    <details class="card">
      <summary><h2>Compared LLM Settings</h2></summary>
      ${settingsRows.length > 0 ? `
      <div style="overflow-x:auto">
        <table class="stats-table">
          <thead><tr><th>Setting</th>${autoSeries.map(s => `<th style="border-top:3px solid ${seriesColor(s.key, s.modelId)}">${escapeHtml(s.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${settingsRows.map(row => `<tr><td>${escapeHtml(row.key)}</td>${row.values.map(v => `<td class="text-mono">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      ` : `<p class="text-muted">${autoSeries.length > 1 ? 'No bench-parameter or llama.cpp setting differences detected between the selected runs.' : 'No bench-parameter or llama.cpp settings captured for this run.'}</p>`}
    </details>`;
}

/**
 * Groups model-vs-settings comparison charts into two sections:
 * "Performance" (score, speed, execution time, score by test) and
 * "Cost" (token usage, turn counts, and a score-vs-tokens efficiency view).
 * Each (model, run parameters) combination becomes its own series so the
 * same model run with different settings shows up as separate bars/points.
 *
 * When viewMode is 'setting', the main charts are replaced by setting-impact
 * charts that isolate the effect of one parameter across runs of the same model.
 */
export function renderComparisonCharts(container: HTMLElement, results: ResultRow[], runInfos: RunParamInfo[], viewMode: ViewMode = 'auto', settingKey?: string): void {
  const splitMode: SplitMode = viewMode === 'setting' ? 'auto' : viewMode;
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap, splitMode);

  if (series.length === 0) {
    container.innerHTML = '<p class="text-muted">No data to display for the current selection.</p>';
    return;
  }

  const hasRepeats = results.some(r => (r.repeatCount ?? 1) > 1);
  // In 'model' mode expand to auto-split so the settings table shows each configuration;
  // in all other modes the chart series already represent each configuration correctly.
  const autoSeries = viewMode === 'model' ? buildSeries(results, runInfoMap, 'auto') : series;
  const settingsRows = autoSeries.length > 1
    ? buildSettingsDiff(autoSeries, runInfoMap)
    : Object.entries(settingsOf(autoSeries[0], runInfoMap)).map(([key, value]) => ({ key, values: [value] }));
  const impactGroups = (viewMode === 'setting' && settingKey) ? buildSettingImpactGroups(results, runInfos, settingKey) : [];

  // In 'setting' mode, replace main charts with impact group charts.
  if (viewMode === 'setting') {
    const settingsHtml = buildSettingsCardHtml(settingsRows, autoSeries, runInfoMap, viewMode, series);
    if (!settingKey) {
      container.innerHTML = settingsHtml + '<p class="text-muted">Select a setting to compare.</p>';
      initCollapsibleCards(container);
      return;
    }
    if (impactGroups.length === 0) {
      container.innerHTML = settingsHtml + `
        <details class="card" open>
          <summary><h2>Setting Impact: ${escapeHtml(settingKey)}</h2></summary>
          <p class="text-muted">No matching groups found for <strong>${escapeHtml(settingKey)}</strong>. Setting impact analysis requires the same model to have been run at least twice with different values for this setting.</p>
        </details>`;
      initCollapsibleCards(container);
      return;
    }
    const impactHtml = `
      <details class="card" open>
        <summary><h2>Setting Impact: ${escapeHtml(settingKey)}</h2></summary>
        <p class="text-muted">Charts below compare runs of the same model grouped by their <strong>${escapeHtml(settingKey)}</strong> value. Other differences between runs are shown in the Compared LLM Settings section above.</p>
        ${impactGroups.map((g, gi) => renderImpactGroupHtml(g, gi, settingKey)).join('')}
      </details>`;
    container.innerHTML = settingsHtml + impactHtml;
    initCollapsibleCards(container);
    impactGroups.forEach((g, gi) => createImpactCharts(container, g, gi, settingKey));
    return;
  }

  const mainHtml = buildSettingsCardHtml(settingsRows, autoSeries, runInfoMap, viewMode, series) + `

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

  container.innerHTML = mainHtml;
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

}

/** Renders one "impact" sub-section: charts comparing values of `key` for a fixed model. */
function renderImpactGroupHtml(g: SettingImpactGroup, gi: number, key: string): string {
  return `
    <div class="card" style="background:var(--surface2)">
      <h3>${escapeHtml(shortModelName(g.modelId))}</h3>
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
