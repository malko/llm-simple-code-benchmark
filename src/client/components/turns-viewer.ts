import { api } from '../api.js';

interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

interface Turn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function renderTurn(turn: Turn, index: number): string {
  const role = turn.role;
  const isSystem = role === 'system';
  const isAssistant = role === 'assistant';
  const isTool = role === 'tool';
  const isUser = role === 'user';

  let inner = '';

  if (turn.reasoning_content) {
    inner += `<details class="turn-reasoning">
      <summary>Thinking</summary>
      <pre class="turn-pre">${escapeHtml(turn.reasoning_content)}</pre>
    </details>`;
  }

  if (turn.content) {
    inner += `<pre class="turn-pre turn-content">${escapeHtml(turn.content)}</pre>`;
  }

  if (turn.tool_calls?.length) {
    for (const tc of turn.tool_calls) {
      const args = prettyJson(tc.function.arguments);
      inner += `<div class="turn-tool-call">
        <span class="turn-tool-name">${escapeHtml(tc.function.name)}</span>
        <pre class="turn-pre turn-tool-args">${escapeHtml(args)}</pre>
      </div>`;
    }
  }

  if (!inner) inner = '<em class="text-muted">(empty)</em>';

  const roleLabel = isTool ? (turn.name ?? 'tool') : role;

  return `<div class="turn turn-${role}" data-index="${index}">
    <div class="turn-header">
      <span class="turn-role turn-role-${role}">${escapeHtml(roleLabel)}</span>
      ${isSystem ? `<button class="turn-toggle btn-link" data-target="turn-body-${index}">show</button>` : ''}
    </div>
    <div class="turn-body" id="turn-body-${index}" ${isSystem ? 'style="display:none"' : ''}>${inner}</div>
  </div>`;
}

export async function renderTurnsViewer(
  runId: string,
  testName: string,
  modelId: string,
  repeatIndex?: number,
): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'turns-viewer';
  container.innerHTML = '<p class="text-muted">Loading turns...</p>';

  let turns: Turn[];
  try {
    const res = await api.getResultTurns(runId, testName, modelId, repeatIndex);
    turns = res.data as Turn[];
  } catch (err) {
    container.innerHTML = `<p class="text-muted">Error loading turns: ${escapeHtml((err as Error).message)}</p>`;
    return container;
  }

  if (!turns.length) {
    container.innerHTML = '<p class="text-muted">No turns recorded.</p>';
    return container;
  }

  container.innerHTML = `
    <div class="turns-list">
      ${turns.map((t, i) => renderTurn(t, i)).join('')}
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('.turn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target!;
      const body = container.querySelector<HTMLElement>(`#${targetId}`)!;
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      btn.textContent = hidden ? 'hide' : 'show';
    });
  });

  return container;
}
