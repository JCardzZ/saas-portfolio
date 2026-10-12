import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
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

interface Rect {
  x: number;
  y: number;
  w: number;
}

interface Point {
  x: number;
  y: number;
}

/** Todo lo que se dibuja, ya colocado para una de las dos disposiciones. */
interface Geometry {
  vertical: boolean;
  width: number;
  height: number;
  table: Rect & { h: number };
  caption: Rect;
  /** Por tenant: su caja, la del filtro y el haz que las une con su consulta. */
  lanes: Record<TenantId, { client: Rect; gate: Rect; beam: string }>;
  /** Dónde se pinta un punto del espacio de vectores (los datos no cambian de coordenadas). */
  at(point: Point): Point;
}

/** Lienzo de la disposición horizontal; con menos ancho, el esquema pasa a vertical. */
const CANVAS = { width: 620, height: 248 };
/** Región del espacio de vectores en las coordenadas de los datos. */
const SPACE = { x: 404, y: 34, w: 184, h: 176 };

const NEAREST = 3;
const VECTOR_COUNT = 48;

const TENANTS: Tenant[] = [
  { id: 'A', name: 'Empresa A', slug: 'empresa-a', y: 72, color: 'var(--accent-text)', query: { x: 468, y: 96 } },
  { id: 'B', name: 'Empresa B', slug: 'empresa-b', y: 176, color: 'var(--text-2)', query: { x: 520, y: 150 } },
];

/**
 * Dos tenants consultan la misma tabla física. El filtro por tenant_id se aplica antes de
 * ordenar por distancia, así que cada búsqueda solo puede alcanzar vectores propios.
 * El interruptor muestra lo que ocurriría sin el filtro (algo que el backend no permite).
 */
@Component({
  selector: 'app-multi-tenant-shield',
  standalone: true,
  imports: [ContainerWidthDirective, TheaterToggleComponent],
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
      stroke: var(--text-1);
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
      stroke: var(--status-danger);
      stroke-dasharray: 3 3;
      filter: drop-shadow(0 0 4px var(--status-danger));
    }
    @keyframes appear {
      from { opacity: 0; }
    }
    .gate rect {
      fill: rgb(255 255 255 / 0.06);
      transition: stroke 0.5s, opacity 0.5s, fill 0.5s;
    }
    .gate-off rect {
      stroke: var(--status-danger);
      fill: rgb(248 113 113 / 0.1);
    }
    .gate text {
      font-size: 12px;
      font-family: var(--font-mono);
    }
    .tenant, .database {
      cursor: pointer;
      outline: none;
    }
    .database:focus-visible text {
      fill: var(--text-1);
      text-decoration: underline;
    }
    .tenant rect {
      fill: rgb(255 255 255 / 0.05);
      transition: filter 0.5s, opacity 0.5s;
    }
    .tenant:focus-visible rect {
      stroke: var(--text-1);
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

  private readonly box = viewChild(ContainerWidthDirective);
  /** Geometría del esquema para el ancho que hay. */
  readonly geo = computed<Geometry>(() => {
    const box = this.box();
    return box?.narrowerThan(CANVAS.width) ? vertical(box.width() || window.innerWidth - 80) : horizontal();
  });

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

/** Clientes a la izquierda, su filtro en medio y la tabla a la derecha. */
function horizontal(): Geometry {
  const lane = (tenant: Tenant): Geometry['lanes'][TenantId] => ({
    client: { x: 14, y: tenant.y - 22, w: 104 },
    gate: { x: 190, y: tenant.y - 16, w: 100 },
    beam: `M118 ${tenant.y} H190 M290 ${tenant.y} C340 ${tenant.y} ${tenant.query.x - 70} ${tenant.query.y} ${tenant.query.x} ${tenant.query.y}`,
  });
  return {
    vertical: false,
    ...CANVAS,
    table: { x: 388, y: 16, w: 216, h: 208 },
    caption: { x: 388, y: 204, w: 216 },
    lanes: { A: lane(TENANTS[0]), B: lane(TENANTS[1]) },
    at: (point) => point,
  };
}

/** Los dos clientes arriba, cada uno sobre su filtro, y la tabla debajo a todo el ancho. */
function vertical(width: number): Geometry {
  const column = (width - 12) / 2;
  const table = { x: 1, y: 132, w: width - 2, h: 208 };
  const at = (point: Point): Point => ({
    x: table.x + 16 + ((point.x - SPACE.x) / SPACE.w) * (table.w - 32),
    y: table.y + 16 + (point.y - SPACE.y),
  });
  const lane = (tenant: Tenant, index: number): Geometry['lanes'][TenantId] => {
    const x = 1 + index * (column + 10);
    const centre = x + column / 2;
    const query = at(tenant.query);
    return {
      client: { x, y: 4, w: column },
      gate: { x, y: 72, w: column },
      beam: `M${centre} 48 V72 M${centre} 104 C${centre} 130 ${query.x} ${query.y - 44} ${query.x} ${query.y}`,
    };
  };
  return {
    vertical: true,
    width,
    height: table.y + table.h + 46,
    table,
    caption: { x: table.x, y: table.y + table.h, w: table.w },
    lanes: { A: lane(TENANTS[0], 0), B: lane(TENANTS[1], 1) },
    at,
  };
}
