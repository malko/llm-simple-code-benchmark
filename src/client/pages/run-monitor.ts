import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { buildResultsTable, buildResultRowPair } from '../components/results-table.js';
import { renderComparisonCharts, RunParamInfo } from '../components/comparison-charts.js';
import { initCollapsibleCards } from '../components/collapsible-cards.js';

export async function renderRunMonitor(params: Record<string, string>): Promise<HTMLElement> {
  const id = params.id;
  const container = document.createElement('div');
  container.innerHTML = '<h1>Run Detail</h1><p>Loading run...</p>';

  let runEvents: EventSource | null = null;
  let allResults: ResultRow[] = [];
  let runInfos: RunParamInfo[] = [];

  function renderProgress(run: Record<string, unknown>): void {
    const prog = run.progress as Record<string, unknown> || {};
    const pct = (prog.percentage as number) || 0;
    const status = run.status as string;

    const progressHtml = `
      <div class="card">
        <div class="card-header">
          <h2>${run.name as string}</h2>
          <span class="badge badge-${status}">${status}</span>
        </div>
        <p>${prog.currentOperation as string || 'Idle'}</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="flex gap-2 items-center">
          <span>Model ${(prog.currentModelIndex as number || 0) + 1}/${prog.totalModels}: <strong>${prog.currentModelId as string || '—'}</strong></span>
          <span>Test ${(prog.currentTestIndex as number || 0) + 1}/${prog.totalTests}: <strong>${prog.currentTestName as string || '—'}</strong></span>
          ${(prog.totalRepeats as number || 1) > 1 ? `<span>Repeat ${prog.currentRepeatIndex as number || 1}/${prog.totalRepeats}</span>` : ''}
          <span>${pct}%</span>
        </div>
      </div>
    `;

    const existing = container.querySelector('#progress-section');
    if (existing) {
      existing.innerHTML = progressHtml;
    }
  }

  function renderGraphs(): void {
    const target = container.querySelector('#graphs-target') as HTMLElement | null;
    if (!target) return;
    const filterSelect = container.querySelector('#graph-test-filter') as HTMLSelectElement | null;
    const testFilter = filterSelect?.value || '';
    const filtered = testFilter ? allResults.filter(r => r.testName === testFilter) : allResults;
    renderComparisonCharts(target, filtered, runInfos);
  }

  function rebuildResultsTable(): void {
    const wrap = container.querySelector('#results-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.appendChild(buildResultsTable(allResults, { showRunColumn: false }));
  }

  function addResult(result: Record<string, unknown>): void {
    const row = result as unknown as ResultRow;
    allResults.push(row);
    const tbody = container.querySelector('#results-table-wrap tbody');
    if (tbody) {
      const [tr, detailTr] = buildResultRowPair(row, { showRunColumn: false });
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
    } else {
      rebuildResultsTable();
    }
    renderGraphs();
  }

  function addLog(entry: string): void {
    const log = container.querySelector('#event-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'text-mono';
    div.textContent = entry;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function renderControls(run: Record<string, unknown>): void {
    const ctrl = container.querySelector('#controls-section');
    if (!ctrl) return;
    const status = run.status as string;
    const isActive = status === 'running' || status === 'pending';
    ctrl.innerHTML = `
      <div class="flex gap-1">
        ${isActive ? '<button class="btn btn-danger" id="stop-run-btn">Stop Run</button>' : ''}
        <button class="btn btn-danger" id="delete-run-btn">Delete</button>
        <a href="#/results/graph?runIds=${id}" data-nav class="btn btn-sm">Compare in Graphs</a>
        <a href="#/results" data-nav class="btn btn-sm">All Results</a>
      </div>
    `;

    ctrl.querySelector('#stop-run-btn')?.addEventListener('click', async () => {
      try {
        await api.cancelRun(id);
        addLog('→ Cancellation requested');
      } catch (err) {
        addLog(`→ Cancel error: ${(err as Error).message}`);
      }
    });

    ctrl.querySelector('#delete-run-btn')?.addEventListener('click', async () => {
      if (confirm('Delete this run and its output files?')) {
        try {
          await api.deleteRun(id);
          location.hash = '#/';
        } catch (err) {
          addLog(`→ Delete error: ${(err as Error).message}`);
        }
      }
    });
  }

  function initUI(run: Record<string, unknown>): void {
    const config = run.config as { testNames?: string[]; parameters?: Record<string, unknown> } || {};
    const testNames = config.testNames || [];
    runInfos = [{
      runId: run.id as string,
      runName: run.name as string,
      parameters: config.parameters,
      modelRuntimeInfo: run.modelRuntimeInfo as RunParamInfo['modelRuntimeInfo'],
    }];

    container.innerHTML = `
      <div id="progress-section"></div>
      <div class="card" id="controls-section"></div>
      <div class="card" id="graphs-section">
        <div class="card-header">
          <h2>Graphs</h2>
          <select id="graph-test-filter">
            <option value="">All Tests</option>
            ${testNames.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div id="graphs-target"></div>
      </div>
      <div class="card" id="results-section">
        <h2>Results</h2>
        <div id="results-table-wrap"></div>
      </div>
      <div class="card">
        <h2>Event Log</h2>
        <div id="event-log" style="max-height:300px;overflow-y:auto;background:var(--surface2);padding:0.5rem;border-radius:var(--radius);font-size:0.8rem"></div>
      </div>
    `;

    allResults = ((run.results as Record<string, unknown>[]) || []) as unknown as ResultRow[];
    rebuildResultsTable();
    renderGraphs();
    renderProgress(run);
    renderControls(run);

    container.querySelector('#graph-test-filter')?.addEventListener('change', renderGraphs);

    // Connect SSE
    const events = api.runEvents(id);
    runEvents = events;

    events.addEventListener('message', (msg) => {
      try {
        const event = JSON.parse(msg.data);
        addLog(`→ ${event.type}: ${JSON.stringify(event.data).slice(0, 120)}`);

        if (event.type === 'test-end') {
          addResult(event.data as Record<string, unknown>);
        }
        if (event.type === 'progress') {
          const runUpdate = { ...run, progress: event.data };
          renderProgress(runUpdate);
        }
        if (event.type === 'completed') {
          addLog(`→ Run ${event.data.status as string}`);
          const updated = { ...run, status: event.data.status, progress: { ...(run.progress as Record<string, unknown> || {}), percentage: 100 } };
          renderProgress(updated);
          renderControls(updated);
        }
        if (event.type === 'error') {
          addLog(`→ Error: ${event.data.error as string}`);
        }
      } catch { /* ignore parse errors */ }
    });

    events.addEventListener('error', () => {
      addLog('→ SSE connection lost. Refreshing...');
      setTimeout(async () => {
        const updated = await api.getRun(id);
        if (updated) {
          renderProgress(updated);
          renderControls(updated);
          allResults = ((updated.results as Record<string, unknown>[]) || []) as unknown as ResultRow[];
          rebuildResultsTable();
          renderGraphs();
        }
      }, 2000);
    });
  }

  try {
    const run = await api.getRun(id) as Record<string, unknown> | null;
    if (!run) {
      container.innerHTML = '<div class="empty-state"><h2>Run Not Found</h2><p>This run does not exist.</p></div>';
      return container;
    }
    initUI(run);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  // Cleanup on unmount
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      runEvents?.close();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  return container;
}
