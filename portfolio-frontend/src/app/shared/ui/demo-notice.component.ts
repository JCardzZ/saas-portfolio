import { ChangeDetectionStrategy, Component, Injectable, booleanAttribute, input, signal } from '@angular/core';

import { runtimeConfig } from '../../core/config/runtime-config';

/**
 * Quién enseña el aviso de modo demo. En la página pública es un segmento de la barra del
 * Inspector de traza (docs/DESIGN.md §8.4); donde no hay inspector (administración, login), lo
 * pinta `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class DemoNoticeHost {
  /** `true` mientras hay un inspector en pantalla que ya lo muestra. */
  readonly hosted = signal(false);
}

/** El aviso en sí: una insignia de aviso. `short` deja solo «Modo demo», para cabeceras estrechas. */
@Component({
  selector: 'app-demo-notice',
  standalone: true,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <span class="ui-badge ui-badge-warn" data-testid="demo-notice" [attr.title]="short() ? full : null">
      <span class="ui-badge-dot" aria-hidden="true"></span>
      @if (short()) {
        Modo demo<span class="sr-only">{{ reason }} · datos simulados</span>
      } @else {
        Modo demo<span class="hidden sm:inline">{{ reason }}</span> · datos simulados
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoNoticeComponent {
  readonly short = input(false, { transform: booleanAttribute });
  /** El motivo solo se escribe si hay sitio: en un móvil la insignia tiene que ser corta. */
  readonly reason = runtimeConfig.demoReason === 'backend-unavailable' ? ' · el servidor no responde' : '';
  readonly full = `Modo demo${this.reason} · datos simulados`;
}
