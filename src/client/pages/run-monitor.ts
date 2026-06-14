import { api } from '../api.js';
import { ResultRow } from '../components/result-types.js';
import { buildResultsTable, buildResultRowPair, ResultsTableOptions } from '../components/results-table.js';
import { renderComparisonCharts, RunParamInfo } from '../components/comparison-charts.js';

function rowKey(r: { testName: string; modelId: string; repeatIndex?: number; repeatCount?: number }): string {
  const ri = (r.repeatCount && r.repeatCount > 1) ? r.repeatIndex : undefined;
  return `${r.modelId}::${r.testName}::${ri ?? ''}`;
}

/** Builds the full (model x test x repeat) queue from the run config, then overlays any results already recorded. */
function buildQueue(run: Record<string, unknown>): ResultRow[] {
  const config = run.config as { modelIds?: string[]; testNames?: string[]; parameters?: Record<string, unknown> } || {};
  const modelIds = config.modelIds || [];
  const testNames = config.testNames || [];
  const repeatCount = Math.max(1, (config.parameters?.repeatCount as number) || 1);

  const queue: ResultRow[] = [];
  for (const modelId of modelIds) {
    for (const testName of testNames) {
      for (let ri = 1; ri <= repeatCount; ri++) {
        queue.push({
          runId: run.id as string,
          testName,
          modelId,
          status: 'pending',
          repeatIndex: repeatCount > 1 ? ri : undefined,
          repeatCount,
        });
      }
    }
  }

  for (const result of (run.results as Record<string, unknown>[]) || []) {
    const row = result as unknown as ResultRow;
    const key = rowKey(row);
    const idx = queue.findIndex(q => rowKey(q) === key && q.status === 'pending');
    if (idx >= 0) queue[idx] = row;
  }
  return queue;
}

