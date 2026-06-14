import { router } from './router.js';
import { api } from './api.js';
import { renderTestList } from './pages/test-list.js';
import { renderTestEditor } from './pages/test-editor.js';
import { renderRunLauncher } from './pages/run-launcher.js';
import { renderRunMonitor } from './pages/run-monitor.js';
import { renderResultsBrowser } from './pages/results-browser.js';
import { renderResultsGraph } from './pages/results-graph.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderSettings } from './pages/settings.js';
import { renderReports } from './pages/reports.js';

router.on('/', renderDashboard);
router.on('/tests', renderTestList);
router.on('/tests/:name/edit', renderTestEditor);
router.on('/run', renderRunLauncher);
router.on('/run/:id', renderRunMonitor);
router.on('/results', renderResultsBrowser);
router.on('/results/graph', renderResultsGraph);
router.on('/reports', renderReports);
router.on('/settings', renderSettings);

async function checkStatus() {
  const serverDot = document.getElementById('server-status')!;
  const llmDot = document.getElementById('llm-status')!;
  serverDot.className = 'status-dot online';
  try {
    const health = await api.health();
    llmDot.className = 'status-dot ' + (health.status === 'ok' ? 'online' : 'offline');
  } catch {
    llmDot.className = 'status-dot offline';
  }
}

router.init();
checkStatus();
setInterval(checkStatus, 15000);
