import { ChangeDetectionStrategy, Component, Injectable, booleanAttribute, computed, inject, input, signal } from '@angular/core';

import { runtimeConfig } from '../../core/config/runtime-config';
import { LanguageService } from '../../core/i18n/language.service';

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

/** El aviso en sí: una insignia discreta. `short` deja solo «Modo demo», para cabeceras estrechas. */
@Component({
  selector: 'app-demo-notice',
  standalone: true,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <!-- Neutra y con el punto en ámbar: informa sin alarmar. El motivo va en el título y para lectores de pantalla. -->
    <span class="ui-badge" data-testid="demo-notice" [attr.title]="full()">
      <span class="ui-badge-dot text-status-warn" aria-hidden="true"></span>
      @if (short()) {
        {{ text().demo }}<span class="sr-only">{{ text().reason }} · {{ text().simulated }}</span>
      } @else {
        {{ text().demo }}<span class="sr-only">{{ text().reason }}</span> · {{ text().simulated }}
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoNoticeComponent {
  readonly short = input(false, { transform: booleanAttribute });
  /** El motivo solo se escribe si hay sitio: en un móvil la insignia tiene que ser corta. */
  private readonly language = inject(LanguageService);
  private readonly down = runtimeConfig.demoReason === 'backend-unavailable';
  readonly text = computed(() =>
    this.language.lang() === 'en'
      ? { demo: 'Demo mode', reason: this.down ? ' · the server is not responding' : '', simulated: 'simulated data' }
      : { demo: 'Modo demo', reason: this.down ? ' · el servidor no responde' : '', simulated: 'datos simulados' },
  );
  readonly full = computed(() => `${this.text().demo}${this.text().reason} · ${this.text().simulated}`);
}
