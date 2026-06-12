import { api } from '../api.js';

export async function renderSettings(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Settings</h1><p>Loading...</p>';

  try {
    const settings = await api.getSettings();

    container.innerHTML = `
      <div class="card" style="max-width:600px">
        <h2>LLM Server Connection</h2>
        <div class="form-group">
          <label for="server-url">Server URL</label>
          <input id="server-url" type="text" value="${escapeHtml(settings.llamaServerUrl)}" placeholder="http://host.docker.internal:8080" />
        </div>
        <div class="form-group">
          <label for="api-key">API Key <span style="color:var(--text2)">(optional)</span></label>
          <input id="api-key" type="password" value="${escapeHtml(settings.llamaApiKey)}" placeholder="sk-..." />
        </div>
        <div class="flex gap-1 items-center">
          <button id="save-settings" class="btn btn-primary">Save</button>
          <button id="test-connection" class="btn">Test Connection</button>
          <span id="connection-status" style="font-size:0.85rem"></span>
        </div>
      </div>
    `;

    const urlInput = container.querySelector('#server-url') as HTMLInputElement;
    const keyInput = container.querySelector('#api-key') as HTMLInputElement;
    const saveBtn = container.querySelector('#save-settings') as HTMLButtonElement;
    const testBtn = container.querySelector('#test-connection') as HTMLButtonElement;
    const statusEl = container.querySelector('#connection-status') as HTMLSpanElement;

    function setStatus(ok: boolean, msg: string) {
      statusEl.style.color = ok ? 'var(--success)' : 'var(--error)';
      statusEl.textContent = msg;
    }

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        await api.saveSettings({
          llamaServerUrl: urlInput.value,
          llamaApiKey: keyInput.value,
        });
        setStatus(true, 'Settings saved');
      } catch (err) {
        setStatus(false, `Save failed: ${(err as Error).message}`);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      setStatus(false, '');
      try {
        const result = await api.testSettings({
          llamaServerUrl: urlInput.value,
          llamaApiKey: keyInput.value,
        });
        setStatus(result.reachable, result.reachable ? 'Connected' : 'Unreachable');
      } catch (err) {
        setStatus(false, `Error: ${(err as Error).message}`);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
