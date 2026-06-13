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
      <div class="chart-container" style="min-height:400px">
        <canvas id="graph-canvas"></canvas>
      </div>
    `;

    container.querySelector('#update-graph')?.addEventListener('click', () => updateGraph(container));

    if (preselected.length > 0) {
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

    const canvas = container.querySelector('#graph-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    if (results.length === 0) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = '';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const existingChart = (canvas as any).__chart;
    if (existingChart) existingChart.destroy();

    const labels: string[] = [];
    const passedData: { x: number; y: number }[] = [];
    const failedData: { x: number; y: number }[] = [];
    const errorData: { x: number; y: number }[] = [];
    const labelMap = new Map<string, number>();

    for (const r of results) {
      const speed = (r.stats as Record<string, number>)?.tokenGenerationSpeed ?? 0;
      const shortName = ((r.modelId as string) || '').replace(/^.*[/:]/g, '').slice(0, 20);
      const label = `${shortName} / ${r.testName}`;

      if (!labelMap.has(label)) {
        labelMap.set(label, labels.length);
        labels.push(label);
      }
      const xi = labelMap.get(label)!;

      if (r.status === 'passed') passedData.push({ x: xi, y: speed });
      else if (r.status === 'failed') failedData.push({ x: xi, y: speed });
      else errorData.push({ x: xi, y: speed });
    }

    (canvas as any).__chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Passed',
            data: passedData,
            backgroundColor: 'rgba(76, 175, 80, 0.7)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 0,
            pointRadius: 6,
            pointBackgroundColor: 'rgba(76, 175, 80, 0.7)',
          },
          {
            label: 'Failed',
            data: failedData,
            backgroundColor: 'rgba(244, 67, 54, 0.7)',
            borderColor: 'rgba(244, 67, 54, 1)',
            borderWidth: 0,
            pointRadius: 6,
            pointBackgroundColor: 'rgba(244, 67, 54, 0.7)',
          },
          {
            label: 'Error',
            data: errorData,
            backgroundColor: 'rgba(255, 152, 0, 0.7)',
            borderColor: 'rgba(255, 152, 0, 1)',
            borderWidth: 0,
            pointRadius: 6,
            pointBackgroundColor: 'rgba(255, 152, 0, 0.7)',
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
                const label = labels[ctx.dataIndex] || '';
                return `${ctx.dataset.label}: ${label} — ${ctx.parsed.y.toFixed(1)} t/s`;
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
        elements: {
          point: {
            hitRadius: 10,
          },
        },
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
  } catch (err) {
    console.error('Failed to load results:', err);
  }
}
