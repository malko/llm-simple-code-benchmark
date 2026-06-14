import { api } from '../api.js';
import { renderMarkdown, buildStandaloneHtml } from '../components/markdown.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function renderReports(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Reports</h1><p>Loading...</p>';

  try {
    const res = await api.listReports();
    const reports = res.data;

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Saved Analysis Reports</h2>
        </div>
        ${reports.length === 0 ? '<p>No saved reports yet. Generate one from the <a href="#/results/graph" data-nav>Graphs</a> page.</p>' : `
        <table>
          <thead><tr><th>Name</th><th>Model</th><th>Runs</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            ${reports.map(r => `
              <tr data-id="${r.id}">
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td class="text-mono">${escapeHtml(r.modelId)}</td>
                <td>${r.runIds.length}</td>
                <td>${escapeHtml(new Date(r.createdAt).toLocaleString())}</td>
                <td>
                  <button class="btn btn-sm view-report" data-id="${r.id}">View</button>
                  <button class="btn btn-sm export-report" data-id="${r.id}" data-name="${escapeHtml(r.name)}">Export</button>
                  <button class="btn btn-sm btn-danger delete-report" data-id="${r.id}">Delete</button>
                </td>
              </tr>
              <tr class="report-detail-row" data-detail-for="${r.id}" style="display:none">
                <td colspan="5"><div class="report-content card" style="max-height:600px; overflow:auto"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    container.querySelectorAll('.view-report').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const detailRow = container.querySelector(`.report-detail-row[data-detail-for="${id}"]`) as HTMLElement;
        const contentEl = detailRow.querySelector('.report-content') as HTMLElement;
        if (detailRow.style.display === 'none') {
          if (!contentEl.innerHTML) {
            contentEl.innerHTML = '<p class="text-muted">Loading...</p>';
            try {
              const report = await api.getReport(id);
              contentEl.innerHTML = renderMarkdown(report.content);
            } catch (err) {
              contentEl.innerHTML = `<p>Error: ${escapeHtml((err as Error).message)}</p>`;
            }
          }
          detailRow.style.display = '';
          (btn as HTMLElement).textContent = 'Hide';
        } else {
          detailRow.style.display = 'none';
          (btn as HTMLElement).textContent = 'View';
        }
      });
    });

    container.querySelectorAll('.export-report').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        const name = (btn as HTMLElement).dataset.name!;
        try {
          const report = await api.getReport(id);
          const html = buildStandaloneHtml(name, report.content);
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          alert(`Error exporting report: ${(err as Error).message}`);
        }
      });
    });

    container.querySelectorAll('.delete-report').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!;
        if (confirm('Delete this report?')) {
          await api.deleteReport(id);
          location.reload();
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
