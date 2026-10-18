import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { Deployment, MergeEntry, formatDate, formatDuration } from './delivery-data';
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
  host: { class: 'bento-card block' },
  template: `
    <app-theater-toggle name="Ramas fusionadas en main" />
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-10">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Ramas fusionadas en main' | t }}</h3>
      <p class="text-xs text-ink-3">{{ 'Datos de GitHub publicados por la CI' | t }}</p>
    </div>

    @if (rows().length === 0) {
      <p class="mt-4 rounded-control border border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-2">
        {{ loaded() ? ('Aún no hay ramas fusionadas publicadas.' | t) : ('Cargando…' | t) }}
      </p>
    } @else {
      <ol class="mt-4" [attr.aria-label]="'Ramas fusionadas, de la más reciente a la más antigua' | t" data-testid="merge-list">
        @for (row of rows(); track row.merge.number; let first = $first; let last = $last) {
          <li class="merge-row" [class.first]="first" [class.last]="last" [class.active]="row.merge.number === activeNumber()">
            <!-- El trazo de main y la rama que vuelve a ella: decorativo, el texto dice lo mismo. -->
            <svg class="graph" viewBox="0 0 44 56" aria-hidden="true">
              <path d="M34 0 C34 18 34 18 20 26" [class]="'branch tone-' + row.tone" fill="none" />
              <circle cx="34" cy="2" r="3" [class]="'tip tone-' + row.tone" />
              <circle cx="12" cy="28" r="5" [class]="'commit tone-' + row.tone" />
            </svg>
            <button type="button" class="merge-button focus-ring" [attr.aria-pressed]="row.merge.number === activeNumber()"
              [attr.data-merge]="row.merge.number" (click)="pick(row.merge.number)">
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <code class="shrink-0 font-mono text-mono-sm text-ink-3">#{{ row.merge.number }}</code>
                  <span class="truncate text-body-sm font-medium text-ink-1">{{ row.merge.title }}</span>
                </span>
                <span class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-caption text-ink-3">
                  <code class="truncate font-mono">{{ row.merge.branch }}</code>
                  <span aria-hidden="true">→</span><code class="font-mono">main</code>
                  <span>· {{ when(row.merge.mergedAt) }}</span>
                </span>
              </span>
              <span class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <span [class]="'pill tone-' + row.tone">{{ ciLabel(row.merge) }}</span>
                @for (item of row.deployed; track item.target) {
                  <span class="pill tone-deploy">{{ item.target === 'frontend' ? 'Frontend' : 'Backend' }} #{{ item.deployment.runNumber }}</span>
                }
              </span>
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
          <ul class="mt-2 flex flex-wrap gap-1.5" [attr.aria-label]="'Jobs de la CI' | t">
            @for (job of ci.jobs; track job.name) {
              <li [class]="'job tone-' + tone(job.status)" [attr.title]="job.status">{{ job.name }}</li>
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
    .merge-row { position: relative; display: flex; align-items: stretch; gap: 0.25rem; border-radius: var(--radius-control); transition: background-color 0.2s ease-out; }
    /* La línea de main: continua aunque una fila crezca (texto ampliado, móvil). */
    .merge-row::before { content: ''; position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: var(--text-2); }
    .merge-row.first::before { top: 28px; }
    .merge-row.last::before { bottom: auto; height: 28px; }
    .merge-row.first.last::before { display: none; }
    .merge-row.active { background: var(--bg-surface-2); }
    .graph { position: relative; width: 44px; height: 56px; flex: none; }
    .branch { stroke-width: 2; }
    .branch.tone-ok, .tip.tone-ok { stroke: var(--status-ok); }
    .branch.tone-bad, .tip.tone-bad { stroke: var(--status-danger); }
    .branch.tone-warn, .tip.tone-warn { stroke: var(--status-warn); }
    .branch.tone-idle, .tip.tone-idle { stroke: var(--text-3); }
    .tip { fill: var(--bg-surface-1); stroke-width: 1.5; }
    .commit { stroke: var(--bg-surface-1); stroke-width: 2; }
    .commit.tone-ok { fill: var(--status-ok); }
    .commit.tone-bad { fill: var(--status-danger); }
    .commit.tone-warn { fill: var(--status-warn); }
    .commit.tone-idle { fill: var(--text-3); }
    .merge-button { display: flex; min-width: 0; flex: 1; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; padding: 0.5rem 0.5rem 0.5rem 0; text-align: left; min-height: 3.5rem; border-radius: var(--radius-control); }
    .pill { display: inline-flex; align-items: center; min-height: 1.5rem; border-radius: 9999px; border: 1px solid; padding: 0 0.5rem; font-size: 0.75rem; line-height: 1rem; white-space: nowrap; }
    .pill.tone-ok { border-color: rgb(var(--c-status-ok) / 0.4); color: var(--status-ok); }
    .pill.tone-bad { border-color: color-mix(in srgb, var(--status-danger) 45%, transparent); color: var(--status-danger); }
    .pill.tone-warn { border-color: color-mix(in srgb, var(--status-warn) 45%, transparent); color: var(--status-warn); }
    .pill.tone-idle { border-color: var(--border-strong); color: var(--text-2); }
    .pill.tone-deploy { border-color: color-mix(in srgb, var(--accent-text) 45%, transparent); color: var(--accent-text); }
    .job { border-radius: var(--radius-mark); border: 1px solid var(--border-subtle); padding: 0.125rem 0.5rem; font-size: 0.75rem; line-height: 1rem; color: var(--text-2); }
    .job.tone-ok { border-color: rgb(var(--c-status-ok) / 0.3); }
    .job.tone-bad { border-color: color-mix(in srgb, var(--status-danger) 50%, transparent); color: var(--status-danger); }
    .job.tone-warn { color: var(--status-warn); }
    .job.tone-idle { color: var(--text-3); }
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
