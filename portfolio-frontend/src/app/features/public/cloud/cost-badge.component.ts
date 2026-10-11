import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { CostEstimate, formatUsd } from './cloud-costs.data';
import { LivePricingState } from './live-pricing.service';

/**
 * Coste mensual orientativo de lo que hay en el lienzo. Al posar el cursor o pulsarlo
 * despliega el desglose por categoría. Las cifras son órdenes de magnitud, no un presupuesto.
 */
@Component({
  selector: 'app-cost-badge',
  standalone: true,
  host: { class: 'block', '(mouseenter)': 'hovered.set(true)', '(mouseleave)': 'hovered.set(false)', '(keydown.escape)': 'pinned.set(false)' },
  template: `
    @if (open()) {
      <div id="cost-breakdown" class="mb-2 w-64 animate-scale-up rounded-2xl border border-white/15 bg-zinc-950/90 p-3 text-left shadow-2xl backdrop-blur-2xl" role="region" aria-label="Desglose del coste mensual estimado">
        <p class="text-[10px] font-medium uppercase tracking-wider text-zinc-400">FinOps · {{ providerName() }}</p>
        <ul class="mt-2 space-y-2">
          @for (category of estimate().categories; track category.id) {
            <li>
              <div class="flex items-baseline justify-between gap-3 text-xs">
                <span class="text-zinc-200">{{ category.name }}</span>
                <span class="font-mono tabular-nums text-white">{{ usd(category.usd) }}</span>
              </div>
              <div class="mt-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div class="h-full rounded-full bg-emerald-400 transition-[width] duration-700 ease-spring" [style.width.%]="share(category.usd)"></div>
              </div>
              <p class="mt-0.5 text-[10px] leading-snug text-zinc-500">
                @for (item of category.items; track item.nodeId; let last = $last) {
                  <span [class.text-emerald-300]="item.live" [title]="item.live ? 'Precio de lista real' : 'Estimación orientativa'">{{ item.name }} {{ usd(item.usd) }}{{ item.live ? ' ●' : '' }}</span>{{ last ? '' : ' · ' }}
                }
              </p>
            </li>
          } @empty {
            <li class="text-xs text-zinc-400">Ningún nodo del lienzo tiene coste fijo.</li>
          }
        </ul>
        @if (estimate().unestimated.length) {
          <p class="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug text-amber-200" data-testid="cost-unestimated">
            Sin estimación: {{ unestimatedNames() }}. No suman al total.
          </p>
        }
        <p class="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug" [class]="estimate().liveUsd > 0 ? 'text-emerald-200' : 'text-zinc-400'" data-testid="cost-source">
          {{ sourceLabel() }}
        </p>
        <p class="mt-2 border-t border-white/10 pt-2 text-[10px] leading-snug text-zinc-500">
          Estimación orientativa en USD para el tamaño mínimo de cada servicio. No incluye tráfico de salida, el uso de
          Gemini, soporte ni descuentos. Contrasta con la calculadora oficial antes de decidir.
        </p>
      </div>
    }
    <button
      type="button"
      class="focus-ring glass flex items-center gap-2 rounded-full px-3 py-1.5 text-left transition duration-500 ease-spring hover:bg-white/10"
      [attr.aria-expanded]="open()"
      aria-controls="cost-breakdown"
      [attr.aria-label]="'Coste estimado: ' + usd(estimate().total) + ' al mes en ' + providerName() + '. Ver desglose'"
      (click)="pinned.set(!pinned())"
    >
      <span class="h-1.5 w-1.5 rounded-full" [class]="estimate().liveUsd > 0 ? 'bg-emerald-400' : 'bg-zinc-500'" aria-hidden="true"></span>
      <span class="text-[10px] font-medium uppercase tracking-wider text-zinc-400">FinOps</span>
      @for (total of [usd(estimate().total)]; track total) {
        <span class="animate-slide-up font-mono text-sm font-semibold tabular-nums text-white">≈ {{ total }}</span>
      }
      <span class="text-[11px] text-zinc-400">/mes</span>
      @if (estimate().liveUsd > 0) {
        <span class="rounded-full border border-emerald-300/40 px-1.5 text-[10px] text-emerald-200" data-testid="cost-live" title="Parte del total que son precios de lista reales, leídos de la API del proveedor">{{ usd(estimate().liveUsd) }} reales</span>
      }
      @if (estimate().unestimated.length) {
        <span class="rounded-full border border-amber-300/40 px-1.5 text-[10px] text-amber-200" [title]="'Sin estimación: ' + unestimatedNames()">+{{ estimate().unestimated.length }} sin estimación</span>
      }
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