export async function renderRunMonitor(params: Record<string, string>): Promise<HTMLElement> {
  const id = params.id;
  const container = document.createElement('div');
  container.innerHTML = '<h1>Run Detail</h1><p>Loading run...</p>';

  let runEvents: EventSource | null = null;
  let allResults: ResultRow[] = [];
  let runInfos: RunParamInfo[] = [];
  let runName = '';
  let currentStatus = 'pending';
  let currentProgress: Record<string, unknown> = {};
  const rowElements = new Map<string, [HTMLTableRowElement, HTMLTableRowElement]>();

  async function handleSkip(row: ResultRow): Promise<void> {
    try {
      await api.skipTest(id, row.testName, row.modelId, row.repeatIndex);
      const label = row.status === 'running' ? 'Stop' : 'Skip';
      addLog(`→ ${label} requested: ${row.testName} / ${row.modelId}${row.repeatIndex ? ` #${row.repeatIndex}` : ''}`);
    } catch (err) {
      addLog(`→ Skip/Stop error: ${(err as Error).message}`);
    }
  }

  const tableOpts: ResultsTableOptions = { showRunColumn: false, onSkip: handleSkip };

  function renderProgress(): void {
    const pct = (currentProgress.percentage as number) || 0;

    const progressHtml = `
      <div class="card">
        <div class="card-header">
          <h2>${runName}</h2>
          <span class="badge badge-${currentStatus}">${currentStatus}</span>
        </div>
        <p>${currentProgress.currentOperation as string || 'Idle'}</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="flex gap-2 items-center">
          <span>Model ${(currentProgress.currentModelIndex as number || 0) + 1}/${currentProgress.totalModels}: <strong>${currentProgress.currentModelId as string || '—'}</strong></span>
          <span>Test ${(currentProgress.currentTestIndex as number || 0) + 1}/${currentProgress.totalTests}: <strong>${currentProgress.currentTestName as string || '—'}</strong></span>
          ${(currentProgress.totalRepeats as number || 1) > 1 ? `<span>Repeat ${currentProgress.currentRepeatIndex as number || 1}/${currentProgress.totalRepeats}</span>` : ''}
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
    const completed = allResults.filter(r => r.status !== 'pending' && r.status !== 'running');
    const filtered = testFilter ? completed.filter(r => r.testName === testFilter) : completed;
    renderComparisonCharts(target, filtered, runInfos);
  }

  function rebuildResultsTable(): void {
    const wrap = container.querySelector('#results-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    rowElements.clear();
    const table = buildResultsTable(allResults, tableOpts);
    wrap.appendChild(table);
    const rows = Array.from(table.querySelectorAll('tbody > tr')) as HTMLTableRowElement[];
    for (let i = 0; i < allResults.length; i++) {
      rowElements.set(rowKey(allResults[i]), [rows[i * 2], rows[i * 2 + 1]]);
    }
  }

  /** Replaces a single row in place (preserving its expanded/collapsed state and reloading details if it was open). */
  function updateRow(updatedRow: ResultRow): void {
    const key = rowKey(updatedRow);
    const idx = allResults.findIndex(r => rowKey(r) === key);
    if (idx < 0) return;
    allResults[idx] = updatedRow;

    const [newTr, newDetailTr] = buildResultRowPair(updatedRow, tableOpts);
    const old = rowElements.get(key);
    if (old) {
      const [oldTr, oldDetailTr] = old;
      const wasExpanded = oldDetailTr.style.display !== 'none';
      oldTr.replaceWith(newTr);
      oldDetailTr.replaceWith(newDetailTr);
      if (wasExpanded) newTr.click();
    } else {
      const tbody = container.querySelector('#results-table-wrap tbody');
      tbody?.appendChild(newTr);
      tbody?.appendChild(newDetailTr);
    }
    rowElements.set(key, [newTr, newDetailTr]);
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

  function renderControls(): void {
    const ctrlEl = container.querySelector('#controls-section');
    if (!ctrlEl) return;
    const isActive = currentStatus === 'running' || currentStatus === 'pending';
    ctrlEl.innerHTML = `
      <div class="flex gap-1">
        ${isActive ? '<button class="btn btn-danger" id="stop-run-btn">Stop Run</button>' : ''}
        <button class="btn btn-danger" id="delete-run-btn">Delete</button>
        <a href="#/results/graph?runIds=${id}" data-nav class="btn btn-sm">Compare in Graphs</a>
        <a href="#/results" data-nav class="btn btn-sm">All Results</a>
      </div>
    `;

    ctrlEl.querySelector('#stop-run-btn')?.addEventListener('click', async () => {
      try {
        await api.cancelRun(id);
        addLog('→ Cancellation requested');
      } catch (err) {
        addLog(`→ Cancel error: ${(err as Error).message}`);
      }
    });

    ctrlEl.querySelector('#delete-run-btn')?.addEventListener('click', async () => {
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
    runName = run.name as string;
    currentStatus = run.status as string;
    currentProgress = (run.progress as Record<string, unknown>) || {};
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

    allResults = buildQueue(run);
    rebuildResultsTable();
    renderGraphs();
    renderProgress();
    renderControls();

    container.querySelector('#graph-test-filter')?.addEventListener('change', renderGraphs);

    // Connect SSE
    const events = api.runEvents(id);
    runEvents = events;

    events.addEventListener('message', (msg) => {
      try {
        const event = JSON.parse(msg.data);
        addLog(`→ ${event.type}: ${JSON.stringify(event.data).slice(0, 120)}`);

        if (event.type === 'model-switch') {
          const data = event.data as { modelId: string; modelIndex: number; totalModels: number };
          currentProgress = {
            ...currentProgress,
            currentModelId: data.modelId,
            currentModelIndex: data.modelIndex,
            totalModels: data.totalModels,
            currentOperation: `Loading model ${data.modelId}...`,
          };
          renderProgress();
        }

        if (event.type === 'test-start') {
          const data = event.data as { testName: string; modelId: string; repeatIndex?: number; repeatCount?: number };
          const key = rowKey(data);
          const existing = allResults.find(r => rowKey(r) === key);
          if (existing) {
            updateRow({ ...existing, status: 'running', startedAt: new Date().toISOString() });
          }
        }

        if (event.type === 'test-end') {
          updateRow(event.data as unknown as ResultRow);
          renderGraphs();
        }

        if (event.type === 'progress') {
          currentProgress = event.data as Record<string, unknown>;
          renderProgress();
        }

        if (event.type === 'completed') {
          currentStatus = event.data.status as string;
          currentProgress = { ...currentProgress, percentage: 100 };
          addLog(`→ Run ${currentStatus}`);
          renderProgress();
          renderControls();

          if (currentStatus === 'cancelled') {
            const now = new Date().toISOString();
            for (const row of [...allResults]) {
              if (row.status === 'pending' || row.status === 'running') {
                updateRow({ ...row, status: 'cancelled', completedAt: now });
              }
            }
          }
        }

        if (event.type === 'error') {
          const data = event.data as { testName?: string; modelId?: string; error: string };
          addLog(`→ Error: ${data.error}`);
          if (data.testName && data.modelId) {
            const now = new Date().toISOString();
            for (const row of [...allResults]) {
              if (row.modelId === data.modelId && row.testName === data.testName && (row.status === 'pending' || row.status === 'running')) {
                updateRow({ ...row, status: 'error', error: data.error, completedAt: now });
              }
            }
          }
        }
      } catch { /* ignore parse errors */ }
    });

    events.addEventListener('error', () => {
      addLog('→ SSE connection lost. Refreshing...');
      setTimeout(async () => {
        const updated = await api.getRun(id) as Record<string, unknown> | null;
        if (updated) {
          runName = updated.name as string;
          currentStatus = updated.status as string;
          currentProgress = (updated.progress as Record<string, unknown>) || {};
          renderProgress();
          renderControls();
          allResults = buildQueue(updated);
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
