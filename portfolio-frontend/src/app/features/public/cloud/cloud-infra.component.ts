import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';

import { IconPopService } from '../../../shared/ui/icon-pop.service';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TECH_ICONS, TechIcon, TechIconKey } from '../../../shared/ui/tech-icons';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { GraphSnapshot, diffGraph } from '../data/graph-diff';
import { SystemEventStep, SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/errors/http-error';
import { ArchitectureStudioService, StudioEntry } from './architecture-studio.service';
import { ArchitectureCopilotComponent } from './architecture-copilot.component';
import { AuditCardComponent } from './audit-card.component';
import { autoLayout } from './auto-layout';
import { CHAOS_PHASE_MS, CHAOS_SCENARIOS, CHAOS_SETTLE_MS, ChaosLevel, ChaosScenario } from './chaos-scenarios';
import { CatalogItem } from './cloud-catalog.data';
import { estimateCost, formatUsd } from './cloud-costs.data';
import { telemetryFor } from './component-telemetry';
import { CopilotAddition, catalogItem } from './copilot';
import { CostBadgeComponent } from './cost-badge.component';
import { RuleViolation, anchorFor, checkGraph, endpointOf, inferKind } from './graph-rules';
import { BlueprintLoad, mergeBlueprint } from './data-blueprints';
import { downloadBlob, rasterize, serializeDiagram } from './diagram-export';
import {
  FAULT_RECOVERY_MS, FaultKind, Faults, TRAFFIC_PROFILES, TrafficMode, backupOf, computeVitals, particlesPerWire, profileOf,
} from './live-traffic';
import { LivePricingService } from './live-pricing.service';
import { LiveVitalsComponent } from './live-vitals.component';
import { NodePatch, NodePropertiesComponent } from './node-properties.component';
import { History } from './studio-history';
import {
  BASE_ZONES, PROJECT_EXTENSION, PROJECT_STORAGE_KEY, StudioProject, StudioZone, ZONE_KINDS, ZONE_MIN_SIZE,
  ZoneCorner, ZoneKind, nodeLabel, parseProject, referenceProject, resizeZone, roleAt, serializeProject, slotsIn, zoneAt, zoneLabel, zonesInside,
} from './studio-project';
import { createZip } from './zip-writer';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, CLOUD_LINKS, CLOUD_NODES, CLOUD_PROVIDERS, CloudLink, CloudNode, CloudProviderId, IconRef, LINK_KINDS,
  LinkKind, NODE_HEIGHT, NODE_WIDTH, PROVISIONING_LOG, ZONE_SLOTS, ZoneId, forProvider, resolveIcon,
} from './cloud-topology.data';
import { CATALOG_DRAG_TYPE, ServiceCatalogComponent } from './service-catalog.component';
import { generateMainTf, generateVariablesTf, unsupportedTerraform } from './terraform-generator';
import { auditTopology } from './topology-auditor';
import { validateTopology } from './topology-validator';

const KEYBOARD_STEP = 12;
/** Espera tras el último cambio antes de publicar el diff del grafo: arrastrar un nodo es un solo cambio. */
export const GRAPH_DIFF_DEBOUNCE_MS = 300;

function graphOf(project: StudioProject): GraphSnapshot {
  return structuredClone({ nodes: project.nodes, links: project.links }) as unknown as GraphSnapshot;
}
/** Rótulo corto de cada tipo de conexión sobre el cable. */
const KIND_LABELS: Record<LinkKind, string> = { CDC_STREAM: 'CDC', EVENT_BUS: 'eventos', ANALYTICS_SINK: 'analítica', REPLICATION: 'réplica' };

interface Wire extends CloudLink {
  path: string;
  labelAt: [number, number];
  /** Conexión hacia un servicio añadido por el visitante: brilla con su color de marca. */
  glow: string | null;
  /** Estado de la conexión durante una simulación de caos. */
  chaos: ChaosLevel | null;
  /** Recibe el tráfico de una instancia caída: lleva más partículas. */
  boost: boolean;
}

/**
 * Estudio de arquitectura multi-cloud: el diagrama de referencia de la plataforma, que el
 * visitante puede ampliar con servicios de un catálogo, reordenar y traducir entre nubes.
 * Genera en vivo el esqueleto de `main.tf` de lo que hay en el lienzo y lo valida con reglas
 * de seguridad. Además estima el coste mensual, simula escenarios de fallo y audita la
 * topología. Trabaja sobre una copia en memoria; "Restablecer" vuelve al original.
 */
