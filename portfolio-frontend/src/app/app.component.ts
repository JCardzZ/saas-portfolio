import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from './core/theme/theme.service';
import { RouterOutlet } from '@angular/router';

import { runtimeConfig } from './core/config/runtime-config';
import { DemoNoticeComponent, DemoNoticeHost } from './shared/ui/demo-notice.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, DemoNoticeComponent],
    template: `
    <router-outlet />
    <!-- En la página pública el aviso va en la barra del Inspector de traza; aquí, donde no lo hay. -->
    @if (mockMode && !host.hosted()) {
      <p
        style="bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)); left: calc(0.75rem + env(safe-area-inset-left, 0px))"
        class="pointer-events-none fixed z-[60] m-0 flex max-w-[calc(100vw-1.5rem)] rounded-full bg-surface-1 shadow-floating"
        data-testid="demo-notice-fallback"
      >
        <app-demo-notice />
      </p>
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  readonly mockMode = runtimeConfig.mockMode;
  readonly host = inject(DemoNoticeHost);
  /** Aplica el tema elegido (o el del sistema) desde el primer pintado, en cualquier página. */
  private readonly theme = inject(ThemeService);
}
