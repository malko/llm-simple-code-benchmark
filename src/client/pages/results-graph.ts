import { api } from '../api.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export async function renderResultsGraph(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Results Graph</h1><p>Loading...</p>';

  try {
    const runsRes = await api.listRuns();
    const runs = runsRes.data;

    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const preselected = params.get('runIds')?.split(',').filter(Boolean) || [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Compare Results</h2>
          <div>
            <button class="btn btn-primary" id="update-graph">Update Graph</button>
          </div>
        </div>
        <p>Select runs to compare. Each dot represents a (model, test) result.</p>
        <div class="selector-list" id="run-selector" style="max-height:200px">
          ${runs.map(r => `
            <label class="selector-item">
              <input type="checkbox" value="${r.id}" ${preselected.includes(r.id) ? 'checked' : ''}>
              <span>${r.name}</span>
              <span class="badge badge-${r.status} ml-1">${r.status}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="chart-container">
        <canvas id="graph-canvas"></canvas>
      </div>
    `;

    container.querySelector('#update-graph')?.addEventListener('click', () => updateGraph(container));

    if (preselected.length > 0 || runs.length > 0) {
      setTimeout(() => updateGraph(container), 100);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${(err as Error).message}</p></div>`;
  }

  return container;
}

async function updateGraph(container: HTMLElement): Promise<void> {
  const checked = container.querySelectorAll('#run-selector input:checked');
  const runIds = Array.from(checked).map(c => (c as HTMLInputElement).value);

  if (runIds.length === 0) return;

  try {
    const res = await api.listResults({ runId: runIds.join(',') });
    const results = res.data as Record<string, unknown>[];

    if (results.length === 0) return;

    const canvas = container.querySelector('#graph-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const existingChart = (canvas as any).__chart;
    if (existingChart) existingChart.destroy();

    const passedData: { x: string; y: number; status: string; model: string; test: string }[] = [];
    const failedData: { x: string; y: number; status: string; model: string; test: string }[] = [];
    const errorData: { x: string; y: number; status: string; model: string; test: string }[] = [];

    for (const r of results) {
      const speed = (r.stats as Record<string, number>)?.tokenGenerationSpeed ?? 0;
      const shortName = ((r.modelId as string) || '').replace(/^.*[/:]/g, '').slice(0, 20);
      const label = `${shortName} / ${r.testName}`;

      const point = { x: label, y: speed, status: r.status as string, model: r.modelId as string, test: r.testName as string };

      if (r.status === 'passed') passedData.push(point);
      else if (r.status === 'failed') failedData.push(point);
      else errorData.push(point);
    }

    (canvas as any).__chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Passed',
            data: passedData,
            backgroundColor: 'rgba(76, 175, 80, 0.7)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 1,
            pointRadius: 6,
          },
          {
            label: 'Failed',
            data: failedData,
            backgroundColor: 'rgba(244, 67, 54, 0.7)',
            borderColor: 'rgba(244, 67, 54, 1)',
            borderWidth: 1,
            pointRadius: 6,
          },
          {
            label: 'Error',
            data: errorData,
            backgroundColor: 'rgba(255, 152, 0, 0.7)',
            borderColor: 'rgba(255, 152, 0, 1)',
            borderWidth: 1,
            pointRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#eee' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = ctx.raw as typeof passedData[0];
                return `${d.status}: ${d.model} / ${d.test} — ${d.y.toFixed(1)} t/s`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Model / Test', color: '#aaa' },
            ticks: { color: '#aaa', maxRotation: 45 },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            title: { display: true, text: 'Token Generation Speed (t/s)', color: '#aaa' },
            beginAtZero: true,
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
        color: '#eee',
      },
      plugins: [{
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart) => {
          const ctx2 = chart.ctx;
          ctx2.save();
          ctx2.fillStyle = '#16213e';
          ctx2.fillRect(0, 0, chart.width, chart.height);
          ctx2.restore();
        },
      }],
    });

    const chartContainer = canvas.parentElement!;
    chartContainer.style.height = Math.max(400, results.length * 30 + 100) + 'px';
  } catch (err) {
    console.error('Failed to load results:', err);
  }
}
