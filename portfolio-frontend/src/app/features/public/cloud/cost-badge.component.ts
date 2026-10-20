import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { CostEstimate, formatUsd } from './cloud-costs.data';
import { LivePricingState } from './live-pricing.service';

/**
 * Coste mensual orientativo de lo que hay en el lienzo. Al posar el cursor o pulsarlo
 * despliega el desglose por categoría. Las cifras son órdenes de magnitud, no un presupuesto.
 */
@Component({
    selector: 'app-cost-badge',
    imports: [TranslatePipe],
    host: { class: 'relative block', '(mouseenter)': 'hovered.set(true)', '(mouseleave)': 'hovered.set(false)', '(keydown.escape)': 'pinned.set(false)' },
    template: `
    @if (open()) {
      <!-- Encima de la línea de estado, sin empujar nada. -->
      <div id="cost-breakdown" class="absolute bottom-full left-0 z-20 mb-2 w-64 animate-scale-up rounded-panel border border-line-strong bg-surface-1/95 p-3 text-left shadow-2xl backdrop-blur-2xl" role="region" [attr.aria-label]="'Desglose del coste mensual estimado' | t">
        <p class="text-xs font-medium uppercase tracking-wider text-ink-2">FinOps · {{ providerName() }}</p>
        <ul class="mt-2 space-y-2">
          @for (category of estimate().categories; track category.id) {
            <li>
              <div class="flex items-baseline justify-between gap-3 text-xs">
                <span class="text-ink-1">{{ category.name | t }}</span>
                <span class="font-mono tabular-nums text-ink-1">{{ usd(category.usd) }}</span>
              </div>
              <div class="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <div class="h-full rounded-full bg-status-ok transition-[width] duration-700 ease-spring" [style.width.%]="share(category.usd)"></div>
              </div>
              <p class="mt-0.5 text-xs leading-snug text-ink-3">
                @for (item of category.items; track item.nodeId; let last = $last) {
                  <span [class.text-accent-text]="item.live" [title]="item.live ? ('Precio de lista real' | t) : ('Estimación orientativa' | t)">{{ item.name | t }} {{ usd(item.usd) }}{{ item.live ? ' ●' : '' }}</span>{{ last ? '' : ' · ' }}
                }
              </p>
            </li>
          } @empty {
            <li class="text-xs text-ink-2">{{ 'Ningún nodo del lienzo tiene coste fijo.' | t }}</li>
          }
        </ul>
        @if (estimate().unestimated.length) {
          <p class="mt-2 border-t border-line-subtle pt-2 text-xs leading-snug text-status-warn" data-testid="cost-unestimated">
            Sin estimación: {{ unestimatedNames() }}. No suman al total.
          </p>
        }
        <p class="mt-2 border-t border-line-subtle pt-2 text-xs leading-snug" [class]="estimate().liveUsd > 0 ? 'text-status-ok' : 'text-ink-2'" data-testid="cost-source">
          {{ sourceLabel() }}
        </p>
        <p class="mt-2 border-t border-line-subtle pt-2 text-xs leading-snug text-ink-3">
          {{ 'Estimación orientativa en USD para el tamaño mínimo de cada servicio. No incluye tráfico de salida, el uso de Gemini, soporte ni descuentos. Contrasta con la calculadora oficial antes de decidir.' | t }}
        </p>
      </div>
    }
    <button
      type="button"
      class="focus-ring flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control px-2 py-1 text-left transition duration-300 hover:bg-surface-3"
      [attr.aria-expanded]="open()"
      aria-controls="cost-breakdown"
      [attr.aria-label]="('Coste estimado: ' | t) + usd(estimate().total) + (' al mes en ' | t) + providerName() + ('. Ver desglose' | t)"
      (click)="pinned.set(!pinned())"
    >
      <span class="h-1.5 w-1.5 rounded-full" [class]="estimate().liveUsd > 0 ? 'bg-status-ok' : 'bg-line-control'" aria-hidden="true"></span>
      <span class="text-xs font-medium uppercase tracking-wider text-ink-2">FinOps</span>
      @for (total of [usd(estimate().total)]; track total) {
        <span class="animate-slide-up font-mono text-sm font-semibold tabular-nums text-ink-1">≈ {{ total }}</span>
      }
      <span class="text-xs text-ink-2">{{ '/mes' | t }}</span>
      @if (estimate().liveUsd > 0) {
        <span class="rounded-full border border-status-ok/40 px-1.5 text-xs text-status-ok" data-testid="cost-live" [attr.title]="'Parte del total que son precios de lista reales, leídos de la API del proveedor' | t">{{ usd(estimate().liveUsd) }} {{ 'reales' | t }}</span>
      }
      @if (estimate().unestimated.length) {
        <span class="rounded-full border border-status-warn/40 px-1.5 text-xs text-status-warn" [title]="('Sin estimación: ' | t) + unestimatedNames()">+{{ estimate().unestimated.length }} sin estimación</span>
      }
    </button>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CostBadgeComponent {
  readonly estimate = input.required<CostEstimate>();
  readonly providerName = input.required<string>();
  /** De dónde salen los precios: se dice siempre, para no confundir una estimación con un dato. */
  readonly pricingState = input<LivePricingState>('demo');

  readonly sourceLabel = computed(() => {
    const live = this.estimate().liveUsd;
    if (live > 0) {
      return `${formatUsd(live)} del total son precios de lista reales (●), leídos de la API pública de ${this.providerName()}. El resto son cifras orientativas.`;
    }
    switch (this.pricingState()) {
      case 'demo': return 'Modo demo: sin backend no se consultan precios. Todas las cifras son orientativas.';
      case 'loading': return 'Consultando precios de lista…';
      case 'unavailable': return 'El servidor de precios no responde: todas las cifras son orientativas.';
      case 'live': return `Ningún servicio de este lienzo tiene todavía precio de lista en ${this.providerName()}: todas las cifras son orientativas.`;
      default: return 'Todas las cifras son orientativas.';
    }
  });

  readonly hovered = signal(false);
  readonly pinned = signal(false);
  readonly open = computed(() => this.hovered() || this.pinned());
  readonly usd = formatUsd;

  readonly unestimatedNames = computed(() => [...new Set(this.estimate().unestimated.map((item) => item.name))].join(', '));

  share(usd: number): number {
    return this.estimate().total ? (usd / this.estimate().total) * 100 : 0;
  }

}
