import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { renderComparisonCharts, RunParamInfo, SplitMode, getDifferingSettingKeys } from '../components/comparison-charts.js';
import { renderMarkdown, buildStandaloneHtml } from '../components/markdown.js';

interface GraphState {
  allResults: ResultRow[];
  runInfos: RunParamInfo[];
  excludedTests: Set<string>;
  excludedModels: Set<string>;
  splitMode: SplitMode;
  splitSettingKey: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function renderResultsGraph(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Results Graph</h1><p>Loading...</p>';

  try {
    const runsRes = await api.listRuns();
    const runs = runsRes.data;

    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const preselected = params.get('runIds')?.split(',').filter(Boolean) || [];

    container.innerHTML = `
      <details class="card" open>
        <summary><h2>Compare Results</h2></summary>
        <p>Select runs to compare. Same model run with different parameters across runs is shown as a separate series.</p>
        <div class="selector-list" id="run-selector" style="max-height:200px">
          ${runs.map(r => `
            <label class="selector-item">
              <input type="checkbox" value="${r.id}" ${preselected.includes(r.id) ? 'checked' : ''}>
              <span>${r.name}</span>
              <span class="badge badge-${r.status} ml-1">${r.status}</span>
            </label>
          `).join('')}
        </div>
      </details>
      <details class="card" id="filters-card" style="display:none" open>
        <summary><h2>Filters</h2></summary>
        <div class="grid-3">
          <div>
            <h3>Tests</h3>
            <div class="selector-list" id="test-filter" style="max-height:200px"></div>
          </div>
          <div>
            <h3>Models</h3>
            <div class="selector-list" id="model-filter" style="max-height:200px"></div>
          </div>
          <div>
            <h3>Group series by</h3>
            <select id="split-mode-filter">
              <option value="auto">Auto (split when settings differ)</option>
              <option value="run">Always split by run</option>
              <option value="model">Model only (merge across runs)</option>
            </select>
            <p class="text-muted">Controls how runs of the same model are grouped into series in the charts below.</p>
          </div>
        </div>
        <div class="form-group mt-1">
          <h3>Split charts by setting</h3>
          <select id="setting-split-filter">
            <option value="">None</option>
          </select>
          <p class="text-muted">When the selection contains different settings, isolate the impact of a single setting on a model: charts are grouped per model with all other settings held constant, varying only this setting.</p>
        </div>
      </details>
      <div id="charts-target"></div>

      <details class="card" id="analysis-card" open>
        <summary><h2>Analysis</h2></summary>
        <p class="text-muted">Generate a detailed report on the current selection (selected runs, with the filters above applied) using a model from your llama.cpp server.</p>
        <div class="form-row">
          <div class="form-group">
            <label>Analysis model</label>
            <select id="analysis-model"><option value="">Loading models…</option></select>
          </div>
        </div>
        <div class="flex gap-1 items-center mb-1">
          <button class="btn btn-primary" id="generate-analysis-btn">Generate Analysis</button>
          <span id="analysis-status" class="text-muted"></span>
        </div>
        <div id="analysis-result" style="display:none">
          <div class="flex gap-1 items-center mb-1 mt-1">
            <input id="analysis-report-name" placeholder="Report name" style="flex:1">
            <button class="btn" id="save-analysis-btn">Save Report</button>
            <button class="btn" id="export-analysis-btn">Export HTML</button>
          </div>
          <div id="analysis-content" class="card" style="max-height:600px; overflow:auto"></div>
        </div>
      </details>
    `;

    const state: GraphState = {
      allResults: [],
      runInfos: [],
      excludedTests: new Set(),
      excludedModels: new Set(),
      splitMode: 'auto',
      splitSettingKey: '',
    };

    container.querySelector('#run-selector')?.addEventListener('change', () => refreshResults(container, state));
    container.querySelector('#split-mode-filter')?.addEventListener('change', (e) => {
      state.splitMode = (e.target as HTMLSelectElement).value as SplitMode;
      applyFilters(container, state);
    });
    container.querySelector('#setting-split-filter')?.addEventListener('change', (e) => {
      state.splitSettingKey = (e.target as HTMLSelectElement).value;
      applyFilters(container, state);
    });

    setupAnalysisSection(container, state);

    if (preselected.length > 0) {
      await refreshResults(container, state);
    } else {
      showEmptySelection(container);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}

function showEmptySelection(container: HTMLElement): void {
  const target = container.querySelector('#charts-target') as HTMLElement;
  if (target) target.innerHTML = '<p class="text-muted">Select at least one run to compare.</p>';

  const filtersCard = container.querySelector('#filters-card') as HTMLElement;
  if (filtersCard) filtersCard.style.display = 'none';
}

async function refreshResults(container: HTMLElement, state: GraphState): Promise<void> {
  const checked = container.querySelectorAll('#run-selector input:checked');
  const runIds = Array.from(checked).map(c => (c as HTMLInputElement).value);

  const target = container.querySelector('#charts-target') as HTMLElement;
  if (!target) return;

  if (runIds.length === 0) {
    showEmptySelection(container);
    return;
  }

  target.innerHTML = '<p class="text-muted">Loading...</p>';

  try {
    const [resultsRes, runDetails] = await Promise.all([
      api.listResults({ runId: runIds.join(',') }),
      Promise.all(runIds.map(id => api.getRun(id))),
    ]);

    state.allResults = resultsRes.data as unknown as ResultRow[];
    state.runInfos = runDetails.filter(Boolean).map(run => {
      const r = run as unknown as {
        id: string;
        name: string;
        config?: { parameters?: Record<string, unknown> };
        modelRuntimeInfo?: RunParamInfo['modelRuntimeInfo'];
      };
      return { runId: r.id, runName: r.name, parameters: r.config?.parameters, modelRuntimeInfo: r.modelRuntimeInfo };
    });

    renderFilters(container, state);
    applyFilters(container, state);
  } catch (err) {
    target.innerHTML = `<p>Error loading results: ${(err as Error).message}</p>`;
  }
}

function renderFilters(container: HTMLElement, state: GraphState): void {
  const filtersCard = container.querySelector('#filters-card') as HTMLElement;
  const testFilter = container.querySelector('#test-filter') as HTMLElement;
  const modelFilter = container.querySelector('#model-filter') as HTMLElement;
  if (!filtersCard || !testFilter || !modelFilter) return;

  if (state.allResults.length === 0) {
    filtersCard.style.display = 'none';
    return;
  }
  filtersCard.style.display = '';

  const testNames = Array.from(new Set(state.allResults.map(r => r.testName))).sort();
  const modelIds = Array.from(new Set(state.allResults.map(r => r.modelId))).sort();

  testFilter.innerHTML = testNames.map(name => `
    <label class="selector-item">
      <input type="checkbox" value="${name}" ${state.excludedTests.has(name) ? '' : 'checked'}>
      <span>${name}</span>
    </label>
  `).join('');

  modelFilter.innerHTML = modelIds.map(id => `
    <label class="selector-item">
      <input type="checkbox" value="${id}" ${state.excludedModels.has(id) ? '' : 'checked'}>
      <span>${id}</span>
    </label>
  `).join('');

  testFilter.querySelectorAll('input[type="checkbox"]').forEach(el => {
    const input = el as HTMLInputElement;
    input.addEventListener('change', () => {
      if (input.checked) state.excludedTests.delete(input.value);
      else state.excludedTests.add(input.value);
      applyFilters(container, state);
    });
  });

  modelFilter.querySelectorAll('input[type="checkbox"]').forEach(el => {
    const input = el as HTMLInputElement;
    input.addEventListener('change', () => {
      if (input.checked) state.excludedModels.delete(input.value);
      else state.excludedModels.add(input.value);
      applyFilters(container, state);
    });
  });

  const settingSplitFilter = container.querySelector('#setting-split-filter') as HTMLSelectElement | null;
  if (settingSplitFilter) {
    const keys = getDifferingSettingKeys(state.allResults, state.runInfos);
    settingSplitFilter.innerHTML = '<option value="">None</option>'
      + keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
    if (keys.includes(state.splitSettingKey)) {
      settingSplitFilter.value = state.splitSettingKey;
    } else {
      state.splitSettingKey = '';
      settingSplitFilter.value = '';
    }
  }
}

function applyFilters(container: HTMLElement, state: GraphState): void {
  const target = container.querySelector('#charts-target') as HTMLElement;
  if (!target) return;

  const filtered = state.allResults.filter(
    r => !state.excludedTests.has(r.testName) && !state.excludedModels.has(r.modelId)
  );

  if (filtered.length === 0) {
    target.innerHTML = '<p class="text-muted">No data to display for the current selection.</p>';
    return;
  }

  renderComparisonCharts(target, filtered, state.runInfos, state.splitMode, state.splitSettingKey || undefined);
}

function setupAnalysisSection(container: HTMLElement, state: GraphState): void {
  const modelSelect = container.querySelector('#analysis-model') as HTMLSelectElement;
  const generateBtn = container.querySelector('#generate-analysis-btn') as HTMLButtonElement;
  const statusEl = container.querySelector('#analysis-status') as HTMLElement;
  const resultEl = container.querySelector('#analysis-result') as HTMLElement;
  const contentEl = container.querySelector('#analysis-content') as HTMLElement;
  const nameInput = container.querySelector('#analysis-report-name') as HTMLInputElement;
  const saveBtn = container.querySelector('#save-analysis-btn') as HTMLButtonElement;
  const exportBtn = container.querySelector('#export-analysis-btn') as HTMLButtonElement;
  if (!modelSelect || !generateBtn) return;

  let lastReport: { name: string; content: string; modelId: string; runIds: string[] } | null = null;

  api.listModels().then(res => {
    if (res.data.length === 0) {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      generateBtn.disabled = true;
      return;
    }
    modelSelect.innerHTML = res.data.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}</option>`).join('');
  }).catch(() => {
    modelSelect.innerHTML = '<option value="">Cannot reach llama server</option>';
    generateBtn.disabled = true;
  });

  generateBtn.addEventListener('click', async () => {
    const checked = container.querySelectorAll('#run-selector input:checked');
    const runIds = Array.from(checked).map(c => (c as HTMLInputElement).value);
    const analysisModelId = modelSelect.value;

    if (runIds.length === 0) {
      statusEl.textContent = 'Select at least one run to compare first.';
      return;
    }
    if (!analysisModelId) {
      statusEl.textContent = 'Select a model to generate the analysis with.';
      return;
    }

    generateBtn.disabled = true;
    resultEl.style.display = 'none';
    statusEl.textContent = 'Generating analysis… this loads the model on the llama.cpp server and may take a while.';

    try {
      const report = await api.generateReport({
        analysisModelId,
        runIds,
        excludedTests: Array.from(state.excludedTests),
        excludedModels: Array.from(state.excludedModels),
        splitMode: state.splitMode,
        splitSettingKey: state.splitSettingKey || undefined,
      });
      lastReport = report;
      contentEl.innerHTML = renderMarkdown(report.content);
      nameInput.value = report.name;
      resultEl.style.display = '';
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = `Error: ${(err as Error).message}`;
    } finally {
      generateBtn.disabled = false;
    }
  });

  saveBtn?.addEventListener('click', async () => {
    if (!lastReport) return;
    const name = nameInput.value.trim() || lastReport.name;
    saveBtn.disabled = true;
    try {
      await api.saveReport({ name, modelId: lastReport.modelId, runIds: lastReport.runIds, content: lastReport.content });
      statusEl.textContent = `Report saved as "${name}". View it in the Reports section.`;
    } catch (err) {
      statusEl.textContent = `Error saving report: ${(err as Error).message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });

  exportBtn?.addEventListener('click', () => {
    if (!lastReport) return;
    const name = nameInput.value.trim() || lastReport.name;
    const html = buildStandaloneHtml(name, lastReport.content);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
