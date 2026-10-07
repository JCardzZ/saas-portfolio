import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { CostEstimate, formatUsd } from './cloud-costs.data';

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
              <p class="mt-0.5 truncate text-[10px] text-zinc-500">{{ itemsOf(category.items) }}</p>
            </li>
          } @empty {
            <li class="text-xs text-zinc-400">Ningún nodo del lienzo tiene coste fijo.</li>
          }
        </ul>
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
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true"></span>
      <span class="text-[10px] font-medium uppercase tracking-wider text-zinc-400">FinOps</span>
      @for (total of [usd(estimate().total)]; track total) {
        <span class="animate-slide-up font-mono text-sm font-semibold tabular-nums text-white">≈ {{ total }}</span>
      }
      <span class="text-[11px] text-zinc-400">/mes</span>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostBadgeComponent {
  readonly estimate = input.required<CostEstimate>();
  readonly providerName = input.required<string>();

  readonly hovered = signal(false);
  readonly pinned = signal(false);
  readonly open = computed(() => this.hovered() || this.pinned());
  readonly usd = formatUsd;

  share(usd: number): number {
    return this.estimate().total ? (usd / this.estimate().total) * 100 : 0;
  }

  itemsOf(items: { name: string; usd: number }[]): string {
    return items.map((item) => `${item.name} ${formatUsd(item.usd)}`).join(' · ');
  }
}
