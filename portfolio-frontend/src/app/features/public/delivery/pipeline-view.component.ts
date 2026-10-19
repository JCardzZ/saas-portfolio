import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import {
  JobRun, JobStatus, Metric, WORKFLOW_KEYS, WorkflowKey, essentialEdges, formatDate, formatDuration, formatDurationShort, plainJobName,
} from './delivery-data';
import { DeliveryStatusService } from './delivery-status.service';
import { JOB_NOTES, JobNote } from './job-notes';
import { PhaseId, PhaseTone, phasesOf, scoreboard } from './pipeline-phases';
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

/** Iconos propios de cada fase (trazo de 24 px): no son marcas de nadie. */
const PHASE_ICONS: Record<PhaseId, string> = {
  detect: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  security: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  contract: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13l-1.5 1.5L10 16M14 13l1.5 1.5L14 16',
  tests: 'M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 14h9',
  build: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  deploy: 'M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 15l-3-3c1.5-4 5-8 12-9-1 7-5 10.5-9 12zM15 9a1 1 0 1 0 0 .01',
  gate: 'M12 3l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2zM8.5 12l2.5 2.5 4.5-5',
};

/**
 * Los workflows tal como se ven en GitHub Actions: jobs, dependencias, estados y duraciones de la
 * última ejecución en main. La estructura sale de los YAML; los datos, de pipeline-status.json.
 */
