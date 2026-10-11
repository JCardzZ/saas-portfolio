import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
  standalone: true,
  host: { class: 'block' },
  template: `
    <section class="glass rounded-panel px-3 py-2" aria-label="Métricas en vivo (simulación)">
      <p class="flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ink-2">
        <span
          class="vitals-clock h-1.5 w-1.5 rounded-full"
          [class]="vitals().status === 'ok' ? 'bg-status-ok' : vitals().status === 'warn' ? 'bg-status-warn' : 'bg-status-danger'"
          aria-hidden="true"
          (animationiteration)="beat.emit()"
        ></span>
        Métricas en vivo <span class="font-normal normal-case tracking-normal text-ink-3">· simulación</span>
      </p>
      <dl class="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs [&>dd]:break-words">
        <dt class="text-ink-2">RPS</dt>
        <dd class="text-right font-mono tabular-nums text-ink-1">{{ number(vitals().rps) }} <span class="text-ink-3">req/s</span></dd>
        <dt class="text-ink-2">Latencia p95</dt>
        <dd class="text-right font-mono tabular-nums" [class]="vitals().status === 'ok' ? 'text-ink-1' : vitals().status === 'warn' ? 'text-status-warn' : 'text-status-danger'">
          {{ vitals().p95 }} <span class="text-ink-3">ms</span>
        </dd>
        <dt class="text-ink-2" title="Coste fijo orientativo de FinOps; no cambia con el tráfico">Coste</dt>
        <dd class="text-right font-mono tabular-nums text-ink-1">
          {{ '$' + vitals().costPerHour.toFixed(2) }}<span class="text-ink-3">/h</span> · {{ usd(vitals().costPerMonth) }}<span class="text-ink-3">/mes</span>
        </dd>
      </dl>
      <p class="mt-1 max-w-[13rem] text-xs leading-snug text-ink-3" role="status">{{ vitals().note }}</p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
