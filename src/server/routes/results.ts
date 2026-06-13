import { Router, Request, Response } from 'express';
import { storage } from '../services/storage.js';

export const resultsRouter = Router();

resultsRouter.get('/', async (req: Request, res: Response) => {
  const runs = await storage.listRuns();
  const allResults = runs.flatMap(r => r.results.map(tr => ({
    ...tr,
    runId: r.id,
    runName: r.name,
    createdAt: r.createdAt,
  })));

  const { runId, testName, modelId, status } = req.query;
  const runIds = typeof runId === 'string' ? runId.split(',').filter(Boolean) : [];
  const filtered = allResults.filter(r => {
    if (runIds.length && !runIds.includes(r.runId)) return false;
    if (testName && r.testName !== testName) return false;
    if (modelId && r.modelId !== modelId) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  res.json({ data: filtered });
});

resultsRouter.get('/:runId/:testName/:modelId', async (req: Request, res: Response) => {
  const { runId, testName, modelId } = req.params;
  const result = await storage.getResult(runId, testName, modelId);
  if (!result) {
    res.status(404).json({ error: 'Result not found' });
    return;
  }
  res.json(result);
});

resultsRouter.get('/:runId/:testName/:modelId/files', async (req: Request, res: Response) => {
  const { runId, testName, modelId } = req.params;
  const files = await storage.listOutputFiles(runId, testName, modelId);
  res.json({ data: files });
});

resultsRouter.get('/stats', async (_req: Request, res: Response) => {
  const runs = await storage.listRuns();
  const stats = {
    totalRuns: runs.length,
    completedRuns: runs.filter(r => r.status === 'completed').length,
    failedRuns: runs.filter(r => r.status === 'failed').length,
    cancelledRuns: runs.filter(r => r.status === 'cancelled').length,
    totalResults: runs.reduce((s, r) => s + r.results.length, 0),
    passedResults: runs.reduce((s, r) => s + r.results.filter(tr => tr.status === 'passed').length, 0),
    failedResults: runs.reduce((s, r) => s + r.results.filter(tr => tr.status === 'failed').length, 0),
  };
  res.json(stats);
});
