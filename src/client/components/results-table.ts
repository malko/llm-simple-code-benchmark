import { ResultRow } from './result-types.js';
import { renderResultDetail } from './result-detail.js';

export interface ResultsTableOptions {
  showRunColumn?: boolean;
  /** When provided, adds an "Action" column with Skip/Stop buttons for pending/running rows. */
  onSkip?: (row: ResultRow) => void;
}

const COLUMN_COUNT_BASE = 8; // Test, Model, Run, Status, Score, Speed, Tokens, Time

function shortModelName(modelId: string): string {
  return (modelId || '').replace(/^.*[/:]/g, '').slice(0, 30);
}

function formatScore(row: ResultRow): string {
  const score = row.testOutput?.score;
  return score === undefined ? '—' : `${(score * 100).toFixed(0)}%`;
}

/** Builds a [data row, detail row] pair. The detail row is hidden and lazily filled on first click. */
export function buildResultRowPair(row: ResultRow, opts: ResultsTableOptions = {}): [HTMLTableRowElement, HTMLTableRowElement] {
  const tr = document.createElement('tr');
  tr.className = 'result-row clickable-row';
  tr.dataset.run = row.runId;
  tr.dataset.test = row.testName;
  tr.dataset.model = row.modelId;

  const stats = row.stats;
  let actionCell = '';
  if (opts.onSkip) {
    if (row.status === 'pending') {
      actionCell = '<td><button class="btn btn-sm skip-btn">Skip</button></td>';
    } else if (row.status === 'running') {
      actionCell = '<td><button class="btn btn-sm btn-danger stop-btn">Stop</button></td>';
    } else {
      actionCell = '<td></td>';
    }
  }
  tr.innerHTML = `
    ${opts.showRunColumn ? `<td>${row.runName}</td>` : ''}
    <td>${row.testName}</td>
    <td title="${row.modelId}">${shortModelName(row.modelId)}</td>
    <td class="text-mono">${row.repeatCount && row.repeatCount > 1 ? `${row.repeatIndex ?? '—'}/${row.repeatCount}` : '—'}</td>
    <td><span class="badge badge-${row.status}">${row.status}</span></td>
    <td class="text-mono">${formatScore(row)}</td>
    <td class="text-mono">${stats?.tokenGenerationSpeed?.toFixed(1) ?? '—'} t/s</td>
    <td class="text-mono">${stats?.tokenGeneratedCount ?? '—'}</td>
    <td class="text-mono">${stats?.elapsedMs ? (stats.elapsedMs / 1000).toFixed(1) + 's' : '—'}</td>
    ${actionCell}
  `;

  if (opts.onSkip) {
    tr.querySelector('.skip-btn, .stop-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSkip!(row);
    });
  }

  const detailTr = document.createElement('tr');
  detailTr.className = 'result-detail-row';
  detailTr.style.display = 'none';
  const detailTd = document.createElement('td');
  detailTd.colSpan = COLUMN_COUNT_BASE + (opts.showRunColumn ? 1 : 0) + (opts.onSkip ? 1 : 0);
  detailTr.appendChild(detailTd);

  tr.addEventListener('click', () => {
    const isOpen = detailTr.style.display !== 'none';
    if (isOpen) {
      detailTr.style.display = 'none';
      tr.classList.remove('expanded');
      return;
    }
    detailTr.style.display = '';
    tr.classList.add('expanded');
    if (!detailTd.dataset.loaded) {
      detailTd.dataset.loaded = '1';
      detailTd.innerHTML = '<p class="text-muted">Loading...</p>';
      renderResultDetail(row).then(el => {
        detailTd.innerHTML = '';
        detailTd.appendChild(el);
      }).catch(err => {
        detailTd.innerHTML = `<p>Error: ${(err as Error).message}</p>`;
      });
    }
  });

  return [tr, detailTr];
}

export function buildResultsTable(results: ResultRow[], opts: ResultsTableOptions = {}): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'results-table';
  table.innerHTML = `
    <thead>
      <tr>
        ${opts.showRunColumn ? '<th>Run</th>' : ''}
        <th>Test</th>
        <th>Model</th>
        <th>Repeat</th>
        <th>Status</th>
        <th>Score</th>
        <th>Speed</th>
        <th>Tokens</th>
        <th>Time</th>
        ${opts.onSkip ? '<th>Action</th>' : ''}
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody')!;
  for (const row of results) {
    const [tr, detailTr] = buildResultRowPair(row, opts);
    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  }
  return table;
}
