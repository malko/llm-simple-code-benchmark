import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { storage } from '../services/storage.js';
import { llamaclient } from '../services/llamaclient.js';
import { buildAnalysisPrompt, AnalysisResultRow, RunParamInfo, SplitMode } from '../services/report-data.js';
import { Settings } from '../types.js';

export const reportsRouter = Router();

const ANALYSIS_PARAMS_DEFAULTS = {
  temperature: 0.3,
  maxTokens: 4096,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  seed: -1,
};

async function ensureModelLoaded(modelId: string, settings: Settings, signal: AbortSignal): Promise<void> {
  const models = await llamaclient.listModels(settings);
  const target = models.find(m => m.id === modelId);
  if (target?.status === 'loaded') return;

  const others = models.filter(m => m.id !== modelId && m.status === 'loaded');
  await Promise.all(others.map(m => llamaclient.unloadModel(m.id, settings).catch(() => {})));
  await llamaclient.loadModel(modelId, settings);

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Cancelled');
    const refreshed = await llamaclient.listModels(settings);
    if (refreshed.find(m => m.id === modelId)?.status === 'loaded') return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for model "${modelId}" to load`);
}

reportsRouter.post('/generate', async (req: Request, res: Response) => {
  const body = req.body as {
    analysisModelId?: string;
    runIds?: string[];
    excludedTests?: string[];
    excludedModels?: string[];
    splitMode?: SplitMode;
    splitSettingKey?: string;
    maxTokens?: number;
  };

  const analysisModelId = body.analysisModelId;
  const runIds = body.runIds || [];
  if (!analysisModelId || runIds.length === 0) {
    res.status(400).json({ error: 'analysisModelId and runIds[] are required' });
    return;
  }

  const excludedTests = new Set(body.excludedTests || []);
  const excludedModels = new Set(body.excludedModels || []);
  const splitMode: SplitMode = body.splitMode || 'auto';

  try {
    const runs = (await storage.listRuns()).filter(r => runIds.includes(r.id));
    if (runs.length === 0) {
      res.status(404).json({ error: 'No matching runs found' });
      return;
    }

    const results: AnalysisResultRow[] = runs.flatMap(r => r.results
      .filter(tr => !excludedTests.has(tr.testName) && !excludedModels.has(tr.modelId))
      .map(tr => ({ ...tr, runName: r.name })));

    if (results.length === 0) {
      res.status(400).json({ error: 'No results match the current selection' });
      return;
    }

    const runInfos: RunParamInfo[] = runs.map(r => ({
      runId: r.id,
      runName: r.name,
      parameters: r.config?.parameters as unknown as Record<string, unknown> | undefined,
      modelRuntimeInfo: r.modelRuntimeInfo,
    }));

    const { system, user } = buildAnalysisPrompt(results, runInfos, splitMode, body.splitSettingKey || undefined);

    const settings = await storage.getSettings();
    const signal = AbortSignal.timeout(300000);

    await ensureModelLoaded(analysisModelId, settings, signal);

    const chatRes = await llamaclient.chat(
      analysisModelId,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      [],
      { ...ANALYSIS_PARAMS_DEFAULTS, maxTokens: body.maxTokens || ANALYSIS_PARAMS_DEFAULTS.maxTokens },
      signal,
      settings,
    );

    const content = chatRes.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: 'The model returned an empty response' });
      return;
    }

    const name = `Analysis: ${runInfos.map(r => r.runName).join(', ')} — ${new Date().toISOString().slice(0, 10)}`;
    res.json({ name, content, modelId: analysisModelId, runIds });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

reportsRouter.get('/', async (_req: Request, res: Response) => {
  const reports = await storage.listReports();
  res.json({ data: reports.map(({ content, ...meta }) => meta) });
});

reportsRouter.get('/:id', async (req: Request, res: Response) => {
  const report = await storage.getReport(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  res.json(report);
});

reportsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { name?: string; modelId?: string; runIds?: string[]; content?: string };
  if (!body.name || !body.modelId || !body.runIds?.length || !body.content) {
    res.status(400).json({ error: 'name, modelId, runIds[], and content are required' });
    return;
  }
  const report = {
    id: randomUUID(),
    name: body.name,
    createdAt: new Date().toISOString(),
    modelId: body.modelId,
    runIds: body.runIds,
    content: body.content,
  };
  await storage.saveReport(report);
  res.status(201).json(report);
});

reportsRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await storage.deleteReport(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  res.json({ success: true });
});
