import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { CommitEntry, Deployment, MergeEntry, formatDate, formatDuration } from './delivery-data';
import { GraphRow, layoutGraph, pullRequestOf } from './git-graph';
import { DeliveryStatusService } from './delivery-status.service';
import { revealDetail } from './stage-graph.component';

type Tone = 'ok' | 'bad' | 'warn' | 'idle';

/** Estado de un job o de una ejecución, en uno de cuatro tonos. */
export function toneOf(status: string | undefined): Tone {
  switch (status) {
    case 'success':
      return 'ok';
    case 'failure':
    case 'timed_out':
      return 'bad';
    case 'cancelled':
    case 'action_required':
      return 'warn';
    default:
      return 'idle';
  }
}

interface Row {
  merge: MergeEntry;
  tone: Tone;
  /** Despliegues hechos con ese commit (versión del CD y destino). */
  deployed: { target: 'frontend' | 'backend'; deployment: Deployment }[];
}

/**
 * Las ramas que se fusionaron en main, como un grafo de git: cada PR sale de main y vuelve a ella
 * en su commit de merge. Al pulsarlo, qué pasó: tamaño del cambio, la CI de ese merge job a job y
 * si llegó a producción. Todo sale de pipeline-status.json, que publica la propia CI.
 */
@Component({
  selector: 'app-merge-history',
  imports: [TranslatePipe, TheaterToggleComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block', style: 'container-type: inline-size' },
  template: `
    <app-theater-toggle name="Ramas fusionadas en main" />
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-10">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Ramas fusionadas en main' | t }}</h3>
      <p class="text-xs text-ink-3">{{ 'Datos de GitHub publicados por la CI' | t }}</p>
    </div>

    @if (graph(); as g) {
      <!-- Historial de main como el Git log de un IDE: un commit por fila y las ramas en carriles paralelos. -->
      <!-- Panel con su propio desplazamiento y la cabecera fija, como el panel Git de un IDE. -->
      <div class="log-panel" tabindex="0" [attr.aria-label]="'Historial de commits' | t" data-no-smooth-scroll>
      <div class="log-head sticky-head" aria-hidden="true" [style.--graph-w.px]="laneX(g.width) + 6">
        <span>{{ 'Rama y mensaje' | t }}</span><span class="text-center">CI</span>
        <span class="col-meta">{{ 'Autor' | t }}</span><span class="col-meta">{{ 'Fecha' | t }}</span><span class="col-meta">Commit</span>
      </div>
      <ol class="commit-log" [attr.aria-label]="'Historial de main, del commit más reciente al más antiguo' | t" data-testid="commit-graph">
        @for (row of g.rows; track row.commit.sha; let first = $first) {
          <li class="commit-row" [class.active]="row.commit.sha === activeSha()" [class.is-merge]="row.merge" [style.height.px]="rowHeight()">
            <svg class="lanes" [attr.width]="laneX(g.width) + 6" [attr.height]="rowHeight()" [attr.viewBox]="'0 0 ' + (laneX(g.width) + 6) + ' ' + rowHeight()" aria-hidden="true">
              @for (segment of row.top; track $index) {
                <path [attr.d]="topPath(segment.from, segment.to)" [attr.stroke]="laneColor(segment.colorLane)" fill="none" class="seg" />
              }
              @for (segment of row.bottom; track $index) {
                <path [attr.d]="bottomPath(segment.from, segment.to)" [attr.stroke]="laneColor(segment.colorLane)" fill="none" class="seg" />
              }
              <circle [attr.cx]="laneX(row.lane)" [attr.cy]="rowHeight() / 2" [attr.r]="row.merge ? 4 : 4.5" class="dot"
                [attr.fill]="row.merge ? 'var(--bg-surface-1)' : laneColor(row.lane)" [attr.stroke]="laneColor(row.lane)" />
            </svg>
            <button type="button" class="log-cells focus-ring" [attr.data-commit]="row.commit.sha" [attr.data-merge]="prOf(row.commit)?.number ?? null"
              [attr.aria-pressed]="row.commit.sha === activeSha()" (click)="pickCommit(row.commit.sha)">
              <span class="subject">
                @if (first) {
                  <span class="ref ref-head"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3-3 3H3z" fill="currentColor" /></svg>main</span>
                }
                @if (prOf(row.commit); as pr) {
                  <span class="ref ref-branch" [style.--lane]="laneColor(branchLane(row))">
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-.75 1.37v7.26a1.5 1.5 0 1 1-1.5 0V4.37a1.5 1.5 0 0 0 1.5 0ZM13 4.5a1.5 1.5 0 1 1-2.25-1.3V5c0 1.66-1.34 3-3 3h-1v-1.5h1A1.5 1.5 0 0 0 9.25 5V3.2A1.5 1.5 0 0 1 13 4.5Z" fill="currentColor" /></svg>{{ pr.branch }}
                  </span>
                }
                <span class="title" [class.muted]="row.merge">{{ row.commit.subject }}</span>
              </span>
              <span class="ci">
                @if (mergeOf(row.commit); as merge) {
                  <span [class]="'ci-icon tone-' + toneOfMerge(merge)" [attr.title]="ciLabel(merge)" aria-hidden="true">{{ icon(toneOfMerge(merge)) }}</span>
                  <span class="sr-only">{{ ciLabel(merge) }}</span>
                }
              </span>
              <span class="col-meta author">{{ row.commit.author }}</span>
              <span class="col-meta date">{{ when(row.commit.date) }}</span>
              <code class="col-meta hash">{{ row.commit.sha.slice(0, 7) }}</code>
            </button>
          </li>
        }
      </ol>
      </div>
      @if (activeCommit(); as commit) {
        @if (!active()) {
          <div class="mt-4 rounded-panel border border-line-subtle bg-surface-2 p-4 text-xs text-ink-2" data-testid="commit-detail">
            <p class="text-sm font-semibold text-ink-1">{{ commit.subject }}</p>
            <p class="mt-1">{{ commit.author }} · {{ date(commit.date) }} · <code class="font-mono">{{ commit.sha.slice(0, 7) }}</code>
              @if (commit.parents.length > 1) { · {{ 'merge de' | t }} <code class="font-mono">{{ commit.parents[1].slice(0, 7) }}</code> }</p>
            @if (isPublic()) {
              <a class="focus-ring mt-2 inline-block rounded-mark text-accent-text underline-offset-2 hover:underline" [href]="'https://github.com/' + repository() + '/commit/' + commit.sha" target="_blank" rel="noopener">{{ 'Ver el commit en GitHub' | t }} ↗</a>
            }
          </div>
        }
      }
    } @else if (rows().length === 0) {
      <p class="mt-4 rounded-control border border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-2">
        {{ loaded() ? ('Aún no hay ramas fusionadas publicadas.' | t) : ('Cargando…' | t) }}
      </p>
    } @else {
      <!-- Estilo «Git log» de un IDE: grafo de carriles, mensaje con sus etiquetas, CI, autor, fecha y commit. -->
      <div class="log-head" aria-hidden="true">
        <span>{{ 'Rama y mensaje' | t }}</span><span class="text-center">CI</span>
        <span class="col-meta">{{ 'Autor' | t }}</span><span class="col-meta">{{ 'Fecha' | t }}</span><span class="col-meta">Commit</span>
      </div>
      <ol [attr.aria-label]="'Ramas fusionadas, de la más reciente a la más antigua' | t" data-testid="merge-list">
        @for (row of rows(); track row.merge.number; let first = $first; let last = $last; let i = $index) {
          <li class="log-row" [class.first]="first" [class.last]="last" [class.active]="row.merge.number === activeNumber()" [style.--lane]="laneColor(i)">
            <!-- main a la izquierda; la rama sube por su carril y se une a main en el commit de merge. -->
            <svg class="graph" viewBox="0 0 56 40" aria-hidden="true">
              <path class="lane" d="M42 40 L42 30 C42 22 30 20 18 20" fill="none" />
              <circle class="tip" cx="42" cy="34" r="3" />
              <circle class="merge" cx="14" cy="20" r="5" />
            </svg>
            <button type="button" class="log-cells focus-ring" [attr.aria-pressed]="row.merge.number === activeNumber()"
              [attr.data-merge]="row.merge.number" (click)="pick(row.merge.number)">
              <span class="subject">
                @if (first) {
                  <span class="ref ref-head" title="HEAD → main">
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7l3 3-3 3H3z" fill="currentColor" /></svg>main
                  </span>
                }
                <span class="ref ref-branch">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-.75 1.37v7.26a1.5 1.5 0 1 1-1.5 0V4.37a1.5 1.5 0 0 0 1.5 0ZM13 4.5a1.5 1.5 0 1 1-2.25-1.3V5c0 1.66-1.34 3-3 3h-1v-1.5h1A1.5 1.5 0 0 0 9.25 5V3.2A1.5 1.5 0 0 1 13 4.5Z" fill="currentColor" /></svg>{{ row.merge.branch }}
                </span>
                <span class="title"><span class="num">#{{ row.merge.number }}</span> {{ row.merge.title }}</span>
                @for (item of row.deployed; track item.target) {
                  <span class="ref ref-deploy">▲ {{ item.target === 'frontend' ? 'Frontend' : 'Backend' }} #{{ item.deployment.runNumber }}</span>
                }
                <span class="meta-inline">{{ row.merge.author }} · {{ when(row.merge.mergedAt) }} · <code>{{ row.merge.sha.slice(0, 7) }}</code></span>
              </span>
              <span class="ci" [attr.title]="ciLabel(row.merge)">
                <span [class]="'ci-icon tone-' + row.tone" aria-hidden="true">{{ row.tone === 'ok' ? '✓' : row.tone === 'bad' ? '✕' : row.tone === 'warn' ? '⊘' : '·' }}</span>
                <span class="sr-only">{{ ciLabel(row.merge) }}</span>
              </span>
              <span class="col-meta author">{{ row.merge.author }}</span>
              <span class="col-meta date">{{ when(row.merge.mergedAt) }}</span>
              <code class="col-meta hash">{{ row.merge.sha.slice(0, 7) }}</code>
            </button>
          </li>
        }
      </ol>
    }

    <div #detail class="mt-4 scroll-mb-24 scroll-mt-24 rounded-panel border border-line-subtle bg-surface-2 p-4" aria-live="polite" [hidden]="!active()">
      @if (active(); as row) {
        <p class="text-sm font-semibold text-ink-1">#{{ row.merge.number }} · {{ row.merge.title }}</p>
        <p class="mt-1 text-xs text-ink-2">
          <code class="font-mono">{{ row.merge.branch }}</code> → <code class="font-mono">main</code>
          · {{ 'por' | t }} {{ row.merge.author }} · {{ date(row.merge.mergedAt) }}
        </p>
        <p class="mt-2 flex flex-wrap gap-3 font-mono text-mono-sm">
          @if (row.merge.additions !== null) { <span class="text-status-ok">+{{ row.merge.additions }}</span> }
          @if (row.merge.deletions !== null) { <span class="text-status-danger">−{{ row.merge.deletions }}</span> }
          @if (row.merge.changedFiles !== null) { <span class="text-ink-2">{{ row.merge.changedFiles }} {{ 'archivos' | t }}</span> }
        </p>

        @if (row.merge.ci; as ci) {
          <p class="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <span class="font-medium text-ink-1">{{ 'CI del merge' | t }}</span>
            <span [class]="'pill tone-' + row.tone">#{{ ci.runNumber }} · {{ ciLabel(row.merge) }}</span>
            @if (ci.durationSeconds !== null) { <span>{{ duration(ci.durationSeconds) }}</span> }
          </p>
          <!-- Jobs como en el panel de ejecución de un IDE: icono de estado y nombre, en columnas. -->
          <ul class="jobs mt-2" [attr.aria-label]="'Jobs de la CI' | t">
            @for (job of ci.jobs; track job.name) {
              <li [class]="'job tone-' + tone(job.status)" [attr.title]="job.status">
                <span class="job-icon" aria-hidden="true">{{ tone(job.status) === 'ok' ? '✓' : tone(job.status) === 'bad' ? '✕' : tone(job.status) === 'warn' ? '⊘' : '–' }}</span>
                <span class="job-name">{{ job.name }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-xs text-ink-3">{{ 'No consta la ejecución de la CI de este merge.' | t }}</p>
        }

        <p class="mt-3 text-xs text-ink-2">
          @if (row.deployed.length) {
            @for (item of row.deployed; track item.target) {
              <span class="mr-3">{{ item.target === 'frontend' ? 'Frontend' : 'Backend' }} {{ 'desplegado' | t }} · #{{ item.deployment.runNumber }} · {{ date(item.deployment.at) }}
                · {{ item.deployment.healthy === true ? ('salud comprobada' | t) : item.deployment.healthy === false ? ('no pasó la salud' | t) : ('salud sin comprobar' | t) }}</span>
            }
          } @else {
            {{ 'Este commit no tiene un despliegue propio registrado (pudo llegar a producción con un merge posterior).' | t }}
          }
        </p>

        @if (isPublic()) {
          <p class="mt-3 flex flex-wrap gap-3 text-xs">
            <a class="focus-ring rounded-mark text-accent-text underline-offset-2 hover:underline" [href]="'https://github.com/' + repository() + '/pull/' + row.merge.number" target="_blank" rel="noopener">{{ 'Ver el PR en GitHub' | t }} ↗</a>
            @if (row.merge.ci; as ci) {
              <a class="focus-ring rounded-mark text-accent-text underline-offset-2 hover:underline" [href]="'https://github.com/' + repository() + '/actions/runs/' + ci.runId" target="_blank" rel="noopener">{{ 'Ver la ejecución de la CI' | t }} ↗</a>
            }
          </p>
        }
      }
    </div>
  `,
  styles: `
    /* Cabecera y filas comparten columnas: grafo, mensaje, CI, autor, fecha, commit. */
    .log-head, .log-cells { display: grid; grid-template-columns: minmax(0, 1fr) 2rem 7.5rem 6.5rem 4.5rem; align-items: center; column-gap: 0.75rem; }
    .log-head { margin-top: 1rem; padding: 0 0.75rem 0.375rem var(--graph-w, 56px); border-bottom: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-3); }
    .log-row { position: relative; display: flex; align-items: stretch; border-radius: var(--radius-mark); transition: background-color 0.15s ease-out; }
    .log-row:hover { background: rgb(var(--c-ink-1) / 0.04); }
    .log-row.active { background: color-mix(in srgb, var(--accent-text) 14%, transparent); }
    /* El carril de main, continuo aunque una fila crezca. */
    .log-row::before { content: ''; position: absolute; left: 13px; top: 0; bottom: 0; width: 2px; background: var(--text-2); }
    .log-row.first::before { top: 20px; }
    .log-row.last::before { bottom: auto; height: 20px; }
    .graph { width: 56px; height: 40px; flex: none; position: relative; }
    .lane { stroke: var(--lane); stroke-width: 2; stroke-linecap: round; }
    .tip { fill: var(--bg-surface-1); stroke: var(--lane); stroke-width: 2; }
    .merge { fill: var(--text-1); stroke: var(--bg-surface-1); stroke-width: 2.5; }
    .log-row.active .merge { fill: var(--accent-text); }
    .log-cells { flex: 1; min-width: 0; min-height: 2.5rem; padding: 0.25rem 0.75rem 0.25rem 0; text-align: left; font-size: 0.8125rem; }
    /* Con el dedo, cada fila es un objetivo de 44 px como el resto de controles. */
    @media (pointer: coarse) { .log-cells { min-height: 2.75rem; } }
    .subject { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; }
    .title { min-width: 0; flex: 1 1 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); }
    .num { color: var(--text-3); font-family: var(--font-mono); }
    .ref { display: inline-flex; align-items: center; gap: 0.25rem; max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: var(--radius-mark); padding: 0.0625rem 0.375rem; font-family: var(--font-mono); font-size: 0.75rem; line-height: 1.125rem; }
    .ref svg { width: 0.75rem; height: 0.75rem; flex: none; }
    .ref-branch { color: var(--lane); background: color-mix(in srgb, var(--lane) 14%, transparent); border: 1px solid color-mix(in srgb, var(--lane) 40%, transparent); }
    .ref-head { color: var(--accent-on); background: var(--accent-solid); font-weight: 600; }
    .ref-deploy { color: var(--accent-text); border: 1px dashed color-mix(in srgb, var(--accent-text) 50%, transparent); }
    .ci { display: flex; justify-content: center; }
    .ci-icon { display: inline-flex; width: 1.25rem; height: 1.25rem; align-items: center; justify-content: center; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; }
    .ci-icon.tone-ok { color: var(--status-ok); background: rgb(var(--c-status-ok) / 0.14); }
    .ci-icon.tone-bad { color: var(--status-danger); background: color-mix(in srgb, var(--status-danger) 16%, transparent); }
    .ci-icon.tone-warn { color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 16%, transparent); }
    .ci-icon.tone-idle { color: var(--text-3); }
    .col-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); font-size: 0.75rem; }
    .hash { font-family: var(--font-mono); color: var(--text-3); }
    .meta-inline { display: none; width: 100%; color: var(--text-3); font-size: 0.75rem; }
    /* Estrecho: el mensaje y la CI; autor, fecha y commit bajan a una línea bajo el mensaje. */
    @container (max-width: 720px) {
      .log-head { display: none; }
      .log-cells { grid-template-columns: minmax(0, 1fr) 2rem; }
      .col-meta { display: none; }
      .meta-inline { display: block; }
    }
    .pill { display: inline-flex; align-items: center; min-height: 1.5rem; border-radius: 9999px; border: 1px solid; padding: 0 0.5rem; font-size: 0.75rem; line-height: 1rem; white-space: nowrap; }
    .pill.tone-ok { border-color: rgb(var(--c-status-ok) / 0.4); color: var(--status-ok); }
    .pill.tone-bad { border-color: color-mix(in srgb, var(--status-danger) 45%, transparent); color: var(--status-danger); }
    .pill.tone-warn { border-color: color-mix(in srgb, var(--status-warn) 45%, transparent); color: var(--status-warn); }
    .pill.tone-idle { border-color: var(--border-strong); color: var(--text-2); }
    .pill.tone-deploy { border-color: color-mix(in srgb, var(--accent-text) 45%, transparent); color: var(--accent-text); }
    .commit-log { margin-top: 0.125rem; }
    .log-panel { margin-top: 1rem; max-height: min(34rem, 70dvh); overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--border-subtle); border-radius: var(--radius-panel); }
    .log-panel:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
    .sticky-head { position: sticky; top: 0; z-index: 1; margin-top: 0; padding-top: 0.5rem; background: var(--bg-surface-2); }
    .commit-row { display: flex; align-items: stretch; border-radius: var(--radius-mark); transition: background-color 0.15s ease-out; }
    .commit-row:hover { background: rgb(var(--c-ink-1) / 0.04); }
    .commit-row.active { background: color-mix(in srgb, var(--accent-text) 14%, transparent); }
    .commit-row .log-cells { min-height: 0; height: 100%; padding-top: 0; padding-bottom: 0; }
    .lanes { flex: none; overflow: visible; }
    .seg { stroke-width: 2; stroke-linecap: round; }
    .dot { stroke-width: 2; }
    .title.muted { color: var(--text-3); }
    .jobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.125rem 1rem; }
    .job { display: flex; min-width: 0; align-items: center; gap: 0.5rem; padding: 0.1875rem 0.25rem; border-radius: var(--radius-mark); font-size: 0.8125rem; color: var(--text-2); }
    .job-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .job-icon { display: inline-flex; width: 1rem; height: 1rem; flex: none; align-items: center; justify-content: center; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; }
    .job.tone-ok .job-icon { color: var(--status-ok); background: rgb(var(--c-status-ok) / 0.14); }
    .job.tone-bad { color: var(--status-danger); background: color-mix(in srgb, var(--status-danger) 8%, transparent); }
    .job.tone-bad .job-icon { color: var(--status-danger); background: color-mix(in srgb, var(--status-danger) 18%, transparent); }
    .job.tone-warn .job-icon { color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 16%, transparent); }
    .job.tone-idle { color: var(--text-3); }
    .job.tone-idle .job-icon { color: var(--text-3); }
    @media (prefers-reduced-motion: reduce) { .merge-row { transition: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MergeHistoryComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);
  private readonly language = inject(LanguageService);
  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');
  private readonly injector = inject(Injector);

  readonly loaded = this.delivery.loaded;
  readonly activeNumber = signal<number | null>(null);
  readonly repository = computed(() => this.delivery.status()?.repository ?? '');
  readonly isPublic = computed(() => this.delivery.status()?.public === true);

  readonly rows = computed<Row[]>(() => {
    const status = this.delivery.status();
    if (!status) {
      return [];
    }
    const deploymentsOf = (sha: string) => (['frontend', 'backend'] as const).flatMap((target) => {
      const deployment = status.deployments[target].find((item) => item.kind === 'deploy' && sha.startsWith(item.sha));
      return deployment ? [{ target, deployment }] : [];
    });
    return status.merges.map((merge) => ({ merge, tone: toneOf(merge.ci?.conclusion), deployed: deploymentsOf(merge.sha) }));
  });

  /**
   * Color del carril de cada rama, como en el log de un IDE: el acento de la paleta girado en el
   * círculo de color (sin colores escritos a mano). Se repite cada seis ramas.
   */
  laneColor(index: number): string {
    const turns = [0, 140, 220, 60, 300, 180];
    return `oklch(from var(--accent-text) l c calc(h + ${turns[index % turns.length]}))`;
  }

  /** Historial de main en carriles (si la CI lo ha publicado). */
  readonly graph = computed(() => {
    const commits = this.delivery.status()?.commits ?? [];
    return commits.length ? layoutGraph(commits) : null;
  });
  readonly activeSha = signal<string | null>(null);
  readonly activeCommit = computed(() => this.delivery.status()?.commits.find((commit) => commit.sha === this.activeSha()) ?? null);
  /** Filas compactas como en el IDE; con el dedo, 44 px para poder tocarlas. */
  readonly rowHeight = signal(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 44 : 32);
  private readonly mergesBySha = computed(() => new Map((this.delivery.status()?.merges ?? []).map((merge) => [merge.sha, merge])));

  laneX(lane: number): number {
    return 12 + lane * 14;
  }

  topPath(from: number, to: number): string {
    const h = this.rowHeight();
    const [x1, x2] = [this.laneX(from), this.laneX(to)];
    return x1 === x2 ? `M${x1} 0 L${x2} ${h / 2}` : `M${x1} 0 C${x1} ${h * 0.4} ${x2} ${h * 0.15} ${x2} ${h / 2}`;
  }

  bottomPath(from: number, to: number): string {
    const h = this.rowHeight();
    const [x1, x2] = [this.laneX(from), this.laneX(to)];
    return x1 === x2 ? `M${x1} ${h / 2} L${x2} ${h}` : `M${x1} ${h / 2} C${x1} ${h * 0.85} ${x2} ${h * 0.6} ${x2} ${h}`;
  }

  prOf(commit: CommitEntry): { number: number; branch: string } | null {
    return pullRequestOf(commit.subject);
  }

  mergeOf(commit: CommitEntry): MergeEntry | null {
    return this.mergesBySha().get(commit.sha) ?? null;
  }

  toneOfMerge(merge: MergeEntry): Tone {
    return toneOf(merge.ci?.conclusion);
  }

  icon(tone: Tone): string {
    return tone === 'ok' ? '✓' : tone === 'bad' ? '✕' : tone === 'warn' ? '⊘' : '·';
  }

  /** Carril por el que llega la rama de un merge (el de su segundo padre). */
  branchLane(row: GraphRow<CommitEntry>): number {
    return row.bottom.find((segment) => segment.from === row.lane && segment.to !== row.lane)?.to ?? row.lane;
  }

  /** Un commit del grafo: si es el merge de un PR publicado, su ficha completa; si no, la del commit. */
  pickCommit(sha: string): void {
    const same = this.activeSha() === sha;
    this.activeSha.set(same ? null : sha);
    const commit = this.activeCommit();
    const merge = commit ? this.mergeOf(commit) : null;
    this.activeNumber.set(!same && merge ? merge.number : null);
    if (!same && merge) {
      afterNextRender(() => revealDetail(this.detail()), { injector: this.injector });
    }
  }

  readonly active = computed(() => this.rows().find((row) => row.merge.number === this.activeNumber()) ?? null);

  ngOnInit(): void {
    this.delivery.load();
  }

  pick(number: number): void {
    this.activeNumber.set(this.activeNumber() === number ? null : number);
    if (this.activeNumber() !== null) {
      // La ficha estaba oculta: se lleva a la vista cuando ya se ha pintado.
      afterNextRender(() => revealDetail(this.detail()), { injector: this.injector });
    }
  }

  tone(status: string): Tone {
    return toneOf(status);
  }

  ciLabel(merge: MergeEntry): string {
    const conclusion = merge.ci?.conclusion;
    const es: Record<string, string> = { success: 'CI correcta', failure: 'CI fallida', cancelled: 'CI cancelada', timed_out: 'CI agotó el tiempo' };
    return this.tr(conclusion ? es[conclusion] ?? `CI: ${conclusion}` : 'CI sin datos');
  }

  /** «hace 3 días», o la fecha si es más antiguo. */
  when(iso: string): string {
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    const en = this.language.lang() === 'en';
    if (days < 1) {
      return en ? 'today' : 'hoy';
    }
    if (days < 7) {
      return en ? `${days} d ago` : `hace ${days} d`;
    }
    return formatDate(iso);
  }

  date(iso: string): string {
    return formatDate(iso);
  }

  duration(seconds: number): string {
    return formatDuration(seconds);
  }

  private tr(es: string): string {
    const dictionary = this.language.dictionary();
    return this.language.lang() === 'en' && dictionary ? (dictionary[es] ?? es) : es;
  }
}
