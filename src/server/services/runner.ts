import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import {
  Run, RunConfig, TestResult, TestStats, ChatMessage,
  ToolCall, ToolDefinition, RunEvent, Settings, TestStats as TestStatsType,
} from '../types.js';
import { llamaclient } from './llamaclient.js';
import { toolDefinitions, toolExecutor } from './tool-executor.js';
import { storage } from './storage.js';

function formatStats(timings: Record<string, number> | undefined, usage: Record<string, unknown> | undefined, turnCount: number): TestStatsType {
  return {
    turnCount,
    tokenGeneratedCount: (usage?.completion_tokens as number) || 0,
    promptTokensCount: (usage?.prompt_tokens as number) || timings?.prompt_n || 0,
    promptProcessingSpeed: timings?.prompt_per_second || 0,
    tokenGenerationSpeed: timings?.predicted_per_second || 0,
    elapsedMs: (timings?.prompt_ms || 0) + (timings?.predicted_ms || 0),
    promptMs: timings?.prompt_ms || 0,
    predictedMs: timings?.predicted_ms || 0,
  };
}

async function copyContext(testName: string, outputDir: string): Promise<void> {
  const contextDir = path.join(TESTS_DIR, testName, 'context');
  try {
    await fs.cp(contextDir, outputDir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

async function runTestScript(scriptPath: string, outputDir: string): Promise<Record<string, unknown>> {
  const ext = path.extname(scriptPath);
  let stdout: string;

  if (ext === '.ts') {
    stdout = execSync(`npx tsx "${scriptPath}" "${outputDir}"`, {
      timeout: 30000,
      encoding: 'utf-8',
    });
  } else if (ext === '.sh') {
    stdout = execSync(`sh "${scriptPath}" "${outputDir}"`, {
      timeout: 30000,
      encoding: 'utf-8',
    });
  } else {
    throw new Error(`Unsupported test script type: ${ext}`);
  }

  try {
    return JSON.parse(stdout.trim());
  } catch {
    return { raw: stdout.trim() };
  }
}

export class RunEmitter extends EventEmitter {
  emitProgress(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'progress', runId, data } satisfies RunEvent);
  }
  emitModelSwitch(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'model-switch', runId, data } satisfies RunEvent);
  }
  emitTestStart(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'test-start', runId, data } satisfies RunEvent);
  }
  emitTestEnd(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'test-end', runId, data } satisfies RunEvent);
  }
  emitError(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'error', runId, data } satisfies RunEvent);
  }
  emitCompleted(runId: string, data: Record<string, unknown>): void {
    this.emit('event', { type: 'completed', runId, data } satisfies RunEvent);
  }
}

export const runEmitter = new RunEmitter();
const activeRuns = new Map<string, AbortController>();

