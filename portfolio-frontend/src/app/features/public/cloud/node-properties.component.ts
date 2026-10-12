import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { CloudNode, CloudProviderId, LINK_KINDS, LinkKind, NodeProps, ZoneId } from './cloud-topology.data';
import { secretEnvKeys } from './terraform-generator';

/** Cambio pedido desde el panel: solo los campos que se han tocado. */
export interface NodePatch {
  name?: string;
  zone?: ZoneId;
  props?: Partial<NodeProps>;
}

export const NODE_ZONES: { id: ZoneId; name: string }[] = [
  { id: 'outside', name: 'Internet (fuera de la nube)' },
  { id: 'global', name: 'Nube · fuera de la red privada' },
  { id: 'public', name: 'Subred pública' },
  { id: 'compute', name: 'Subred privada · aplicación' },
  { id: 'data', name: 'Subred privada · datos' },
  { id: 'managed', name: 'Servicio gestionado' },
  { id: 'external', name: 'Externo (tercero o centro de datos)' },
];

const INSTANCE_HINTS: Record<CloudProviderId, string[]> = {
  aws: ['t3.medium', 'm5.large', 'db.m5.large', 'cache.t3.micro'],
  gcp: ['e2-medium', 'n2-standard-2', 'db-custom-2-7680'],
  azure: ['Standard_B2s', 'Standard_D4s_v5', 'GP_Standard_D2ds_v4'],
  // Sin sugerencias: los nombres de las formas de OCI no se han contrastado con su documentación.
  oci: [],
};

