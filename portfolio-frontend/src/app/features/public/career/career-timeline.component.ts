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
          <li class="row animate-slide-up" [class.open]="isOpen(i)" [style.animation-delay.ms]="i * 60">
            <h3 class="m-0">
              <button
                type="button"
                class="row-head focus-ring"
                [id]="'career-head-' + i"
                [attr.aria-expanded]="isOpen(i)"
                [attr.aria-controls]="'career-detail-' + i"
                (click)="toggle(i)"
              >
                <span class="period">{{ milestone.period }}</span>
                <span class="main">
                  <span class="title">{{ milestone.title }}</span>
                  @if (milestone.role || milestone.organization) {
                    <span class="meta">{{ milestone.role }}@if (milestone.role && milestone.organization) {<span> · </span>}{{ milestone.organization }}</span>
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
              <p class="summary">{{ milestone.summary }}</p>
              @if (milestone.technologies?.length) {
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
    .career { border-top: 1px solid var(--border-subtle); }
    .row { border-bottom: 1px solid var(--border-subtle); }
    .row-head {
      display: grid; width: 100%; align-items: center; gap: 0.25rem 1.5rem; padding: 1.125rem 0.25rem;
      grid-template-columns: 9rem minmax(0, 1fr) auto 1rem; text-align: left;
      transition: background-color var(--duration-fast) var(--ease-standard);
    }
    .row-head:hover { background: rgb(var(--c-ink-1) / 0.025); }
    .period { font: 0.8125rem/1.4 var(--font-mono); color: var(--accent-text); font-variant-numeric: tabular-nums; }
    .main { display: flex; min-width: 0; flex-direction: column; gap: 0.125rem; }
    .title { font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text-1); }
    .meta { font-size: 0.875rem; color: var(--text-2); }
    .stack { display: flex; align-items: center; gap: 0.625rem; opacity: 0.85; }
    .chevron { width: 1rem; height: 1rem; fill: none; stroke: var(--text-3); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--duration-base) var(--ease-emphasized); }
    .open .chevron { transform: rotate(180deg); }
    .detail { padding: 0 0.25rem 1.5rem calc(9rem + 1.75rem); }
    .detail:not([hidden]) { animation: reveal var(--duration-slow) var(--ease-emphasized) both; }
    @keyframes reveal { from { opacity: 0; transform: translateY(-0.25rem); } }
    .summary { max-width: 46rem; font-size: 0.9375rem; line-height: 1.65; color: var(--text-2); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.875rem; }
    .chip {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.125rem 0.625rem; border: 1px solid var(--border-subtle);
      border-radius: 999px; font-size: 0.75rem; color: var(--text-2);
    }
    /* Estrecho: el periodo encima del título; sin logos en la fila (están en el detalle). */
    @media (max-width: 640px) {
      .row-head { grid-template-columns: minmax(0, 1fr) 1rem; }
      .period { grid-column: 1 / -1; }
      .stack { display: none; }
      .detail { padding-left: 0.25rem; }
    }
    @media (pointer: coarse) { .row-head { min-height: 2.75rem; } }
    @media (prefers-reduced-motion: reduce) { .detail:not([hidden]) { animation: none; } .chevron { transition: none; } }
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
