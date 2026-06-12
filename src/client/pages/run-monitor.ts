import { api } from '../api.js';

export async function renderRunMonitor(params: Record<string, string>): Promise<HTMLElement> {
  const id = params.id;
  const container = document.createElement('div');
  container.innerHTML = '<h1>Run Monitor</h1><p>Loading run...</p>';

  let runEvents: EventSource | null = null;
  let currentRun: Record<string, unknown> | null = null;

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
          <span>${pct}%</span>
        </div>
      </div>
    `;

    const existing = container.querySelector('#progress-section');
    if (existing) {
      existing.innerHTML = progressHtml;
    }
  }

  function addResult(result: Record<string, unknown>): void {
    const tbody = container.querySelector('#results-tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${result.testName as string}</td>
      <td>${(result.modelId as string)?.replace(/^.*[/:]/, '…')}</td>
      <td><span class="badge badge-${result.status as string}">${result.status as string}</span></td>
      <td class="text-mono">${(result.stats as Record<string, number>)?.tokenGenerationSpeed?.toFixed(1) ?? '—'} t/s</td>
      <td class="text-mono">${(result.stats as Record<string, number>)?.elapsedMs ? ((result.stats as Record<string, number>).elapsedMs / 1000).toFixed(1) + 's' : '—'}</td>
    `;
    tbody.appendChild(tr);
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

  function initUI(run: Record<string, unknown>): void {
    container.innerHTML = `
      <div id="progress-section"></div>
      <div class="card" id="controls-section">
        <button class="btn btn-danger" id="stop-run-btn">Stop Run</button>
      </div>
      <div class="card" id="results-section">
        <h2>Results</h2>
        <table>
          <thead><tr><th>Test</th><th>Model</th><th>Status</th><th>Speed</th><th>Time</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>
      </div>
      <div class="card">
        <h2>Event Log</h2>
        <div id="event-log" style="max-height:300px;overflow-y:auto;background:var(--surface2);padding:0.5rem;border-radius:var(--radius);font-size:0.8rem"></div>
      </div>
    `;

    // Add existing results
    const results = (run.results as Record<string, unknown>[]) || [];
    results.forEach(addResult);
    renderProgress(run);

    container.querySelector('#stop-run-btn')?.addEventListener('click', async () => {
      try {
        await api.cancelRun(id);
        addLog('→ Cancellation requested');
      } catch (err) {
        addLog(`→ Cancel error: ${(err as Error).message}`);
      }
    });

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
          currentRun = runUpdate;
          renderProgress(runUpdate);
        }
        if (event.type === 'completed') {
          addLog(`→ Run ${event.data.status as string}`);
          renderProgress({ ...run, status: event.data.status, progress: { percentage: 100 } });
          (container.querySelector('#stop-run-btn') as HTMLButtonElement)?.remove();
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
          currentRun = updated;
          renderProgress(updated);
          const results = (updated.results as Record<string, unknown>[]) || [];
          const tbody = container.querySelector('#results-tbody');
          if (tbody) tbody.innerHTML = '';
          results.forEach(addResult);
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
    currentRun = run;
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
