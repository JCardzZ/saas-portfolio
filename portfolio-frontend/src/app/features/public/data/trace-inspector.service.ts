import { Injectable, computed, inject, signal } from '@angular/core';

import { TechIconKey } from '../../../shared/ui/tech-icons';
import { DiffLine, GraphChange, diffLines, summarize } from './graph-diff';
import { SystemEvent, SystemEventsService } from './system-events.service';

/** Tecnologías con actividad propia en el flujo de eventos y que, por tanto, se pueden inspeccionar. */
export const INSPECTABLE_TECHS: readonly TechIconKey[] = [
  'angular', 'spring', 'redis', 'postgresql', 'gemini', 'jwt',
  'aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'cloudflare', 'docker', 'githubActions', 'graph',
];

// Servicios gestionados que son, a efectos de traza, la tecnología que alojan.
const ALIASES: Partial<Record<TechIconKey, TechIconKey>> = { neon: 'postgresql', upstash: 'redis' };

const MAX_SHOWN = 40;
/** Cambios del grafo que se conservan en el filtro «Grafo». */
const MAX_GRAPH_ENTRIES = 30;

/** Un cambio del grafo del Estudio, ya preparado para pintarse. */
export interface GraphEntry {
  id: number;
  time: string;
  summary: string;
  lines: DiffLine[];
}

/**
 * Dónde se coloca el panel: acoplado abajo o a la derecha (la página se encoge para no quedar
 * tapada), flotante y arrastrable, o recogido en una píldora.
 */
export type InspectorMode = 'bottom' | 'right' | 'floating' | 'pill';
/** Lo que se dibuja de verdad: en pantallas pequeñas el panel es siempre una hoja inferior. */
export type InspectorLayout = InspectorMode | 'sheet';

const MODES: InspectorMode[] = ['bottom', 'right', 'floating', 'pill'];
const MODE_STORAGE_KEY = 'trace-inspector-mode';
/** Por debajo de este ancho el panel es una hoja inferior; acoplarlo a la derecha exige más sitio. */
export const SHEET_BELOW_PX = 640;
/** Con menos alto que este (un móvil en horizontal) el panel acoplado no deja ver la página: va como hoja. */
export const SHEET_BELOW_HEIGHT_PX = 500;
export const RIGHT_DOCK_FROM_PX = 1024;

/**
 * Tecnología cuya traza se está inspeccionando. La fijan los nodos de los diagramas y los
 * logos del catálogo; la lee el panel inspector, que muestra solo sus eventos.
 */
@Injectable({ providedIn: 'root' })
export class TraceInspectorService {
  private readonly systemEvents = inject(SystemEventsService);

  private readonly _selected = signal<TechIconKey | null>(null);
  /** Logo que identifica lo inspeccionado: una tecnología o el servicio concreto de un nodo. */
  readonly selected = this._selected.asReadonly();

  /** Pieza concreta de un diagrama que se inspecciona, si la selección vino de un nodo. */
  private readonly _component = signal<{ id: string; label: string; tech: TechIconKey | null } | null>(null);
  /** Nombre de la pieza inspeccionada (p. ej. «RDS PostgreSQL»); `null` si se inspecciona una tecnología. */
  readonly label = computed(() => this._component()?.label ?? null);
  /** Pieza de diagrama que se está inspeccionando ahora, si la hay. */
  readonly componentId = computed(() => this._component()?.id ?? null);

  private readonly _mode = signal<InspectorMode>(storedMode());
  /** Modo elegido por el visitante; se recuerda entre visitas. */
  readonly mode = this._mode.asReadonly();
  /** Modo al que vuelve el panel al desplegar la píldora. */
  private expandedMode: Exclude<InspectorMode, 'pill'> = this._mode() === 'pill' ? 'bottom' : (this._mode() as Exclude<InspectorMode, 'pill'>);
  /** Ancho de la ventana; lo mantiene al día el componente del panel. */
  readonly viewportWidth = signal(typeof window === 'undefined' ? RIGHT_DOCK_FROM_PX : window.innerWidth);
  readonly viewportHeight = signal(typeof window === 'undefined' ? SHEET_BELOW_HEIGHT_PX : window.innerHeight);

  /** Pantalla de móvil (estrecha o baja): el inspector es una hoja inferior y, cerrado, una barra. */
  readonly narrow = computed(() => this.viewportWidth() < SHEET_BELOW_PX || this.viewportHeight() < SHEET_BELOW_HEIGHT_PX);

