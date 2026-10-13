import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AutofocusDirective } from '../../../../shared/ui/autofocus.directive';
import { FocusTrapDirective } from '../../../../shared/ui/focus-trap.directive';
import { PortalDirective } from '../../../../shared/ui/portal.directive';
import { Advice, Assessment, Level } from './system-advisor';

const LEVEL_NAMES: Record<Level, string> = { good: 'Bien', limited: 'Con límites', risk: 'En riesgo' };
const LEVEL_BADGES: Record<Level, string> = { good: 'ui-badge ui-badge-ok', limited: 'ui-badge ui-badge-warn', risk: 'ui-badge ui-badge-danger' };

/**
 * Símbolo del asistente de diseño: un núcleo con dos órbitas que giran despacio. Es un dibujo
 * propio; con `prefers-reduced-motion` queda quieto (regla global).
 */
@Component({
  selector: 'app-advisor-orb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block shrink-0', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  template: `
    <svg class="orb block h-full w-full" viewBox="0 0 48 48" fill="none" aria-hidden="true" [attr.data-level]="level()">
      <circle class="halo" cx="24" cy="24" r="22" />
      <g class="ring ring-a"><ellipse cx="24" cy="24" rx="20" ry="8.5" /><circle class="moon" cx="44" cy="24" r="2" /></g>
      <g class="ring ring-b"><ellipse cx="24" cy="24" rx="20" ry="8.5" /><circle class="moon" cx="4" cy="24" r="1.6" /></g>
      <path class="core" d="M24 13.5l2.7 7.8 7.8 2.7-7.8 2.7-2.7 7.8-2.7-7.8-7.8-2.7 7.8-2.7z" />
    </svg>
  `,
  styles: `
    .orb { --tone: var(--accent-text); overflow: visible; }
    .orb[data-level='limited'] { --tone: var(--status-warn); }
    .orb[data-level='risk'] { --tone: var(--status-danger); }
    .halo { fill: var(--tone); opacity: 0.1; transform-origin: 24px 24px; animation: orb-breathe 3.2s ease-in-out infinite; }
    .ring { transform-origin: 24px 24px; }
    .ring ellipse { stroke: var(--tone); stroke-width: 1.1; opacity: 0.75; }
    .ring-a { animation: orb-spin-a 9s linear infinite; }
    .ring-b { animation: orb-spin-b 13s linear infinite; }
    .moon { fill: var(--tone); }
    .core { fill: var(--text-1); transform-origin: 24px 24px; animation: orb-pulse 3.2s ease-in-out infinite; }
    @keyframes orb-spin-a { from { transform: rotate(-28deg); } to { transform: rotate(332deg); } }
    @keyframes orb-spin-b { from { transform: rotate(52deg); } to { transform: rotate(-308deg); } }
    @keyframes orb-breathe { 50% { opacity: 0.2; transform: scale(1.06); } }
    @keyframes orb-pulse { 50% { transform: scale(0.88); } }
  `,
})
export class AdvisorOrbComponent {
  readonly size = input(28);
  readonly level = input<Level>('good');
}

/**
 * Ventana del asistente de diseño: el veredicto, cómo queda cada dimensión y los consejos, cada uno
 * con su porqué y, cuando es una elección de esta vista, un botón que la aplica. Lo que muestra lo
 * calcula `assessSystem`; aquí no hay ninguna regla.
 */
