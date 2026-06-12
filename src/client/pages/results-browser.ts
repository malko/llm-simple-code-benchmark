import { api } from '../api.js';

export async function renderResultsBrowser(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Results</h1><p>Loading...</p>';

  try {
    const resultsRes = await api.listResults();
    const results = resultsRes.data as Record<string, unknown>[];

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
          </div>
        </div>
        ${results.length === 0 ? '<p>No results yet.</p>' : `
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Test</th>
              <th>Model</th>
              <th>Status</th>
              <th>Speed</th>
              <th>Tokens</th>
              <th>Time</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="results-body">
            ${results.map(r => `
              <tr class="result-row" data-run="${r.runId}" data-test="${r.testName}" data-model="${r.modelId}">
                <td>${r.runName as string}</td>
                <td>${r.testName as string}</td>
                <td title="${r.modelId as string}">${(r.modelId as string)?.replace(/^.*[/:]/g, '').slice(0, 30)}</td>
                <td><span class="badge badge-${r.status as string}">${r.status as string}</span></td>
                <td class="text-mono">${(r.stats as Record<string, number>)?.tokenGenerationSpeed?.toFixed(1) ?? '—'} t/s</td>
                <td class="text-mono">${(r.stats as Record<string, number>)?.tokenGeneratedCount ?? '—'}</td>
                <td class="text-mono">${(r.stats as Record<string, number>)?.elapsedMs ? ((r.stats as Record<string, number>).elapsedMs / 1000).toFixed(1) + 's' : '—'}</td>
                <td><button class="btn btn-sm view-detail" data-run="${r.runId}" data-test="${r.testName}" data-model="${r.modelId}">View</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
      <div id="detail-modal"></div>
    `;

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
        (el as HTMLElement).style.display = matchRun && matchTest ? '' : 'none';
      });
    }

    filterRun.addEventListener('change', applyFilters);
    filterTest.addEventListener('input', applyFilters);

    container.querySelectorAll('.view-detail').forEach(btn => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement;
        const { run, test, model } = el.dataset;
        const detail = container.querySelector('#detail-modal')!;
        detail.innerHTML = '<p>Loading...</p>';
        try {
          const result = await api.getResult(run!, test!, model!);
          detail.innerHTML = `
            <div class="card">
              <div class="card-header">
                <h2>Result: ${test} / ${(model || '').replace(/^.*[/:]/g, '').slice(0, 40)}</h2>
                <button class="btn btn-sm" id="close-detail">Close</button>
              </div>
              <pre style="background:var(--surface2);padding:1rem;border-radius:var(--radius);overflow:auto;max-height:60vh;font-size:0.8rem">${JSON.stringify(result, null, 2)}</pre>
            </div>
          `;
          detail.querySelector('#close-detail')?.addEventListener('click', () => { detail.innerHTML = ''; });
        } catch (err) {
          detail.innerHTML = `<div class="card"><p>Error: ${(err as Error).message}</p></div>`;
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
