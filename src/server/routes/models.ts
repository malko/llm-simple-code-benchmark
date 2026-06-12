import { Router, Request, Response } from 'express';
import { llamaclient } from '../services/llamaclient.js';
import { storage } from '../services/storage.js';

export const modelsRouter = Router();

modelsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await storage.getSettings();
    const models = await llamaclient.listModels(settings);
    res.json({ data: models });
  } catch (err) {
    res.status(503).json({ error: `Cannot reach llama server: ${(err as Error).message}` });
  }
});

modelsRouter.get('/health', async (_req: Request, res: Response) => {
  const settings = await storage.getSettings();
  const ok = await llamaclient.health(settings);
  if (ok) {
    res.json({ status: 'ok' });
  } else {
    res.status(503).json({ status: 'unavailable' });
  }
});
