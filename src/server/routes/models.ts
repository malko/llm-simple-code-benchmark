import { Router, Request, Response } from 'express';
import { llamaclient } from '../services/llamaclient.js';

export const modelsRouter = Router();

modelsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const models = await llamaclient.listModels();
    res.json({ data: models });
  } catch (err) {
    res.status(503).json({ error: `Cannot reach llama server: ${(err as Error).message}` });
  }
});

modelsRouter.get('/health', async (_req: Request, res: Response) => {
  const ok = await llamaclient.health();
  if (ok) {
    res.json({ status: 'ok' });
  } else {
    res.status(503).json({ status: 'unavailable' });
  }
});
