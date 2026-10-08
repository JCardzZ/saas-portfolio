import { TechIconKey } from '../../../shared/ui/tech-icons';
import topologyJson from './generated/topology.json';
import workflowsJson from './generated/workflows.json';

/**
 * Datos de las vistas «Arquitectura en producción» y «Pipeline CI/CD».
 *
 * La estructura (qué piezas hay, qué jobs y de qué dependen) sale de archivos generados en el
 * build a partir de deploy/topology.json y de .github/workflows (tools/generate-delivery-data.mjs).
 * Los datos de cada ejecución llegan aparte, en pipeline-status.json (DeliveryStatusService).
 */

export type WorkflowKey = 'ci' | 'cd' | 'nightly';
export const WORKFLOW_KEYS: WorkflowKey[] = ['ci', 'cd', 'nightly'];

export interface WorkflowJob {
  id: string;
  name: string;
  needs: string[];
  stage: number;
  matrix: boolean;
}

export interface WorkflowGraph {
  file: string;
  name: string;
  jobs: WorkflowJob[];
}

export type NodeStatus = 'live' | 'planned';

export interface TopologyNode {
  id: string;
  label: string;
  role: string;
  icon: TechIconKey | null;
  stage: number;
  status: NodeStatus;
  what: string;
  why: string;
  /** De qué parte de pipeline-status.json salen sus datos reales. */
  facts: 'repo' | 'ci' | 'image' | 'frontend' | 'backend' | null;
  /** Campo de /telemetry/health que da su estado cuando está desplegado. */
  health: string | null;
}

export interface Topology {
  nodes: TopologyNode[];
  links: { from: string; to: string; label: string }[];
}

export const WORKFLOWS = workflowsJson as Record<WorkflowKey, WorkflowGraph>;
export const TOPOLOGY = topologyJson as Topology;

// ───────────── Estado de las ejecuciones (pipeline-status.json) ─────────────

export type JobStatus = 'success' | 'skipped' | 'failure' | 'cancelled';
export type Metric = string | number | boolean;

export interface JobRun {
  id: string;
  status: JobStatus;
  durationSeconds: number | null;
  runs: number;
  metrics: Record<string, Metric>;
}

export interface WorkflowRun {
  runId: number;
  runNumber: number;
  sha: string;
  event: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number | null;
  conclusion: 'success' | 'failure';
  jobs: JobRun[];
}

export interface PipelineStatus {
  repository: string;
  /** Solo con el repositorio público se enlaza a GitHub: en uno privado el enlace no abre. */
  public: boolean;
  updatedAt: string;
  workflows: Partial<Record<WorkflowKey, WorkflowRun>>;
}

const JOB_STATUSES: JobStatus[] = ['success', 'skipped', 'failure', 'cancelled'];
const MAX_JOBS = 60;
const MAX_METRICS = 16;

/**
 * El archivo llega de la red (o del build): solo se aceptan los campos conocidos, con su tipo y un
 * tamaño razonable. Devuelve `null` si no es un estado de pipeline reconocible.
 */
export function parsePipelineStatus(value: unknown): PipelineStatus | null {
  if (!isRecord(value) || value['schema'] !== 1 || !isRecord(value['workflows'])) {
    return null;
  }
  const repository = text(value['repository'], 140);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    return null;
  }
  const workflows: PipelineStatus['workflows'] = {};
  for (const key of WORKFLOW_KEYS) {
    const run = parseRun(value['workflows'][key]);
    if (run) {
      workflows[key] = run;
    }
  }
  return { repository, public: value['public'] === true, updatedAt: date(value['updatedAt']), workflows };
}

function parseRun(value: unknown): WorkflowRun | null {
  if (!isRecord(value) || !Array.isArray(value['jobs'])) {
    return null;
  }
  const sha = text(value['sha'], 40);
  const runId = integer(value['runId']);
  if (!/^[0-9a-f]{7,40}$/.test(sha) || runId === null) {
    return null;
  }
  const jobs: JobRun[] = [];
  for (const item of value['jobs'].slice(0, MAX_JOBS)) {
    if (!isRecord(item) || !/^[\w-]{1,60}$/.test(text(item['id'], 60)) || !JOB_STATUSES.includes(item['status'] as JobStatus)) {
      continue;
    }
    jobs.push({
      id: text(item['id'], 60),
      status: item['status'] as JobStatus,
      durationSeconds: integer(item['durationSeconds']),
      runs: integer(item['runs']) ?? 1,
      metrics: parseMetrics(item['metrics']),
    });
  }
  return {
    runId,
    runNumber: integer(value['runNumber']) ?? 0,
    sha,
    event: text(value['event'], 40),
    startedAt: date(value['startedAt']),
    finishedAt: date(value['finishedAt']),
    durationSeconds: integer(value['durationSeconds']),
    conclusion: value['conclusion'] === 'failure' ? 'failure' : 'success',
    jobs,
  };
}

