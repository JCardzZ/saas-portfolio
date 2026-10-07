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
    <section class="glass rounded-2xl px-3 py-2" aria-label="Métricas en vivo (simulación)">
      <p class="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        <span
          class="vitals-clock h-1.5 w-1.5 rounded-full"
          [class]="vitals().status === 'ok' ? 'bg-emerald-400' : vitals().status === 'warn' ? 'bg-amber-400' : 'bg-red-500'"
          aria-hidden="true"
          (animationiteration)="beat.emit()"
        ></span>
        Métricas en vivo <span class="font-normal normal-case tracking-normal text-zinc-500">· simulación</span>
      </p>
      <dl class="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[11px]">
        <dt class="text-zinc-400">RPS</dt>
        <dd class="text-right font-mono tabular-nums text-white">{{ number(vitals().rps) }} <span class="text-zinc-500">req/s</span></dd>
        <dt class="text-zinc-400">Latencia p95</dt>
        <dd class="text-right font-mono tabular-nums" [class]="vitals().status === 'ok' ? 'text-white' : vitals().status === 'warn' ? 'text-amber-300' : 'text-red-400'">
          {{ vitals().p95 }} <span class="text-zinc-500">ms</span>
        </dd>
        <dt class="text-zinc-400" title="Coste fijo orientativo de FinOps; no cambia con el tráfico">Coste</dt>
        <dd class="text-right font-mono tabular-nums text-white">
          {{ '$' + vitals().costPerHour.toFixed(2) }}<span class="text-zinc-500">/h</span> · {{ usd(vitals().costPerMonth) }}<span class="text-zinc-500">/mes</span>
        </dd>
      </dl>
      <p class="mt-1 max-w-[13rem] text-[10px] leading-snug text-zinc-500" role="status">{{ vitals().note }}</p>
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
