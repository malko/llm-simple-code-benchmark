import { api } from '../api.js';

export async function renderDashboard(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Dashboard</h1><p>Loading...</p>';

  try {
    const [runsRes, statsRes, testsRes] = await Promise.all([
      api.listRuns(),
      api.getStats(),
      api.listTests(),
    ]);

    const stats = statsRes as Record<string, number>;
    const runs = runsRes.data;
    const tests = testsRes.data;

    container.innerHTML = `
      <div class="grid-3 mb-1">
        <div class="card">
          <h2>${runs.length}</h2>
          <p>Total Runs</p>
        </div>
        <div class="card">
          <h2>${stats.passedResults || 0}</h2>
          <p>Passed Tests</p>
        </div>
        <div class="card">
          <h2>${tests.length}</h2>
          <p>Test Cases</p>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2>Recent Runs</h2>
          <a href="#/run" data-nav class="btn btn-primary btn-sm">New Run</a>
        </div>
        ${runs.length === 0 ? '<p>No runs yet. <a href="#/run" data-nav>Create your first run</a>.</p>' : `
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Progress</th><th>Passed</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${runs.slice(0, 10).map(r => {
              const total = r.modelCount * r.testCount * (r.repeatCount ?? 1);
              const passed = r.passedCount ?? 0;
              const date = new Date(r.createdAt).toLocaleDateString();
              return '<tr>'
                + `<td><a href="#/run/${r.id}" data-nav>${r.name}</a></td>`
                + `<td><span class="badge badge-${r.status}">${r.status}</span></td>`
                + `<td>${r.progress?.percentage ?? 0}%</td>`
                + `<td>${passed}/${total}</td>`
                + `<td>${date}</td>`
                + `<td><button class="btn btn-sm btn-danger delete-run" data-id="${r.id}" data-name="${r.name}">Delete</button></td>`
                + '</tr>';
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    container.querySelectorAll('.delete-run').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        const id = el.dataset.id!;
        const name = el.dataset.name!;
        if (confirm(`Delete run "${name}"? This will remove the run and its output files.`)) {
          try {
            await api.deleteRun(id);
            location.reload();
          } catch (err) {
            alert(`Failed to delete run: ${(err as Error).message}`);
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
