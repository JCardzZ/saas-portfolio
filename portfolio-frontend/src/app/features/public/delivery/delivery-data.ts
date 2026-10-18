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
  /** Nombre de cada columna del diagrama, por número de etapa. */
  stages: string[];
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
  /** Línea de tiempo de despliegues, del más reciente al más antiguo. */
  deployments: Record<DeployTarget, Deployment[]>;
  /** Últimos PR fusionados en main, del más reciente al más antiguo, con la CI de su merge. */
  merges: MergeEntry[];
}

export interface MergeEntry {
  number: number;
  title: string;
  branch: string;
  author: string;
  mergedAt: string;
  sha: string;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  ci: { runId: number; runNumber: number; conclusion: string; durationSeconds: number | null; jobs: { name: string; status: string }[] } | null;
}

export type DeployTarget = 'frontend' | 'backend';

export interface Deployment {
  /** `rollback`: se volvió a una versión anterior con rollback.yml. */
  kind: 'deploy' | 'rollback';
  sha: string;
  at: string;
  /** Usuario de GitHub que lo lanzó; vacío si no consta. */
  by: string;
  runNumber: number;
  runId: number;
  /** Resultado de la comprobación de salud tras desplegar; `null` si no se comprobó. */
  healthy: boolean | null;
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
  const history = isRecord(value['deployments']) ? value['deployments'] : {};
  return {
    repository,
    public: value['public'] === true,
    updatedAt: date(value['updatedAt']),
    workflows,
    deployments: { frontend: parseDeployments(history['frontend']), backend: parseDeployments(history['backend']) },
    merges: parseMerges(value['merges']),
  };
}

const MAX_MERGES = 12;

/** Lo publicado por la CI sobre cada PR fusionado; lo que no tiene la forma esperada se descarta. */
function parseMerges(value: unknown): MergeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const count = (item: unknown) => (typeof item === 'number' && Number.isInteger(item) && item >= 0 ? item : null);
  const merges: MergeEntry[] = [];
  for (const item of value.slice(0, MAX_MERGES)) {
    if (!isRecord(item) || count(item['number']) === null) {
      continue;
    }
    const sha = text(item['sha'], 40);
    const mergedAt = date(item['mergedAt']);
    if (!/^[0-9a-f]{40}$/.test(sha) || !mergedAt) {
      continue;
    }
    const ci = isRecord(item['ci']) && count(item['ci']['runId']) !== null ? item['ci'] : null;
    merges.push({
      number: item['number'] as number,
      title: text(item['title'], 140),
      branch: text(item['branch'], 100),
      author: text(item['author'], 40),
      mergedAt,
      sha,
      additions: count(item['additions']),
      deletions: count(item['deletions']),
      changedFiles: count(item['changedFiles']),
      ci: ci ? {
        runId: ci['runId'] as number,
        runNumber: count(ci['runNumber']) ?? 0,
        conclusion: text(ci['conclusion'], 20),
        durationSeconds: count(ci['durationSeconds']),
        jobs: (Array.isArray(ci['jobs']) ? ci['jobs'] : []).slice(0, 40).filter(isRecord)
          .map((job) => ({ name: text(job['name'], 60), status: text(job['status'], 20) })),
      } : null,
    });
  }
  return merges;
}

const MAX_DEPLOYMENTS = 20;

function parseDeployments(value: unknown): Deployment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deployments: Deployment[] = [];
  for (const item of value.slice(0, MAX_DEPLOYMENTS)) {
    if (!isRecord(item)) {
      continue;
    }
    const sha = text(item['sha'], 40);
    const at = date(item['at']);
    if (!/^[0-9a-f]{7,40}$/.test(sha) || !at) {
      continue;
    }
    const by = text(item['by'], 39);
    deployments.push({
      kind: item['kind'] === 'rollback' ? 'rollback' : 'deploy',
      sha,
      at,
      // Un nombre de usuario de GitHub: letras, cifras y guiones.
      by: /^[A-Za-z0-9-]+$/.test(by) ? by : '',
      runNumber: integer(item['runNumber']) ?? 0,
      runId: integer(item['runId']) ?? 0,
      healthy: typeof item['healthy'] === 'boolean' ? item['healthy'] : null,
    });
  }
  return deployments;
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

