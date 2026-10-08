// Construye pipeline-status.json: el resumen público de la última ejecución de cada workflow.
// Funciones puras; las usa tools/pipeline-status.mjs dentro de los workflows.

/** Peor resultado de varias ejecuciones de un mismo job (las de una matriz). */
const SEVERITY = ['skipped', 'success', 'cancelled', 'failure'];

function seconds(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : null;
}

/**
 * @param {object} run       ejecución, tal como la devuelve la API de GitHub
 * @param {object[]} apiJobs  sus jobs, tal como los devuelve la API
 * @param {{ jobs: object[] }} graph  estructura del workflow (workflows.json)
 * @param {Record<string, object>} metrics  métricas por id de job
 * @param {string} now  instante de la consulta (ISO), para la duración de una ejecución aún abierta
 */
export function workflowStatus(run, apiJobs, graph, metrics = {}, now = new Date().toISOString()) {
  const jobs = [];
  for (const job of graph.jobs) {
    const pattern = new RegExp(job.namePattern, 'u');
    // Solo lo que ya terminó: el job que publica este archivo sigue en marcha mientras lo escribe.
    const runs = apiJobs.filter((item) => pattern.test(item.name) && item.status === 'completed');
    if (runs.length === 0) {
      continue;
    }
    const status = runs.map((item) => item.conclusion).sort((a, b) => SEVERITY.indexOf(b) - SEVERITY.indexOf(a))[0];
    const durations = runs.map((item) => seconds(item.started_at, item.completed_at)).filter((value) => value !== null);
    jobs.push({
      id: job.id,
      status: SEVERITY.includes(status) ? status : 'failure',
      // Las ejecuciones de una matriz corren en paralelo: cuenta la más larga.
      durationSeconds: status === 'skipped' || durations.length === 0 ? null : Math.max(...durations),
      runs: runs.length,
      ...(metrics[job.id] ? { metrics: metrics[job.id] } : {}),
    });
  }
  const failed = jobs.some((job) => job.status === 'failure' || job.status === 'cancelled');
  // Dentro del propio workflow la ejecución sigue abierta: termina, a estos efectos, ahora.
  const end = run.status === 'completed' && run.updated_at ? run.updated_at : now;
  return {
    runId: run.id,
    runNumber: run.run_number,
    sha: run.head_sha,
    event: run.event,
    startedAt: run.run_started_at ?? run.created_at,
    finishedAt: end,
    durationSeconds: seconds(run.run_started_at ?? run.created_at, end),
    // La ejecución aún no ha terminado cuando se escribe esto: su resultado es el de sus jobs.
    conclusion: failed ? 'failure' : 'success',
    jobs,
  };
}

/** Sustituye en el archivo existente la entrada de un workflow y conserva las demás. */
export function mergeStatus(existing, key, workflow, { repository, isPublic, now }) {
  const valid = existing && typeof existing === 'object' && existing.schema === 1;
  const previous = valid ? existing.workflows ?? {} : {};
  return {
    schema: 1,
    repository,
    public: isPublic,
    updatedAt: now,
    workflows: workflow ? { ...previous, [key]: workflow } : previous,
    deployments: valid && existing.deployments ? existing.deployments : { frontend: [], backend: [] },
  };
}

/** Despliegues que se conservan por destino en la línea de tiempo. */
export const MAX_DEPLOYMENTS = 20;

/**
 * Despliegues que deja una ejecución del CD, a partir de las métricas de sus jobs. Solo cuenta
 * lo que de verdad se desplegó (el job terminó bien).
 */
export function deploymentsOf(workflow, { by = '' } = {}) {
  const job = (id) => workflow.jobs.find((item) => item.id === id && item.status === 'success');
  const base = { kind: 'deploy', at: workflow.finishedAt, by, runId: workflow.runId, runNumber: workflow.runNumber };
  const entries = [];
  const frontend = job('frontend-deploy');
  if (frontend) {
    const metrics = frontend.metrics ?? {};
    entries.push({
      target: 'frontend', ...base,
      sha: metrics.deployedSha ?? workflow.sha,
      healthy: typeof metrics.healthy === 'boolean' ? metrics.healthy : null,
      ...(metrics.deploymentId ? { deploymentId: metrics.deploymentId } : {}),
    });
  }
  const backend = job('deploy');
  if (backend) {
    const smoke = workflow.jobs.find((item) => item.id === 'smoke');
    entries.push({
      target: 'backend', ...base,
      sha: workflow.sha,
      healthy: smoke ? smoke.status === 'success' : null,
      ...(backend.metrics?.digest ? { digest: backend.metrics.digest } : {}),
    });
  }
  return entries;
}

/**
 * Añade despliegues a la línea de tiempo: los más recientes primero, sin repetir una misma
 * ejecución y sin pasar de MAX_DEPLOYMENTS por destino.
 */
export function withDeployments(status, entries) {
  const deployments = { frontend: [...(status.deployments?.frontend ?? [])], backend: [...(status.deployments?.backend ?? [])] };
  for (const entry of entries) {
    const list = deployments[entry.target];
    if (!list) {
      continue;
    }
    const { target, ...record } = entry;
    const rest = list.filter((item) => !(item.runId === record.runId && item.kind === record.kind));
    deployments[target] = [record, ...rest]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, MAX_DEPLOYMENTS);
  }
  return { ...status, deployments };
}

/** Recuentos que se suman cuando un job corre varias veces en paralelo (una matriz). */
const COUNTERS = ['tests', 'failed', 'skipped'];

/** Junta las métricas de dos ejecuciones del mismo job: los recuentos se suman, lo demás se sustituye. */
export function mergeMetrics(previous = {}, next = {}) {
  const merged = { ...previous, ...next };
  for (const key of COUNTERS) {
    if (typeof previous[key] === 'number' && typeof next[key] === 'number') {
      merged[key] = previous[key] + next[key];
    }
  }
  return merged;
}