async function waitForModelReady(modelId: string, settings: Settings, signal: AbortSignal, timeoutMs = 120000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Run cancelled');
    const models = await llamaclient.listModels(settings);
    const found = models.find(m => m.id === modelId);
    if (found?.status === 'loaded') return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for model "${modelId}" to load`);
}

async function switchToModel(modelId: string, settings: Settings, signal: AbortSignal): Promise<void> {
  const models = await llamaclient.listModels(settings);
  const target = models.find(m => m.id === modelId);
  if (target?.status === 'loaded') return;
  const others = models.filter(m => m.id !== modelId && m.status === 'loaded');
  await Promise.all(others.map(m => llamaclient.unloadModel(m.id, settings).catch(() => {})));
  await llamaclient.loadModel(modelId, settings);
  await waitForModelReady(modelId, settings, signal);
}

async function chatLoop(
  modelId: string,
  prompt: string,
  tools: ToolDefinition[],
  outputDir: string,
  params: RunConfig['parameters'],
  signal: AbortSignal,
  settings?: Settings,
): Promise<{ messages: ChatMessage[]; stats: TestStatsType }> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a test agent. You have access to tools for file operations in the output directory.
Your task: respond to the user's prompt. You may use tools to read/write files as needed.
The output directory may already contain files relevant to your task (e.g. an existing codebase) — use list_files to check before starting.
Output directory: ${outputDir}`,
    },
    { role: 'user', content: prompt },
  ];

  const llmParams = {
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    topP: params.topP,
    topK: params.topK,
    minP: params.minP,
    repeatPenalty: params.repeatPenalty,
    seed: params.seed,
  };

  let turnCount = 0;
  let cumulativeUsage: Record<string, unknown> = {};
  let cumulativeTimings: Record<string, number> = {};

  for (let i = 0; i < params.maxTurns; i++) {
    if (signal.aborted) throw new Error('Run cancelled');

    const res = await llamaclient.chat(modelId, messages, tools, llmParams, signal, settings);
    turnCount++;

    if (res.usage) cumulativeUsage = res.usage;
    if (res.timings) {
      cumulativeTimings = {
        prompt_n: (cumulativeTimings.prompt_n || 0) + (res.timings.prompt_n || 0),
        prompt_ms: (cumulativeTimings.prompt_ms || 0) + (res.timings.prompt_ms || 0),
        prompt_per_second: res.timings.prompt_per_second || 0,
        predicted_n: (cumulativeTimings.predicted_n || 0) + (res.timings.predicted_n || 0),
        predicted_ms: (cumulativeTimings.predicted_ms || 0) + (res.timings.predicted_ms || 0),
        predicted_per_second: res.timings.predicted_per_second || 0,
      };
    }

    const choice = res.choices?.[0];
    if (!choice) throw new Error('No choices in response');

    const msg = choice.message || choice.delta || {};
    const finishReason = choice.finish_reason;

    messages.push(msg as ChatMessage);

    if (finishReason === 'stop' || finishReason === 'length') {
      const stats = formatStats(
        cumulativeTimings as Record<string, number>,
        cumulativeUsage,
        turnCount,
      );
      return { messages, stats };
    }

    if (finishReason === 'tool_calls' && msg.tool_calls) {
      for (const call of msg.tool_calls) {
        if (signal.aborted) throw new Error('Run cancelled');
        const result = await toolExecutor.execute(outputDir, call as ToolCall);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }
    } else {
      break;
    }
  }

  const stats = formatStats(
    cumulativeTimings as Record<string, number>,
    cumulativeUsage,
    turnCount,
  );
  return { messages, stats };
}

