import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { IconPopService } from '../../../shared/ui/icon-pop.service';
import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';

type TenantId = 'A' | 'B';

interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  y: number;
  color: string;
  query: { x: number; y: number };
}

interface StoredVector {
  id: number;
  tenant: TenantId;
  x: number;
  y: number;
}

interface Hit extends StoredVector {
  /** El vector pertenece a otro tenant: solo puede ocurrir con el filtro desactivado. */
  leak: boolean;
}

const NEAREST = 3;
const VECTOR_COUNT = 48;

const TENANTS: Tenant[] = [
  { id: 'A', name: 'Empresa A', slug: 'empresa-a', y: 72, color: '#38bdf8', query: { x: 468, y: 96 } },
  { id: 'B', name: 'Empresa B', slug: 'empresa-b', y: 176, color: '#fbbf24', query: { x: 520, y: 150 } },
];

/**
 * Dos tenants consultan la misma tabla física. El filtro por tenant_id se aplica antes de
 * ordenar por distancia, así que cada búsqueda solo puede alcanzar vectores propios.
 * El interruptor muestra lo que ocurriría sin el filtro (algo que el backend no permite).
 */
@Component({
  selector: 'app-multi-tenant-shield',
  standalone: true,
  imports: [TheaterToggleComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block' },
  templateUrl: './multi-tenant-shield.component.html',
  styles: `
    /* Al pasar por la tarjeta (o en modo teatro) los haces y los vectores ganan contraste. */
    :host(:hover) .beam,
    :host(.theater-expanded) .beam {
      opacity: 0.95;
      filter: drop-shadow(0 0 4px currentColor);
    }
    :host(:hover) .vector:not(.dimmed),
    :host(.theater-expanded) .vector:not(.dimmed) {
      opacity: 0.9;
    }
    .beam {
      fill: none;
      stroke-width: 1.6;
      opacity: 0.55;
      transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .beam-pulse {
      fill: none;
      stroke: #fff;
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-dasharray: 5 95;
      animation: flow 2s linear infinite;
      transition: opacity 0.5s;
    }
    @keyframes flow {
      from { stroke-dashoffset: 100; }
      to { stroke-dashoffset: 0; }
    }
    .dimmed {
      opacity: 0.12;
    }
    .vector {
      transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .hit-line {
      stroke-width: 1.4;
      stroke-linecap: round;
      animation: appear 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    }
    .leak {
      stroke: #f87171;
      stroke-dasharray: 3 3;
      filter: drop-shadow(0 0 4px #f87171);
    }
    @keyframes appear {
      from { opacity: 0; }
    }
    .gate rect {
      fill: rgb(255 255 255 / 0.06);
      transition: stroke 0.5s, opacity 0.5s, fill 0.5s;
    }
    .gate-off rect {
      stroke: #f87171;
      fill: rgb(248 113 113 / 0.1);
    }
    .gate text {
      font-size: 9.5px;
      font-family: "SF Mono", ui-monospace, Menlo, monospace;
    }
    .tenant, .database {
      cursor: pointer;
      outline: none;
    }
    .database:focus-visible text {
      fill: #fff;
      text-decoration: underline;
    }
    .tenant rect {
      fill: rgb(255 255 255 / 0.05);
      transition: filter 0.5s, opacity 0.5s;
    }
    .tenant:focus-visible rect {
      stroke: #fff;
      stroke-width: 2;
    }
    .tenant text {
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiTenantShieldComponent {
  private readonly events = inject(SystemEventsService);
  private readonly inspector = inject(TraceInspectorService);

private readonly iconPop = inject(IconPopService);

  /** Abre la traza de PostgreSQL y hace despegar su logo: al posar el cursor (vuelve al salir) o al pulsar. */
  inspectDatabase(event?: Event): void {
    this.inspector.select('postgresql');
    const logo = (event?.currentTarget as Element | undefined)?.querySelector('svg');
    if (!logo) {
      return;
    }
    const label = event!.currentTarget as Element;
    if (event?.type === 'mouseenter') {
      this.iconPop.hoverEnter(this.postgresql, logo, label);
    } else {
      this.iconPop.pop(this.postgresql, logo, true, label);
    }
  }

  leaveDatabase(event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('svg');
    if (logo) {
      this.iconPop.hoverLeave(logo);
    }
  }

  readonly tenants = TENANTS;
  readonly postgresql = TECH_ICONS.postgresql;
  readonly vectors = generateVectors();

  /** Tenant resaltado; `null` muestra los dos a la vez. */
  readonly focused = signal<TenantId | null>(null);
  readonly filterOff = signal(false);

  readonly searches = computed(() =>
    TENANTS.map((tenant) => ({
      tenant,
      hits: this.nearest(tenant, this.filterOff()),
    })),
  );

  readonly leaks = computed(() => this.searches().reduce((total, search) => total + search.hits.filter((hit) => hit.leak).length, 0));
  readonly sqlTenant = computed(() => TENANTS.find((tenant) => tenant.id === this.focused()) ?? TENANTS[0]);

  beam(tenant: Tenant): string {
    const { x, y } = tenant.query;
    return `M118 ${tenant.y} H190 M290 ${tenant.y} C340 ${tenant.y} ${x - 70} ${y} ${x} ${y}`;
  }

  isDimmed(tenant: TenantId): boolean {
    return this.focused() !== null && this.focused() !== tenant;
  }

  color(tenant: TenantId): string {
    return TENANTS.find((candidate) => candidate.id === tenant)!.color;
  }

  toggleFilter(): void {
    this.filterOff.update((off) => !off);
    this.events.emitFromUser(
      this.filterOff()
        ? [['warn', 'SIN FILTRO (hipotético)', `${this.leaks()} vectores de otro tenant alcanzados`]]
        : [
            ['vector', 'pgvector', "WHERE tenant_id = 'empresa-a' ORDER BY embedding <=> ?"],
            ['ok', 'Aislamiento', '0 vectores de otro tenant'],
          ],
    );
  }

  private nearest(tenant: Tenant, includeOtherTenants: boolean): Hit[] {
    return this.vectors
      .filter((vector) => includeOtherTenants || vector.tenant === tenant.id)
      .map((vector) => ({ vector, distance: Math.hypot(vector.x - tenant.query.x, vector.y - tenant.query.y) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST)
      .map(({ vector }) => ({ ...vector, leak: vector.tenant !== tenant.id }));
  }
}

// Semilla fija: los vectores de ambos tenants quedan mezclados igual en cada carga.
function generateVectors(): StoredVector[] {
  let seed = 7_10_2026;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: VECTOR_COUNT }, (_, id) => ({
    id,
    tenant: (id % 2 === 0 ? 'A' : 'B') as TenantId,
    x: 404 + random() * 184,
    y: 34 + random() * 176,
  }));
}
