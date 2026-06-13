import { api } from '../api.js';

const STORAGE_KEY = 'llm-code-bench:selected-models';

function getSelected(listId: string): string[] {
  const list = document.querySelector(listId);
  if (!list) return [];
  const checks = list.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checks).map(c => (c as HTMLInputElement).value);
}

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

    const savedModelIds: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

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
            ${models.map(m => `
              <label class="selector-item">
                <input type="checkbox" value="${m.id}" ${savedModelIds.includes(m.id) ? 'checked' : ''}>
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
        <p class="text-muted">Check a parameter to override the server default, uncheck to let the server decide.</p>
        <div class="run-params">
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="temperature" checked>
              <span>Temperature</span>
            </label>
            <input type="number" id="param-temperature" value="0.8" step="0.05" min="0" max="2">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="maxTokens" checked>
              <span>Max Tokens</span>
            </label>
            <input type="number" id="param-max-tokens" value="2048" step="1" min="1" max="32768">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="topP" checked>
              <span>Top P</span>
            </label>
            <input type="number" id="param-top-p" value="0.95" step="0.01" min="0" max="1">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="topK" checked>
              <span>Top K</span>
            </label>
            <input type="number" id="param-top-k" value="40" step="1" min="0" max="200">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="minP" checked>
              <span>Min P</span>
            </label>
            <input type="number" id="param-min-p" value="0.05" step="0.01" min="0" max="1">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="repeatPenalty" checked>
              <span>Repeat Penalty</span>
            </label>
            <input type="number" id="param-repeat-penalty" value="1.1" step="0.05" min="1" max="2">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="seed" checked>
              <span>Seed (-1 = random)</span>
            </label>
            <input type="number" id="param-seed" value="-1" step="1">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="maxTurns" checked>
              <span>Max Turns (tool calls)</span>
            </label>
            <input type="number" id="param-max-turns" value="50" step="1" min="1" max="500">
          </div>
          <div class="form-group param-with-toggle">
            <label class="param-toggle">
              <input type="checkbox" class="param-enable" data-param="timeout" checked>
              <span>Timeout (seconds)</span>
            </label>
            <input type="number" id="param-timeout" value="300" step="1" min="10" max="3600">
          </div>
        </div>
      </div>

      <div class="card">
        <button class="btn btn-primary btn-success" id="launch-btn">Launch Run</button>
      </div>
    `;

    container.querySelectorAll('.param-enable').forEach(cb => {
      cb.addEventListener('change', () => {
        const input = (cb as HTMLElement).closest('.form-group')?.querySelector('input:not(.param-enable)') as HTMLInputElement;
        if (input) input.disabled = !(cb as HTMLInputElement).checked;
      });
      const evt = new Event('change');
      cb.dispatchEvent(evt);
    });

    container.querySelector('#launch-btn')?.addEventListener('click', async () => {
      const modelIds = getSelected('#model-list');
      const testNames = getSelected('#test-list');

      if (modelIds.length === 0) { alert('Select at least one model.'); return; }
      if (testNames.length === 0) { alert('Select at least one test.'); return; }

      const name = (container.querySelector('#run-name') as HTMLInputElement).value.trim();
      if (!name) { alert('Enter a run name.'); return; }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(modelIds));

      const parameters: Record<string, number> = {};
      container.querySelectorAll('.param-enable:checked').forEach(cb => {
        const paramName = (cb as HTMLElement).dataset.param!;
        const input = (cb as HTMLElement).closest('.form-group')?.querySelector('input:not(.param-enable)') as HTMLInputElement;
        if (!input) return;
        const val = input.type === 'number' && input.value.includes('.') ? parseFloat(input.value) : parseInt(input.value, 10);
        parameters[paramName] = val;
      });

      const config = {
        name,
        modelIds,
        testNames,
        parameters,
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
