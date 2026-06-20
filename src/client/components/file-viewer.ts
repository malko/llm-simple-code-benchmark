import { api } from '../api.js';
import { loadMonaco, languageForFile } from './monaco-loader.js';

export async function renderFileViewer(
  runId: string,
  testName: string,
  modelId: string,
  preferredFile?: string,
  repeatIndex?: number,
): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'file-viewer';
  container.innerHTML = '<p class="text-muted">Loading files...</p>';

  let files: string[];
  try {
    const res = await api.getResultFiles(runId, testName, modelId, repeatIndex);
    files = res.data;
  } catch (err) {
    container.innerHTML = `<p>Error loading files: ${(err as Error).message}</p>`;
    return container;
  }

  if (files.length === 0) {
    container.innerHTML = '<p class="text-muted">No output files.</p>';
    return container;
  }

  files.sort((a, b) => {
    const aDir = a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : '';
    const bDir = b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : '';
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = `
    <div class="file-viewer-layout">
      <div class="file-list">
        ${files.map(f => `<div class="file-item" data-path="${f}">${f}</div>`).join('')}
      </div>
      <div class="file-content">
        <div class="monaco-wrap" id="file-monaco"></div>
      </div>
    </div>
  `;

  const monacoEl = container.querySelector('#file-monaco') as HTMLElement;
  const monaco = await loadMonaco();
  const editor = monaco.editor.create(monacoEl, {
    value: '',
    language: 'plaintext',
    theme: 'vs-dark',
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
    automaticLayout: true,
  });

  const selectFile = async (filePath: string): Promise<void> => {
    container.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', (el as HTMLElement).dataset.path === filePath);
    });
    try {
      const { content } = await api.getResultFileContent(runId, testName, modelId, filePath, repeatIndex);
      monaco.editor.setModelLanguage(editor.getModel()!, languageForFile(filePath));
      editor.setValue(content);
    } catch (err) {
      editor.setValue(`Error loading file: ${(err as Error).message}`);
    }
  };

  container.querySelectorAll('.file-item').forEach(el => {
    el.addEventListener('click', () => selectFile((el as HTMLElement).dataset.path!));
  });

  const initial = preferredFile && files.includes(preferredFile) ? preferredFile : files[0];
  await selectFile(initial);

  return container;
}
