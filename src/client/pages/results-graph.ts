import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { renderComparisonCharts, RunParamInfo } from '../components/comparison-charts.js';

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
          <div>
            <button class="btn btn-primary" id="update-graph">Update Graph</button>
          </div>
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
      <div id="charts-target"></div>
    `;

    container.querySelector('#update-graph')?.addEventListener('click', () => updateGraph(container));

    if (preselected.length > 0) {
      setTimeout(() => updateGraph(container), 100);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}

async function updateGraph(container: HTMLElement): Promise<void> {
  const checked = container.querySelectorAll('#run-selector input:checked');
  const runIds = Array.from(checked).map(c => (c as HTMLInputElement).value);

  const target = container.querySelector('#charts-target') as HTMLElement;
  if (!target) return;

  if (runIds.length === 0) {
    target.innerHTML = '<p class="text-muted">Select at least one run to compare.</p>';
    return;
  }

  target.innerHTML = '<p class="text-muted">Loading...</p>';

  try {
    const [resultsRes, runDetails] = await Promise.all([
      api.listResults({ runId: runIds.join(',') }),
      Promise.all(runIds.map(id => api.getRun(id))),
    ]);

    const results = resultsRes.data as unknown as ResultRow[];
    const runInfos: RunParamInfo[] = runDetails.filter(Boolean).map(run => {
      const r = run as unknown as { id: string; name: string; config?: { parameters?: Record<string, unknown> } };
      return { runId: r.id, runName: r.name, parameters: r.config?.parameters };
    });

    renderComparisonCharts(target, results, runInfos);
  } catch (err) {
    target.innerHTML = `<p>Error loading results: ${(err as Error).message}</p>`;
  }
}
