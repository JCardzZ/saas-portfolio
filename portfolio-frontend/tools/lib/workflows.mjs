// Lee la estructura de un workflow de GitHub Actions (jobs y dependencias) para dibujar su grafo.
// Funciones puras: las usan el generador de datos del build y sus tests.
import { parse } from 'yaml';

/**
 * @param {string} source contenido YAML del workflow
 * @returns {{ name: string, jobs: Array<{ id: string, name: string, needs: string[], stage: number, matrix: boolean, namePattern: string }> }}
 */
export function workflowGraph(source) {
  const workflow = parse(source);
  if (!workflow || typeof workflow !== 'object' || !workflow.jobs || typeof workflow.jobs !== 'object') {
    throw new Error('El archivo no es un workflow con jobs.');
  }
  const ids = Object.keys(workflow.jobs);
  const jobs = ids.map((id) => {
    const job = workflow.jobs[id] ?? {};
    const needs = [job.needs ?? []].flat().map(String);
    for (const need of needs) {
      if (!ids.includes(need)) {
        throw new Error(`El job "${id}" necesita "${need}", que no existe.`);
      }
    }
    const name = String(job.name ?? id);
    return { id, name: displayName(name), needs, matrix: Boolean(job.strategy?.matrix), namePattern: namePattern(name) };
  });
  const stages = stagesOf(jobs);
  return { name: String(workflow.name ?? ''), jobs: jobs.map((job) => ({ ...job, stage: stages.get(job.id) })) };
}

/** Etapa de cada job: la longitud del camino más largo de dependencias que llega hasta él. */
export function stagesOf(jobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const stages = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (stages.has(id)) {
      return stages.get(id);
    }
    if (visiting.has(id)) {
      throw new Error(`Dependencia circular en "${id}".`);
    }
    visiting.add(id);
    const stage = Math.max(-1, ...byId.get(id).needs.map(depth)) + 1;
    visiting.delete(id);
    stages.set(id, stage);
    return stage;
  };
  jobs.forEach((job) => depth(job.id));
  return stages;
}

/** Nombre para mostrar: sin las expresiones de la matriz ("🧪 Frontend (${{ matrix.shard }}/3)" → "🧪 Frontend"). */
export function displayName(name) {
  return name
    .replace(/\s*\([^()]*\$\{\{[^}]*\}\}[^()]*\)/g, '')
    .replace(/\$\{\{[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expresión regular (como texto) que reconoce los nombres con que GitHub lista las ejecuciones de
 * un job: cada expresión `${{ … }}` del nombre vale por cualquier texto.
 */
export function namePattern(name) {
  const escaped = name.split(/\$\{\{[^}]*\}\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `^${escaped.join('.+')}$`;
}
