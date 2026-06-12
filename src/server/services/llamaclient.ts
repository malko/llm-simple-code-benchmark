import { LlamaChatResponse, ChatMessage, ToolDefinition } from '../types.js';

const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8080';

export const llamaclient = {
  async listModels(): Promise<{ id: string; status: string; meta?: Record<string, unknown> }[]> {
    const res = await fetch(`${LLAMA_SERVER_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
    const body = await res.json();
    return (body.data || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      path: m.path as string | undefined,
      status: ((m.status as Record<string, string>)?.value as string) || 'unknown',
      meta: m.meta as Record<string, unknown> | undefined,
      architecture: m.architecture as Record<string, unknown> | undefined,
    }));
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
    signal?: AbortSignal
  ): Promise<LlamaChatResponse> {
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

    const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM chat failed (${res.status}): ${text}`);
    }

    return res.json();
  },

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${LLAMA_SERVER_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
