import { api } from '../api.js';

export async function renderRunLauncher(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>New Run</h1><p>Loading...</p>';

  try {
    const [modelsRes, testsRes] = await Promise.all([
      api.listModels(),
      api.listTests(),
    ]);

    const models = modelsRes.data;
    const tests = testsRes.data;

    if (tests.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No Tests Defined</h2>
          <p>Create a test case before launching a run.</p>
          <a href="#/tests" data-nav class="btn btn-primary">Create Test</a>
        </div>
      `;
      return container;
    }

    container.innerHTML = `
      <div class="card">
        <h2>Run Configuration</h2>
        <div class="form-group">
          <label>Run Name</label>
          <input type="text" id="run-name" value="run-${Date.now()}" placeholder="my-run-name">
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h2>Select Models</h2>
          <p>Choose models from the llama server</p>
          ${models.length === 0 ? '<p>No models available. Check llama server connection.</p>' : `
          <div class="selector-list" id="model-list">
            ${models.map((m, i) => `
              <label class="selector-item">
                <input type="checkbox" value="${m.id}" ${i === 0 ? 'checked' : ''}>
                <span>${m.id}</span>
                <span class="badge badge-${m.status} ml-1">${m.status}</span>
              </label>
            `).join('')}
          </div>
          `}
        </div>

        <div class="card">
          <h2>Select Tests</h2>
          <div class="selector-list" id="test-list">
            ${tests.map((t, i) => `
              <label class="selector-item">
                <input type="checkbox" value="${t.name}" ${i === 0 ? 'checked' : ''}>
                <span>${t.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Parameters</h2>
        <div class="run-params">
          <div class="form-group">
            <label>Temperature</label>
            <input type="number" id="param-temperature" value="0.8" step="0.05" min="0" max="2">
          </div>
          <div class="form-group">
            <label>Max Tokens</label>
            <input type="number" id="param-max-tokens" value="2048" step="1" min="1" max="32768">
          </div>
          <div class="form-group">
            <label>Top P</label>
            <input type="number" id="param-top-p" value="0.95" step="0.01" min="0" max="1">
          </div>
          <div class="form-group">
            <label>Top K</label>
            <input type="number" id="param-top-k" value="40" step="1" min="0" max="200">
          </div>
          <div class="form-group">
            <label>Min P</label>
            <input type="number" id="param-min-p" value="0.05" step="0.01" min="0" max="1">
          </div>
          <div class="form-group">
            <label>Repeat Penalty</label>
            <input type="number" id="param-repeat-penalty" value="1.1" step="0.05" min="1" max="2">
          </div>
          <div class="form-group">
            <label>Seed (-1 = random)</label>
            <input type="number" id="param-seed" value="-1" step="1">
          </div>
          <div class="form-group">
            <label>Max Turns (tool calls)</label>
            <input type="number" id="param-max-turns" value="50" step="1" min="1" max="500">
          </div>
          <div class="form-group">
            <label>Timeout (seconds)</label>
            <input type="number" id="param-timeout" value="300" step="1" min="10" max="3600">
          </div>
        </div>
      </div>

      <div class="card">
        <button class="btn btn-primary btn-success" id="launch-btn">Launch Run</button>
      </div>
    `;

    container.querySelector('#launch-btn')?.addEventListener('click', async () => {
      const modelIds = getSelected('#model-list');
      const testNames = getSelected('#test-list');

      if (modelIds.length === 0) { alert('Select at least one model.'); return; }
      if (testNames.length === 0) { alert('Select at least one test.'); return; }

      const name = (container.querySelector('#run-name') as HTMLInputElement).value.trim();
      if (!name) { alert('Enter a run name.'); return; }

      const config = {
        name,
        modelIds,
        testNames,
        parameters: {
          temperature: parseFloat((container.querySelector('#param-temperature') as HTMLInputElement).value),
          maxTokens: parseInt((container.querySelector('#param-max-tokens') as HTMLInputElement).value),
          topP: parseFloat((container.querySelector('#param-top-p') as HTMLInputElement).value),
          topK: parseInt((container.querySelector('#param-top-k') as HTMLInputElement).value),
          minP: parseFloat((container.querySelector('#param-min-p') as HTMLInputElement).value),
          repeatPenalty: parseFloat((container.querySelector('#param-repeat-penalty') as HTMLInputElement).value),
          seed: parseInt((container.querySelector('#param-seed') as HTMLInputElement).value),
          timeout: parseInt((container.querySelector('#param-timeout') as HTMLInputElement).value),
          maxTurns: parseInt((container.querySelector('#param-max-turns') as HTMLInputElement).value),
        },
      };

      try {
        const run = await api.createRun(config);
        location.hash = `#/run/${(run as any).id}`;
      } catch (err) {
        alert(`Failed to launch: ${(err as Error).message}`);
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}

function getSelected(listId: string): string[] {
  const list = document.querySelector(listId);
  if (!list) return [];
  const checks = list.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checks).map(c => (c as HTMLInputElement).value);
}
