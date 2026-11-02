import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { SystemCategoryId } from './system-catalog.data';
import { SystemDesign } from './system-design';
import { JourneyKind, JourneyStep, requestJourney } from './request-journey';

const PLAY_STEP_MS = 750;

/**
 * Recorrido de una petición (flag `studio.app-e2e`): una cascada como la de la pestaña de red del
 * navegador. Cada salto ocupa su tiempo en la línea; lo asíncrono va aparte, después de la
 * respuesta. Al abrir un salto se ve qué pasa si esa pieza cae y cómo se mitiga.
 */
@Component({
  selector: 'app-request-journey',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="journey" aria-labelledby="journey-title" data-testid="request-journey">
      <header class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="min-w-0 flex-1">
          <h5 id="journey-title" class="text-sm font-semibold text-ink-1">{{ 'Recorrido de una petición' | t }}</h5>
          <p class="text-xs text-ink-3">{{ 'De punta a punta, con la latencia de cada salto y qué pasa si cae.' | t }}</p>
        </div>
        <div class="ui-segmented" role="tablist" [attr.aria-label]="'Tipo de petición' | t">
          @for (option of kinds; track option.id) {
            <button type="button" role="tab" class="ui-segment" [attr.aria-selected]="kind() === option.id" (click)="select(option.id)">{{ option.label | t }}</button>
          }
        </div>
        <button type="button" class="ui-btn-secondary journey-play" [attr.aria-pressed]="playing()" data-testid="journey-play" (click)="playing() ? stop() : play()">
          <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true">
            @if (playing()) { <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /> } @else { <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> }
          </svg>
          {{ playing() ? ('Detener' | t) : ('Reproducir' | t) }}
        </button>
      </header>

      <ol class="journey-list" role="list">
        @for (step of journey().steps; track $index; let i = $index) {
          @let bar = bars()[i];
          <li class="journey-row" [class.journey-row-on]="current() === i" [class.journey-row-async]="step.async" [attr.data-step]="i">
            <button type="button" class="journey-head" [attr.aria-expanded]="open() === i" [attr.aria-controls]="'journey-detail-' + i" (click)="toggle(i)" (mouseenter)="hover(step)" (mouseleave)="hover(null)" (focus)="hover(step)" (blur)="hover(null)">
              <span class="journey-index" aria-hidden="true">{{ i + 1 }}</span>
              <span class="journey-who min-w-0">
                <span class="block truncate text-sm font-medium text-ink-1">{{ step.actor }}</span>
                <span class="block truncate text-xs text-ink-3">{{ step.action }}</span>
              </span>
              <span class="journey-track" aria-hidden="true">
                <span class="journey-bar" [class.journey-bar-async]="step.async" [style.left.%]="bar.left" [style.width.%]="bar.width"></span>
              </span>
              <span class="journey-ms">{{ step.async ? ('después' | t) : (step.ms ? step.ms + ' ms' : '—') }}</span>
            </button>
            @if (open() === i) {
              <div class="journey-detail" [id]="'journey-detail-' + i" data-testid="journey-detail">
                <p class="text-ink-1">{{ step.action }}</p>
                <p><span class="journey-tag journey-tag-risk">{{ 'Si cae' | t }}</span>{{ step.failure.impact }}</p>
                <p><span class="journey-tag journey-tag-fix">{{ 'Mitigación' | t }}</span>{{ step.failure.mitigation }}</p>
              </div>
            }
          </li>
        }
      </ol>

      <footer class="journey-total" data-testid="journey-total">
        <span class="text-ink-2">{{ 'El usuario espera' | t }}</span>
        <strong class="font-mono text-base text-ink-1">≈ {{ journey().totalMs }} ms</strong>
        @if (journey().targetMs; as target) {
          <span class="ui-badge" [class.ui-badge-ok]="journey().totalMs <= target" [class.ui-badge-warn]="journey().totalMs > target">
            {{ journey().totalMs <= target ? ('dentro del objetivo p95 de' | t) : ('por encima del objetivo p95 de' | t) }} {{ target }} ms
          </span>
        } @else {
          <span class="text-xs text-ink-3">{{ 'Fija una latencia en los requisitos para compararla.' | t }}</span>
        }
        <span class="ml-auto text-xs text-ink-3">{{ 'Órdenes de magnitud dentro de una región, no una medición.' | t }}</span>
      </footer>
      <p class="sr-only" aria-live="polite">{{ live() }}</p>
    </section>
  `,
  styles: [`
    .journey { border-radius: var(--radius-panel); border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-1) / 0.6); padding: 1rem; }
    .journey-play { display: inline-flex; align-items: center; gap: 0.45rem; }
    .journey-list { margin-top: 0.85rem; border-top: 1px solid var(--border-subtle); }
    .journey-row { border-bottom: 1px solid var(--border-subtle); transition: background var(--duration-fast) var(--ease-standard); }
    .journey-row-on { background: rgb(var(--c-accent-solid) / 0.08); }
    .journey-head { display: grid; grid-template-columns: 1.5rem minmax(0, 15rem) minmax(4rem, 1fr) 4.5rem; align-items: center; gap: 0.75rem; width: 100%; padding: 0.55rem 0.25rem; text-align: left; }
    .journey-head:hover { background: rgb(var(--c-ink-1) / 0.03); }
    .journey-head:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -2px; border-radius: 6px; }
    .journey-index { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 9999px; border: 1px solid var(--border-strong); font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-3); }
    .journey-row-on .journey-index { border-color: var(--accent-text); color: var(--accent-text); }
    .journey-track { position: relative; height: 0.5rem; border-radius: 9999px; background: rgb(var(--c-ink-1) / 0.05); }
    .journey-bar { position: absolute; top: 0; bottom: 0; min-width: 3px; border-radius: 9999px; background: var(--text-3); transition: background var(--duration-fast); }
    .journey-row-on .journey-bar { background: var(--accent-text); }
    .journey-bar-async { background: transparent !important; border: 1px dashed var(--text-3); }
    .journey-row-async .journey-who { opacity: 0.8; }
    .journey-ms { text-align: right; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .journey-detail { display: grid; gap: 0.35rem; padding: 0 0.25rem 0.75rem 2.25rem; font-size: 0.8125rem; line-height: 1.5; color: var(--text-2); }
    .journey-tag { display: inline-block; margin-right: 0.5rem; padding: 0 0.4rem; border-radius: 0.3rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .journey-tag-risk { background: rgb(var(--c-status-danger) / 0.12); color: var(--status-danger); }
    .journey-tag-fix { background: rgb(var(--c-status-ok) / 0.12); color: var(--status-ok); }
    .journey-total { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; margin-top: 0.85rem; font-size: 0.875rem; }
    @media (max-width: 640px) {
      .journey-head { grid-template-columns: 1.5rem minmax(0, 1fr) 4rem; }
      .journey-track { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .journey-row, .journey-bar { transition: none; } }
  `],
})
export class RequestJourneyComponent {
  readonly design = input.required<SystemDesign>();
  /** Pieza del diagrama que se resalta: la del salto abierto, bajo el cursor o en reproducción. */
  readonly highlight = output<SystemCategoryId | null>();

  readonly kinds: { id: JourneyKind; label: string }[] = [{ id: 'read', label: 'Leer' }, { id: 'write', label: 'Escribir' }];
  readonly kind = signal<JourneyKind>('read');
  readonly journey = computed(() => requestJourney(this.design(), this.kind()));
  /** Salto abierto (su detalle de fallo) y salto en reproducción. */
  readonly open = signal<number | null>(null);
  readonly current = signal<number | null>(null);
  readonly playing = signal(false);
  readonly live = signal('');
  private timer: ReturnType<typeof setInterval> | undefined;

  /** Posición de cada barra en la cascada: lo síncrono, uno tras otro; lo asíncrono, tras su salto anterior. */
  readonly bars = computed(() => {
    const { steps, totalMs } = this.journey();
    const span = Math.max(1, totalMs);
    let at = 0;
    return steps.map((step) => {
      if (step.async) {
        return { left: Math.min(96, (at / span) * 100), width: 4 };
      }
      const bar = { left: (at / span) * 100, width: Math.max(0.8, (step.ms / span) * 100) };
      at += step.ms;
      return bar;
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  select(kind: JourneyKind): void {
    this.stop();
    this.kind.set(kind);
    this.open.set(null);
  }

  toggle(index: number): void {
    this.open.set(this.open() === index ? null : index);
    this.highlight.emit(this.open() === null ? null : this.journey().steps[index].category);
  }

  hover(step: JourneyStep | null): void {
    if (!this.playing()) {
      this.highlight.emit(step?.category ?? null);
    }
  }

  /** Recorre los saltos uno a uno, resaltando cada pieza en el diagrama. */
  play(): void {
    this.stop();
    this.playing.set(true);
    this.advance(0);
    this.timer = setInterval(() => {
      const next = (this.current() ?? -1) + 1;
      if (next >= this.journey().steps.length) {
        this.stop();
        this.live.set(`Respuesta en ≈ ${this.journey().totalMs} ms`);
      } else {
        this.advance(next);
      }
    }, PLAY_STEP_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
    this.current.set(null);
    this.highlight.emit(null);
  }

  private advance(index: number): void {
    const step = this.journey().steps[index];
    this.current.set(index);
    this.highlight.emit(step.category);
    this.live.set(`${index + 1}. ${step.actor}: ${step.action}`);
  }
}