/** Panel de propiedades de un nodo del lienzo: nombre, zona de red, capacidad, puertos, entorno y conexiones. */
@Component({
  selector: 'app-node-properties',
  standalone: true,
  imports: [AutofocusDirective],
  host: { class: 'block', '(keydown.escape)': 'closed.emit(); $event.stopPropagation()', '(keydown)': '$event.stopPropagation()' },
  template: `
    <section class="flex max-h-[32rem] animate-scale-up flex-col overflow-hidden rounded-panel border border-line-strong bg-surface-1/95 text-ink-1 shadow-2xl backdrop-blur-2xl" role="dialog" aria-labelledby="node-properties-title">
      <header class="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <h4 id="node-properties-title" class="min-w-0 flex-1 truncate text-sm font-semibold">Propiedades · {{ service() }}</h4>
        <button type="button" class="focus-ring rounded-control px-2 text-lg leading-none text-ink-2 hover:text-ink-1" aria-label="Cerrar las propiedades" (click)="closed.emit()">×</button>
      </header>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <label class="block">
          <span class="text-ink-2">Nombre del recurso</span>
          <input appAutofocus type="text" maxlength="60" class="field" [placeholder]="service()" [value]="node().name ?? ''" (input)="changed.emit({ name: value($event) })" />
        </label>

        <label class="block">
          <span class="text-ink-2">Subred / zona de red</span>
          <select class="field" [value]="node().zone" (change)="changed.emit({ zone: $any(value($event)) })">
            @for (zone of zones; track zone.id) {
              <option [value]="zone.id" [selected]="zone.id === node().zone">{{ zone.name }}</option>
            }
          </select>
        </label>

        <label class="block">
          <span class="text-ink-2">Capacidad / instancia</span>
          <input type="text" maxlength="60" class="field font-mono" list="instance-hints" [placeholder]="hints()[0]" [value]="node().props?.instance ?? ''" (input)="changed.emit({ props: { instance: value($event) } })" />
          <datalist id="instance-hints">
            @for (hint of hints(); track hint) {
              <option [value]="hint"></option>
            }
          </datalist>
        </label>

        <label class="block">
          <span class="text-ink-2">Puertos</span>
          <input type="text" maxlength="80" class="field font-mono" placeholder="8080, 443" [value]="node().props?.ports ?? ''" (input)="changed.emit({ props: { ports: value($event) } })" />
        </label>

        <label class="block">
          <span class="text-ink-2">Variables de entorno <span class="text-ink-3">(CLAVE=valor, una por línea)</span></span>
          <textarea rows="4" maxlength="2000" class="field resize-y font-mono" placeholder="SPRING_PROFILES_ACTIVE=prod" [value]="node().props?.env ?? ''" (input)="changed.emit({ props: { env: value($event) } })"></textarea>
        </label>

        <div>
          <span class="text-ink-2">Conexiones</span>
          <ul class="mt-1 space-y-1">
            @for (link of links(); track link.from + '>' + link.to) {
              <li class="flex items-center gap-2 rounded-control bg-surface-2 px-2 py-1">
                <span class="font-mono text-ink-3" aria-hidden="true">{{ link.outgoing ? '→' : '←' }}</span>
                <span class="min-w-0 flex-1 truncate">
                  <span class="sr-only">{{ link.outgoing ? 'Hacia' : 'Desde' }}</span> {{ link.label }}
                </span>
                <select class="field !w-auto !py-0.5 text-xs" [attr.aria-label]="'Tipo de la conexión con ' + link.label" (change)="onKind(link, $event)">
                  <option value="" [selected]="!link.kind">Peticiones</option>
                  @for (option of linkKinds; track option.kind) {
                    <option [value]="option.kind" [selected]="link.kind === option.kind" [title]="option.hint">{{ option.name }}</option>
                  }
                </select>
                <button type="button" class="rounded-control px-1.5 text-ink-2 hover:text-ink-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text" [attr.aria-label]="'Quitar la conexión con ' + link.label" (click)="disconnected.emit({ from: link.from, to: link.to })">×</button>
              </li>
            } @empty {
              <li class="text-ink-3">Sin conexiones.</li>
            }
          </ul>
          @if (targets().length > 0) {
            <label class="sr-only" for="connect-with">Conectar con otro nodo</label>
            <select id="connect-with" class="field" (change)="onConnect($event)">
              <option value="">Conectar con…</option>
              @for (target of targets(); track target.id) {
                <option [value]="target.id">{{ target.label }}</option>
              }
            </select>
          }
        </div>

        @if (secrets().length > 0) {
          <p class="rounded-control border border-status-warn/40 bg-status-warn/10 px-2 py-1.5 text-status-warn" role="status">
            {{ secrets().join(', ') }} parece una credencial. No se exporta a Terraform, pero sí queda guardada en tu navegador
            y en el JSON del proyecto: usa un valor de ejemplo.
          </p>
        }
      </div>

      <footer class="border-t border-line-subtle px-3 py-2 text-xs leading-snug text-ink-3">
        Recurso de Terraform: <span class="font-mono text-ink-2">{{ resource() ?? 'fuera de Terraform' }}</span>
      </footer>
    </section>
  `,
  styles: `
    .field {
      margin-top: 0.25rem;
      display: block;
      width: 100%;
      border-radius: 0.6rem;
      border: 1px solid rgb(255 255 255 / 0.12);
      background: rgb(0 0 0 / 0.5);
      padding: 0.35rem 0.55rem;
      color: var(--text-1);
      font-size: 0.75rem;
    }
    .field:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodePropertiesComponent {
  readonly node = input.required<CloudNode>();
  /** Nombre del servicio en la nube activa: el que se usa si el nodo no tiene nombre propio. */
  readonly service = input.required<string>();
  readonly resource = input.required<string | null>();
  readonly provider = input.required<CloudProviderId>();

  /** Conexiones del nodo, con el nombre del nodo del otro extremo. */
  readonly links = input<{ from: string; to: string; outgoing: boolean; label: string; kind?: LinkKind | null }[]>([]);
  readonly linkKinds = LINK_KINDS;
  /** Nodos con los que todavía se puede conectar. */
  readonly targets = input<{ id: string; label: string }[]>([]);

  readonly changed = output<NodePatch>();
  readonly connected = output<string>();
  readonly disconnected = output<{ from: string; to: string }>();
  readonly kindChanged = output<{ from: string; to: string; kind: LinkKind | null }>();
  readonly closed = output<void>();

  readonly zones = NODE_ZONES;
  readonly hints = computed(() => INSTANCE_HINTS[this.provider()]);
  readonly secrets = computed(() => secretEnvKeys(this.node().props?.env));

  onConnect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value) {
      this.connected.emit(select.value);
      select.value = '';
    }
  }

  onKind(link: { from: string; to: string }, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.kindChanged.emit({ from: link.from, to: link.to, kind: value ? (value as LinkKind) : null });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
