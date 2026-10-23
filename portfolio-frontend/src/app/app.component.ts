import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from './core/theme/theme.service';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { runtimeConfig } from './core/config/runtime-config';
import { BackToTopComponent } from './shared/ui/back-to-top.component';
import { DemoNoticeComponent, DemoNoticeHost } from './shared/ui/demo-notice.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, DemoNoticeComponent, BackToTopComponent],
    template: `
    <router-outlet />
    <!-- «Volver arriba» en las páginas públicas (landing y artículos); la administración no lo necesita. -->
    @if (publicPage()) {
      <app-back-to-top />
    }
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
  private readonly router = inject(Router);
  readonly publicPage = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => !/^\/(admin|login)(\/|$|\?|#)/.test(event.urlAfterRedirects)),
    ),
    { initialValue: false },
  );
}
