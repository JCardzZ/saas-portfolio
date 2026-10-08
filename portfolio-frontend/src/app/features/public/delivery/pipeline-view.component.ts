import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';

import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import {
  JobRun, JobStatus, Metric, WORKFLOW_KEYS, WorkflowKey, essentialEdges, formatDate, formatDuration, formatDurationShort, plainJobName,
} from './delivery-data';
import { DeliveryStatusService } from './delivery-status.service';
import { JOB_NOTES } from './job-notes';
import { NodeTone, StageEdge, StageGraphComponent, StageNode, revealDetail } from './stage-graph.component';

const TABS: Record<WorkflowKey, string> = { ci: 'CI', cd: 'CD', nightly: 'Nightly' };
const STATUS_LABEL: Record<JobStatus, string> = {
  success: 'correcto', skipped: 'omitido', failure: 'fallido', cancelled: 'cancelado',
};
const STATUS_TONE: Record<JobStatus, NodeTone> = {
  success: 'ok', skipped: 'skipped', failure: 'failed', cancelled: 'failed',
};
/** Nombre legible de cada métrica publicada por los jobs. */
const METRIC_LABELS: Record<string, string> = {
  tests: 'Tests', failed: 'Fallidos', skipped: 'Omitidos', coverage: 'Cobertura de líneas (%)',
  bundleKb: 'Bundle inicial (kB)', bundleGzipKb: 'Bundle inicial, gzip (kB)',
  performance: 'Lighthouse · rendimiento', accessibility: 'Lighthouse · accesibilidad',
  bestPractices: 'Lighthouse · buenas prácticas', seo: 'Lighthouse · SEO',
  vulnerabilities: 'Vulnerabilidades altas o críticas con corrección', sbomPackages: 'Paquetes en el SBOM',
  digest: 'Digest de la imagen', profiles: 'Perfiles de dispositivo', deployedSha: 'Commit desplegado',
  deploymentUrl: 'Despliegue', signatureVerified: 'Firma verificada',
};
/** Lo que dura en pantalla cada etapa de la reproducción (la ejecución real dura minutos). */
const REPLAY_STAGE_MS = 850;

/**
 * Los workflows tal como se ven en GitHub Actions: jobs, dependencias, estados y duraciones de la
 * última ejecución en main. La estructura sale de los YAML; los datos, de pipeline-status.json.
 */