function parseMetrics(value: unknown): Record<string, Metric> {
  const metrics: Record<string, Metric> = {};
  if (!isRecord(value)) {
    return metrics;
  }
  for (const [key, metric] of Object.entries(value).slice(0, MAX_METRICS)) {
    if (!/^[\w-]{1,40}$/.test(key)) {
      continue;
    }
    if (typeof metric === 'number' && Number.isFinite(metric)) {
      metrics[key] = metric;
    } else if (typeof metric === 'boolean') {
      metrics[key] = metric;
    } else if (typeof metric === 'string') {
      metrics[key] = metric.slice(0, 120);
    }
  }
  return metrics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Fecha ISO válida, o cadena vacía. */
function date(value: unknown): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : '';
}

// ───────────── Presentación ─────────────

/** «1 min 20 s», «45 s». Vacío si no hay dato. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return '';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} s` : rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Fecha y hora en la zona del visitante: «8 oct 2026, 03:01». Vacío si no hay dato. */
export function formatDate(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));
}

// ───────────── Colocación del grafo ─────────────

export interface GraphNode {
  id: string;
  stage: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  positions: Record<string, { x: number; y: number }>;
  /** Nodos de cada etapa, en orden; es también el orden de la vista vertical del móvil. */
  stages: string[][];
}

export const CARD_WIDTH = 176;
export const CARD_HEIGHT = 60;
const COLUMN_GAP = 44;
const ROW_GAP = 12;

/**
 * Columnas por etapa, de izquierda a derecha, con cada columna centrada en vertical. Las
 * posiciones salen de la cuenta, no de medir el DOM: el SVG de las conexiones y las tarjetas usan
 * las mismas cifras.
 */
export function layoutStages(nodes: GraphNode[]): GraphLayout {
  const stages: string[][] = [];
  for (const node of nodes) {
    (stages[node.stage] ??= []).push(node.id);
  }
  const filled = Array.from(stages, (stage) => stage ?? []).filter((stage) => stage.length > 0);
  const rows = Math.max(1, ...filled.map((stage) => stage.length));
  const height = rows * CARD_HEIGHT + (rows - 1) * ROW_GAP;
  const positions: GraphLayout['positions'] = {};
  filled.forEach((stage, column) => {
    const columnHeight = stage.length * CARD_HEIGHT + (stage.length - 1) * ROW_GAP;
    stage.forEach((id, row) => {
      positions[id] = {
        x: column * (CARD_WIDTH + COLUMN_GAP),
        y: (height - columnHeight) / 2 + row * (CARD_HEIGHT + ROW_GAP),
      };
    });
  });
  return {
    width: Math.max(1, filled.length) * CARD_WIDTH + Math.max(0, filled.length - 1) * COLUMN_GAP,
    height,
    positions,
    stages: filled,
  };
}

/** Curva de la salida (borde derecho) de un nodo a la entrada (borde izquierdo) de otro. */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x + CARD_WIDTH;
  const y1 = from.y + CARD_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + CARD_HEIGHT / 2;
  const bend = Math.max(18, (x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
}

/**
 * Conexiones que hay que dibujar: se quitan las que ya se deducen de otras (si A → B → C, la línea
 * A → C sobra). El grafo dice lo mismo con muchas menos líneas cruzadas; la lista completa de
 * dependencias de cada job se sigue mostrando en su ficha.
 */
export function essentialEdges(jobs: { id: string; needs: string[] }[]): { from: string; to: string }[] {
  const needs = new Map(jobs.map((job) => [job.id, job.needs]));
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    for (const need of needs.get(from) ?? []) {
      if (need === target || (!seen.has(need) && reaches(need, target, seen.add(need)))) {
        return true;
      }
    }
    return false;
  };
  return jobs.flatMap((job) => job.needs
    // Sobra si se llega a esa dependencia a través de otra de las dependencias directas.
    .filter((need) => !job.needs.some((other) => other !== need && reaches(other, need)))
    .map((need) => ({ from: need, to: job.id })));
}
