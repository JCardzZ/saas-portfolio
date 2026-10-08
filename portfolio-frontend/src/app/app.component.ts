import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { runtimeConfig } from './core/config/runtime-config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (mockMode) {
      <p
        style="bottom: calc(0.75rem + var(--dock-bottom, 0px) + env(safe-area-inset-bottom, 0px)); left: calc(0.75rem + env(safe-area-inset-left, 0px))"
        class="pointer-events-none fixed z-[60] max-w-[calc(100vw-1.5rem)] text-balance rounded-2xl border border-amber-300/40 bg-amber-400/90 px-3 py-1 text-xs font-medium text-black shadow-lg"
      >
        Modo demo<span class="hidden sm:inline">{{ reason }}</span> · datos simulados
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnDestroy {
  readonly mockMode = runtimeConfig.mockMode;
  /** El motivo solo se escribe si hay sitio: en un móvil la insignia tiene que ser corta. */
  readonly reason = runtimeConfig.demoReason === 'backend-unavailable' ? ' · el servidor no responde' : '';

  constructor() {
    // La insignia va fija abajo: las páginas reservan ese hueco al final para que no tape nada.
    if (this.mockMode) {
      document.documentElement.style.setProperty('--badge-space', '2.75rem');
    }
  }

  ngOnDestroy(): void {
    document.documentElement.style.removeProperty('--badge-space');
  }
}
