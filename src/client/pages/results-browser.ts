import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { buildResultsTable } from '../components/results-table.js';

export async function renderResultsBrowser(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Results</h1><p>Loading...</p>';

  try {
    const resultsRes = await api.listResults();
    const results = resultsRes.data as unknown as ResultRow[];

    const runsRes = await api.listRuns();
    const runs = runsRes.data;

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>All Results</h2>
          <div class="flex gap-1">
            <select id="filter-run">
              <option value="">All runs</option>
              ${runs.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
            </select>
            <input type="text" id="filter-test" placeholder="Filter test name..." style="width:200px">
            <a href="#/results/graph" data-nav class="btn btn-sm">Graph</a>
          </div>
        </div>
        ${results.length === 0 ? '<p>No results yet.</p>' : '<div id="results-table-wrap"></div>'}
      </div>
    `;

    if (results.length > 0) {
      const wrap = container.querySelector('#results-table-wrap')!;
      wrap.appendChild(buildResultsTable(results, { showRunColumn: true }));
    }

    const filterRun = container.querySelector('#filter-run') as HTMLSelectElement;
    const filterTest = container.querySelector('#filter-test') as HTMLInputElement;

    function applyFilters(): void {
      const rows = container.querySelectorAll('.result-row');
      const runFilter = filterRun.value;
      const testFilter = filterTest.value.toLowerCase();
      rows.forEach(row => {
        const el = row as HTMLElement;
        const matchRun = !runFilter || el.dataset.run === runFilter;
        const matchTest = !testFilter || (el.dataset.test || '').toLowerCase().includes(testFilter);
        const visible = matchRun && matchTest;
        el.style.display = visible ? '' : 'none';
        const detailRow = el.nextElementSibling as HTMLElement | null;
        if (detailRow?.classList.contains('result-detail-row') && !visible) {
          detailRow.style.display = 'none';
          el.classList.remove('expanded');
        }
      });
    }

    filterRun.addEventListener('change', applyFilters);
    filterTest.addEventListener('input', applyFilters);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
