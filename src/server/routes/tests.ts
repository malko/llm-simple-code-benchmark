import { Router, Request, Response } from 'express';
import { storage } from '../services/storage.js';

export const testsRouter = Router();

testsRouter.get('/', async (_req: Request, res: Response) => {
  const tests = await storage.listTests();
  const result = await Promise.all(
    tests.map(async (name) => {
      const data = await storage.getTest(name);
      return { name, hasPrompt: !!data?.prompt, hasScript: !!data?.script };
    })
  );
  res.json({ data: result });
});

testsRouter.get('/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const test = await storage.getTest(name);
  if (!test) {
    res.status(404).json({ error: 'Test not found' });
    return;
  }
  res.json({ name, ...test });
});

testsRouter.put('/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const { prompt, script } = req.body;
  if (typeof prompt !== 'string' || typeof script !== 'string') {
    res.status(400).json({ error: 'prompt and script (strings) are required' });
    return;
  }
  await storage.saveTest(name, prompt, script);
  res.json({ success: true, name });
});

testsRouter.delete('/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  await storage.deleteTest(name);
  res.json({ success: true });
});
