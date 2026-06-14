import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { renderComparisonCharts, RunParamInfo } from '../components/comparison-charts.js';

interface GraphState {
  allResults: ResultRow[];
  runInfos: RunParamInfo[];
  excludedTests: Set<string>;
  excludedModels: Set<string>;
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
      <div class="card">
        <div class="card-header">
          <h2>Compare Results</h2>
        </div>
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
      </div>
      <div class="card" id="filters-card" style="display:none">
        <div class="card-header"><h2>Filters</h2></div>
        <div class="grid-2">
          <div>
            <h3>Tests</h3>
            <div class="selector-list" id="test-filter" style="max-height:200px"></div>
          </div>
          <div>
            <h3>Models</h3>
            <div class="selector-list" id="model-filter" style="max-height:200px"></div>
          </div>
        </div>
      </div>
      <div id="charts-target"></div>
    `;

    const state: GraphState = {
      allResults: [],
      runInfos: [],
      excludedTests: new Set(),
      excludedModels: new Set(),
    };

    container.querySelector('#run-selector')?.addEventListener('change', () => refreshResults(container, state));

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
      const r = run as unknown as { id: string; name: string; config?: { parameters?: Record<string, unknown> } };
      return { runId: r.id, runName: r.name, parameters: r.config?.parameters };
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

  renderComparisonCharts(target, filtered, state.runInfos);
}
