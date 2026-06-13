export interface ResultStats {
  turnCount?: number;
  tokenGeneratedCount?: number;
  promptTokensCount?: number;
  promptProcessingSpeed?: number;
  tokenGenerationSpeed?: number;
  elapsedMs?: number;
  promptMs?: number;
  predictedMs?: number;
}

export interface ResultOutput {
  passed?: boolean;
  score?: number;
  details?: Record<string, unknown>;
}

export interface ResultRow {
  runId: string;
  runName?: string;
  testName: string;
  modelId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  stats?: ResultStats;
  testOutput?: ResultOutput;
  error?: string;
}
