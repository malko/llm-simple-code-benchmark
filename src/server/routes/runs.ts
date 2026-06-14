import { Router, Request, Response } from 'express';
import { storage } from '../services/storage.js';
import { runner, runEmitter } from '../services/runner.js';
import { RunConfig, RunEvent } from '../types.js';

export const runsRouter = Router();

runsRouter.get('/', async (_req: Request, res: Response) => {
  const runs = await storage.listRuns();
  const summary = runs.map(r => ({
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.createdAt,
    progress: r.progress,
    modelCount: r.config.modelIds.length,
    testCount: r.config.testNames.length,
    resultCount: r.results.length,
  })).reverse();
  res.json({ data: summary });
});

runsRouter.get('/:id', async (req: Request, res: Response) => {
  const run = await storage.getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(run);
});

runsRouter.post('/', async (req: Request, res: Response) => {
  const config = req.body as RunConfig;
  if (!config.name || !config.modelIds?.length || !config.testNames?.length) {
    res.status(400).json({ error: 'name, modelIds[], and testNames[] are required' });
    return;
  }
  const defaults = {
    temperature: 0.8,
    maxTokens: 2048,
    topP: 0.95,
    topK: 40,
    minP: 0.05,
    repeatPenalty: 1.1,
    seed: -1,
    timeout: 300,
    maxTurns: 50,
    repeatCount: 1,
  };
  config.parameters = { ...defaults, ...config.parameters };

  try {
    const run = await runner.start(config);
    res.status(201).json(run);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

runsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const run = await storage.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (runner.isActive(id)) {
    runner.cancel(id);
  }
  await storage.deleteRun(run);
  res.json({ success: true });
});

runsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;
  const ok = runner.cancel(id);
  if (ok) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Run not found or not running' });
  }
});

runsRouter.get('/:id/events', (req: Request, res: Response) => {
  const { id } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const handler = (event: RunEvent) => {
    if (event.runId === id) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'completed' || event.type === 'error') {
        cleanup();
      }
    }
  };

  const cleanup = () => {
    runEmitter.removeListener('event', handler);
    res.end();
  };

  runEmitter.on('event', handler);
  req.on('close', cleanup);
});
