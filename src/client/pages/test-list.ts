import { api } from '../api.js';

export async function renderTestList(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Test Cases</h1><p>Loading...</p>';

  try {
    const res = await api.listTests();
    const tests = res.data;

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>All Tests</h2>
          <button class="btn btn-primary" id="new-test-btn">+ New Test</button>
        </div>
        ${tests.length === 0 ? '<p>No test cases yet. Click "New Test" to create one.</p>' : `
        <table>
          <thead><tr><th>Name</th><th>Prompt</th><th>Script</th><th>Actions</th></tr></thead>
          <tbody>
            ${tests.map(t => `
              <tr>
                <td><strong>${t.name}</strong></td>
                <td>${t.hasPrompt ? '✓' : '✗'}</td>
                <td>${t.hasScript ? '✓' : '✗'}</td>
                <td>
                  <a href="#/tests/${encodeURIComponent(t.name)}/edit" data-nav class="btn btn-sm">Edit</a>
                  <button class="btn btn-sm btn-danger delete-test" data-name="${t.name}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    container.querySelector('#new-test-btn')?.addEventListener('click', () => {
      const name = prompt('Test name (no spaces):');
      if (name && /^[a-zA-Z0-9_-]+$/.test(name)) {
        location.hash = `#/tests/${encodeURIComponent(name)}/edit`;
      } else if (name) {
        alert('Name must contain only letters, numbers, hyphens, and underscores.');
      }
    });

    container.querySelectorAll('.delete-test').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = (btn as HTMLElement).dataset.name!;
        if (confirm(`Delete test "${name}"?`)) {
          await api.deleteTest(name);
          location.reload();
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}