  /** Disposición efectiva según el modo elegido y el espacio disponible. */
  readonly layout = computed<InspectorLayout>(() => {
    const mode = this._mode();
    if (mode === 'pill') {
      return 'pill';
    }
    if (this.narrow()) {
      return 'sheet';
    }
    return mode === 'right' && this.viewportWidth() < RIGHT_DOCK_FROM_PX ? 'bottom' : mode;
  });

  /** Los eventos más recientes en los que interviene la tecnología seleccionada. */
  readonly events = computed(() => {
    const selected = this._selected();
    if (selected === null) {
      return [];
    }
    const component = this._component();
    // De un nodo: sus propios eventos más los de la tecnología que aloja. De una tecnología: los suyos.
    const matches = component
      ? (event: SystemEvent) => event.component === component.id || (component.tech !== null && !event.component && event.techs.includes(component.tech))
      : (event: SystemEvent) => event.techs.includes(selected);
    return this.systemEvents.events().filter(matches).slice(-MAX_SHOWN);
  });

  private readonly _graphEntries = signal<GraphEntry[]>([]);
  /** Filtro «Grafo»: los últimos cambios del grafo del lienzo, como diff de su JSON. */
  readonly graphEntries = this._graphEntries.asReadonly();
  private readonly _graphJson = signal('');
  /** El JSON completo del grafo tal como está ahora. */
  readonly graphJson = this._graphJson.asReadonly();
  /** Se está viendo el filtro «Grafo» en lugar de la traza de una tecnología. */
  readonly graphView = computed(() => this._selected() === 'graph');
  private nextGraphId = 1;

  /** El Estudio publica aquí cada cambio de su grafo (ya con su espera para agrupar cambios seguidos). */
  publishGraph(changes: GraphChange[], json: string, at = new Date()): void {
    this._graphJson.set(json);
    if (changes.length === 0) {
      return;
    }
    const entry: GraphEntry = {
      id: this.nextGraphId++, time: at.toLocaleTimeString('es-ES', { hour12: false }), summary: summarize(changes), lines: diffLines(changes),
    };
    this._graphEntries.update((entries) => [...entries, entry].slice(-MAX_GRAPH_ENTRIES));
  }

  /** Abre el filtro «Grafo». */
  selectGraph(): void {
    this._component.set(null);
    this._selected.set('graph');
  }

  /** Tecnología inspeccionable que corresponde a un logo, o `null` si no tiene traza propia. */
  static inspectable(icon: TechIconKey | undefined): TechIconKey | null {
    const tech = icon ? (ALIASES[icon] ?? icon) : undefined;
    return tech && INSPECTABLE_TECHS.includes(tech) ? tech : null;
  }

  /** Selecciona la tecnología de un logo. Los logos sin traza propia no cambian la selección. */
  select(icon: TechIconKey | undefined): void {
    const tech = TraceInspectorService.inspectable(icon);
    if (tech) {
      this._component.set(null);
      this._selected.set(tech);
    }
  }

  /**
   * Inspecciona una pieza concreta de un diagrama. La consola muestra los eventos propios de
   * ese nodo y, si aloja una tecnología con traza (`tech`), también los de esa tecnología.
   */
  inspectComponent(component: { id: string; label: string; icon: TechIconKey; tech: TechIconKey | null }): void {
    this._component.set({ id: component.id, label: component.label, tech: component.tech });
    this._selected.set(component.icon);
  }

  close(): void {
    this._component.set(null);
    this._selected.set(null);
  }

  setMode(mode: InspectorMode): void {
    this.compactHeight.set(null);
    if (mode !== 'pill') {
      this.expandedMode = mode;
    }
    this._mode.set(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // Sin almacenamiento (modo privado) el modo simplemente no se recuerda.
    }
  }

  /**
   * Cambia la posición solo para la acción en curso (p. ej. «Comprobar ahora» lo acopla a la derecha
   * para no tapar el diagrama), sin guardarla: la preferencia del visitante sigue siendo la suya.
   */
  dockTemporarily(mode: Exclude<InspectorMode, 'pill'>, compactHeight: number | null = null): void {
    this._mode.set(mode);
    this.compactHeight.set(mode === 'bottom' ? compactHeight : null);
  }

  /**
   * Alto justo para lo que se va a mostrar (acoplado abajo), mientras el visitante no lo cambie:
   * el inspector no le quita a la página más alto del que necesita. Lo anula cualquier cambio suyo.
   */
  readonly compactHeight = signal<number | null>(null);

  /** Despliega la píldora en el modo que tenía antes de minimizarse. */
  restore(): void {
    this.setMode(this.expandedMode);
  }
}

function storedMode(): InspectorMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY) as InspectorMode | null;
    return stored && MODES.includes(stored) ? stored : 'bottom';
  } catch {
    return 'bottom';
  }
}
