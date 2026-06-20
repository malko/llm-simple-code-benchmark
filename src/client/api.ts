const BASE = '/api';

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Tests
  listTests: () => request<{ data: { name: string; hasPrompt: boolean; hasScript: boolean }[] }>('/tests'),
  getTest: (name: string) => request<{ name: string; prompt: string; script: string }>(`/tests/${encodeURIComponent(name)}`),
  saveTest: (name: string, prompt: string, script: string) =>
    request<{ success: boolean }>(`/tests/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ prompt, script }),
    }),
  deleteTest: (name: string) =>
    request<{ success: boolean }>(`/tests/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // Models
  listModels: () => request<{ data: { id: string; status: string; meta?: Record<string, unknown> }[] }>('/models'),
  health: () => request<{ status: string }>('/models/health'),

  // Runs
  listRuns: () => request<{ data: { id: string; name: string; status: string; createdAt: string; progress: Record<string, unknown>; modelCount: number; testCount: number; repeatCount: number; resultCount: number; passedCount: number }[] }>('/runs'),
  getRun: (id: string) => request<Record<string, unknown>>(`/runs/${encodeURIComponent(id)}`),
  createRun: (config: Record<string, unknown>) =>
    request<Record<string, unknown>>('/runs', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  cancelRun: (id: string) =>
    request<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  skipTest: (id: string, testName: string, modelId: string, repeatIndex?: number) =>
    request<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/skip-test`, {
      method: 'POST',
      body: JSON.stringify({ testName, modelId, repeatIndex }),
    }),
  deleteRun: (id: string) =>
    request<{ success: boolean }>(`/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  runEvents: (id: string): EventSource =>
    new EventSource(`${BASE}/runs/${encodeURIComponent(id)}/events`),

  // Results
  listResults: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ data: Record<string, unknown>[] }>('/results' + qs);
  },
  getResult: (runId: string, testName: string, modelId: string, repeat?: number) =>
    request<Record<string, unknown>>(`/results/${encodeURIComponent(runId)}/${encodeURIComponent(testName)}/${encodeURIComponent(modelId)}${repeat !== undefined ? `?repeat=${repeat}` : ''}`),
  getResultFiles: (runId: string, testName: string, modelId: string, repeat?: number) =>
    request<{ data: string[] }>(`/results/${encodeURIComponent(runId)}/${encodeURIComponent(testName)}/${encodeURIComponent(modelId)}/files${repeat !== undefined ? `?repeat=${repeat}` : ''}`),
  getResultFileContent: (runId: string, testName: string, modelId: string, filePath: string, repeat?: number) =>
    request<{ path: string; content: string }>(`/results/${encodeURIComponent(runId)}/${encodeURIComponent(testName)}/${encodeURIComponent(modelId)}/file?path=${encodeURIComponent(filePath)}${repeat !== undefined ? `&repeat=${repeat}` : ''}`),
  getResultTurns: (runId: string, testName: string, modelId: string, repeat?: number) =>
    request<{ data: unknown[] }>(`/results/${encodeURIComponent(runId)}/${encodeURIComponent(testName)}/${encodeURIComponent(modelId)}/turns${repeat !== undefined ? `?repeat=${repeat}` : ''}`),
  getRawResult: (runId: string, testName: string, modelId: string, repeat?: number) =>
    request<Record<string, unknown>>(`/results/${encodeURIComponent(runId)}/${encodeURIComponent(testName)}/${encodeURIComponent(modelId)}/raw${repeat !== undefined ? `?repeat=${repeat}` : ''}`),
  getStats: () => request<Record<string, number>>('/results/stats'),

  // Reports
  generateReport: (payload: {
    analysisModelId: string;
    runIds: string[];
    excludedTests?: string[];
    excludedModels?: string[];
    splitMode?: string;
    splitSettingKey?: string;
  }) =>
    request<{ name: string; content: string; modelId: string; runIds: string[] }>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listReports: () => request<{ data: { id: string; name: string; createdAt: string; modelId: string; runIds: string[] }[] }>('/reports'),
  getReport: (id: string) =>
    request<{ id: string; name: string; createdAt: string; modelId: string; runIds: string[]; content: string }>(`/reports/${encodeURIComponent(id)}`),
  saveReport: (payload: { name: string; modelId: string; runIds: string[]; content: string }) =>
    request<{ id: string; name: string; createdAt: string; modelId: string; runIds: string[]; content: string }>('/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteReport: (id: string) =>
    request<{ success: boolean }>(`/reports/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<{ llamaServerUrl: string; llamaApiKey: string }>('/settings'),
  saveSettings: (settings: { llamaServerUrl: string; llamaApiKey: string }) =>
    request<{ success: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  testSettings: (settings: { llamaServerUrl: string; llamaApiKey: string }) =>
    request<{ reachable: boolean }>('/settings/test', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
};