@Component({
    selector: 'app-pipeline-view',
    imports: [TranslatePipe, StageGraphComponent, TheaterToggleComponent],
    hostDirectives: [TheaterDirective],
    host: { class: 'bento-card block' },
    template: `
    <app-theater-toggle name="Pipeline CI/CD" />
    <div class="flex flex-wrap items-center justify-between gap-3 pr-10">
      <div class="flex min-w-0 items-center gap-3">
        <span class="gh-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18"><path [attr.d]="githubPath" fill="currentColor" /></svg>
        </span>
        <div class="min-w-0">
          <h3 class="text-xl font-semibold tracking-tight text-ink-1">Pipeline CI/CD</h3>
          <p class="text-xs text-ink-3">{{ 'GitHub Actions · ' | t }}{{ workflowFile() }}</p>
        </div>
      </div>
      <div class="ui-segmented" role="tablist" aria-label="Workflow">
        @for (tab of tabs; track tab.key) {
          <button
            type="button"
            role="tab"
            class="ui-segment"
            [attr.aria-selected]="tab.key === key()"
            (click)="choose(tab.key)"
          >{{ tab.label }}</button>
        }
      </div>
    </div>

    <!-- La ejecución en una franja: resultado, número, commit, duración y enlace. -->
    <div class="run" [attr.data-tone]="runTone()">
      <span class="run-badge" aria-hidden="true">
        @switch (runTone()) {
          @case ('ok') { <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> }
          @case ('failed') { <svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg> }
          @default { <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" /></svg> }
        }
      </span>
      <div class="min-w-0">
        <p class="run-title" aria-live="polite">
          @if (replaying()) {
            {{ 'Reproducción animada' | t }}
          } @else if (run(); as run) {
            {{ tabLabel() }} #{{ run.runNumber }} · {{ (run.conclusion === 'success' ? 'correcta' : 'con fallos') | t }}
          } @else {
            {{ dataLabel() | t }}
          }
        </p>
        <p class="run-meta">
          @if (run(); as run) {
            <span>{{ 'Datos de la ejecución del' | t }} {{ runDate() }}</span>
            <span>Commit <code class="font-mono text-ink-1">{{ run.sha.slice(0, 7) }}</code></span>
            @if (run.durationSeconds !== null) {
              <span>{{ 'Duración total:' | t }} {{ duration(run.durationSeconds) }}</span>
            }
            @if (runUrl(); as url) {
              <a class="focus-ring tap rounded text-accent-text hover:underline" [href]="url" target="_blank" rel="noopener noreferrer">{{ 'Ver en GitHub ↗' | t }}</a>
            }
          }
        </p>
      </div>
      <button
        type="button"
        class="replay focus-ring"
        [disabled]="!run() || replaying()"
        (click)="replay()"
        [attr.aria-label]="'Reproducir última ejecución' | t"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
        <span>{{ 'Reproducir' | t }}</span>
      </button>
    </div>

    <!-- Marcador de calidad: cifras reales de esta ejecución. Cada una abre el job que la publicó. -->
    @if (score().length) {
      <ul class="score" [attr.aria-label]="'Resultados de la ejecución' | t">
        @for (item of score(); track item.key) {
          <li>
            <button type="button" class="score-item focus-ring" [attr.data-score]="item.key" (click)="openJob(item.job)">
              <span class="score-value">{{ item.value }}</span>
              <span class="score-label">{{ item.label | t }}</span>
            </button>
          </li>
        }
      </ul>
    }

    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p class="text-overline uppercase text-ink-3">{{ view() === 'phases' ? ('Fases' | t) : ('Dependencias entre jobs' | t) }}</p>
      <div class="ui-segmented" role="tablist" [attr.aria-label]="'Vista' | t">
        <button type="button" role="tab" class="ui-segment" data-view="phases" [attr.aria-selected]="view() === 'phases'" (click)="view.set('phases')">{{ 'Fases' | t }}</button>
        <button type="button" role="tab" class="ui-segment" data-view="graph" [attr.aria-selected]="view() === 'graph'" (click)="view.set('graph')">{{ 'Grafo' | t }}</button>
      </div>
    </div>

    @if (view() === 'phases') {
      <ol class="rail" [attr.aria-label]="('Fases del workflow ' | t) + tabLabel()" data-testid="pipeline-phases">
        @for (phase of phases(); track phase.id; let i = $index) {
          <li class="rail-step">
            <button
              type="button"
              class="phase focus-ring"
              [attr.data-phase]="phase.id"
              [attr.data-tone]="phase.tone"
              [attr.aria-pressed]="phase.id === selectedPhase()?.id"
              (click)="selectPhase(phase.id)"
            >
              <span class="phase-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path [attr.d]="phaseIcons[phase.id]" /></svg>
              </span>
              <span class="phase-text">
                <span class="phase-name">{{ phase.title | t }}</span>
                <span class="phase-meta">
                  @if (phase.tone === 'running') {
                    {{ 'en marcha…' | t }}
                  } @else if (phase.ran) {
                    {{ phase.passed }}/{{ phase.ran }}{{ phase.durationSeconds !== null ? ' · ' + short(phase.durationSeconds) : '' }}
                  } @else if (phase.tone === 'skipped') {
                    {{ 'omitida' | t }}
                  } @else {
                    {{ phase.jobs.length }} {{ (phase.jobs.length === 1 ? 'job' : 'jobs') | t }}
                  }
                </span>
              </span>
            </button>
          </li>
        }
      </ol>

      @if (selectedPhase(); as phase) {
        <div class="phase-panel" [attr.data-phase-panel]="phase.id">
          <p class="phase-promise">{{ phase.promise | t }}</p>
          <ul class="jobs">
            @for (job of phase.jobs; track job.id) {
              <li>
                <button
                  type="button"
                  class="job focus-ring"
                  [attr.data-job]="job.id"
                  [attr.data-tone]="jobView()[job.id].tone"
                  [attr.aria-pressed]="job.id === activeId()"
                  (click)="pick(job.id)"
                >
                  <span class="dot" aria-hidden="true"></span>
                  <span class="job-text">
                    <span class="job-name">{{ jobView()[job.id].label }}</span>
                    <span class="job-what">{{ note(job.id).what | t }}</span>
                  </span>
                  <span class="job-time">{{ jobView()[job.id].detail || jobView()[job.id].toneLabel }}</span>
                </button>
              </li>
            }
          </ul>
        </div>
      }
    } @else {
      <app-stage-graph
        class="theater-stage mt-4"
        [nodes]="nodes()"
        [edges]="edges()"
        [activeId]="activeId()"
        [label]="('Jobs del workflow ' | t) + tabLabel()"
        variant="pill"
        (picked)="pick($event)"
      />
      <ul class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2" [attr.aria-label]="'Leyenda' | t">
        <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-status-ok" aria-hidden="true"></span>{{ 'Correcto' | t }}</li>
        <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-line-control" aria-hidden="true"></span>{{ 'Omitido' | t }}</li>
        <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-status-danger" aria-hidden="true"></span>{{ 'Fallido' | t }}</li>
      </ul>
    }

    <div #detail class="mt-4 scroll-mb-24 scroll-mt-24 rounded-panel border border-line-subtle bg-surface-2 p-4" aria-live="polite" data-testid="job-detail">
      @if (active(); as job) {
        <p class="text-sm font-semibold text-ink-1">{{ job.name }}</p>
        <p class="mt-1 text-sm text-ink-2">{{ job.note.what | t }}</p>
        @if (job.note.why) {
          <p class="mt-1 text-sm text-ink-2"><span class="text-ink-3">{{ 'Por qué existe:' | t }}</span> {{ job.note.why | t }}</p>
        }
        <dl class="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div class="flex justify-between gap-3"><dt class="text-ink-3">{{ 'Estado' | t }}</dt><dd class="text-ink-1">{{ job.status | t }}</dd></div>
          @if (job.duration) {
            <div class="flex justify-between gap-3"><dt class="text-ink-3">{{ 'Duración' | t }}</dt><dd class="text-ink-1">{{ job.duration }}</dd></div>
          }
          @if (job.needs) {
            <div class="flex justify-between gap-3"><dt class="text-ink-3">{{ 'Espera a' | t }}</dt><dd class="text-right text-ink-1">{{ job.needs }}</dd></div>
          }
          @for (metric of job.metrics; track metric.label) {
            <div class="flex justify-between gap-3"><dt class="text-ink-3">{{ metric.label | t }}</dt><dd class="break-all text-right font-mono text-ink-1">{{ metric.value }}</dd></div>
          }
        </dl>
      } @else {
        <p class="text-sm text-ink-2">{{ 'Toca un job para ver qué hace, por qué existe y sus datos de la última ejecución.' | t }}</p>
        <p class="mt-1 text-xs text-ink-3">{{ 'Estados y duraciones son los de la ejecución real; la reproducción los recorre acelerados.' | t }}</p>
      }
    </div>
  `,
    styles: `
    :host { container-type: inline-size; }
    .gh-mark {
      display: inline-grid; width: 2.25rem; height: 2.25rem; flex: none; place-items: center;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--bg-surface-2); color: var(--text-1);
    }

    /* ── Ejecución ── */
    .run {
      display: flex; align-items: center; gap: 0.875rem; margin-top: 1rem; padding: 0.75rem 0.875rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-panel); background: var(--bg-surface-2);
    }
    .run > .min-w-0 { flex: 1; }
    .run-badge {
      display: inline-grid; width: 2.25rem; height: 2.25rem; flex: none; place-items: center; border-radius: 999px;
      background: rgb(var(--c-ink-1) / 0.06); color: var(--text-2);
    }
    .run-badge svg { width: 1.125rem; height: 1.125rem; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
    .run[data-tone='ok'] .run-badge { background: color-mix(in srgb, var(--status-ok) 16%, transparent); color: var(--status-ok); }
    .run[data-tone='failed'] .run-badge { background: color-mix(in srgb, var(--status-danger) 16%, transparent); color: var(--status-danger); }
    .run[data-tone='running'] .run-badge { color: var(--accent-text); animation: breathe 1.2s var(--ease-standard) infinite; }
    .run-title { font-size: 0.9375rem; font-weight: 600; color: var(--text-1); }
    .run-meta { display: flex; flex-wrap: wrap; gap: 0.25rem 0.875rem; margin-top: 0.125rem; font-size: 0.75rem; color: var(--text-2); }
    .replay {
      display: inline-flex; flex: none; align-items: center; gap: 0.375rem; min-height: 2.25rem; padding: 0 0.875rem;
      border-radius: var(--radius-control); background: var(--accent-solid); color: var(--accent-on); font-size: 0.875rem; font-weight: 600;
      transition: background-color var(--duration-fast) var(--ease-standard), opacity var(--duration-fast);
    }
    .replay:hover:not(:disabled) { background: var(--accent-solid-hover); }
    .replay:disabled { opacity: 0.4; }
    .replay svg { width: 0.875rem; height: 0.875rem; fill: currentColor; }

    /* ── Marcador ── */
    .score { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 0.5rem; margin-top: 0.75rem; }
    .score-item {
      display: flex; width: 100%; height: 100%; flex-direction: column; align-items: flex-start; gap: 0.125rem; padding: 0.625rem 0.75rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-control); text-align: left;
      transition: border-color var(--duration-fast) var(--ease-standard), transform var(--duration-base) var(--ease-emphasized);
    }
    .score-item:hover { border-color: var(--border-strong); transform: translateY(-1px); }
    .score-value { font: 600 1.25rem/1.2 var(--font-mono); color: var(--text-1); font-variant-numeric: tabular-nums; }
    [data-score='signature'] .score-value, [data-score='tests'] .score-value { color: var(--status-ok); }
    .score-label { font-size: 0.75rem; line-height: 1.3; color: var(--text-3); }

    /* ── Fases: una fila con su recorrido; cada fase dice cuántos jobs pasaron y cuánto tardó ── */
    .rail { position: relative; display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 0.5rem; margin-top: 0.75rem; }
    .rail-step { position: relative; min-width: 0; }
    /* Tramo hacia la fase siguiente, a la altura del icono. */
    .rail-step:not(:last-child)::after {
      content: ''; position: absolute; top: 1.75rem; left: calc(50% + 1.5rem); right: calc(-50% + 1.5rem - 0.5rem); height: 1px;
      background: var(--border-strong);
    }
    .phase {
      display: flex; width: 100%; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.5rem 0.25rem 0.625rem;
      border: 1px solid transparent; border-radius: var(--radius-panel); text-align: center;
      transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
    }
    .phase:hover { background: rgb(var(--c-ink-1) / 0.03); }
    .phase[aria-pressed='true'] { border-color: var(--border-strong); background: var(--bg-surface-2); }
    .phase-icon {
      position: relative; display: inline-grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: 999px;
      border: 1px solid var(--border-strong); background: var(--bg-surface-1); color: var(--text-2);
      transition: color var(--duration-base), border-color var(--duration-base), box-shadow var(--duration-base);
    }
    .phase-icon svg { width: 1.125rem; height: 1.125rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    /* Estado en un anillo y un punto en la esquina del icono. */
    .phase-icon::after {
      content: ''; position: absolute; right: -1px; bottom: -1px; width: 0.75rem; height: 0.75rem; border-radius: 999px;
      border: 2px solid var(--bg-surface-1); background: var(--text-3);
    }
    [data-tone='ok'] .phase-icon { color: var(--text-1); border-color: color-mix(in srgb, var(--status-ok) 55%, transparent); }
    [data-tone='ok'] .phase-icon::after { background: var(--status-ok); }
    [data-tone='failed'] .phase-icon { color: var(--status-danger); border-color: var(--status-danger); }
    [data-tone='failed'] .phase-icon::after { background: var(--status-danger); }
    [data-tone='skipped'] .phase-icon, [data-tone='pending'] .phase-icon { opacity: 0.55; }
    [data-tone='idle'] .phase-icon::after, [data-tone='pending'] .phase-icon::after { background: transparent; box-shadow: inset 0 0 0 1px var(--text-3); }
    [data-tone='running'] .phase-icon { color: var(--accent-text); border-color: var(--accent-text); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-text) 18%, transparent); }
    [data-tone='running'] .phase-icon::after { background: var(--accent-text); animation: breathe 0.9s ease-in-out infinite; }
    .phase[aria-pressed='true'] .phase-icon { border-color: var(--accent-text); }
    .phase-text { display: flex; min-width: 0; max-width: 100%; flex-direction: column; gap: 0.125rem; }
    .phase-name { font-size: 0.8125rem; font-weight: 600; color: var(--text-1); line-height: 1.25; }
    .phase-meta { font: 0.75rem/1.3 var(--font-mono); color: var(--text-3); font-variant-numeric: tabular-nums; }
    @keyframes breathe { 50% { opacity: 0.35; } }

    /* ── Jobs de la fase elegida ── */
    .phase-panel { margin-top: 0.75rem; animation: rise var(--duration-slow) var(--ease-emphasized) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(0.5rem); } }
    .phase-promise { margin: 0 0 0.5rem 0.25rem; font-size: 0.8125rem; color: var(--text-2); }
    .jobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0.5rem; }
    .job {
      display: flex; width: 100%; height: 100%; align-items: flex-start; gap: 0.625rem; padding: 0.625rem 0.75rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--bg-surface-2); text-align: left;
      transition: border-color var(--duration-fast) var(--ease-standard);
    }
    .job:hover, .job[aria-pressed='true'] { border-color: var(--border-strong); }
    .job[aria-pressed='true'] { box-shadow: inset 2px 0 0 var(--accent-text); }
    .job .dot { margin-top: 0.375rem; width: 0.5rem; height: 0.5rem; flex: none; border-radius: 999px; background: var(--text-3); }
    .job[data-tone='ok'] .dot { background: var(--status-ok); }
    .job[data-tone='failed'] .dot { background: var(--status-danger); }
    .job[data-tone='running'] .dot { background: var(--accent-text); animation: breathe 0.9s ease-in-out infinite; }
    .job[data-tone='idle'] .dot, .job[data-tone='pending'] .dot { background: transparent; box-shadow: inset 0 0 0 1px var(--text-3); }
    .job[data-tone='pending'] { opacity: 0.45; }
    .job-text { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 0.125rem; }
    .job-name { font-size: 0.875rem; font-weight: 500; color: var(--text-1); }
    .job[data-tone='skipped'] .job-name { color: var(--text-2); }
    .job-what { font-size: 0.75rem; line-height: 1.35; color: var(--text-3); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .job-time { flex: none; font: 0.75rem var(--font-mono); color: var(--text-2); font-variant-numeric: tabular-nums; }

    /* Estrecho: las fases pasan a una rejilla sin tramos; la ejecución se apila. */
    @container (max-width: 40rem) {
      .rail { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.25rem; }
      .phase { padding-inline: 0.125rem; }
      .phase-icon { width: 2.25rem; height: 2.25rem; }
      .phase-name { font-size: 0.75rem; }
      .score { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.375rem; }
      .score-item { padding: 0.5rem 0.625rem; }
      .score-value { font-size: 1.0625rem; }
      .rail-step::after { display: none; }
      .run { flex-wrap: wrap; }
      .replay { width: 100%; justify-content: center; min-height: 2.75rem; }
    }
    @media (pointer: coarse) {
      .phase, .job, .score-item { min-height: 2.75rem; }
      .replay { min-height: 2.75rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .phase-panel, [data-tone='running'] .phase-icon::after, .job[data-tone='running'] .dot, .run[data-tone='running'] .run-badge { animation: none; }
      .score-item { transition: none; }
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PipelineViewComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);
  private readonly events = inject(SystemEventsService);
  private readonly inspector = inject(TraceInspectorService);

  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');

  readonly tabs = WORKFLOW_KEYS.map((key) => ({ key, label: TABS[key] }));
  readonly phaseIcons = PHASE_ICONS;
  readonly githubPath = TECH_ICONS.github.path;
  /** Fases (por defecto, más compacta) o el grafo completo de dependencias. */
  readonly view = signal<'phases' | 'graph'>('phases');
  private readonly phaseId = signal<PhaseId | null>(null);
  readonly key = signal<WorkflowKey>('ci');
  readonly activeId = signal<string | null>(null);
  readonly replaying = signal(false);
  /** Durante la reproducción: etapa que se está ejecutando. */
  private readonly replayStage = signal(-1);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly graph = computed(() => this.delivery.workflows[this.key()]);
  readonly run = computed(() => this.delivery.status()?.workflows[this.key()] ?? null);
  readonly tabLabel = computed(() => TABS[this.key()]);

  readonly runDate = computed(() => {
    const run = this.run();
    return run ? formatDate(run.finishedAt || run.startedAt) : '';
  });

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

  readonly workflowFile = computed(() => this.graph().file);
  /** Cada job como en el grafo (nombre, estado y duración), para las tarjetas de la fase. */
  readonly jobView = computed(() => Object.fromEntries(this.nodes().map((node) => [node.id, node])) as Record<string, StageNode>);
  readonly phases = computed(() => {
    const jobs = this.jobView();
    return phasesOf(this.graph().jobs, this.runsById(), (id) => (jobs[id]?.tone ?? 'idle') as PhaseTone);
  });
  /** La fase elegida; si no hay, la primera que falló o, si todo fue bien, la de tests (la que más cuenta). */
  readonly selectedPhase = computed(() => {
    const phases = this.phases();
    return phases.find((phase) => phase.id === this.phaseId())
      ?? phases.find((phase) => phase.tone === 'failed')
      ?? phases.find((phase) => phase.id === 'tests')
      ?? phases[0] ?? null;
  });
  readonly score = computed(() => scoreboard(this.run()));
  readonly runTone = computed<PhaseTone>(() => {
    if (this.replaying()) {
      return 'running';
    }
    const run = this.run();
    return run ? (run.conclusion === 'success' ? 'ok' : 'failed') : 'idle';
  });

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

  selectPhase(id: PhaseId): void {
    this.phaseId.set(id);
  }

  /** Abre la ficha de un job desde el marcador: muestra su fase y lo elige. */
  openJob(id: string): void {
    const phase = this.phases().find((item) => item.jobs.some((job) => job.id === id));
    this.view.set('phases');
    if (phase) {
      this.phaseId.set(phase.id);
    }
    this.pick(id);
  }

  note(id: string): JobNote {
    return JOB_NOTES[this.key()][id] ?? { what: 'Job del workflow.', why: '' };
  }

  short(seconds: number): string {
    return formatDurationShort(seconds);
  }

  pick(id: string): void {
    this.activeId.set(id);
    revealDetail(this.detail());
  }

  choose(key: WorkflowKey): void {
    this.stop();
    this.key.set(key);
    this.activeId.set(null);
    this.phaseId.set(null);
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