@Component({
  selector: 'app-cloud-infra',
  standalone: true,
  imports: [TechIconComponent, TheaterToggleComponent, ServiceCatalogComponent, CostBadgeComponent, AuditCardComponent, NodePropertiesComponent, ArchitectureCopilotComponent, LiveVitalsComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block' },
  templateUrl: './cloud-infra.component.html',
  styleUrl: './cloud-infra.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudInfraComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly events = inject(SystemEventsService);
  readonly inspector = inject(TraceInspectorService);
  private readonly pricing = inject(LivePricingService);
  private readonly iconPop = inject(IconPopService);

  readonly providers = CLOUD_PROVIDERS;
  readonly scenarios = CHAOS_SCENARIOS;
  readonly icons = TECH_ICONS;
  /** Pantalla táctil: las asas del lienzo reciben una zona de toque mayor que su dibujo. */
  readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /**
   * Lado de esa zona en unidades del lienzo: 44 px de pantalla al tamaño mínimo al que se dibuja
   * (min-w de 720 px sobre un viewBox de 1110).
   */
  readonly touchTarget = Math.ceil(44 * (1110 / 720));
  readonly width = NODE_WIDTH;
  readonly height = NODE_HEIGHT;
  readonly viewBox = `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`;

  readonly selectedId = signal<CloudProviderId>('aws');
  readonly selected = computed(() => CLOUD_PROVIDERS.find((provider) => provider.id === this.selectedId())!);
  readonly providerColor = computed(() => TECH_ICONS[this.selectedId()].color);

  readonly nodes = signal<CloudNode[]>(structuredClone(CLOUD_NODES));
  private readonly links = signal<CloudLink[]>(structuredClone(CLOUD_LINKS));
  /** Recuadros del lienzo (nube, red, subredes...), de mayor a menor para que los pequeños queden encima. */
  readonly zones = signal<StudioZone[]>(structuredClone(BASE_ZONES));
  readonly zonesByArea = computed(() => [...this.zones()].sort((a, b) => b.w * b.h - a.w * a.h));
  readonly hasCloudZone = computed(() => this.zones().some((zone) => zone.id === 'cloud'));
  readonly editing = signal(false);
  readonly catalogDocked = signal(true);
  readonly codeOpen = signal(false);
  readonly copied = signal(false);
  /** Se ha añadido, movido o quitado algo respecto al diagrama original. */
  readonly modified = signal(false);

  readonly activeId = signal('api');
  readonly active = computed(() => this.nodes().find((node) => node.id === this.activeId()) ?? null);

  /** Conexiones con su trazado bezier, recalculado cada vez que un nodo se mueve. */
  readonly wires = computed<Wire[]>(() => {
    const byId = new Map(this.nodes().map((node) => [node.id, node]));
    return this.links().flatMap((link) => {
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) {
        return [];
      }
      const custom = to.custom ? to : from.custom ? from : null;
      const faults = this.faults();
      // Un fallo inyectado a mano manda sobre el escenario de caos: por un nodo caído no pasa tráfico.
      const chaos: ChaosLevel | null = faults[from.id] === 'down' || faults[to.id] === 'down' ? 'down'
        : faults[to.id] === 'cpu' ? 'warn'
        : (this.chaosPhase()?.wires[`${link.from}>${link.to}`] ?? null);
      return [{ ...link, ...connect(from, to), glow: custom ? (this.iconOf(custom)?.color ?? null) : null, chaos, boost: this.takingOver().has(to.id) }];
    });
  });

  /** Color de marca del nodo activo: con él brillan las conexiones que pasan por esa pieza. */
  readonly activeColor = computed(() => {
    const node = this.active();
    return (node && this.iconOf(node)?.color) ?? this.providerColor();
  });

  /** `main.tf` de lo que hay ahora mismo en el lienzo, para la nube activa. */
  readonly mainTf = computed(() => generateMainTf(this.nodes(), this.links(), this.selectedId()));
  /** Resultado de las reglas de seguridad sobre la topología actual. */
  /** Servicios del lienzo que el generador aún no cubre: se avisa, nunca se omiten en silencio. */
  readonly terraformGaps = computed(() => unsupportedTerraform(this.nodes(), this.selectedId()));
  /** Reglas del grafo incumplidas (conexión no permitida, instancias de más). Solo avisan. */
  readonly violations = computed<RuleViolation[]>(() => checkGraph(this.nodes(), this.links(), (node) => this.serviceOf(node)));
  readonly violationsByNode = computed(() => {
    const byNode = new Map<string, string[]>();
    for (const violation of this.violations()) {
      byNode.set(violation.nodeId, [...(byNode.get(violation.nodeId) ?? []), violation.message]);
    }
    return byNode;
  });
  readonly linkKinds = LINK_KINDS;
  private announcedViolations = new Set<string>();

  readonly findings = computed(() => validateTopology(this.nodes(), this.links(), this.selectedId()));
  readonly warnings = computed(() => this.findings().filter((finding) => finding.level === 'warn' && finding.check.startsWith('Warning')));

  /** Coste mensual orientativo de los nodos del lienzo en la nube activa. */
  /** Precios de lista reales de la nube elegida, si el backend los ha dado; mandan sobre las cifras orientativas. */
  readonly livePrices = computed(() => this.pricing.monthlyFor(this.selectedId()));
  readonly cost = computed(() => estimateCost(this.nodes(), this.selectedId(), this.studio.costs(), this.livePrices()));
  /** Coste de cada nodo, para su etiqueta: importe y si es un precio real, o «sin estimación». */
  readonly nodeCosts = computed(() => {
    const estimate = this.cost();
    const byNode = new Map<string, { label: string; live: boolean; title: string }>();
    for (const item of estimate.categories.flatMap((category) => category.items)) {
      const quote = item.live ? this.pricing.quotesFor(this.selectedId())[item.type] : undefined;
      byNode.set(item.nodeId, {
        label: `${formatUsd(item.usd)}/mes`, live: item.live === true,
        title: quote
          ? `Precio de lista real · ${quote.sku} · ${quote.source ?? ''} (${quote.region ?? ''}). ${quote.note ?? ''}`
          : 'Estimación orientativa, no un precio consultado',
      });
    }
    for (const item of estimate.unestimated) {
      byNode.set(item.nodeId, { label: 'sin estimación', live: false, title: 'Sin precio público ni cifra orientativa: no suma al total' });
    }
    return byNode;
  });
  readonly pricingState = this.pricing.state;

  // ---------- Caos ----------
  readonly chaosOpen = signal(false);
  /** Escenario en curso y fase por la que va. */
  readonly chaos = signal<{ scenario: ChaosScenario; phase: number } | null>(null);
  readonly chaosPhase = computed(() => {
    const running = this.chaos();
    return running ? running.scenario.phases[running.phase] : null;
  });
  readonly chaosCaption = computed(() => this.fill(this.chaosPhase()?.caption ?? ''));
  private chaosTimers: ReturnType<typeof setTimeout>[] = [];

  // ---------- Tráfico en vivo ----------
  readonly trafficProfiles = TRAFFIC_PROFILES;
  readonly trafficMode = signal<TrafficMode>('normal');
  /** Fallos inyectados a mano, por id de nodo. */
  readonly faults = signal<Faults>({});
  private readonly faultTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
  /** Nodos que están asumiendo el tráfico de una instancia caída del mismo servicio. */
  readonly takingOver = computed(() => {
    const faults = this.faults();
    const nodes = this.nodes();
    return new Set(nodes.filter((node) => faults[node.id] === 'down').flatMap((node) => {
      const backup = backupOf(node, nodes, faults);
      return backup ? [backup.id] : [];
    }));
  });
  /** Latidos del reloj del widget de métricas. */
  readonly phase = signal(0);
  readonly vitals = computed(() => computeVitals(this.trafficMode(), this.nodes(), this.faults(), this.cost().total, this.phase()));
  readonly trafficSpeed = computed(() => profileOf(this.trafficMode()).speed);
  /** Índices de las partículas de cada conexión con el tráfico actual. */
  readonly particles = computed(() => Array.from({ length: particlesPerWire(this.trafficMode(), this.wires().length) }, (_, index) => index));
  readonly boostParticles = [10, 11];
  readonly activeFault = computed(() => (this.active() ? (this.faults()[this.active()!.id] ?? null) : null));

  // ---------- Auditoría y copiloto ----------
  readonly copilotOpen = signal(false);
  readonly projectNow = computed(() => this.project());
  readonly costOverrides = computed(() => this.studio.costs());
  readonly auditOpen = signal(false);
  readonly recommendations = computed(() => auditTopology(this.nodes(), this.links(), this.selectedId(), this.studio.costs()));

  // ---------- Proyecto: plantillas, historial, propiedades y zonas ----------
  private readonly studio = inject(ArchitectureStudioService);
  private readonly auth = inject(AuthService);
  /** Plantillas y proyectos que se pueden abrir: del backend si responde, o los que lleva el estudio. */
  readonly presets = this.studio.entries;
  readonly catalog = this.studio.catalog;
  readonly catalogFromServer = computed(() => this.studio.catalogSource() === 'server');
  readonly presetsFromServer = computed(() => this.studio.source() === 'server');
  readonly canSaveToCloud = this.auth.isAuthenticated;
  /** Proyecto guardado en el backend que se está editando, si lo hay. */
  readonly cloudProject = signal<{ id: string; title: string } | null>(null);
  readonly cloudTitle = signal('');
  readonly cloudNotice = signal<string | null>(null);
  readonly saving = signal(false);
  readonly zoneKinds = ZONE_KINDS;
  /** Menú desplegado de la barra del proyecto. */
  readonly menu = signal<'project' | 'presets' | 'export' | 'cloud' | 'view' | 'analyze' | 'zones' | null>(null);
  readonly projectError = signal<string | null>(null);
  readonly exporting = signal(false);
  private readonly history = new History<StudioProject>();
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  /** Nodo cuyas propiedades se están editando. */
  readonly propertiesId = signal<string | null>(null);
  readonly propertiesNode = computed(() => this.nodes().find((node) => node.id === this.propertiesId()) ?? null);
  /** El panel de propiedades guarda un solo paso de historial por nodo, no uno por tecla. */
  private propertiesRecorded = false;
  readonly activeZoneId = signal<string | null>(null);
  readonly activeZone = computed(() => this.zones().find((zone) => zone.id === this.activeZoneId()) ?? null);

  private readonly canvas = viewChild<ElementRef<SVGSVGElement>>('canvas');
  private nextCustomId = 1;
  private dragging: { id: string; dx: number; dy: number; recorded: boolean } | null = null;
  private zoneDrag: { id: string; mode: 'move' | ZoneCorner; x: number; y: number; origin: StudioZone; nodes: CloudNode[]; zones: StudioZone[]; recorded: boolean } | null = null;
  readonly corners: ZoneCorner[] = ['nw', 'ne', 'sw', 'se'];
  /** Recuadro sobre el que está el nodo que se arrastra: es el que lo adoptará al soltarlo. */
  readonly dropZoneId = signal<string | null>(null);

  // ---------- Conexiones ----------
  /** Nodo desde el que se está trazando una conexión nueva. */
  readonly connectingFrom = signal<string | null>(null);
  readonly connectingNode = computed(() => this.nodes().find((node) => node.id === this.connectingFrom()) ?? null);
  /** Extremo libre del cable mientras se arrastra, en coordenadas del lienzo. */
  readonly linkPreview = signal<{ x: number; y: number } | null>(null);
  private linkDragStart: { x: number; y: number } | null = null;
  /** Conexiones del nodo cuyas propiedades están abiertas, y nodos con los que aún se puede conectar. */
  readonly propertiesLinks = computed(() => {
    const node = this.propertiesNode();
    if (!node) {
      return { links: [], targets: [] };
    }
    const label = (id: string) => this.serviceOf(this.nodes().find((candidate) => candidate.id === id)!);
    const touching = this.links().filter((link) => link.from === node.id || link.to === node.id);
    return {
      links: touching.map((link) => ({
        from: link.from, to: link.to, outgoing: link.from === node.id, label: label(link.from === node.id ? link.to : link.from),
        kind: link.kind ?? null,
      })),
      targets: this.nodes()
        .filter((candidate) => candidate.id !== node.id && !touching.some((link) => link.from === node.id && link.to === candidate.id))
        .map((candidate) => ({ id: candidate.id, label: this.serviceOf(candidate) })),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.clearChaosTimers();
      this.clearFaults();
    });
    this.restore();
    this.studio.load();
    // Fuera de pantalla se detienen las partículas y el reloj de las métricas (clase `studio-paused`).
    if (typeof IntersectionObserver !== 'undefined') {
      const visibility = new IntersectionObserver(([entry]) => this.host.classList.toggle('studio-paused', !entry.isIntersecting));
      visibility.observe(this.host);
      inject(DestroyRef).onDestroy(() => visibility.disconnect());
    }
    // Lo que el visitante cambia se guarda en su navegador; el diagrama original no ocupa sitio.
    effect(() => {
      const project = this.project();
      try {
        if (this.modified()) {
          localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project));
        } else {
          localStorage.removeItem(PROJECT_STORAGE_KEY);
        }
      } catch {
        // Sin almacenamiento (modo privado) el proyecto solo vive mientras dure la página.
      }
    });
    // La galería de patrones de datos vive fuera de esta tarjeta: sigue la nube del lienzo y le pide cargar.
    effect(() => {
      this.studio.activeProvider.set(this.selectedId());
      this.studio.canvasHasContent.set(this.nodes().length > 0);
    }, { allowSignalWrites: true });
    this.studio.blueprintRequests.pipe(takeUntilDestroyed()).subscribe((load) => this.loadBlueprint(load));
    // Precios reales: al añadir o quitar un tipo de servicio, o al cambiar de nube, se piden al backend
    // (que consulta las API públicas y lo cuenta por SSE). En modo demo no se pide nada.
    let priced = '';
    effect(() => {
      const provider = this.selectedId();
      const types = [...new Set(this.nodes().map((node) => node.type))].sort();
      const key = `${provider}:${types.join(',')}`;
      if (key !== priced) {
        priced = key;
        untracked(() => this.pricing.refresh(provider, types));
      }
    }, { allowSignalWrites: true });
    // Filtro «Grafo» del inspector: tras cada cambio, y agrupando los seguidos, el diff del JSON del grafo.
    let snapshot: GraphSnapshot = graphOf(this.project());
    let pending: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const project = this.project();
      clearTimeout(pending);
      pending = setTimeout(() => {
        const next = graphOf(project);
        this.inspector.publishGraph(diffGraph(snapshot, next), serializeProject(project));
        snapshot = next;
      }, GRAPH_DIFF_DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(pending));
    // Cada regla del grafo que se incumple deja su aviso en el inspector, una sola vez.
    effect(() => {
      const current = this.violations();
      const fresh = current.filter((violation) => !this.announcedViolations.has(violation.message));
      this.announcedViolations = new Set(current.map((violation) => violation.message));
      for (const violation of fresh) {
        this.events.emitFromUser([['warn', 'Graph Rule', violation.message]], violation.nodeId);
      }
    }, { allowSignalWrites: true });
  }

  /**
   * Nombre que se muestra: de un nodo, el suyo (o el del servicio, numerado si hay varios
   * iguales); de una entrada del catálogo, el del servicio en la nube elegida.
   */
  serviceOf(item: { service: CloudNode['service']; id?: string }): string {
    const service = forProvider(item.service, this.selectedId());
    return item.id ? nodeLabel(item as CloudNode, this.nodes(), service) : service;
  }

  /** Nombre del servicio sin el nombre propio del nodo. */
  cloudServiceOf(node: CloudNode): string {
    return forProvider(node.service, this.selectedId());
  }

  terraformOf(node: CloudNode): string | null {
    return node.terraform ? forProvider(node.terraform, this.selectedId()) : null;
  }

  zoneLabelOf(zone: StudioZone): string {
    return zoneLabel(zone, this.selectedId());
  }

  iconKeyOf(item: { icon: IconRef | null }): TechIconKey | null {
    return item.icon ? resolveIcon(item.icon, this.selectedId()) : null;
  }

  iconOf(item: { icon: IconRef | null }): TechIcon | null {
    const key = this.iconKeyOf(item);
    return key ? TECH_ICONS[key] : null;
  }

  isWireActive(wire: CloudLink): boolean {
    return wire.from === this.activeId() || wire.to === this.activeId();
  }

  /** Cambia de nube: todos los nodos, también los añadidos, pasan a su servicio equivalente. */
  select(id: CloudProviderId): void {
    this.selectedId.set(id);
    this.events.emitFromUser([...PROVISIONING_LOG[id], ...this.validationSteps()]);
    this.inspector.select(id);
  }

  toggleEditing(): void {
    this.cancelConnection();
    this.editing.update((editing) => !editing);
    this.iconPop.release();
  }

  /**
   * Resalta el nodo y sus conexiones. Fuera del modo de edición, además el inspector pasa a
   * mostrar la traza de esa pieza y su logo despega; con clic o toque se inyecta una muestra
   * de su telemetría.
   */
  activate(node: CloudNode, event: Event): void {
    if (this.editing() && event.type === 'click' && this.connectingFrom() && this.connectingFrom() !== node.id) {
      this.connect(this.connectingFrom()!, node.id);
      return;
    }
    this.activeId.set(node.id);
    if (this.editing()) {
      return;
    }
    const telemetry = telemetryFor(node.type, node.role);
    const name = this.serviceOf(node);
    const key = this.iconKeyOf(node);
    this.inspector.inspectComponent({ id: node.id, label: name, icon: key ?? telemetry.tech ?? this.selectedId(), tech: telemetry.tech });
    if (event.type === 'click') {
      this.events.emitFromUser(telemetry.steps.map(([kind, tag, detail]) => [kind, tag, (detail ?? '').replace('{name}', name)]), node.id);
    }

    const target = event.currentTarget as Element;
    const logo = target.querySelector('.node-icon');
    if (!key || !logo) {
      return;
    }
    if (event.type === 'mouseenter') {
      this.iconPop.hoverEnter(TECH_ICONS[key], logo, target);
    } else if (event.type === 'click') {
      this.iconPop.pop(TECH_ICONS[key], logo, true, target);
    }
  }

  leave(event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('.node-icon');
    if (logo) {
      this.iconPop.hoverLeave(logo);
    }
  }

  async copyMainTf(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.mainTf());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Sin permiso de portapapeles el código sigue a la vista para copiarlo a mano.
    }
  }

  // ---------- Caos ----------

  /** Un escenario solo se puede simular si sus nodos siguen en el lienzo. */
  canRun(scenario: ChaosScenario): boolean {
    return scenario.requires.every((id) => this.nodes().some((node) => node.id === id));
  }

  /** Estado que el escenario en curso rotula sobre el nodo, si le afecta. */
  chaosOf(node: CloudNode): { label: string; level: ChaosLevel } | null {
    const fault = this.faults()[node.id];
    if (fault) {
      return fault === 'down' ? { label: 'DOWN', level: 'down' } : { label: 'CPU 100 %', level: 'warn' };
    }
    if (this.takingOver().has(node.id)) {
      return { label: 'FAILOVER', level: 'ok' };
    }
    return this.chaosPhase()?.nodes[node.id] ?? null;
  }

  // ---------- Tráfico en vivo e inyección de fallos ----------

  setTraffic(mode: TrafficMode): void {
    if (mode === this.trafficMode()) {
      return;
    }
    this.trafficMode.set(mode);
    const profile = profileOf(mode);
    const vitals = this.vitals();
    this.events.emitFromUser([
      ['info', 'Traffic Profile', `${profile.name} (${profile.hint}) · ≈ ${profile.rps.toLocaleString('en-US')} req/s`],
      [vitals.status === 'ok' ? 'ok' : 'warn', '200 OK', `GET /public/projects · p95 ${vitals.p95} ms · ${vitals.note}`],
    ]);
  }

  /** Avanza la simulación un latido; cada pocos, deja en el inspector una línea con el estado. */
  onBeat(): void {
    this.phase.update((phase) => phase + 1);
    if (this.phase() % 5 === 0) {
      const vitals = this.vitals();
      this.events.emit(vitals.status === 'ok' ? 'ok' : 'warn', vitals.status === 'down' ? '503 Service Unavailable' : '200 OK',
        `GET /public/projects · ${vitals.rps.toLocaleString('en-US')} req/s · p95 ${vitals.p95} ms`);
    }
  }

  /**
   * Inyecta un fallo en un nodo: lo tumba o lo pone al 100 % de CPU. Si hay otra instancia sana
   * del mismo servicio, asume su tráfico; si no, el sistema se degrada. Se recupera solo a los
   * pocos segundos, y todo queda registrado en la traza del nodo.
   */
  injectFault(node: CloudNode, kind: FaultKind): void {
    this.clearFault(node.id, false);
    const name = this.serviceOf(node);
    this.faults.update((faults) => ({ ...faults, [node.id]: kind }));
    this.inspector.inspectComponent({ id: node.id, label: name, icon: this.iconKeyOf(node) ?? this.selectedId(), tech: null });
    this.iconPop.release();

    if (kind === 'cpu') {
      this.events.emitFromUser([['warn', 'CPU 100 %', `${name} · la latencia sube`]], node.id);
    } else {
      const backup = backupOf(node, this.nodes(), this.faults());
      this.events.emitFromUser([
        ['warn', 'Service DOWN', `${name} · fallo inyectado a mano`],
        backup
          ? ['ok', 'Failover', `el tráfico pasa a ${this.serviceOf(backup)}`]
          : ['warn', 'No Redundancy', `${name} no tiene otra instancia: se pierden peticiones`],
      ], node.id);
    }
    this.faultTimers.set(node.id, [
      setTimeout(() => this.events.emitFromUser([['info', 'Recovery Test', `${name} · comprobación de salud`]], node.id), FAULT_RECOVERY_MS - 2500),
      setTimeout(() => this.clearFault(node.id, true), FAULT_RECOVERY_MS),
    ]);
  }

  /** Quita el fallo de un nodo, por recuperación o porque lo restaura la persona. */
  clearFault(id: string, announce: boolean): void {
    this.faultTimers.get(id)?.forEach((timer) => clearTimeout(timer));
    this.faultTimers.delete(id);
    if (!this.faults()[id]) {
      return;
    }
    this.faults.update(({ [id]: _, ...rest }) => rest);
    const node = this.nodes().find((candidate) => candidate.id === id);
    if (announce && node) {
      this.events.emitFromUser([['ok', 'Service UP', `${this.serviceOf(node)} · restablecido`]], id);
    }
  }

  private clearFaults(): void {
    this.faultTimers.forEach((timers) => timers.forEach((timer) => clearTimeout(timer)));
    this.faultTimers.clear();
    this.faults.set({});
  }

  /** Reproduce el escenario fase a fase: fallo, fallback, prueba de recuperación y vuelta a la normalidad. */
  runChaos(scenario: ChaosScenario): void {
    if (!this.canRun(scenario)) {
      return;
    }
    this.stopChaos();
    this.iconPop.release();
    this.inspector.select(scenario.inspect);
    this.enterChaosPhase(scenario, 0);
    for (let phase = 1; phase < scenario.phases.length; phase++) {
      this.chaosTimers.push(setTimeout(() => this.enterChaosPhase(scenario, phase), phase * CHAOS_PHASE_MS));
    }
    // Tras la última fase el lienzo vuelve a su estado normal.
    this.chaosTimers.push(setTimeout(() => this.chaos.set(null), (scenario.phases.length - 1) * CHAOS_PHASE_MS + CHAOS_SETTLE_MS));
  }

  stopChaos(): void {
    this.clearChaosTimers();
    this.chaos.set(null);
  }

  private enterChaosPhase(scenario: ChaosScenario, phase: number): void {
    this.chaos.set({ scenario, phase });
    this.events.emitFromUser(scenario.phases[phase].events.map(([kind, tag, detail]) => [kind, tag, this.fill(detail ?? '')]));
  }

  private clearChaosTimers(): void {
    this.chaosTimers.forEach((timer) => clearTimeout(timer));
    this.chaosTimers = [];
  }

  /** Sustituye `{id}` por el nombre que tiene ese nodo en la nube activa. */
  private fill(text: string): string {
    return text.replace(/\{(\w+)\}/g, (_, id: string) => {
      const node = this.nodes().find((candidate) => candidate.id === id);
      return node ? this.serviceOf(node) : id;
    });
  }

  // ---------- Auditoría ----------

  toggleCopilot(): void {
    this.copilotOpen.update((open) => !open);
    if (this.copilotOpen()) {
      this.auditOpen.set(false);
      this.propertiesId.set(null);
    }
  }

  /**
   * Coloca en el lienzo las piezas de una recomendación del copiloto, como un solo paso de
   * historial. Las del catálogo caen en su zona, con su icono y su recurso; las que no están en
   * él entran como tecnología externa, sin icono ni Terraform.
   *
   * @return cuántas se han colocado
   */
  applyAdditions(additions: CopilotAddition[]): number {
    const usable = additions.filter((addition) => catalogItem(addition.code, this.catalog()) || (addition.code === 'custom' && addition.name));
    if (usable.length === 0) {
      return 0;
    }
    this.record();
    const names: string[] = [];
    for (const addition of usable) {
      const item = catalogItem(addition.code, this.catalog());
      const zone: ZoneId = item?.zone ?? 'external';
      const type = item?.type ?? 'custom';
      let id = `${type}-${this.nextCustomId++}`;
      while (this.nodes().some((candidate) => candidate.id === id)) {
        id = `${type}-${this.nextCustomId++}`;
      }
      const node: CloudNode = item
        ? {
          id, type, ...clamp(this.freeSlot(zone)), zone, role: addition.role ?? item.capability, service: item.service, icon: item.icon,
          terraform: item.terraform, why: item.why, custom: true,
        }
        : {
          id, type, ...clamp(this.freeSlot(zone)), zone, role: addition.role ?? 'Tecnología externa', service: addition.name!, icon: null,
          terraform: null, why: 'Propuesta por el copiloto; no está en el catálogo del estudio.', custom: true,
        };
      const anchor = this.nodes().find((candidate) => candidate.id === addition.connectFrom)
        ?? (item ? this.nodes().find((candidate) => candidate.id === item.connectFrom) : undefined);
      this.nodes.update((nodes) => [...nodes, node]);
      if (anchor) {
        this.links.update((links) => [...links, { from: anchor.id, to: id }]);
      }
      this.activeId.set(id);
      names.push(this.serviceOf(node));
    }
    this.modified.set(true);
    this.events.emitFromUser([
      ['info', `Terraform Plan +${usable.length} to add`, `copiloto · ${names.join(', ')}`],
      ['ok', 'Route Table Updated', `${usable.length} ${usable.length === 1 ? 'pieza añadida' : 'piezas añadidas'}`],
      ...this.validationSteps(),
    ]);
    this.inspector.select('terraform');
    return usable.length;
  }

  openAudit(): void {
    this.copilotOpen.set(false);
    const actions = this.recommendations().filter((item) => item.level === 'action').length;
    this.auditOpen.set(true);
    this.events.emitFromUser([
      ['info', 'Topology Audit', `${this.nodes().length} nodos · ${this.wires().length} conexiones · ${this.selected().name}`],
      ['ok', 'Audit Rules Complete', `${actions} recomendaciones · consulta RAG a Gemini en curso`],
    ]);
    this.inspector.select('gemini');
  }

  onAuditAnswered(ok: boolean): void {
    this.events.emitFromUser([ok
      ? ['ai', 'Gemini generateContent', 'contraste de la auditoría con la plataforma real']
      : ['warn', 'Gemini', 'asistente no disponible · la auditoría por reglas sigue siendo válida']]);
  }

  // ---------- Edición ----------

  /**
   * Coloca un servicio del catálogo: en el punto indicado (si se soltó sobre el lienzo) o en
   * el primer hueco libre de su zona, y lo conecta con el nodo del que recibe el tráfico.
   */
  add(item: CatalogItem, at?: { x: number; y: number }): void {
    this.record();
    const position = clamp(at ?? this.freeSlot(item.zone));
    // Soltado en un punto concreto, su zona de red es la del recuadro donde cae.
    const zone = at ? roleAt(this.zones(), position.x, position.y, item.zone) : item.zone;
    let id = `${item.type}-${this.nextCustomId++}`;
    while (this.nodes().some((candidate) => candidate.id === id)) {
      id = `${item.type}-${this.nextCustomId++}`;
    }
    const node: CloudNode = {
      id, type: item.type, ...position, zone, role: item.capability, service: item.service, icon: item.icon,
      terraform: item.terraform, why: item.why, custom: true,
    };

    // Origen del tráfico según el tipo de servicio; si ya no está en el lienzo, el nodo más cercano.
    // Una pieza de datos solo se conecta con lo que sus reglas admiten; si no hay nada, queda suelta.
    const anchor = endpointOf(item.type) === 'service'
      ? (this.nodes().find((candidate) => candidate.id === item.connectFrom) ?? nearest(this.nodes(), position))
      : anchorFor(item.type, item.connectFrom, position, this.nodes());
    this.nodes.update((nodes) => [...nodes, node]);
    if (anchor) {
      const kind = inferKind(anchor.type, item.type);
      this.links.update((links) => [...links, { from: anchor.id, to: id, ...(kind ? { kind } : {}) }]);
    }
    this.activeId.set(id);
    this.modified.set(true);

    const name = this.serviceOf(node);
    const resource = item.terraform ? forProvider(item.terraform, this.selectedId()) : null;
    this.events.emitFromUser([
      ['info', 'Terraform Plan +1 to add', `${name} · ${item.capability}`],
      resource
        ? ['ok', `Terraform Apply: resource "${resource}"`, `"${id.replace(/-/g, '_')}" { … } · creation complete`]
        : ['warn', 'Terraform', `${name}: sin soporte de Terraform todavía`],
      ['ok', `Deploying Node: ${name}`, this.selected().name],
      ['ok', 'Route Table Updated', anchor ? `${this.serviceOf(anchor)} → ${name}` : name],
      ...this.validationSteps(),
    ]);
    this.inspector.select('terraform');
    // Cuando el nodo ya está dibujado, su logo entra con el pop-out 3D.
    setTimeout(() => this.popNode(id), 80);
  }

  remove(node: CloudNode): void {
    this.record();
    if (this.propertiesId() === node.id) {
      this.propertiesId.set(null);
    }
    this.clearFault(node.id, false);
    const name = this.serviceOf(node);
    const affected = this.links().filter((link) => link.from === node.id || link.to === node.id).length;
    this.iconPop.release();
    this.nodes.update((nodes) => nodes.filter((candidate) => candidate.id !== node.id));
    this.links.update((links) => links.filter((link) => link.from !== node.id && link.to !== node.id));
    this.modified.set(true);

    this.events.emitFromUser([
      ['warn', 'Terraform Plan -1 to destroy', `${name} · ${node.role}`],
      ['warn', `Destroying Node: ${name}`, this.selected().name],
      ['ok', 'Route Table Updated', `${affected} ${affected === 1 ? 'ruta eliminada' : 'rutas eliminadas'}`],
      ...this.validationSteps(),
    ]);
    this.inspector.select('terraform');
  }

  reset(): void {
    this.record();
    this.iconPop.release();
    this.apply({ ...referenceProject(), provider: this.selectedId() });
    this.modified.set(false);
    this.cloudProject.set(null);
    this.events.emitFromUser([
      ['info', 'Terraform', 'estado restablecido a la arquitectura de referencia'],
      ...this.validationSteps(),
    ]);
  }

  // Soltar sobre el lienzo un servicio arrastrado desde el catálogo.
  onCanvasDragOver(event: DragEvent): void {
    if (this.editing()) {
      event.preventDefault();
    }
  }

  onCanvasDrop(event: DragEvent): void {
    const type = event.dataTransfer?.getData(CATALOG_DRAG_TYPE) || event.dataTransfer?.getData('text/plain');
    const item = this.catalog().flatMap((category) => category.items).find((candidate) => candidate.type === type);
    if (!this.editing() || !item) {
      return;
    }
    event.preventDefault();
    this.add(item, this.toCanvas(event.clientX, event.clientY));
  }

  // Mover un nodo arrastrándolo (ratón o dedo).
  onNodePointerDown(event: PointerEvent, node: CloudNode): void {
    if (!this.editing()) {
      return;
    }
    const point = this.toCanvas(event.clientX, event.clientY);
    this.dragging = { id: node.id, dx: node.x - point.x, dy: node.y - point.y, recorded: false };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.activeId.set(node.id);
  }

  onNodePointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    if (!this.dragging.recorded) {
      this.record();
      this.dragging.recorded = true;
    }
    const point = this.toCanvas(event.clientX, event.clientY);
    this.moveTo(this.dragging.id, point.x + this.dragging.dx, point.y + this.dragging.dy);
    const moved = this.nodes().find((node) => node.id === this.dragging!.id);
    this.dropZoneId.set(moved ? (zoneAt(this.zones(), moved.x, moved.y)?.id ?? null) : null);
  }

  onNodePointerUp(): void {
    this.dragging = null;
    this.dropZoneId.set(null);
  }

  // Con teclado: las flechas mueven el nodo enfocado y Supr o Retroceso lo quitan.
  onNodeKeydown(event: KeyboardEvent, node: CloudNode): void {
    if (!this.editing()) {
      return;
    }
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0], ArrowRight: [KEYBOARD_STEP, 0], ArrowUp: [0, -KEYBOARD_STEP], ArrowDown: [0, KEYBOARD_STEP],
    };
    if (step[event.key]) {
      event.preventDefault();
      // Se parte de la posición actual del nodo, no de la que tenía al dibujarse por última vez.
      const current = this.nodes().find((candidate) => candidate.id === node.id) ?? node;
      this.record();
      this.moveTo(node.id, current.x + step[event.key][0], current.y + step[event.key][1]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.openProperties(node);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(node);
    }
  }

  // ---------- Proyecto ----------

  /** El proyecto tal como está ahora en el lienzo. */
  project(): StudioProject {
    return { provider: this.selectedId(), nodes: this.nodes(), links: this.links(), zones: this.zones() };
  }

  /** Abre una plantilla o un proyecto guardado; los del backend se piden en ese momento. */
  loadPreset(entry: StudioEntry): void {
    this.menu.set(null);
    this.projectError.set(null);
    this.studio.open(entry).subscribe({
      next: (project) => {
        this.record();
        this.apply(project);
        this.modified.set(entry.id !== 'reference');
        this.cloudProject.set(entry.kind === 'saved' ? { id: entry.id, title: entry.name } : null);
        this.cloudTitle.set(entry.kind === 'saved' ? entry.name : '');
        this.events.emitFromUser([['info', 'Terraform', `plantilla «${entry.name}» cargada`], ...this.validationSteps()]);
        this.inspector.select('terraform');
      },
      error: (error: unknown) => this.projectError.set(`No se pudo abrir «${entry.name}»: ${describe(error)}`),
    });
  }

  /**
   * Carga un patrón de datos de la galería. Sustituye el lienzo o se agrega a lo que hay, en
   * la nube que esté elegida; en los dos casos es un solo paso de deshacer.
   */
  loadBlueprint({ blueprint, mode }: BlueprintLoad): void {
    this.projectError.set(null);
    const built = { ...blueprint.build(), provider: this.selectedId() };
    const merged = mode === 'add' ? mergeBlueprint(this.project(), built) : null;
    if (merged && !merged.ok) {
      this.projectError.set(merged.error);
      return;
    }
    this.record();
    this.apply(merged?.ok ? merged.project : built);
    this.modified.set(true);
    this.cloudProject.set(null);
    this.cloudTitle.set('');
    this.events.emitFromUser([
      ['info', 'Blueprint', `«${blueprint.name}» v${blueprint.version} ${merged?.ok ? `agregado al lienzo (${merged.added} piezas nuevas)` : 'cargado en el lienzo'}`],
      ...this.validationSteps(),
    ]);
    this.inspector.select('terraform');
    this.host.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  /** Guarda el lienzo en el backend: como proyecto nuevo o actualizando el que se abrió. */
  saveToCloud(asNew: boolean): void {
    const title = this.cloudTitle().trim();
    if (!title || this.saving()) {
      return;
    }
    const current = asNew ? null : this.cloudProject();
    this.saving.set(true);
    this.projectError.set(null);
    this.cloudNotice.set(null);
    this.studio.save(this.project(), title, current?.id).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.cloudProject.set({ id: saved.id, title: saved.title });
        this.cloudNotice.set(`«${saved.title}» guardado en el servidor.`);
        this.menu.set(null);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.projectError.set(`No se pudo guardar en la nube: ${describe(error)}`);
      },
    });
  }

  undo(): void {
    const previous = this.history.undo(this.project());
    if (previous) {
      this.apply(previous);
      this.modified.set(true);
    }
    this.syncHistory();
  }

  redo(): void {
    const next = this.history.redo(this.project());
    if (next) {
      this.apply(next);
      this.modified.set(true);
    }
    this.syncHistory();
  }

  // Ctrl/Cmd+Z deshace y Ctrl+Y o Ctrl/Cmd+Mayús+Z rehace, salvo mientras se escribe en un campo.
  @HostListener('keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key === 'Escape' && this.connectingFrom()) {
      this.cancelConnection();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.menu() && !(event.target as Element).closest?.('[data-menu]')) {
      this.menu.set(null);
    }
  }

  exportProject(): void {
    downloadBlob(new Blob([serializeProject(this.project())], { type: 'application/json' }), `arquitectura${PROJECT_EXTENSION}`);
    this.menu.set(null);
  }

  async importProject(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const parsed = parseProject(await file.text());
    if (!parsed.ok) {
      this.projectError.set(parsed.error);
      return;
    }
    this.record();
    this.apply(parsed.project);
    this.modified.set(true);
    this.projectError.set(null);
    this.events.emitFromUser([['info', 'Terraform', `proyecto importado · ${parsed.project.nodes.length} nodos`], ...this.validationSteps()]);
  }

  /** Imagen del diagrama tal como está: PNG a triple resolución (fondo oscuro o transparente) o SVG. */
  /** Fondo oscuro de las imágenes exportadas: la superficie de las tarjetas (un archivo suelto no puede usar la variable CSS). */
  darkBackground(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--bg-surface-1').trim() || 'black';
  }

  async exportImage(format: 'png' | 'svg', background: string | null): Promise<void> {
    const svg = this.canvas()?.nativeElement;
    this.menu.set(null);
    if (!svg) {
      return;
    }
    this.exporting.set(true);
    this.projectError.set(null);
    try {
      const text = await serializeDiagram(svg, { background });
      downloadBlob(format === 'svg' ? new Blob([text], { type: 'image/svg+xml' }) : await rasterize(text), `arquitectura-${this.selectedId()}.${format}`);
    } catch {
      this.projectError.set('No se pudo exportar la imagen del diagrama.');
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * `main.tf` y `variables.tf` del lienzo, en un ZIP. Los compila el backend; si no responde,
   * se usan los del navegador, que generan el mismo texto.
   */
  async exportTerraform(): Promise<void> {
    this.menu.set(null);
    const local = { mainTf: this.mainTf(), variablesTf: generateVariablesTf(this.nodes(), this.selectedId()) };
    const files = await firstValueFrom(this.studio.terraform(this.project())).catch(() => local);
    const readme = [
      `Terraform generado desde el Estudio de arquitectura (${this.selected().name}).`,
      'Es un esqueleto: declara los recursos y sus dependencias, pero no sus argumentos.',
      'No se puede aplicar tal cual.',
    ].join('\n');
    downloadBlob(createZip([
      { name: 'main.tf', content: files.mainTf + '\n' },
      { name: 'variables.tf', content: files.variablesTf + '\n' },
      { name: 'README.txt', content: readme + '\n' },
    ]), `terraform-${this.selectedId()}.zip`);
  }

  // ---------- Auto-ordenar y conexiones ----------

  /** Recoloca todos los nodos por capas, alineados a la rejilla de sus recuadros. */
  autoArrange(): void {
    if (this.nodes().length === 0) {
      return;
    }
    this.record();
    this.iconPop.release();
    this.nodes.set(autoLayout(this.nodes(), this.links(), this.zones()));
    this.modified.set(true);
    this.events.emitFromUser([['info', 'Terraform', `lienzo auto-ordenado · ${this.nodes().length} nodos`]]);
  }

  /** Empieza a trazar una conexión desde un nodo: arrastrando hasta el destino o pulsándolo después. */
  startConnection(node: CloudNode, event?: PointerEvent): void {
    this.connectingFrom.set(node.id);
    this.propertiesId.set(null);
    if (event) {
      event.stopPropagation();
      this.linkDragStart = this.toCanvas(event.clientX, event.clientY);
      this.linkPreview.set(this.linkDragStart);
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    }
  }

  onLinkPointerMove(event: PointerEvent): void {
    if (this.linkDragStart) {
      this.linkPreview.set(this.toCanvas(event.clientX, event.clientY));
    }
  }

  onLinkPointerUp(event: PointerEvent): void {
    const start = this.linkDragStart;
    if (!start) {
      return;
    }
    this.linkDragStart = null;
    const point = this.toCanvas(event.clientX, event.clientY);
    const target = this.nodes().find((node) => Math.abs(node.x - point.x) <= NODE_WIDTH / 2 && Math.abs(node.y - point.y) <= NODE_HEIGHT / 2);
    if (target && target.id !== this.connectingFrom()) {
      this.connect(this.connectingFrom()!, target.id);
    } else if (Math.hypot(point.x - start.x, point.y - start.y) > 6) {
      // Soltado en el vacío: se cancela. Sin arrastre fue un clic: se espera a que se pulse el destino.
      this.cancelConnection();
    } else {
      this.linkPreview.set(null);
    }
  }

  cancelConnection(): void {
    this.connectingFrom.set(null);
    this.linkPreview.set(null);
    this.linkDragStart = null;
  }

  connect(from: string, to: string): void {
    this.cancelConnection();
    const source = this.nodes().find((node) => node.id === from);
    const target = this.nodes().find((node) => node.id === to);
    if (!source || !target || from === to || this.links().some((link) => link.from === from && link.to === to)) {
      return;
    }
    this.record();
    const kind = inferKind(source.type, target.type);
    this.links.update((links) => [...links, { from, to, ...(kind ? { kind } : {}) }]);
    this.activeId.set(to);
    this.modified.set(true);
    this.events.emitFromUser([['ok', 'Route Table Updated', `${this.serviceOf(source)} → ${this.serviceOf(target)}`], ...this.validationSteps()]);
    this.inspector.select('terraform');
  }

  disconnect(from: string, to: string): void {
    if (!this.links().some((link) => link.from === from && link.to === to)) {
      return;
    }
    this.record();
    this.links.update((links) => links.filter((link) => !(link.from === from && link.to === to)));
    this.modified.set(true);
    this.events.emitFromUser([['ok', 'Route Table Updated', '1 ruta eliminada'], ...this.validationSteps()]);
  }

  /** Cambia qué lleva una conexión; `null` la deja como tráfico de peticiones corriente. */
  setLinkKind(from: string, to: string, kind: LinkKind | null): void {
    const link = this.links().find((candidate) => candidate.from === from && candidate.to === to);
    if (!link || (link.kind ?? null) === kind) {
      return;
    }
    this.record();
    this.links.update((links) => links.map((candidate) => {
      if (candidate !== link) {
        return candidate;
      }
      const { kind: _previous, ...rest } = candidate;
      return kind ? { ...rest, kind } : rest;
    }));
    this.modified.set(true);
  }

  kindLabel(kind: LinkKind | undefined): string | null {
    return kind ? KIND_LABELS[kind] : null;
  }

  // ---------- Propiedades de un nodo ----------

  openProperties(node: CloudNode): void {
    this.activeId.set(node.id);
    this.propertiesId.set(node.id);
    this.propertiesRecorded = false;
    this.auditOpen.set(false);
  }

  updateNode(id: string, patch: NodePatch): void {
    if (!this.propertiesRecorded) {
      this.record();
      this.propertiesRecorded = true;
    }
    this.nodes.update((nodes) => nodes.map((node) => {
      if (node.id !== id) {
        return node;
      }
      const updated: CloudNode = { ...node };
      if (patch.name !== undefined) {
        updated.name = patch.name.trim() ? patch.name : undefined;
      }
      if (patch.props) {
        updated.props = { ...node.props, ...patch.props };
      }
      if (patch.zone && patch.zone !== node.zone) {
        // Cambia de zona de red: se recoloca en un hueco libre de su recuadro.
        Object.assign(updated, this.freeSlot(patch.zone), { zone: patch.zone });
      }
      return updated;
    }));
    this.modified.set(true);
  }

  // ---------- Zonas ----------

  addZone(kind: ZoneKind): void {
    this.record();
    const definition = ZONE_KINDS.find((candidate) => candidate.kind === kind)!;
    const count = this.zones().filter((zone) => !BASE_ZONES.some((base) => base.id === zone.id)).length;
    let id = `zone-${count + 1}`;
    for (let next = count + 2; this.zones().some((zone) => zone.id === id); next++) {
      id = `zone-${next}`;
    }
    const zone: StudioZone = { id, kind, role: definition.role, x: 24 + (count % 4) * 22, y: 392 + (count % 4) * 22, w: 240, h: 170 };
    this.zones.update((zones) => [...zones, zone]);
    this.activeZoneId.set(id);
    this.modified.set(true);
    this.menu.set(null);
  }

  removeZone(zone: StudioZone): void {
    this.record();
    this.zones.update((zones) => zones.filter((candidate) => candidate.id !== zone.id));
    this.activeZoneId.set(null);
    this.reassignZones();
    this.modified.set(true);
  }

  renameZone(zone: StudioZone, label: string): void {
    this.zones.update((zones) => zones.map((candidate) =>
      candidate.id === zone.id ? { ...candidate, label: label.trim() ? label.slice(0, 60) : undefined } : candidate));
    this.modified.set(true);
  }

  // Una zona se mueve arrastrando su rótulo (y arrastra lo que contiene) y se redimensiona desde su esquina.
  onZonePointerDown(event: PointerEvent, zone: StudioZone, mode: 'move' | ZoneCorner): void {
    if (!this.editing()) {
      return;
    }
    event.stopPropagation();
    const point = this.toCanvas(event.clientX, event.clientY);
    const inside = (node: CloudNode) => node.x >= zone.x && node.x <= zone.x + zone.w && node.y >= zone.y && node.y <= zone.y + zone.h;
    this.zoneDrag = {
      id: zone.id, mode, x: point.x, y: point.y, origin: { ...zone }, recorded: false,
      nodes: mode === 'move' ? this.nodes().filter(inside).map((node) => ({ ...node })) : [],
      zones: mode === 'move' ? zonesInside(this.zones(), zone).map((inner) => ({ ...inner })) : [],
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    this.activeZoneId.set(zone.id);
  }

  onZonePointerMove(event: PointerEvent): void {
    const drag = this.zoneDrag;
    if (!drag) {
      return;
    }
    if (!drag.recorded) {
      this.record();
      drag.recorded = true;
    }
    const point = this.toCanvas(event.clientX, event.clientY);
    this.transformZone(drag, point.x - drag.x, point.y - drag.y);
  }

  onZonePointerUp(): void {
    if (this.zoneDrag?.recorded) {
      this.reassignZones();
    }
    this.zoneDrag = null;
  }

  // Con teclado: flechas para mover, Mayús+flechas para redimensionar y Supr para quitar.
  onZoneKeydown(event: KeyboardEvent, zone: StudioZone): void {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0], ArrowRight: [KEYBOARD_STEP, 0], ArrowUp: [0, -KEYBOARD_STEP], ArrowDown: [0, KEYBOARD_STEP],
    };
    if (!this.editing()) {
      return;
    }
    if (step[event.key]) {
      event.preventDefault();
      this.record();
      const inside = (node: CloudNode) => node.x >= zone.x && node.x <= zone.x + zone.w && node.y >= zone.y && node.y <= zone.y + zone.h;
      const mode = event.shiftKey ? 'se' : 'move';
      this.transformZone({
        id: zone.id, mode, origin: { ...zone },
        nodes: mode === 'move' ? this.nodes().filter(inside).map((node) => ({ ...node })) : [],
        zones: mode === 'move' ? zonesInside(this.zones(), zone).map((inner) => ({ ...inner })) : [],
      }, step[event.key][0], step[event.key][1]);
      this.reassignZones();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeZone(zone);
    }
  }

  private transformZone(drag: { id: string; mode: 'move' | ZoneCorner; origin: StudioZone; nodes: CloudNode[]; zones: StudioZone[] }, dx: number, dy: number): void {
    const { origin } = drag;
    if (drag.mode !== 'move') {
      const { x, y, w, h } = resizeZone(origin, drag.mode, dx, dy);
      this.zones.update((zones) => zones.map((zone) => (zone.id === drag.id ? { ...zone, x, y, w, h } : zone)));
    } else {
      // El recuadro no sale del lienzo; lo que contiene se desplaza lo mismo que él.
      const moveX = Math.round(Math.min(CANVAS_WIDTH - origin.w - origin.x, Math.max(-origin.x, dx)));
      const moveY = Math.round(Math.min(CANVAS_HEIGHT - origin.h - origin.y, Math.max(-origin.y, dy)));
      const moved = new Map([origin, ...drag.zones].map((zone) => [zone.id, zone]));
      this.zones.update((zones) => zones.map((zone) => {
        const start = moved.get(zone.id);
        return start ? { ...zone, x: start.x + moveX, y: start.y + moveY } : zone;
      }));
      const carried = new Map(drag.nodes.map((node) => [node.id, node]));
      this.nodes.update((nodes) => nodes.map((node) => {
        const start = carried.get(node.id);
        return start ? { ...node, ...clamp({ x: start.x + moveX, y: start.y + moveY }) } : node;
      }));
    }
    this.modified.set(true);
  }

  /** Tras mover, redimensionar o quitar un recuadro, cada nodo toma la zona de red del sitio donde ha quedado. */
  private reassignZones(): void {
    this.nodes.update((nodes) => nodes.map((node) => {
      const zone = roleAt(this.zones(), node.x, node.y, node.zone);
      return zone === node.zone ? node : { ...node, zone };
    }));
  }

  /** Guarda el estado actual en el historial, justo antes de cambiarlo. */
  private record(): void {
    this.history.record(this.project());
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private apply(project: StudioProject): void {
    this.iconPop.release();
    this.stopChaos();
    this.clearFaults();
    this.selectedId.set(project.provider);
    this.nodes.set(structuredClone(project.nodes));
    this.links.set(structuredClone(project.links));
    this.zones.set(structuredClone(project.zones));
    this.activeId.set(project.nodes.some((node) => node.id === 'api') ? 'api' : (project.nodes[0]?.id ?? ''));
    this.propertiesId.set(null);
    this.activeZoneId.set(null);
    this.cancelConnection();
  }

  /** Recupera el proyecto que el visitante dejó guardado en este navegador, si es válido. */
  private restore(): void {
    try {
      const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
      const parsed = stored ? parseProject(stored) : null;
      if (parsed?.ok) {
        this.apply(parsed.project);
        this.modified.set(true);
      }
    } catch {
      // Sin almacenamiento se parte de la arquitectura de referencia.
    }
  }

  /** Las comprobaciones de seguridad de la topología actual, como eventos para el inspector. */
  private validationSteps(): SystemEventStep[] {
    return this.findings().map((finding) => [finding.level === 'ok' ? 'ok' : 'warn', finding.check, finding.detail]);
  }

  private moveTo(id: string, x: number, y: number): void {
    const position = clamp({ x, y });
    // Al cambiar de recuadro, el nodo cambia de zona de red.
    this.nodes.update((nodes) => nodes.map((node) =>
      node.id === id ? { ...node, ...position, zone: roleAt(this.zones(), position.x, position.y, node.zone) } : node));
    this.modified.set(true);
  }

  /** Primer hueco libre de la zona; si está llena, uno fuera de la nube. */
  private freeSlot(zone: ZoneId): { x: number; y: number } {
    const isFree = ([x, y]: [number, number]) =>
      this.nodes().every((node) => Math.abs(node.x - x) >= NODE_WIDTH || Math.abs(node.y - y) >= NODE_HEIGHT);
    const [x, y] = [...slotsIn(this.zones(), zone), ...ZONE_SLOTS[zone], ...ZONE_SLOTS.external, ...ZONE_SLOTS.outside].find(isFree)
      ?? [CANVAS_WIDTH / 2, CANVAS_HEIGHT - NODE_HEIGHT];
    return { x, y };
  }

  private popNode(id: string): void {
    const element = this.host.querySelector(`[data-node-id="${id}"]`);
    const node = this.nodes().find((candidate) => candidate.id === id);
    const logo = element?.querySelector('.node-icon');
    const icon = node ? this.iconOf(node) : null;
    if (element && logo && icon) {
      this.iconPop.pop(icon, logo, true, element);
    }
  }

  /** Coordenadas de ventana → coordenadas del lienzo (el SVG se escala con el ancho disponible). */
  private toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const svg = this.canvas()?.nativeElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) {
      return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }
}

