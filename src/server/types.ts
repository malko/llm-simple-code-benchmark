export interface RunParameters {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  seed: number;
  timeout: number;
  maxTurns: number;
}

export interface RunConfig {
  name: string;
  modelIds: string[];
  testNames: string[];
  parameters: RunParameters;
}

export interface ModelInfo {
  id: string;
  path?: string;
  status: 'loaded' | 'unloaded' | 'loading';
  meta?: Record<string, unknown>;
  multimodal?: boolean;
}

export interface Run {
  id: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: RunConfig;
  progress: RunProgress;
  results: TestResult[];
  error?: string;
}

export interface RunProgress {
  currentModelIndex: number;
  currentTestIndex: number;
  totalModels: number;
  totalTests: number;
  currentModelId: string;
  currentTestName: string;
  currentOperation: string;
  percentage: number;
}

export interface TestResult {
  runId: string;
  testName: string;
  modelId: string;
  status: 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  stats: TestStats;
  testOutput: Record<string, unknown>;
  error?: string;
  outputPath: string;
}

export interface TestStats {
  turnCount: number;
  tokenGeneratedCount: number;
  promptTokensCount: number;
  promptProcessingSpeed: number;
  tokenGenerationSpeed: number;
  elapsedMs: number;
  promptMs: number;
  predictedMs: number;
}

export type RunEventType = 'progress' | 'test-start' | 'test-end' | 'model-switch' | 'error' | 'completed';

export interface RunEvent {
  type: RunEventType;
  runId: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlamaChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    finish_reason: 'stop' | 'tool_calls' | 'length';
    delta?: Partial<ChatMessage>;
    message?: ChatMessage & { tool_calls?: ToolCall[] };
  }[];
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens: number };
  };
  timings?: {
    prompt_n: number;
    prompt_ms: number;
    prompt_per_token_ms: number;
    prompt_per_second: number;
    predicted_n: number;
    predicted_ms: number;
    predicted_per_token_ms: number;
    predicted_per_second: number;
  };
}

export interface Settings {
  llamaServerUrl: string;
  llamaApiKey: string;
}

export interface LlamaModelEntry {
  id: string;
  path?: string;
  status: {
    value: 'loaded' | 'unloaded' | 'loading';
    args?: string[];
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  meta?: Record<string, unknown>;
}
