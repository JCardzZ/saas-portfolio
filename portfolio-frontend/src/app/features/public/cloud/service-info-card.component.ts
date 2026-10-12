import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';

import { CloudProviderId } from './cloud-topology.data';
import { CardSide, ServiceCard } from './service-card';

/** Cuánto hay que arrastrar la hoja hacia abajo para cerrarla. */
export const SHEET_DISMISS_PX = 80;

/**
 * Tarjeta informativa de un servicio (docs/DESIGN.md, panel flotante). Solo pinta lo que recibe:
 * el contenido lo calcula `buildServiceCard` a partir del catálogo y del diagrama. `variant`
 * decide la forma: `popover`, anclada junto al nodo con una flecha hacia él, o `sheet`, la hoja
 * inferior de móviles y tabletas, que se cierra deslizándola hacia abajo o con «Cerrar».
 */
@Component({
  selector: 'app-service-info-card',
  standalone: true,
  template: `
    <section
      role="dialog"
      [attr.aria-modal]="variant() === 'sheet' ? 'true' : null"
      [attr.aria-labelledby]="titleId()"
      class="service-card relative flex max-h-full flex-col border border-line-strong bg-surface-2 text-ink-1 shadow-floating"
      [class]="variant() === 'sheet' ? 'rounded-t-card pb-[env(safe-area-inset-bottom)]' : 'rounded-panel'"
      [attr.data-side]="variant() === 'popover' ? side() : null"
      [style.--arrow.px]="arrow()"
      (keydown.escape)="$event.stopPropagation(); closed.emit()"
    >
      @if (variant() === 'sheet') {
        <!-- Asa para arrastrar la hoja hacia abajo. -->
        <div
          class="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          data-testid="sheet-handle"
          aria-hidden="true"
          (pointerdown)="dragStart($event)"
          (pointermove)="dragMove($event)"
          (pointerup)="dragEnd($event)"
          (pointercancel)="dragEnd($event)"
        >
          <span class="h-1 w-10 rounded-full bg-line-strong"></span>
        </div>
      } @else {
        <span class="service-card-arrow" aria-hidden="true"></span>
      }

      <header class="flex shrink-0 items-start gap-3 border-b border-line-subtle px-4 py-3">
        <div class="min-w-0 flex-1">
          <h3 [id]="titleId()" class="text-title-3 text-ink-1">{{ card().title }}</h3>
          @if (card().officialName !== card().title) {
            <p class="text-body-sm text-ink-2">{{ card().officialName }}</p>
          }
        </div>
        <button type="button" class="ui-btn-ghost shrink-0" data-testid="card-close" (click)="closed.emit()">Cerrar</button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <h4 class="text-overline uppercase text-ink-3">Qué es</h4>
          <p class="mt-1 text-body-sm text-ink-1">{{ card().what }}</p>
          @if (card().note; as note) {
            <p class="mt-1 text-body-sm text-ink-2">{{ note }}</p>
          }
        </div>

        @if (card().uses.length) {
          <div>
            <h4 class="text-overline uppercase text-ink-3">Para qué se usa</h4>
            <ul class="mt-1 list-disc space-y-0.5 pl-5 text-body-sm text-ink-1">
              @for (use of card().uses; track use) {
                <li>{{ use }}</li>
              }
            </ul>
          </div>
        }

        @if (!card().equivalence.direct) {
          <div class="rounded-control border border-status-warn/40 bg-status-warn/10 px-3 py-2" data-testid="card-no-equivalent">
            <span class="ui-badge-warn">Sin equivalente directo</span>
            <p class="mt-1.5 text-body-sm text-ink-1">{{ card().equivalence.tradeoff }}</p>
          </div>
        }

        <div>
          <h4 class="text-overline uppercase text-ink-3">En este diagrama</h4>
          <dl class="mt-1 space-y-1 text-body-sm">
            <div class="flex gap-2"><dt class="w-24 shrink-0 text-ink-3">Recibe de</dt><dd class="min-w-0 text-ink-1">{{ card().context.receivesFrom.join(', ') || 'Nadie' }}</dd></div>
            <div class="flex gap-2"><dt class="w-24 shrink-0 text-ink-3">Envía a</dt><dd class="min-w-0 text-ink-1">{{ card().context.sendsTo.join(', ') || 'Nadie' }}</dd></div>
            <div class="flex gap-2"><dt class="w-24 shrink-0 text-ink-3">Zona</dt><dd class="min-w-0 text-ink-1">{{ card().context.zone }}</dd></div>
            <div class="flex gap-2">
              <dt class="w-24 shrink-0 text-ink-3">Coste</dt>
              <dd class="flex min-w-0 flex-wrap items-center gap-2 text-ink-1">
                @if (card().cost.kind !== 'none') {
                  <span class="font-mono text-mono">{{ card().cost.label }}</span>
                }
                <span [class]="card().cost.kind === 'live' ? 'ui-badge-ok' : 'ui-badge'" data-testid="card-cost-tag">{{ card().cost.tag }}</span>
              </dd>
            </div>
          </dl>
          @if (card().context.warnings.length) {
            <ul class="mt-2 space-y-1" data-testid="card-warnings">
              @for (warning of card().context.warnings; track warning) {
                <li class="flex gap-2 text-body-sm text-status-warn"><span aria-hidden="true">!</span><span class="min-w-0">{{ warning }}</span></li>
              }
            </ul>
          }
        </div>

        @if (card().equivalents.length) {
          <div>
            <h4 class="text-overline uppercase text-ink-3">En las otras nubes</h4>
            <ul class="mt-1.5 flex flex-wrap gap-2">
              @for (equivalent of card().equivalents; track equivalent.provider) {
                <li>
                  <button
                    type="button"
                    class="ui-focus tap inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-left text-body-sm text-ink-1 transition-colors duration-fast ease-standard hover:border-line-control"
                    [attr.data-provider]="equivalent.provider"
                    [attr.aria-label]="'Ver en ' + equivalent.cloud + ': ' + equivalent.name + (equivalent.direct ? '' : ' (sin equivalente directo)')"
                    (click)="providerChosen.emit(equivalent.provider)"
                  >
                    <span class="shrink-0 text-ink-3">{{ equivalent.cloud }}</span>
                    <span class="min-w-0">{{ equivalent.name }}</span>
                    @if (!equivalent.direct) {
                      <span class="shrink-0 text-status-warn" aria-hidden="true">≈</span>
                    }
                  </button>
                </li>
              }
            </ul>
          </div>
        } @else if (card().cloudAgnostic && card().docs) {
          <p class="text-body-sm text-ink-2">Es el mismo producto en cualquier nube.</p>
        }
      </div>

      @if (card().docs; as docs) {
        <footer class="shrink-0 border-t border-line-subtle px-4 py-3">
          <a class="ui-focus tap inline-flex items-center gap-1.5 rounded-mark text-body-sm text-accent-text hover:underline" [href]="docs.url" target="_blank" rel="noopener noreferrer">
            Documentación oficial
            <span class="text-ink-3">· {{ docs.host }}</span>
            <span class="sr-only">(se abre en otra pestaña)</span>
          </a>
        </footer>
      }
    </section>
  `,
  styles: `
    :host { display: block; max-height: 100%; }
    .service-card { animation: service-card-in var(--duration-base) var(--ease-standard) backwards; }
    @keyframes service-card-in { from { opacity: 0; transform: translateY(4px); } }
    /* La flecha es un cuadrado girado que asoma por el borde que mira al nodo. */
    .service-card-arrow {
      position: absolute;
      width: 10px;
      height: 10px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-strong);
      transform: rotate(45deg);
    }
    [data-side='right'] > .service-card-arrow { left: -6px; top: calc(var(--arrow) - 5px); border-right: 0; border-top: 0; }
    [data-side='left'] > .service-card-arrow { right: -6px; top: calc(var(--arrow) - 5px); border-left: 0; border-bottom: 0; }
    [data-side='bottom'] > .service-card-arrow { top: -6px; left: calc(var(--arrow) - 5px); border-right: 0; border-bottom: 0; }
    [data-side='top'] > .service-card-arrow { bottom: -6px; left: calc(var(--arrow) - 5px); border-left: 0; border-top: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceInfoCardComponent {
  readonly card = input.required<ServiceCard>();
  readonly variant = input<'popover' | 'sheet'>('popover');
  /** Lado del nodo en el que está la tarjeta y posición de la flecha (`placeCard`). */
  readonly side = input<CardSide>('right');
  readonly arrow = input(24);

  readonly closed = output<void>();
  /** El visitante quiere ver este mismo nodo en otra nube. */
  readonly providerChosen = output<CloudProviderId>();

  readonly titleId = computed(() => `service-card-title-${this.card().nodeId}`);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private dragFrom: number | null = null;

  dragStart(event: PointerEvent): void {
    this.dragFrom = event.clientY;
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  /** La hoja sigue al dedo, solo hacia abajo. */
  dragMove(event: PointerEvent): void {
    if (this.dragFrom !== null) {
      this.host.style.transform = `translateY(${Math.max(0, event.clientY - this.dragFrom)}px)`;
    }
  }

  dragEnd(event: PointerEvent): void {
    if (this.dragFrom === null) {
      return;
    }
    const distance = event.clientY - this.dragFrom;
    this.dragFrom = null;
    this.host.style.transform = '';
    if (distance >= SHEET_DISMISS_PX) {
      this.closed.emit();
    }
  }
}