/** Duración en corto, para donde no hay sitio: «1m 34s», «45s». */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return '';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest}s` : rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Nombre de un job sin el emoji de etapa que lleva delante («🧪 Backend unit» → «Backend unit»). */
export function plainJobName(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, '').trim() || name;
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

/** Medidas de un grafo, en píxeles, sobre una rejilla de 8. */
export interface GraphSize {
  width: number;
  height: number;
  /** Entre columnas: al menos 48, para que quepan los quiebres de las conexiones. */
  columnGap: number;
  /** Entre nodos de una columna: al menos 24. */
  rowGap: number;
  /** Hueco sobre las columnas para su rótulo. */
  top: number;
  /** Entre dos franjas de columnas, cuando el grafo no cabe en una sola. */
  bandGap: number;
}

/** Tarjeta de una pieza de la arquitectura. */
export const CARD: GraphSize = { width: 168, height: 52, columnGap: 48, rowGap: 24, top: 32, bandGap: 56 };
/** Píldora de un job del pipeline: más pequeña, hay muchas más. */
export const PILL: GraphSize = { width: 200, height: 36, columnGap: 48, rowGap: 24, top: 0, bandGap: 56 };

export interface NodePosition {
  x: number;
  y: number;
  /** Franja (fila de columnas) en la que está. */
  band: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  positions: Record<string, NodePosition>;
  /** Nodos de cada etapa, en orden; es también el orden de la vista vertical del móvil. */
  stages: string[][];
  /** Número de etapa (el del dato) de cada columna, para rotularla. */
  stageNumbers: number[];
  /** Dónde va el rótulo de cada columna. */
  headers: { x: number; y: number }[];
  /** Línea horizontal libre sobre cada franja: por ahí pasan las conexiones que cambian de franja. */
  bandLanes: number[];
  bands: number;
}

/**
 * Una columna por etapa, de izquierda a derecha y centrada en vertical. Si no caben todas en
 * `maxColumns`, las columnas siguen en otra franja debajo: el grafo se reorganiza, nunca se
 * comprime ni se solapa. Las posiciones salen de la cuenta, no de medir el DOM.
 */
export function layoutStages(nodes: GraphNode[], size: GraphSize = CARD, maxColumns = Infinity): GraphLayout {
  const byStage = new Map<number, string[]>();
  for (const node of nodes) {
    byStage.set(node.stage, [...(byStage.get(node.stage) ?? []), node.id]);
  }
  const stageNumbers = [...byStage.keys()].sort((a, b) => a - b);
  const stages = stageNumbers.map((stage) => byStage.get(stage)!);
  const perBand = Math.max(1, Math.min(stages.length, Math.floor(maxColumns)) || 1);
  const bands = Math.max(1, Math.ceil(stages.length / perBand));
  // Con varias franjas, un margen a cada lado deja pasillo para las conexiones que cambian de franja.
  const margin = bands > 1 ? size.columnGap / 2 : 0;

  const positions: GraphLayout['positions'] = {};
  const headers: GraphLayout['headers'] = [];
  const bandLanes: number[] = [];
  let y = 0;
  for (let band = 0; band < bands; band++) {
    const columns = stages.slice(band * perBand, (band + 1) * perBand);
    const rows = Math.max(1, ...columns.map((column) => column.length));
    const bodyHeight = rows * size.height + (rows - 1) * size.rowGap;
    if (band > 0) {
      bandLanes[band] = y + size.bandGap / 2;
      y += size.bandGap;
    } else {
      bandLanes[band] = 0;
    }
    columns.forEach((column, index) => {
      const x = margin + index * (size.width + size.columnGap);
      const height = column.length * size.height + (column.length - 1) * size.rowGap;
      // A la rejilla de 4: una columna impar centrada frente a una par cae en medio píxel.
      const offset = Math.round((bodyHeight - height) / 2 / 4) * 4;
      headers.push({ x, y });
      column.forEach((id, row) => {
        positions[id] = { x, y: y + size.top + offset + row * (size.height + size.rowGap), band };
      });
    });
    y += size.top + bodyHeight;
  }
  const columnsWide = Math.min(stages.length, perBand) || 1;
  return {
    width: 2 * margin + columnsWide * size.width + (columnsWide - 1) * size.columnGap,
    height: y,
    positions,
    stages,
    stageNumbers,
    headers,
    bandLanes,
    bands,
  };
}

const CORNER = 8;

/** Línea quebrada con las esquinas redondeadas, por una lista de puntos en ángulo recto. */
function roundedPath(points: [number, number][]): string {
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length; index++) {
    const [x, y] = points[index];
    const next = points[index + 1];
    if (!next) {
      path += ` L${x} ${y}`;
      break;
    }
    const [px, py] = points[index - 1];
    const before = Math.hypot(x - px, y - py);
    const after = Math.hypot(next[0] - x, next[1] - y);
    const radius = Math.min(CORNER, before / 2, after / 2);
    if (radius === 0) {
      continue;
    }
    const ax = x - Math.sign(x - px) * radius;
    const ay = y - Math.sign(y - py) * radius;
    const bx = x + Math.sign(next[0] - x) * radius;
    const by = y + Math.sign(next[1] - y) * radius;
    path += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  return path;
}

/**
 * Conexión en ángulos rectos con las esquinas redondeadas.
 * - Entre columnas de la misma franja: sale por la derecha, quiebra en el pasillo y entra por la izquierda.
 * - Dentro de una columna: baja (o sube) en línea recta.
 * - A otra franja: baja por el pasillo de su derecha hasta la línea libre sobre la franja de
 *   destino, la recorre y entra por la izquierda del nodo. Nunca pasa por encima de un nodo.
 */
export function edgePath(from: NodePosition, to: NodePosition, size: GraphSize = CARD, bandLanes: number[] = []): string {
  const y1 = from.y + size.height / 2;
  const y2 = to.y + size.height / 2;
  const half = size.columnGap / 2;
  if (from.band !== to.band) {
    const lane = bandLanes[Math.max(from.band, to.band)] ?? (from.y + to.y) / 2;
    const out = from.x + size.width + half;
    const into = to.x - half;
    return roundedPath([[from.x + size.width, y1], [out, y1], [out, lane], [into, lane], [into, y2], [to.x, y2]]);
  }
  if (from.x === to.x) {
    const x = from.x + size.width / 2;
    const down = to.y > from.y;
    return `M${x} ${down ? from.y + size.height : from.y} L${x} ${down ? to.y : to.y + size.height}`;
  }
  const forward = to.x > from.x;
  const x1 = forward ? from.x + size.width : from.x;
  const x2 = forward ? to.x : to.x + size.width;
  if (y1 === y2) {
    return `M${x1} ${y1} L${x2} ${y2}`;
  }
  const bend = x1 + (forward ? half : -half);
  return roundedPath([[x1, y1], [bend, y1], [bend, y2], [x2, y2]]);
}

/** Columnas que caben en un ancho dado; al menos una. */
export function columnsThatFit(available: number, size: GraphSize): number {
  return Math.max(1, Math.floor((available + size.columnGap) / (size.width + size.columnGap)));
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
