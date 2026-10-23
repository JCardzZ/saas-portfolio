import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { finalize } from 'rxjs';

import { CareerMilestone, PublicCatalogShowcasesService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TechIcon, techIconFor } from '../../../shared/ui/tech-icons';

/** Línea de tiempo profesional. Los hitos salen de `GET /public/career-timeline`. */
@Component({
    selector: 'app-career-timeline',
    imports: [TranslatePipe, TechIconComponent],
    template: `
    @if (error(); as message) {
      <div class="border border-line-subtle bg-surface-1 max-w-md rounded-card p-6 text-center" role="alert">
        <p class="text-sm text-ink-2">{{ message }}</p>
        <button type="button" class="focus-ring mt-3 rounded-control px-3 py-1 text-sm font-medium text-accent-text hover:underline" (click)="load()">
          {{ 'Reintentar' | t }}
        </button>
      </div>
    } @else if (loading()) {
      <div class="space-y-4" aria-hidden="true">
        <div class="border border-line-subtle bg-surface-1 h-32 animate-pulse rounded-card"></div>
        <div class="border border-line-subtle bg-surface-1 h-32 animate-pulse rounded-card"></div>
      </div>
    } @else {
      <!-- Una fila por puesto: periodo, rol y empresa, y el stack principal. Se despliega al pulsar;
           el puesto actual viene abierto. El detalle está siempre en la página (oculto, no ausente). -->
      <ol class="career" data-testid="career-list">
        @for (milestone of milestones(); track $index; let i = $index) {
          <li class="row animate-slide-up" [class.open]="isOpen(i)" [class.current]="isCurrent(milestone)" [class.education]="isEducation(milestone)" [style.animation-delay.ms]="i * 60">
            <!-- Raíl de la línea de tiempo: un punto por hito; el puesto actual, en el acento y con pulso. -->
            <span class="node" aria-hidden="true">
              @if (isEducation(milestone)) {
                <svg viewBox="0 0 16 16"><path d="M1.5 6 8 3l6.5 3L8 9 1.5 6zM4 7.4v3.1c0 .9 1.8 2 4 2s4-1.1 4-2V7.4M14.5 6v4" /></svg>
              }
            </span>
            <h3 class="m-0">
              <button
                type="button"
                class="row-head focus-ring"
                [id]="'career-head-' + i"
                [attr.aria-expanded]="isOpen(i)"
                [attr.aria-controls]="'career-detail-' + i"
                (click)="toggle(i)"
              >
                <span class="when">
                  <span class="period">{{ milestone.period }}</span>
                  @if (isCurrent(milestone)) {
                    <span class="now">{{ 'Actual' | t }}</span>
                  }
                </span>
                <span class="main">
                  <span class="title">{{ milestone.title }}</span>
                  @if (milestone.role || milestone.organization) {
                    <span class="meta">{{ milestone.role }}@if (milestone.role && milestone.organization) {<span> · </span>}{{ milestone.organization }}</span>
                  }
                  <!-- Cerrada, una línea del resumen: se entiende el puesto sin abrirlo. -->
                  @if (!isOpen(i) && milestone.summary) {
                    <span class="preview">{{ milestone.summary }}</span>
                  }
                </span>
                <span class="stack" aria-hidden="true">
                  @for (icon of headIcons(milestone); track $index) {
                    <app-tech-icon [icon]="icon" [size]="16" />
                  }
                </span>
                <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
              </button>
            </h3>
            <div class="detail" role="region" [id]="'career-detail-' + i" [attr.aria-labelledby]="'career-head-' + i" [hidden]="!isOpen(i)">
              @if (duration(milestone); as length) {
                <p class="duration">{{ length }}</p>
              }
              <!-- Cada frase del resumen, un punto: se recorre de un vistazo (el texto es el mismo). -->
              @if (highlights(milestone); as points) {
                @if (points.length > 1) {
                  <h4 class="label">{{ 'Lo que hice' | t }}</h4>
                  <ul class="highlights">
                    @for (point of points; track $index) {
                      <li>{{ point }}</li>
                    }
                  </ul>
                } @else {
                  <p class="summary">{{ milestone.summary }}</p>
                }
              }
              @if (milestone.technologies?.length) {
                <h4 class="label">Stack</h4>
                <ul class="chips" [attr.aria-label]="'Tecnologías' | t">
                  @for (technology of milestone.technologies; track technology) {
                    <li class="chip">
                      @if (iconFor(technology); as icon) {
                        <app-tech-icon [icon]="icon" [size]="12" />
                      }
                      {{ technology }}
                    </li>
                  }
                </ul>
              }
            </div>
          </li>
        } @empty {
          <li class="py-6 text-sm text-ink-2">{{ 'La trayectoria se publicará aquí próximamente.' | t }}</li>
        }
      </ol>
    }
  `,
    styles: `
    .career { position: relative; }
    /* El raíl: una línea vertical continua a la izquierda, entre el periodo y el contenido. */
    .career::before { content: ''; position: absolute; top: 1.5rem; bottom: 1.5rem; left: calc(9rem + 0.6875rem); width: 1px; background: var(--border-subtle); }
    .row { position: relative; }
    .node {
      position: absolute; top: 1.5rem; left: calc(9rem + 0.3125rem); z-index: 1; display: grid; place-items: center;
      width: 0.875rem; height: 0.875rem; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--bg-canvas);
    }
    .node svg { width: 0.75rem; height: 0.75rem; fill: none; stroke: var(--text-2); stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
    .education .node { width: 1.25rem; height: 1.25rem; top: 1.3125rem; left: calc(9rem + 0.125rem); }
    .current .node { border-color: var(--accent-solid); background: var(--accent-solid); box-shadow: 0 0 0 4px rgb(var(--c-accent-solid) / 0.18); }
    .current .node::after { content: ''; position: absolute; inset: -4px; border-radius: 999px; border: 1px solid var(--accent-solid); animation: pulse 2.4s var(--ease-standard) infinite; }
    @keyframes pulse { from { opacity: 0.8; transform: scale(1); } to { opacity: 0; transform: scale(2.2); } }
    .row-head {
      display: grid; width: 100%; align-items: start; gap: 0.25rem 1.5rem; padding: 1.125rem 0.25rem 1.125rem 0.25rem;
      grid-template-columns: 9rem 1.5rem minmax(0, 1fr) auto 1rem; text-align: left; border-radius: var(--radius-control);
      transition: background-color var(--duration-fast) var(--ease-standard);
    }
    .row-head:hover { background: rgb(var(--c-ink-1) / 0.025); }
    .when { display: flex; flex-direction: column; align-items: flex-start; gap: 0.375rem; padding-top: 0.125rem; }
    .period { font: 0.8125rem/1.4 var(--font-mono); color: var(--text-3); font-variant-numeric: tabular-nums; }
    .current .period { color: var(--accent-text); }
    .now { padding: 0 0.5rem; border: 1px solid rgb(var(--c-accent-solid) / 0.4); border-radius: 999px; font-size: 0.75rem; line-height: 1.25rem; color: var(--accent-text); }
    .main { grid-column: 3; display: flex; min-width: 0; flex-direction: column; gap: 0.125rem; }
    .preview { margin-top: 0.375rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; color: var(--text-3); }
    .title { font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text-1); }
    .meta { font-size: 0.875rem; color: var(--text-2); }
    .stack { display: flex; align-items: center; gap: 0.625rem; opacity: 0.85; }
    .chevron { width: 1rem; height: 1rem; fill: none; stroke: var(--text-3); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--duration-base) var(--ease-emphasized); }
    .open .chevron { transform: rotate(180deg); }
    .stack, .chevron { margin-top: 0.25rem; }
    .detail { padding: 0 0.25rem 1.75rem calc(9rem + 1.5rem + 3.25rem); }
    .detail:not([hidden]) { animation: reveal var(--duration-slow) var(--ease-emphasized) both; }
    @keyframes reveal { from { opacity: 0; transform: translateY(-0.25rem); } }
    .summary { max-width: 46rem; font-size: 0.9375rem; line-height: 1.65; color: var(--text-2); }
    .duration { margin-bottom: 1rem; font: 0.8125rem/1.4 var(--font-mono); color: var(--text-3); }
    .label { margin: 1.25rem 0 0.625rem; font: 500 0.75rem/1rem var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
    .label:first-of-type { margin-top: 0; }
    .highlights { display: grid; gap: 0.625rem; max-width: 46rem; }
    .highlights li { position: relative; padding-left: 1.25rem; font-size: 0.9375rem; line-height: 1.6; color: var(--text-2); }
    .highlights li::before { content: ''; position: absolute; left: 0.125rem; top: 0.6em; width: 0.375rem; height: 0.375rem; border-radius: 999px; background: var(--accent-solid); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .chip {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.125rem 0.625rem; border: 1px solid var(--border-subtle);
      border-radius: 999px; font-size: 0.75rem; color: var(--text-2);
    }
    /* Estrecho: el periodo encima del título; sin logos en la fila (están en el detalle). */
    @media (max-width: 640px) {
      .career::before { left: 0.6875rem; }
      .node { left: 0.3125rem; top: 1.25rem; }
      .education .node { left: 0.125rem; top: 1.0625rem; }
      .row-head { grid-template-columns: minmax(0, 1fr) 1rem; padding-left: 2.25rem; }
      .when { grid-column: 1 / -1; flex-direction: row; align-items: center; }
      .main { grid-column: 1; }
      .stack { display: none; }
      .detail { padding-left: 2.25rem; }
    }
    @media (pointer: coarse) { .row-head { min-height: 2.75rem; } }
    @media (prefers-reduced-motion: reduce) { .detail:not([hidden]) { animation: none; } .chevron { transition: none; } .current .node::after { animation: none; opacity: 0; } }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CareerTimelineComponent {
  private readonly api = inject(PublicCatalogShowcasesService);
  private readonly language = inject(LanguageService);

  readonly milestones = signal<CareerMilestone[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly iconFor = techIconFor;
  /** Filas abiertas; la primera (el puesto actual) empieza abierta. */
  private readonly open = signal<ReadonlySet<number>>(new Set([0]));

  isOpen(index: number): boolean {
    return this.open().has(index);
  }

  toggle(index: number): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  /** Frases del resumen, una por punto. No parte por «. » dentro de una abreviatura como «p. ej.». */
  highlights(milestone: CareerMilestone): string[] {
    return (milestone.summary ?? '').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map((sentence) => sentence.trim()).filter(Boolean);
  }

  /** Duración del puesto a partir del periodo («ene 2024 - actualidad» → «2 años 10 meses»). */
  duration(milestone: CareerMilestone): string | null {
    const en = this.language.lang() === 'en';
    return periodLength(milestone.period ?? '', en);
  }

  /** Puesto actual: el periodo termina en «actualidad» / «present». */
  isCurrent(milestone: CareerMilestone): boolean {
    return /actualidad|present|current/i.test(milestone.period ?? '');
  }

  /** Formación: un hito sin rol (título, universidad). */
  isEducation(milestone: CareerMilestone): boolean {
    return !milestone.role;
  }

  /** Hasta cuatro logos del stack del puesto, para reconocerlo de un vistazo (los que tienen logo). */
  headIcons(milestone: CareerMilestone): TechIcon[] {
    const icons = (milestone.technologies ?? []).map((technology) => techIconFor(technology)).filter((icon): icon is TechIcon => !!icon);
    // Spring Boot y Spring Batch comparten logo: uno basta.
    return [...new Set(icons)].slice(0, 4);
  }

  constructor() {
    // La trayectoria llega en el idioma de la página y se vuelve a pedir al cambiarlo.
    effect(() => {
      const lang = this.language.lang();
      untracked(() => this.load(lang));
    });
  }

  load(lang = this.language.lang()): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .publicCareerTimelineGet(lang)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (milestones) => this.milestones.set(milestones),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }
}

const MONTHS: Record<string, number> = {
  ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11,
};

/**
 * Meses entre el inicio y el fin de un periodo con mes y año («may 2022 - ene 2024», ambos meses
 * incluidos, como LinkedIn). `null` si el periodo solo tiene años: no se inventa una duración.
 */
export function periodLength(period: string, en: boolean, today = new Date()): string | null {
  const [from, to] = period.toLowerCase().split(/\s+-\s+/);
  const parse = (text: string | undefined): [number, number] | null => {
    const match = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(text?.trim() ?? '');
    return match && match[1] in MONTHS ? [MONTHS[match[1]], Number(match[2])] : null;
  };
  const start = parse(from);
  const end = /actualidad|present|current/.test(to ?? '') ? [today.getMonth(), today.getFullYear()] as [number, number] : parse(to);
  if (!start || !end) return null;
  const months = (end[1] - start[1]) * 12 + (end[0] - start[0]) + 1;
  if (months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const y = years ? part(years, en ? 'yr' : 'año', en ? 'yrs' : 'años') : '';
  const m = rest ? part(rest, en ? 'mo' : 'mes', en ? 'mos' : 'meses') : '';
  return [y, m].filter(Boolean).join(' ');
}
