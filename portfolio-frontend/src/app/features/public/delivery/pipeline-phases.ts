import { JobRun, WorkflowJob, WorkflowRun } from './delivery-data';

/**
 * El pipeline por fases: los jobs agrupados por lo que hacen, en el orden en que corren. La fase
 * de cada job sale del emoji con el que empieza su nombre en el YAML (🔍, 🛡️, 📜, 🧪, 📦, 🚀, ✅),
 * así que un job nuevo cae solo en su fase y no hay una lista que mantener a mano.
 */
export type PhaseId = 'detect' | 'security' | 'contract' | 'tests' | 'build' | 'deploy' | 'gate';
export type PhaseIcon = PhaseId;
export type PhaseTone = 'ok' | 'failed' | 'skipped' | 'running' | 'pending' | 'idle';

interface PhaseDef {
  id: PhaseId;
  emoji: string;
  title: string;
  /** Lo que garantiza la fase, en una línea. */
  promise: string;
}

const PHASE_DEFS: readonly PhaseDef[] = [
  { id: 'detect', emoji: '🔍', title: 'Detectar', promise: 'Solo se prueba lo que cambió' },
  { id: 'security', emoji: '🛡️', title: 'Seguridad', promise: 'Sin secretos ni fallos de seguridad conocidos' },
  { id: 'contract', emoji: '📜', title: 'Contrato API', promise: 'El contrato OpenAPI es válido y compatible' },
  { id: 'tests', emoji: '🧪', title: 'Tests', promise: 'El código hace lo que dice, en todos los tamaños de pantalla' },
  { id: 'build', emoji: '📦', title: 'Build y publicación', promise: 'Se construye una vez, se mide y se firma' },
  { id: 'deploy', emoji: '🚀', title: 'Despliegue', promise: 'Llega a producción lo que pasó la CI' },
  { id: 'gate', emoji: '✅', title: 'Verificación final', promise: 'Nada se integra sin todo en verde' },
];

export interface Phase {
  id: PhaseId;
  title: string;
  promise: string;
  /** Jobs de la fase, en el orden del workflow. */
  jobs: WorkflowJob[];
  /** Etapa del grafo en la que empieza: la reproducción la ilumina cuando llega ahí. */
  firstStage: number;
  lastStage: number;
  tone: PhaseTone;
  /** Jobs correctos de los que corrieron (los omitidos no cuentan). */
  passed: number;
  ran: number;
  /** Lo que tardó la fase: el job más largo, porque los de una fase corren en paralelo. */
  durationSeconds: number | null;
}

function phaseOf(job: WorkflowJob): PhaseDef {
  return PHASE_DEFS.find((def) => job.name.startsWith(def.emoji)) ?? PHASE_DEFS.find((def) => def.id === 'build')!;
}

/**
 * Las fases de un workflow con el estado de su última ejecución. `jobTone` da el estado de cada
 * job (con la reproducción en marcha, el de ese instante).
 */
export function phasesOf(jobs: readonly WorkflowJob[], runs: ReadonlyMap<string, JobRun>, jobTone: (id: string) => PhaseTone): Phase[] {
  const groups = new Map<PhaseId, WorkflowJob[]>();
  for (const job of jobs) {
    const id = phaseOf(job).id;
    groups.set(id, [...(groups.get(id) ?? []), job]);
  }
  const order = (id: PhaseId) => PHASE_DEFS.findIndex((def) => def.id === id);
  return [...groups.entries()]
    .map(([id, members]) => {
      const def = PHASE_DEFS[order(id)];
      const tones = members.map((job) => jobTone(job.id));
      const results = members.map((job) => runs.get(job.id)).filter((run): run is JobRun => !!run);
      const ran = results.filter((run) => run.status !== 'skipped');
      const durations = ran.map((run) => run.durationSeconds).filter((value): value is number => value !== null);
      return {
        id,
        title: def.title,
        promise: def.promise,
        jobs: members,
        firstStage: Math.min(...members.map((job) => job.stage)),
        lastStage: Math.max(...members.map((job) => job.stage)),
        tone: phaseTone(tones),
        passed: ran.filter((run) => run.status === 'success').length,
        ran: ran.length,
        durationSeconds: durations.length ? Math.max(...durations) : null,
      };
    })
    .sort((a, b) => a.firstStage - b.firstStage || order(a.id) - order(b.id));
}

function phaseTone(tones: PhaseTone[]): PhaseTone {
  if (tones.includes('failed')) return 'failed';
  if (tones.includes('running')) return 'running';
  if (tones.includes('pending')) return 'pending';
  if (tones.includes('ok')) return 'ok';
  if (tones.length && tones.every((tone) => tone === 'skipped')) return 'skipped';
  return 'idle';
}

/** Una cifra del marcador de calidad: siempre un dato publicado por un job de esa ejecución. */
export interface ScoreItem {
  key: string;
  value: string;
  label: string;
  /** Job del que sale: al pulsarla se abre su ficha. */
  job: string;
}

/**
 * Las cifras de la última ejecución que mejor cuentan su calidad (tests, cobertura, Lighthouse,
 * vulnerabilidades, firma…). Solo las que la ejecución publicó: sin dato no hay cifra.
 */
export function scoreboard(run: WorkflowRun | null): ScoreItem[] {
  if (!run) {
    return [];
  }
  const items: ScoreItem[] = [];
  const find = (metric: string) => run.jobs.find((job) => job.metrics && metric in job.metrics);
  const number = (metric: string) => {
    const job = find(metric);
    const value = job?.metrics[metric];
    return job && typeof value === 'number' ? { job: job.id, value } : null;
  };

  const testJobs = run.jobs.filter((job) => typeof job.metrics?.['tests'] === 'number');
  if (testJobs.length) {
    const total = testJobs.reduce((sum, job) => sum + (job.metrics['tests'] as number), 0);
    const failed = testJobs.reduce((sum, job) => sum + (typeof job.metrics['failed'] === 'number' ? job.metrics['failed'] : 0), 0);
    items.push({ key: 'tests', value: total.toLocaleString('es'), label: failed ? `tests · ${failed} fallidos` : 'tests en verde', job: testJobs[0].id });
  }
  const coverage = number('coverage');
  if (coverage) items.push({ key: 'coverage', value: `${coverage.value} %`, label: 'cobertura del backend', job: coverage.job });
  const performance = number('performance');
  if (performance) items.push({ key: 'performance', value: String(performance.value), label: 'Lighthouse · rendimiento', job: performance.job });
  const accessibility = number('accessibility');
  if (accessibility) items.push({ key: 'accessibility', value: String(accessibility.value), label: 'Lighthouse · accesibilidad', job: accessibility.job });
  const vulnerabilities = number('vulnerabilities');
  if (vulnerabilities) items.push({ key: 'vulnerabilities', value: String(vulnerabilities.value), label: 'vulnerabilidades altas o críticas', job: vulnerabilities.job });
  const bundle = number('bundleGzipKb');
  if (bundle) items.push({ key: 'bundle', value: `${Math.round(bundle.value)} kB`, label: 'bundle inicial (gzip)', job: bundle.job });
  const sbom = number('sbomPackages');
  if (sbom) items.push({ key: 'sbom', value: String(sbom.value), label: 'paquetes en el SBOM', job: sbom.job });
  const signed = run.jobs.find((job) => job.metrics?.['signatureVerified'] === true);
  if (signed) items.push({ key: 'signature', value: '✓', label: 'firma de la imagen verificada', job: signed.id });
  return items;
}
