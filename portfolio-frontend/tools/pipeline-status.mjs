// Escribe pipeline-status.json con el resultado de una ejecución de un workflow. Lo ejecuta el
// último job de ci.yml y cd.yml en main y el resultado se publica en la rama `badges`.
// Solo usa datos de la API de GitHub sobre la propia ejecución: nada de logs ni de secretos.
//
// Variables: GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, WORKFLOW_KEY (ci | cd | nightly)
// Argumentos: --existing <archivo actual, si lo hay> --metrics <carpeta con *.json> --out <archivo>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { mergeMetrics, mergeStatus, workflowStatus } from './lib/pipeline-status.mjs';

const arg = (name) => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? null : process.argv[index + 1]; };
const { GH_TOKEN: token, GITHUB_REPOSITORY: repository, RUN_ID: runId, WORKFLOW_KEY: key } = process.env;
if (!token || !repository || !runId || !key) {
  console.error('Faltan GH_TOKEN, GITHUB_REPOSITORY, RUN_ID o WORKFLOW_KEY.');
  process.exit(1);
}

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) {
    throw new Error(`GitHub respondió ${response.status} a ${path}`);
  }
  return response.json();
}

const graphs = JSON.parse(readFileSync(join(import.meta.dirname, '../src/app/features/public/delivery/generated/workflows.json'), 'utf8'));
const graph = graphs[key];
if (!graph) {
  console.error(`No hay grafo para el workflow "${key}".`);
  process.exit(1);
}

const [repo, run] = await Promise.all([api(''), api(`/actions/runs/${runId}`)]);
const jobs = [];
for (let page = 1; ; page++) {
  const batch = await api(`/actions/runs/${runId}/jobs?per_page=100&page=${page}`);
  jobs.push(...batch.jobs);
  if (batch.jobs.length < 100) {
    break;
  }
}

// Métricas que dejó cada job: un JSON por job, con el id del job como nombre de archivo.
const metrics = {};
const metricsDir = arg('metrics');
if (metricsDir && existsSync(metricsDir)) {
  const files = readdirSync(metricsDir, { recursive: true }).map(String).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const id = file.split(/[\\/]/).pop().replace(/\.json$/, '');
    try {
      metrics[id] = mergeMetrics(metrics[id], JSON.parse(readFileSync(join(metricsDir, file), 'utf8')));
    } catch {
      console.warn(`Métricas ilegibles en ${file}: se omiten.`);
    }
  }
}

const now = new Date().toISOString();
const existingFile = arg('existing');
const existing = existingFile && existsSync(existingFile) ? JSON.parse(readFileSync(existingFile, 'utf8')) : null;
const status = mergeStatus(existing, key, workflowStatus(run, jobs, graph, metrics, now), {
  repository, isPublic: repo.private === false, now,
});
writeFileSync(arg('out') ?? 'pipeline-status.json', `${JSON.stringify(status, null, 2)}\n`);
console.log(`pipeline-status.json: ${key} · ejecución ${run.run_number} · ${status.workflows[key].jobs.length} jobs`);
