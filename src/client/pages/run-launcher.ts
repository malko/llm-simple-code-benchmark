import { api } from '../api.js';

const MODEL_STORAGE_KEY = 'llm-code-bench:selected-models';
const PARAM_STORAGE_KEY = 'llm-code-bench:run-params';

function getSelected(listId: string): string[] {
  const list = document.querySelector(listId);
  if (!list) return [];
  const checks = list.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checks).map(c => (c as HTMLInputElement).value);
}

const PARAM_DEFAULTS: Record<string, { value: number; min?: number; max?: number; step: number; label: string }> = {
  temperature: { value: 0.8, min: 0, max: 2, step: 0.05, label: 'Temperature' },
  maxTokens: { value: 2048, min: 1, max: 32768, step: 1, label: 'Max Tokens' },
  topP: { value: 0.95, min: 0, max: 1, step: 0.01, label: 'Top P' },
  topK: { value: 40, min: 0, max: 200, step: 1, label: 'Top K' },
  minP: { value: 0.05, min: 0, max: 1, step: 0.01, label: 'Min P' },
  repeatPenalty: { value: 1.1, min: 1, max: 2, step: 0.05, label: 'Repeat Penalty' },
  seed: { value: -1, step: 1, label: 'Seed (-1 = random)' },
  maxTurns: { value: 50, min: 1, max: 500, step: 1, label: 'Max Turns (tool calls)' },
  timeout: { value: 300, min: 10, max: 3600, step: 1, label: 'Timeout (seconds)' },
};

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

    const savedModelIds: string[] = JSON.parse(localStorage.getItem(MODEL_STORAGE_KEY) || '[]');
    const savedParams: Record<string, { value: number; enabled: boolean }> = JSON.parse(localStorage.getItem(PARAM_STORAGE_KEY) || '{}');

    function paramState(name: string): { value: number; enabled: boolean } {
      const s = savedParams[name];
      if (s) return s;
      const d = PARAM_DEFAULTS[name];
      return { value: d?.value ?? 0, enabled: true };
    }

    function attr(obj: { min?: number; max?: number; step: number }): string {
      return `step="${obj.step}"${obj.min !== undefined ? ` min="${obj.min}"` : ''}${obj.max !== undefined ? ` max="${obj.max}"` : ''}`;
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
          ${Object.entries(PARAM_DEFAULTS).map(([name, def]) => {
            const st = paramState(name);
            return `
            <div class="form-group param-with-toggle">
              <label class="param-toggle">
                <input type="checkbox" class="param-enable" data-param="${name}" ${st.enabled ? 'checked' : ''}>
                <span>${def.label}</span>
              </label>
              <input type="number" id="param-${name}" value="${st.value}" ${attr(def)}>
            </div>
            `;
          }).join('')}
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

      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(modelIds));

      const paramState: Record<string, { value: number; enabled: boolean }> = {};
      const parameters: Record<string, number> = {};

      container.querySelectorAll('.param-enable').forEach(cb => {
        const paramName = (cb as HTMLElement).dataset.param!;
        const input = (cb as HTMLElement).closest('.form-group')?.querySelector('input:not(.param-enable)') as HTMLInputElement;
        if (!input) return;
        const val = input.value.includes('.') ? parseFloat(input.value) : parseInt(input.value, 10);
        const enabled = (cb as HTMLInputElement).checked;
        paramState[paramName] = { value: val, enabled };
        if (enabled) parameters[paramName] = val;
      });

      localStorage.setItem(PARAM_STORAGE_KEY, JSON.stringify(paramState));

      const config = { name, modelIds, testNames, parameters };

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