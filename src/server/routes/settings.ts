import { Router, Request, Response } from 'express';
import { storage } from '../services/storage.js';
import { llamaclient } from '../services/llamaclient.js';
import { Settings } from '../types.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req: Request, res: Response) => {
  const settings = await storage.getSettings();
  res.json(settings);
});

settingsRouter.put('/', async (req: Request, res: Response) => {
  const { llamaServerUrl, llamaApiKey } = req.body as Settings;
  if (typeof llamaServerUrl !== 'string') {
    res.status(400).json({ error: 'llamaServerUrl is required' });
    return;
  }
  const settings: Settings = {
    llamaServerUrl: llamaServerUrl.trim(),
    llamaApiKey: typeof llamaApiKey === 'string' ? llamaApiKey.trim() : '',
  };
  await storage.saveSettings(settings);
  res.json({ success: true });
});

settingsRouter.post('/test', async (req: Request, res: Response) => {
  const { llamaServerUrl, llamaApiKey } = req.body as Partial<Settings>;
  const testSettings: Settings = {
    llamaServerUrl: (llamaServerUrl || '').trim(),
    llamaApiKey: (llamaApiKey || '').trim(),
  };
  try {
    const ok = await llamaclient.health(testSettings);
    res.json({ reachable: ok });
  } catch {
    res.json({ reachable: false });
  }
});