function describe(error: unknown): string {
  return error instanceof Error && !('status' in error) ? error.message : describeHttpError(error);
}

function clamp(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(Math.min(CANVAS_WIDTH - NODE_WIDTH / 2 - 4, Math.max(NODE_WIDTH / 2 + 4, position.x))),
    y: Math.round(Math.min(CANVAS_HEIGHT - NODE_HEIGHT / 2 - 4, Math.max(NODE_HEIGHT / 2 + 4, position.y))),
  };
}

function nearest(nodes: CloudNode[], position: { x: number; y: number }): CloudNode | null {
  return nodes.reduce<CloudNode | null>((best, node) => {
    const distance = Math.hypot(node.x - position.x, node.y - position.y);
    return !best || distance < Math.hypot(best.x - position.x, best.y - position.y) ? node : best;
  }, null);
}

/**
 * Curva bezier entre dos nodos: sale por el lado que mira al destino y llega por el opuesto.
 * Así los cables siguen a los nodos cuando se mueven.
 */
function connect(from: CloudNode, to: CloudNode): { path: string; labelAt: [number, number] } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let start: [number, number];
  let end: [number, number];
  let path: string;

  if (Math.abs(dx) * NODE_HEIGHT >= Math.abs(dy) * NODE_WIDTH * 0.5) {
    const side = Math.sign(dx) || 1;
    start = [from.x + (side * NODE_WIDTH) / 2, from.y];
    end = [to.x - (side * NODE_WIDTH) / 2, to.y];
    const middle = (start[0] + end[0]) / 2;
    path = `M${start[0]} ${start[1]} C${middle} ${start[1]} ${middle} ${end[1]} ${end[0]} ${end[1]}`;
  } else {
    const side = Math.sign(dy) || 1;
    start = [from.x, from.y + (side * NODE_HEIGHT) / 2];
    end = [to.x, to.y - (side * NODE_HEIGHT) / 2];
    const middle = (start[1] + end[1]) / 2;
    path = `M${start[0]} ${start[1]} C${start[0]} ${middle} ${end[0]} ${middle} ${end[0]} ${end[1]}`;
  }
  return { path, labelAt: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 7] };
}
