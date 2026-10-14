import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { finalize } from 'rxjs';

import { CareerMilestone, PublicCatalogShowcasesService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { techIconFor } from '../../../shared/ui/tech-icons';

/** Línea de tiempo profesional. Los hitos salen de `GET /public/career-timeline`. */
@Component({
  selector: 'app-career-timeline',
  standalone: true,
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
      <ol class="relative space-y-4 border-l border-line-subtle pl-6 sm:pl-8">
        @for (milestone of milestones(); track $index) {
          <li class="relative animate-slide-up" [style.animation-delay.ms]="$index * 70">
            <span class="absolute -left-[1.85rem] top-7 h-2.5 w-2.5 rounded-full bg-accent-text sm:-left-[2.35rem]" aria-hidden="true"></span>
            <article class="bento-card">
              <p class="font-mono text-xs text-accent-text">{{ milestone.period }}</p>
              <h3 class="mt-1 text-xl font-semibold tracking-tight text-ink-1">{{ milestone.title }}</h3>
              @if (milestone.role || milestone.organization) {
                <p class="mt-0.5 text-sm text-ink-2">
                  {{ milestone.role }}@if (milestone.role && milestone.organization) {<span> · </span>}{{ milestone.organization }}
                </p>
              }
              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">{{ milestone.summary }}</p>

              @if (milestone.technologies?.length) {
                <ul class="mt-4 flex flex-wrap gap-1.5" [attr.aria-label]="'Tecnologías' | t">
                  @for (technology of milestone.technologies; track technology) {
                    <li class="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
                      @if (iconFor(technology); as icon) {
                        <app-tech-icon [icon]="icon" [size]="12" />
                      }
                      {{ technology }}
                    </li>
                  }
                </ul>
              }
            </article>
          </li>
        } @empty {
          <li class="border border-line-subtle bg-surface-1 rounded-card p-6 text-sm text-ink-2">{{ 'La trayectoria se publicará aquí próximamente.' | t }}</li>
        }
      </ol>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerTimelineComponent implements OnInit {
  private readonly api = inject(PublicCatalogShowcasesService);

  readonly milestones = signal<CareerMilestone[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly iconFor = techIconFor;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .publicCareerTimelineGet()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (milestones) => this.milestones.set(milestones),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }
}
