import { LlamaChatResponse, ChatMessage, ModelInfo, ToolDefinition, Settings } from '../types.js';

const ENV_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8080';
const ENV_KEY = process.env.LLAMA_API_KEY || '';

function resolveUrl(settings?: Pick<Settings, 'llamaServerUrl'>): string {
  return settings?.llamaServerUrl?.trim() || ENV_URL;
}

function resolveHeaders(settings?: Pick<Settings, 'llamaApiKey'>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = settings?.llamaApiKey?.trim() || ENV_KEY;
  if (key) headers['Authorization'] = `Bearer ${key}`;
  return headers;
}

export const llamaclient = {
  async listModels(settings?: Settings): Promise<ModelInfo[]> {
    const url = resolveUrl(settings);
    const headers = resolveHeaders(settings);
    const res = await fetch(`${url}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
    const body = await res.json();
    return (body.data || []).map((m: Record<string, unknown>) => {
      const status = m.status as Record<string, unknown> | undefined;
      return {
        id: m.id as string,
        path: m.path as string | undefined,
        status: ((status?.value as string) || 'unknown') as ModelInfo['status'],
        args: status?.args as string[] | undefined,
        meta: m.meta as Record<string, unknown> | undefined,
        architecture: m.architecture as Record<string, unknown> | undefined,
      };
    });
  },

  async chat(
    modelId: string,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    params: {
      temperature: number;
      maxTokens: number;
      topP: number;
      topK: number;
      minP: number;
      repeatPenalty: number;
      seed: number;
    },
    signal?: AbortSignal,
    settings?: Settings,
  ): Promise<LlamaChatResponse> {
    const url = resolveUrl(settings);
    const headers = resolveHeaders(settings);

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      top_k: params.topK,
      min_p: params.minP,
      repeat_penalty: params.repeatPenalty,
      seed: params.seed >= 0 ? params.seed : undefined,
      stream: false,
    };

    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM chat failed (${res.status}): ${text}`);
    }

    return res.json();
  },

  async loadModel(modelId: string, settings?: Settings, signal?: AbortSignal): Promise<void> {
    const url = resolveUrl(settings);
    const headers = resolveHeaders(settings);
    const timeout = AbortSignal.timeout(60000);
    const res = await fetch(`${url}/models/load`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: modelId }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to load model "${modelId}": ${res.status} ${text}`);
    }
  },

  async unloadModel(modelId: string, settings?: Settings): Promise<void> {
    const url = resolveUrl(settings);
    const headers = resolveHeaders(settings);
    const res = await fetch(`${url}/models/unload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to unload model "${modelId}": ${res.status} ${text}`);
    }
  },

  async health(settings?: Settings): Promise<boolean> {
    try {
      const url = resolveUrl(settings);
      const headers = resolveHeaders(settings);
      const res = await fetch(`${url}/health`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
