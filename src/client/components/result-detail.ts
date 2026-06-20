import { ResultRow } from './result-types.js';
import { renderFileViewer } from './file-viewer.js';
import { renderTurnsViewer } from './turns-viewer.js';
import { api } from '../api.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

type TabId = 'files' | 'turns' | 'raw';

export async function renderResultDetail(row: ResultRow): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'result-detail';

  const stats = row.stats;
  const output = row.testOutput;
  const details = output?.details || {};
  const checks = (details.checks as Record<string, boolean> | undefined) || {};
  const otherDetails = Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'checks'));

  const statItems = [
    `<span class="stat-item"><span class="stat-label">Status</span> <span class="badge badge-${row.status}">${row.status}</span></span>`,
    row.repeatCount && row.repeatCount > 1
      ? `<span class="stat-item"><span class="stat-label">Repeat</span> ${row.repeatIndex ?? '—'}/${row.repeatCount}</span>`
      : '',
    output?.score !== undefined
      ? `<span class="stat-item"><span class="stat-label">Score</span> ${(output.score * 100).toFixed(1)}%</span>`
      : '',
    `<span class="stat-item"><span class="stat-label">Turns</span> ${stats?.turnCount ?? '—'}</span>`,
    `<span class="stat-item"><span class="stat-label">Generated</span> ${stats?.tokenGeneratedCount ?? '—'} tok</span>`,
    `<span class="stat-item"><span class="stat-label">Prompt</span> ${stats?.promptTokensCount ?? '—'} tok</span>`,
    stats?.tokenGenerationSpeed !== undefined
      ? `<span class="stat-item"><span class="stat-label">Gen speed</span> ${stats.tokenGenerationSpeed.toFixed(1)} t/s</span>`
      : '',
    stats?.promptProcessingSpeed !== undefined
      ? `<span class="stat-item"><span class="stat-label">PP speed</span> ${stats.promptProcessingSpeed.toFixed(1)} t/s</span>`
      : '',
    stats?.elapsedMs !== undefined
      ? `<span class="stat-item"><span class="stat-label">Elapsed</span> ${(stats.elapsedMs / 1000).toFixed(1)}s</span>`
      : '',
  ].filter(Boolean).join('');

  const checksHtml = Object.keys(checks).length > 0
    ? `<div class="result-checks-bar">
        ${Object.entries(checks).map(([name, passed]) => `
          <span class="check-chip ${passed ? 'check-pass' : 'check-fail'}">
            <span class="check-icon">${passed ? '✓' : '✗'}</span> ${escapeHtml(name)}
          </span>
        `).join('')}
       </div>`
    : '';

  const extraHtml = Object.keys(otherDetails).length > 0
    ? `<div class="failure-details">
        <span class="failure-details-label">Failure Details</span>
        <pre class="details-json details-json-error">${escapeHtml(JSON.stringify(otherDetails, null, 2))}</pre>
       </div>`
    : '';

  const errorHtml = row.error
    ? `<div class="failure-details">
        <span class="failure-details-label">Error</span>
        <pre class="details-json details-json-error">${escapeHtml(row.error)}</pre>
       </div>`
    : '';

  container.innerHTML = `
    <div class="result-meta">
      <div class="result-stats-bar">${statItems}</div>
      ${checksHtml}
      ${extraHtml}
      ${errorHtml}
    </div>
    <div class="detail-tabs">
      <button class="detail-tab active" data-tab="raw">results.json</button>
      <button class="detail-tab" data-tab="turns">LLM Turns</button>
      <button class="detail-tab" data-tab="files">Output Files</button>
    </div>
    <div class="detail-tab-content" data-panel="raw"><p class="text-muted">Loading...</p></div>
    <div class="detail-tab-content" data-panel="turns" style="display:none"></div>
    <div class="detail-tab-content" data-panel="files" style="display:none"></div>
  `;

  const preferred = typeof details.sourcePath === 'string' ? details.sourcePath as string : undefined;
  const filesPanel = container.querySelector<HTMLElement>('[data-panel="files"]')!;
  const turnsPanel = container.querySelector<HTMLElement>('[data-panel="turns"]')!;
  const rawPanel = container.querySelector<HTMLElement>('[data-panel="raw"]')!;

  const loaded = new Set<TabId>();

  const loadTab = async (tab: TabId): Promise<void> => {
    if (loaded.has(tab)) return;
    loaded.add(tab);

    if (tab === 'files') {
      const viewer = await renderFileViewer(row.runId, row.testName, row.modelId, preferred, row.repeatIndex);
      filesPanel.innerHTML = '';
      filesPanel.appendChild(viewer);
    } else if (tab === 'turns') {
      const viewer = await renderTurnsViewer(row.runId, row.testName, row.modelId, row.repeatIndex);
      turnsPanel.appendChild(viewer);
    } else if (tab === 'raw') {
      try {
        const data = await api.getRawResult(row.runId, row.testName, row.modelId, row.repeatIndex);
        rawPanel.innerHTML = `<pre class="details-json raw-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      } catch (err) {
        rawPanel.innerHTML = `<p class="text-muted">Error: ${escapeHtml((err as Error).message)}</p>`;
      }
    }
  };

  container.querySelectorAll<HTMLButtonElement>('.detail-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab as TabId;
      [filesPanel, turnsPanel, rawPanel].forEach(p => (p.style.display = 'none'));
      const panel = container.querySelector<HTMLElement>(`[data-panel="${tab}"]`)!;
      panel.style.display = '';
      await loadTab(tab);
    });
  });

  await loadTab('raw');

  return container;
}
