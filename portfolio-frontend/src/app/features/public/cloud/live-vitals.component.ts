import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { formatUsd } from './cloud-costs.data';
import { Vitals } from './live-traffic';

/**
 * Constantes vitales del lienzo: peticiones por segundo, latencia p95 y coste. Las dos primeras
 * son simuladas (el widget lo dice); el coste es el orientativo de FinOps.
 * No usa temporizadores: un elemento con una animación CSS infinita hace de reloj, de modo que
 * se detiene solo cuando el lienzo está fuera de pantalla o la persona prefiere menos movimiento.
 */
@Component({
    selector: 'app-live-vitals',
    imports: [TranslatePipe],
    host: { class: 'block' },
    template: `
    <!-- Una línea de estado, sin caja: punto, estado y cifras. -->
    <section class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" [attr.aria-label]="'Métricas en vivo (simulación)' | t">
      <p class="flex items-center gap-1.5 font-medium uppercase tracking-wider text-ink-3">
        <span
          class="vitals-clock h-1.5 w-1.5 rounded-full"
          [class]="vitals().status === 'ok' ? 'bg-status-ok' : vitals().status === 'warn' ? 'bg-status-warn' : 'bg-status-danger'"
          aria-hidden="true"
          (animationiteration)="beat.emit()"
        ></span>
        {{ 'Métricas en vivo' | t }} <span class="font-normal normal-case tracking-normal text-ink-3">{{ '· simulación' | t }}</span>
      </p>
      <dl class="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 [&>dd]:mr-3">
        <dt class="text-ink-2">RPS</dt>
        <dd class="font-mono tabular-nums text-ink-1">{{ number(vitals().rps) }} <span class="text-ink-3">req/s</span></dd>
        <dt class="text-ink-2">{{ 'Latencia p95' | t }}</dt>
        <dd class="font-mono tabular-nums" [class]="vitals().status === 'ok' ? 'text-ink-1' : vitals().status === 'warn' ? 'text-status-warn' : 'text-status-danger'">
          {{ vitals().p95 }} <span class="text-ink-3">ms</span>
        </dd>
        <dt class="text-ink-2" [attr.title]="'Coste fijo orientativo de FinOps; no cambia con el tráfico' | t">{{ 'Coste' | t }}</dt>
        <dd class="font-mono tabular-nums text-ink-1">
          {{ '$' + vitals().costPerHour.toFixed(2) }}<span class="text-ink-3">/h</span> · {{ usd(vitals().costPerMonth) }}<span class="text-ink-3">{{ '/mes' | t }}</span>
        </dd>
      </dl>
      <p class="text-ink-2" role="status">{{ vitals().note | t }}</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveVitalsComponent {
  readonly vitals = input.required<Vitals>();
  /** Un latido del reloj: quien escucha avanza la simulación. */
  readonly beat = output<void>();

  readonly usd = formatUsd;

  number(value: number): string {
    return value.toLocaleString('en-US');
  }
}