export const runner = {
  async start(config: RunConfig): Promise<Run> {
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${config.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const abortController = new AbortController();
    activeRuns.set(id, abortController);

    const run: Run = {
      id,
      name: config.name,
      createdAt: new Date().toISOString(),
      status: 'running',
      config,
      progress: {
        currentModelIndex: 0,
        currentTestIndex: 0,
        totalModels: config.modelIds.length,
        totalTests: config.testNames.length,
        currentModelId: config.modelIds[0] || '',
        currentTestName: config.testNames[0] || '',
        currentOperation: 'Initializing',
        percentage: 0,
      },
      results: [],
    };

    await storage.saveRun(run);
    this.execute(id, config, abortController.signal).catch(() => {});
    return run;
  },

  cancel(id: string): boolean {
    const ctrl = activeRuns.get(id);
    if (ctrl) {
      ctrl.abort();
      activeRuns.delete(id);
      return true;
    }
    return false;
  },

  isActive(id: string): boolean {
    return activeRuns.has(id);
  },

  async execute(runId: string, config: RunConfig, signal: AbortSignal): Promise<void> {
    try {
      const settings = await storage.getSettings();
      const totalSteps = config.modelIds.length * config.testNames.length;
      let completedSteps = 0;

      for (let mi = 0; mi < config.modelIds.length; mi++) {
        const modelId = config.modelIds[mi];
        if (signal.aborted) { await finalizeRun(runId, 'cancelled'); return; }

        runEmitter.emitModelSwitch(runId, {
          modelId, modelIndex: mi, totalModels: config.modelIds.length,
        });

        try {
          await switchToModel(modelId, settings, signal);
        } catch (err) {
          for (let ti = 0; ti < config.testNames.length; ti++) {
            const testName = config.testNames[ti];
            runEmitter.emitError(runId, { testName, modelId, error: `Model switch failed: ${(err as Error).message}` });
            completedSteps++;
          }
          continue;
        }

        for (let ti = 0; ti < config.testNames.length; ti++) {
          const testName = config.testNames[ti];
          if (signal.aborted) { await finalizeRun(runId, 'cancelled'); return; }

          const test = await storage.getTest(testName);
          if (!test) {
            runEmitter.emitError(runId, { testName, modelId, error: `Test "${testName}" not found` });
            completedSteps++;
            continue;
          }

          const outputDir = storage.getTestOutputDir(runId, testName, modelId);
          const resultDir = storage.getResultDir(runId, testName, modelId);
          await fs.mkdir(outputDir, { recursive: true });
          await copyContext(testName, outputDir);

          const result: TestResult = {
            runId,
            testName,
            modelId,
            status: 'running',
            startedAt: new Date().toISOString(),
            stats: {
              turnCount: 0, tokenGeneratedCount: 0, promptTokensCount: 0,
              promptProcessingSpeed: 0, tokenGenerationSpeed: 0,
              elapsedMs: 0, promptMs: 0, predictedMs: 0,
            },
            testOutput: {},
            outputPath: outputDir,
          };
          runEmitter.emitTestStart(runId, { testName, modelId });

          try {
            const { messages, stats } = await chatLoop(
              modelId, test.prompt, toolDefinitions, outputDir, config.parameters, signal, settings,
            );

            result.stats = stats;
            result.completedAt = new Date().toISOString();
            await storage.saveTurns(runId, testName, modelId, messages);
            await storage.saveResult(runId, testName, modelId, result);

            const testOutput = await runTestScript(
              path.join(TESTS_DIR, testName, 'test.ts'),
              resultDir,
            );
            result.testOutput = testOutput;
            result.status = testOutput.passed ? 'passed' : 'failed';
            await storage.saveResult(runId, testName, modelId, result);
          } catch (err) {
            result.completedAt = new Date().toISOString();
            if (signal.aborted) {
              result.status = 'cancelled';
            } else {
              result.status = 'error';
              result.error = (err as Error).message;
            }
            await storage.saveResult(runId, testName, modelId, result);
          }

          const run = await storage.getRun(runId);
          if (run) {
            run.results.push(result);
            completedSteps++;
            run.progress = {
              currentModelIndex: mi,
              currentTestIndex: ti,
              totalModels: config.modelIds.length,
              totalTests: config.testNames.length,
              currentModelId: modelId,
              currentTestName: testName,
              currentOperation: result.status,
              percentage: Math.round((completedSteps / totalSteps) * 100),
            };
            await storage.saveRun(run);
          }

          runEmitter.emitTestEnd(runId, {
            testName, modelId, status: result.status, stats: result.stats,
          });
          runEmitter.emitProgress(runId, (run?.progress || {}) as Record<string, unknown>);
        }
      }

      await finalizeRun(runId, 'completed');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'Run cancelled') {
        await finalizeRun(runId, 'cancelled');
      } else {
        await finalizeRun(runId, 'failed', msg);
      }
    } finally {
      activeRuns.delete(runId);
    }
  },
};

async function finalizeRun(runId: string, status: Run['status'], error?: string): Promise<void> {
  const run = await storage.getRun(runId);
  if (run) {
    run.status = status;
    if (error) run.error = error;
    await storage.saveRun(run);
  }
  runEmitter.emitCompleted(runId, { status, error });
}

const TESTS_DIR = process.env.TESTS_DIR || '/app/tests';
