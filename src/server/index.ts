import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './services/storage.js';
import { testsRouter } from './routes/tests.js';
import { modelsRouter } from './routes/models.js';
import { runsRouter } from './routes/runs.js';
import { resultsRouter } from './routes/results.js';
import { settingsRouter } from './routes/settings.js';
import { reportsRouter } from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');

app.use(express.json({ limit: '10mb' }));

app.use('/api/tests', testsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/results', resultsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);

app.use(express.static(CLIENT_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

async function main() {
  await storage.init();
  app.listen(PORT, () => {
    console.log(`llm-code-bench server running on http://0.0.0.0:${PORT}`);
  });
}

main().catch(console.error);
