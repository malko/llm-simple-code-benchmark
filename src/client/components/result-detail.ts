import { ResultRow } from './result-types.js';
import { renderFileViewer } from './file-viewer.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function renderResultDetail(row: ResultRow): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'result-detail';

  const stats = row.stats;
  const output = row.testOutput;
  const details = output?.details || {};
  const checks = (details.checks as Record<string, boolean> | undefined) || {};
  const otherDetails = Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'checks'));

  container.innerHTML = `
    <div class="result-detail-grid">
      <div class="result-detail-info">
        <h3>Stats</h3>
        <table class="stats-table">
          <tr><td>Status</td><td><span class="badge badge-${row.status}">${row.status}</span></td></tr>
          ${row.repeatCount && row.repeatCount > 1 ? `<tr><td>Repeat</td><td>${row.repeatIndex ?? '—'} / ${row.repeatCount}</td></tr>` : ''}
          ${output?.score !== undefined ? `<tr><td>Score</td><td>${(output.score * 100).toFixed(1)}%</td></tr>` : ''}
          <tr><td>Turns</td><td>${stats?.turnCount ?? '—'}</td></tr>
          <tr><td>Tokens generated</td><td>${stats?.tokenGeneratedCount ?? '—'}</td></tr>
          <tr><td>Prompt tokens</td><td>${stats?.promptTokensCount ?? '—'}</td></tr>
          <tr><td>Generation speed</td><td>${stats?.tokenGenerationSpeed?.toFixed(1) ?? '—'} t/s</td></tr>
          <tr><td>Prompt speed</td><td>${stats?.promptProcessingSpeed?.toFixed(1) ?? '—'} t/s</td></tr>
          <tr><td>Elapsed</td><td>${stats?.elapsedMs ? (stats.elapsedMs / 1000).toFixed(1) + 's' : '—'}</td></tr>
        </table>
        ${Object.keys(checks).length > 0 ? `
        <h3>Checks</h3>
        <ul class="checks-list">
          ${Object.entries(checks).map(([name, passed]) => `
            <li class="${passed ? 'check-pass' : 'check-fail'}">
              <span class="check-icon">${passed ? '✓' : '✗'}</span> ${escapeHtml(name)}
            </li>
          `).join('')}
        </ul>` : ''}
        ${Object.keys(otherDetails).length > 0 ? `
        <h3>Details</h3>
        <pre class="details-json">${escapeHtml(JSON.stringify(otherDetails, null, 2))}</pre>` : ''}
        ${row.error ? `<h3>Error</h3><pre class="details-json">${escapeHtml(row.error)}</pre>` : ''}
      </div>
      <div class="result-detail-files">
        <h3>Output Files</h3>
        <div class="file-viewer-target"><p class="text-muted">Loading...</p></div>
      </div>
    </div>
  `;

  const target = container.querySelector('.file-viewer-target')!;
  const preferred = typeof details.sourcePath === 'string' ? details.sourcePath as string : undefined;
  const viewer = await renderFileViewer(row.runId, row.testName, row.modelId, preferred, row.repeatIndex);
  target.innerHTML = '';
  target.appendChild(viewer);

  return container;
}
