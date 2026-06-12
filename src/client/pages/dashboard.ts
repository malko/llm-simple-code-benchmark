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
          <thead><tr><th>Name</th><th>Status</th><th>Progress</th><th>Results</th><th>Date</th></tr></thead>
          <tbody>
            ${runs.slice(0, 10).map(r => `
              <tr onclick="location.hash='#/run/${r.id}'" style="cursor:pointer">
                <td>${r.name}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td>${r.progress?.percentage ?? 0}%</td>
                <td>${r.resultCount}/${r.modelCount * r.testCount}</td>
                <td>${new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
