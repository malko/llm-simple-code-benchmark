import { Chart, registerables, ChartConfiguration } from 'chart.js';
import { ResultRow } from './result-types.js';

Chart.register(...registerables);

export interface RunParamInfo {
  runId: string;
  runName: string;
  parameters?: Record<string, unknown>;
}

interface SeriesEntry {
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

function buildSeries(results: ResultRow[], runInfos: Map<string, RunParamInfo>): SeriesEntry[] {
  const modelSigs = new Map<string, Set<string>>();
  for (const r of results) {
    const sig = paramsSignature(runInfos.get(r.runId)?.parameters);
    if (!modelSigs.has(r.modelId)) modelSigs.set(r.modelId, new Set());
    modelSigs.get(r.modelId)!.add(sig);
  }

  const seriesMap = new Map<string, SeriesEntry>();
  for (const r of results) {
    const info = runInfos.get(r.runId);
    const sig = paramsSignature(info?.parameters);
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

function barOptions(yLabel: string, opts: { min?: number; max?: number; showLegend?: boolean } = {}): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !!opts.showLegend, position: 'top', labels: { color: AXIS_COLOR } },
    },
    scales: {
      x: { ticks: { color: AXIS_COLOR, maxRotation: 45 }, grid: { color: GRID_COLOR } },
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

/**
 * Groups model-vs-settings comparison charts into two sections:
 * "Performance" (score, speed, execution time, score by test) and
 * "Cost" (token usage, turn counts, and a score-vs-tokens efficiency view).
 * Each (model, run parameters) combination becomes its own series so the
 * same model run with different settings shows up as separate bars/points.
 */
export function renderComparisonCharts(container: HTMLElement, results: ResultRow[], runInfos: RunParamInfo[]): void {
  const runInfoMap = new Map(runInfos.map(r => [r.runId, r]));
  const series = buildSeries(results, runInfoMap);

  if (series.length === 0) {
    container.innerHTML = '<p class="text-muted">No data to display for the current selection.</p>';
    return;
  }

  container.innerHTML = `
    <h2>Performance</h2>
    <div class="grid-2">
      <div class="chart-container"><h3>Average Score</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-score"></canvas></div></div>
      <div class="chart-container"><h3>Average Speed (tokens/s)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-speed"></canvas></div></div>
      <div class="chart-container"><h3>Total Execution Time (s)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-time"></canvas></div></div>
      <div class="chart-container"><h3>Score by Test</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-by-test"></canvas></div></div>
    </div>

    <h2 class="mt-1">Cost</h2>
    <div class="grid-3">
      <div class="chart-container"><h3>Average Output Tokens</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-gen"></canvas></div></div>
      <div class="chart-container"><h3>Average Total Tokens (Prompt + Output)</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-total"></canvas></div></div>
      <div class="chart-container"><h3>Average Turn Count</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-turns"></canvas></div></div>
    </div>
    <div class="grid-2">
      <div class="chart-container"><h3>Output Tokens by Test</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-tokens-by-test"></canvas></div></div>
      <div class="chart-container"><h3>Score vs Output Tokens</h3><div class="chart-canvas-wrap"><canvas id="cmp-chart-efficiency"></canvas></div></div>
    </div>
  `;

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
}