@Component({
  selector: 'app-system-advisor',
  standalone: true,
  imports: [AdvisorOrbComponent, AutofocusDirective, FocusTrapDirective, PortalDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div appPortal class="fixed inset-0 z-dialog flex items-end justify-center sm:items-center sm:p-6" data-testid="advisor-layer" (keydown.escape)="closed.emit()">
      <div class="absolute inset-0 bg-canvas/70 backdrop-blur-sm" data-testid="advisor-backdrop" (click)="closed.emit()"></div>
      <section
        appFocusTrap
        role="dialog"
        aria-modal="true"
        aria-labelledby="advisor-title"
        class="advisor relative flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden border border-line-strong bg-surface-2 text-ink-1 shadow-floating max-sm:rounded-t-card max-sm:pb-[env(safe-area-inset-bottom)] sm:max-w-2xl sm:rounded-panel"
      >
        <header class="flex shrink-0 items-start gap-4 border-b border-line-subtle px-5 py-4">
          <app-advisor-orb [size]="48" [level]="assessment().verdict" />
          <div class="min-w-0 flex-1">
            <p class="text-overline uppercase text-ink-3">Asistente de diseño</p>
            <h3 id="advisor-title" class="text-title-2 text-ink-1" data-testid="advisor-headline">{{ assessment().headline }}</h3>
            <p class="mt-0.5 text-body-sm text-ink-2">{{ counts() }}</p>
          </div>
          <button appAutofocus type="button" class="ui-btn-ghost shrink-0" (click)="closed.emit()">Cerrar</button>
        </header>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <ul class="grid gap-2 sm:grid-cols-2" aria-label="Cómo queda cada dimensión">
            @for (dimension of assessment().dimensions; track dimension.id) {
              <li class="rounded-control border border-line-subtle bg-surface-1 px-3 py-2" [attr.data-dimension]="dimension.id" [attr.data-level]="dimension.level">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-body-sm font-medium text-ink-1">{{ dimension.name }}</span>
                  <span [class]="badge(dimension.level)">{{ levelName(dimension.level) }}</span>
                </div>
                <p class="mt-0.5 text-caption font-normal text-ink-2">{{ dimension.summary }}</p>
              </li>
            }
          </ul>

          @for (dimension of withAdvice(); track dimension.id) {
            <div>
              <h4 class="text-overline uppercase text-ink-3">{{ dimension.name }}</h4>
              <ul class="mt-2 space-y-2">
                @for (item of dimension.advice; track item.id) {
                  <li class="rounded-control border border-line-subtle px-3 py-2.5" [attr.data-advice]="item.id">
                    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <p class="min-w-0 text-body-sm font-medium text-ink-1">{{ item.title }}</p>
                      <span [class]="badge(item.level)">{{ item.level === 'risk' ? 'Bloquea' : 'Mejorable' }}</span>
                    </div>
                    <p class="mt-1 text-body-sm text-ink-2">{{ item.why }}</p>
                    @if (item.action; as action) {
                      @if (action.kind === 'choose') {
                        <button type="button" class="ui-btn-secondary mt-2" [disabled]="readonly()" [attr.data-apply]="item.id" (click)="applied.emit(item)">{{ action.label }}</button>
                      } @else {
                        <p class="mt-2 text-caption font-normal text-ink-3">{{ action.label }}.</p>
                      }
                    }
                  </li>
                }
              </ul>
            </div>
          }

          @if (strengths().length) {
            <div>
              <h4 class="text-overline uppercase text-ink-3">Lo que ya juega a favor</h4>
              <ul class="mt-2 space-y-1 text-body-sm text-ink-2" data-testid="advisor-strengths">
                @for (strength of strengths(); track strength) {
                  <li class="flex gap-2"><span class="text-status-ok" aria-hidden="true">✓</span><span class="min-w-0">{{ strength }}</span></li>
                }
              </ul>
            </div>
          }
        </div>

        <footer class="shrink-0 border-t border-line-subtle px-5 py-3">
          <p class="text-caption font-normal text-ink-3" data-testid="advisor-basis">
            Reglas deterministas sobre lo que has elegido y sobre la infraestructura del lienzo. No es un modelo de IA ni una medición: orienta, no garantiza.
          </p>
        </footer>
      </section>
    </div>
  `,
  styles: `
    .advisor { animation: advisor-in var(--duration-slow) var(--ease-emphasized) backwards; }
    @keyframes advisor-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } }
  `,
})
export class SystemAdvisorComponent {
  readonly assessment = input.required<Assessment>();
  /** En pantallas estrechas la vista no se edita: los consejos se leen, no se aplican. */
  readonly readonly = input(false);
  readonly closed = output<void>();
  /** El visitante quiere aplicar un consejo que cambia una elección. */
  readonly applied = output<Advice>();

  readonly withAdvice = computed(() => this.assessment().dimensions.filter((dimension) => dimension.advice.length));
  readonly strengths = computed(() => this.assessment().dimensions.flatMap((dimension) => dimension.strengths));
  readonly counts = computed(() => {
    const advice = this.assessment().advice;
    const blocking = advice.filter((item) => item.level === 'risk').length;
    if (!advice.length) {
      return 'No hay nada que cambiar con lo que se sabe del sistema.';
    }
    const total = `${advice.length} ${advice.length === 1 ? 'sugerencia' : 'sugerencias'}`;
    return blocking ? `${total}, ${blocking} ${blocking === 1 ? 'bloquea' : 'bloquean'} el crecimiento.` : `${total} para mejorarlo.`;
  });

  levelName(level: Level): string {
    return LEVEL_NAMES[level];
  }

  badge(level: Level): string {
    return LEVEL_BADGES[level];
  }
}