@Component({
  selector: 'app-pipeline-view',
  standalone: true,
  imports: [StageGraphComponent, TheaterToggleComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block' },
  template: `
    <app-theater-toggle name="Pipeline CI/CD" />
    <div class="flex flex-wrap items-center justify-between gap-3 pr-10">
      <h3 class="text-xl font-semibold tracking-tight text-white">Pipeline CI/CD</h3>
      <div class="glass flex max-w-full overflow-x-auto rounded-full p-1 [scrollbar-width:none]" role="tablist" aria-label="Workflow">
        @for (tab of tabs; track tab.key) {
          <button
            type="button"
            role="tab"
            class="focus-ring shrink-0 rounded-full px-3.5 py-1 text-xs font-medium transition duration-300 ease-spring"
            [class]="tab.key === key() ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'"
            [attr.aria-selected]="tab.key === key()"
            (click)="choose(tab.key)"
          >{{ tab.label }}</button>
        }
      </div>
    </div>

    <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400" aria-live="polite">
      <span class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
        [class]="replaying() ? 'border-accent/50 text-accent' : 'border-white/10 text-zinc-300'">
        {{ replaying() ? 'Reproducción animada' : dataLabel() }}
      </span>
      @if (run(); as run) {
        <span>Commit <code class="font-mono text-zinc-200">{{ run.sha.slice(0, 7) }}</code></span>
        @if (run.durationSeconds !== null) {
          <span>Duración total: {{ duration(run.durationSeconds) }}</span>
        }
        @if (runUrl(); as url) {
          <a class="focus-ring tap inline-flex items-center rounded text-accent hover:text-accent-hover" [href]="url" target="_blank" rel="noopener noreferrer">Ver en GitHub ↗</a>
        }
      }
    </p>

    <app-stage-graph
      class="theater-stage mt-6"
      [nodes]="nodes()"
      [edges]="edges()"
      [activeId]="activeId()"
      [label]="'Jobs del workflow ' + tabLabel()"
      variant="pill"
      (picked)="pick($event)"
    />

    <ul class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400" aria-label="Leyenda">
      <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true"></span>Correcto</li>
      <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-zinc-600" aria-hidden="true"></span>Omitido</li>
      <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-red-400" aria-hidden="true"></span>Fallido</li>
    </ul>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="focus-ring rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition duration-300 ease-spring hover:bg-accent-hover disabled:opacity-40"
        [disabled]="!run() || replaying()"
        (click)="replay()"
      >Reproducir última ejecución</button>
      <p class="text-xs text-zinc-500">
        Estados y duraciones son los de la ejecución real; la reproducción los recorre acelerados.
      </p>
    </div>

    <div #detail class="mt-4 min-h-[7rem] scroll-mb-24 scroll-mt-24 rounded-2xl border border-white/10 bg-black/30 p-4" aria-live="polite">
      @if (active(); as job) {
        <p class="text-sm font-semibold text-white">{{ job.name }}</p>
        <p class="mt-1 text-sm text-zinc-300">{{ job.note.what }}</p>
        <p class="mt-1 text-sm text-zinc-400"><span class="text-zinc-300">Por qué existe:</span> {{ job.note.why }}</p>
        <dl class="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div class="flex justify-between gap-3"><dt class="text-zinc-500">Estado</dt><dd class="text-zinc-200">{{ job.status }}</dd></div>
          @if (job.duration) {
            <div class="flex justify-between gap-3"><dt class="text-zinc-500">Duración</dt><dd class="text-zinc-200">{{ job.duration }}</dd></div>
          }
          @if (job.needs) {
            <div class="flex justify-between gap-3"><dt class="text-zinc-500">Espera a</dt><dd class="text-right text-zinc-200">{{ job.needs }}</dd></div>
          }
          @for (metric of job.metrics; track metric.label) {
            <div class="flex justify-between gap-3"><dt class="text-zinc-500">{{ metric.label }}</dt><dd class="break-all text-right font-mono text-zinc-200">{{ metric.value }}</dd></div>
          }
        </dl>
      } @else {
        <p class="text-sm text-zinc-400">Toca un job para ver qué hace, por qué existe y sus datos de la última ejecución.</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineViewComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);
  private readonly events = inject(SystemEventsService);
  private readonly inspector = inject(TraceInspectorService);

  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');

  readonly tabs = WORKFLOW_KEYS.map((key) => ({ key, label: TABS[key] }));
  readonly key = signal<WorkflowKey>('ci');
  readonly activeId = signal<string | null>(null);
  readonly replaying = signal(false);
  /** Durante la reproducción: etapa que se está ejecutando. */
  private readonly replayStage = signal(-1);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly graph = computed(() => this.delivery.workflows[this.key()]);
  readonly run = computed(() => this.delivery.status()?.workflows[this.key()] ?? null);
  readonly tabLabel = computed(() => TABS[this.key()]);

  readonly dataLabel = computed(() => {
    const run = this.run();
    if (run) {
      return `Datos de la ejecución del ${formatDate(run.finishedAt || run.startedAt)}`;
    }
    return this.delivery.loaded() ? 'Estructura del workflow · sin datos publicados de su última ejecución' : 'Cargando la última ejecución…';
  });

  /** Solo con el repositorio público: en uno privado el enlace llevaría a un 404. */
  readonly runUrl = computed(() => {
    const status = this.delivery.status();
    const run = this.run();
    return status?.public && run ? `https://github.com/${status.repository}/actions/runs/${run.runId}` : null;
  });

  private readonly runsById = computed(() => new Map((this.run()?.jobs ?? []).map((job) => [job.id, job] as [string, JobRun])));

  readonly nodes = computed<StageNode[]>(() => {
    const runs = this.runsById();
    const stage = this.replayStage();
    return this.graph().jobs.map((job) => {
      const result = runs.get(job.id);
      let tone: NodeTone = result ? STATUS_TONE[result.status] : 'idle';
      if (this.replaying() && result) {
        tone = job.stage > stage ? 'pending' : job.stage === stage && result.status !== 'skipped' ? 'running' : tone;
      }
      return {
        id: job.id,
        stage: job.stage,
        // En la píldora, el nombre sin emoji y la duración en corto; la ficha los da completos.
        label: plainJobName(job.name),
        tone,
        toneLabel: tone === 'running' ? 'en marcha' : tone === 'pending' ? 'pendiente' : result ? STATUS_LABEL[result.status] : 'sin datos',
        detail: tone === 'running' ? 'en marcha…'
          : result ? (result.status === 'success' ? formatDurationShort(result.durationSeconds) || 'correcto' : STATUS_LABEL[result.status]) : '',
      };
    });
  });

  readonly edges = computed<StageEdge[]>(() => essentialEdges(this.graph().jobs));

  readonly active = computed(() => {
    const job = this.graph().jobs.find((item) => item.id === this.activeId());
    if (!job) {
      return null;
    }
    const result = this.runsById().get(job.id);
    const names = new Map(this.graph().jobs.map((item) => [item.id, item.name]));
    return {
      name: job.name,
      note: JOB_NOTES[this.key()][job.id] ?? { what: 'Job del workflow.', why: '' },
      status: result ? STATUS_LABEL[result.status] + (result.runs > 1 ? ` (${result.runs} ejecuciones en paralelo)` : '') : 'sin datos de la última ejecución',
      duration: result ? formatDuration(result.durationSeconds) : '',
      needs: job.needs.map((need) => names.get(need) ?? need).join(', '),
      metrics: Object.entries(result?.metrics ?? {}).map(([name, value]) => ({ label: METRIC_LABELS[name] ?? name, value: metricText(value) })),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  ngOnInit(): void {
    this.delivery.load();
  }

  pick(id: string): void {
    this.activeId.set(id);
    revealDetail(this.detail());
  }

  choose(key: WorkflowKey): void {
    this.stop();
    this.key.set(key);
    this.activeId.set(null);
  }

  duration(seconds: number): string {
    return formatDuration(seconds);
  }

  /** Recorre la última ejecución etapa a etapa y la cuenta en el inspector de traza. */
  replay(): void {
    const run = this.run();
    if (!run || this.replaying()) {
      return;
    }
    this.inspector.select('githubActions');
    this.events.emit('info', 'GitHub Actions', `${this.tabLabel()} · reproducción de la ejecución #${run.runNumber} (${run.sha.slice(0, 7)})`);
    this.replaying.set(true);
    const last = Math.max(...this.graph().jobs.map((job) => job.stage));
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = (stage: number): void => {
      if (stage > 0) {
        this.report(stage - 1);
      }
      if (stage > last) {
        this.stop();
        return;
      }
      this.replayStage.set(stage);
      this.timer = setTimeout(() => step(stage + 1), reduced ? 0 : REPLAY_STAGE_MS);
    };
    step(0);
  }

  /** Eventos de los jobs de una etapa ya recorrida, con su resultado real. */
  private report(stage: number): void {
    const runs = this.runsById();
    for (const job of this.graph().jobs.filter((item) => item.stage === stage)) {
      const result = runs.get(job.id);
      if (!result) {
        continue;
      }
      const time = formatDuration(result.durationSeconds);
      this.events.emit(
        result.status === 'success' ? 'ok' : result.status === 'skipped' ? 'info' : 'warn',
        'GitHub Actions',
        `${job.name} → ${STATUS_LABEL[result.status]}${time ? ` (${time})` : ''}`,
      );
    }
  }

  private stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.replaying.set(false);
    this.replayStage.set(-1);
  }
}

function metricText(value: Metric): string {
  return typeof value === 'boolean' ? (value ? 'sí' : 'no') : String(value);
}
