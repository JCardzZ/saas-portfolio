import { ChangeDetectionStrategy, Component } from '@angular/core';
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
        style="bottom: calc(0.75rem + var(--dock-bottom, 0px))"
        class="pointer-events-none fixed left-3 z-[60] rounded-full border border-amber-300/40 bg-amber-400/90 px-3 py-1 text-xs font-medium text-black shadow-lg"
      >
        Modo demo · datos simulados
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly mockMode = runtimeConfig.mockMode;
}
