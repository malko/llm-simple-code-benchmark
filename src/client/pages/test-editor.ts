import { api } from '../api.js';
import { loadMonaco } from '../components/monaco-loader.js';

export async function renderTestEditor(params: Record<string, string>): Promise<HTMLElement> {
  const name = params.name;
  const container = document.createElement('div');
  container.innerHTML = `<h1>Edit Test: ${name}</h1><p>Loading...</p>`;

  let promptData = '';
  let scriptData = `import fs from 'fs';
import path from 'path';

const outputDir = process.argv[2];
const resultsPath = path.join(outputDir, 'results.json');
const turnsPath = path.join(outputDir, 'turns.json');

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
const output = { passed: true, score: 1.0, details: { test: 'basic' } };
console.log(JSON.stringify(output));
`;

  try {
    const test = await api.getTest(name);
    if (test) {
      promptData = test.prompt;
      scriptData = test.script;
    }
  } catch { /* new test */ }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${name}</h2>
          <p style="font-size:0.8rem;margin:0">Test name (directory in tests/)</p>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-success" id="save-test-btn">Save</button>
          <a href="#/tests" data-nav class="btn">Back</a>
        </div>
      </div>
    </div>
    <div class="editor-grid">
      <div class="editor-pane">
        <h3>prompt.txt</h3>
        <div class="monaco-wrap" id="prompt-editor"></div>
      </div>
      <div class="editor-pane">
        <h3>test.ts</h3>
        <div class="monaco-wrap" id="script-editor"></div>
      </div>
    </div>
  `;

  loadMonacoEditors(container, name, promptData, scriptData);
  return container;
}

async function loadMonacoEditors(
  container: HTMLElement,
  name: string,
  promptContent: string,
  scriptContent: string,
): Promise<void> {
  const monaco = await loadMonaco();

  const promptEl = container.querySelector('#prompt-editor') as HTMLElement;
  const scriptEl = container.querySelector('#script-editor') as HTMLElement;

  const promptEditor = monaco.editor.create(promptEl, {
    value: promptContent,
    language: 'markdown',
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 13,
    automaticLayout: true,
  });

  const scriptEditor = monaco.editor.create(scriptEl, {
    value: scriptContent,
    language: 'typescript',
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 13,
    automaticLayout: true,
  });

  const saveBtn = container.querySelector('#save-test-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await api.saveTest(name, promptEditor.getValue(), scriptEditor.getValue());
      saveBtn.textContent = 'Saved!';
      setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 2000);
    } catch (err) {
      saveBtn.textContent = 'Error!';
      alert((err as Error).message);
      saveBtn.disabled = false;
    }
  });
}
