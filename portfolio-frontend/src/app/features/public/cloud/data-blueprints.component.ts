import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ArchitectureStudioService } from './architecture-studio.service';

import { CANVAS_HEIGHT, CANVAS_WIDTH, CLOUD_PROVIDERS, CloudLink, CloudNode, NODE_HEIGHT, NODE_WIDTH, forProvider } from './cloud-topology.data';
import { BlueprintLoad, DATA_BLUEPRINTS, DataBlueprint } from './data-blueprints';
import { endpointOf } from './graph-rules';
import { StudioZone } from './studio-project';

interface Thumbnail {
  zones: StudioZone[];
  nodes: (CloudNode & { data: boolean })[];
  wires: (CloudLink & { x1: number; y1: number; x2: number; y2: number })[];
}

interface Card {
  blueprint: DataBlueprint;
  thumbnail: Thumbnail;
  /** Las piezas de datos del patrón, con el nombre que tienen en la nube elegida. */
  services: string;
}

/**
 * Galería «Patrones de datos»: tres blueprints (CDC, analítica por eventos y recuperación
 * multirregión) que se cargan en el lienzo del Estudio. La miniatura se dibuja con el mismo
 * grafo que se va a cargar, así que no puede quedarse atrás.
 */
@Component({
  selector: 'app-data-blueprints',
  standalone: true,
  host: { class: 'bento-card block' },
  template: `
    <section id="patrones-de-datos" aria-labelledby="data-blueprints-title">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-3">Patrones de datos</p>
      <h3 id="data-blueprints-title" class="mt-1 text-xl font-semibold tracking-tight text-ink-1">CDC, streaming y analítica, listos para el lienzo</h3>
      <p class="mt-1 max-w-2xl text-sm text-ink-2">
        Tres patrones de referencia. Cada uno se traduce a {{ providerName() }} y a las otras dos nubes; son ilustrativos, no la
        infraestructura de ninguna entidad.
      </p>

      <ul class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (card of cards(); track card.blueprint.id) {
          <li class="flex min-w-0 flex-col rounded-panel border border-line-subtle bg-surface-2 p-4" [attr.data-blueprint]="card.blueprint.id">
            <svg class="w-full rounded-panel border border-line-subtle bg-surface-1" [attr.viewBox]="viewBox" role="img" [attr.aria-label]="'Diagrama en miniatura: ' + card.blueprint.summary">
              @for (zone of card.thumbnail.zones; track zone.id) {
                <rect [attr.x]="zone.x" [attr.y]="zone.y" [attr.width]="zone.w" [attr.height]="zone.h" rx="14" fill="none" stroke="var(--border-strong)" stroke-width="3" />
              }
              @for (wire of card.thumbnail.wires; track wire.from + '>' + wire.to) {
                <line [attr.x1]="wire.x1" [attr.y1]="wire.y1" [attr.x2]="wire.x2" [attr.y2]="wire.y2" [attr.stroke]="wire.kind ? 'var(--text-2)' : 'var(--border-control)'" stroke-width="4" [attr.stroke-dasharray]="wire.kind ? '14 10' : null" />
              }
              @for (node of card.thumbnail.nodes; track node.id) {
                <rect [attr.x]="node.x - halfWidth" [attr.y]="node.y - halfHeight" [attr.width]="halfWidth * 2" [attr.height]="halfHeight * 2" rx="12" [attr.fill]="node.data ? 'var(--text-1)' : 'var(--bg-surface-3)'" [attr.stroke]="node.data ? 'var(--text-1)' : 'var(--border-control)'" stroke-width="3" />
              }
            </svg>

            <div class="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h4 class="text-base font-semibold text-ink-1">{{ card.blueprint.name }}</h4>
              <span class="rounded-full border border-line-strong px-1.5 font-mono text-xs text-ink-2" title="Versión del blueprint">v{{ card.blueprint.version }}</span>
            </div>
            <p class="mt-0.5 font-mono text-xs text-ink-2">{{ card.blueprint.summary }}</p>
            <dl class="mt-3 flex-1 space-y-2 text-[13px] leading-snug">
              <div>
                <dt class="text-xs font-medium uppercase tracking-wider text-ink-3">Problema</dt>
                <dd class="text-ink-1">{{ card.blueprint.problem }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium uppercase tracking-wider text-ink-3">Trade-off</dt>
                <dd class="text-ink-1">{{ card.blueprint.tradeoff }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium uppercase tracking-wider text-ink-3">En {{ providerName() }}</dt>
                <dd class="text-ink-2">{{ card.services }}</dd>
              </div>
            </dl>

            @if (asking() === card.blueprint.id) {
              <div class="mt-3 rounded-panel border border-line-strong bg-surface-2 p-3" role="group" [attr.aria-label]="'Cómo cargar ' + card.blueprint.name">
                <p class="text-[13px] text-ink-1">El lienzo ya tiene contenido. ¿Qué hago con él?</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="focus-ring rounded-control bg-ink-1 px-3 py-1.5 text-xs font-medium text-canvas" (click)="choose(card.blueprint, 'replace')">Reemplazar</button>
                  <button type="button" class="focus-ring rounded-control border border-line-strong px-3 py-1.5 text-xs text-ink-1 hover:bg-surface-3" (click)="choose(card.blueprint, 'add')">Agregar al lienzo</button>
                  <button type="button" class="focus-ring rounded-control px-3 py-1.5 text-xs text-ink-2 hover:text-ink-1" (click)="asking.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <button type="button" class="focus-ring mt-3 self-start rounded-control border border-line-strong px-4 py-1.5 text-sm text-ink-1 transition hover:bg-surface-3" (click)="request(card.blueprint)">
                Cargar en el lienzo
              </button>
            }
          </li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataBlueprintsComponent {
  private readonly studio = inject(ArchitectureStudioService);

  /** Nube elegida en el lienzo: los nombres de la galería la siguen. */
  readonly provider = this.studio.activeProvider;
  readonly providerName = computed(() => CLOUD_PROVIDERS.find((candidate) => candidate.id === this.provider())!.name);

  readonly viewBox = `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`;
  readonly halfWidth = NODE_WIDTH / 2 - 8;
  readonly halfHeight = NODE_HEIGHT / 2 - 8;
  /** Blueprint que está esperando la respuesta de reemplazar o agregar. */
  readonly asking = signal<string | null>(null);

  readonly cards = computed<Card[]>(() => DATA_BLUEPRINTS.map((blueprint) => {
    const project = blueprint.build();
    const byId = new Map(project.nodes.map((node) => [node.id, node]));
    const data = project.nodes.filter((node) => endpointOf(node.type) !== 'service');
    return {
      blueprint,
      services: data.map((node) => forProvider(node.service, this.provider())).join(' → '),
      thumbnail: {
        zones: project.zones,
        nodes: project.nodes.map((node) => ({ ...node, data: endpointOf(node.type) !== 'service' })),
        wires: project.links.flatMap((link) => {
          const from = byId.get(link.from);
          const to = byId.get(link.to);
          return from && to ? [{ ...link, x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : [];
        }),
      },
    };
  }));

  request(blueprint: DataBlueprint): void {
    // Con algo en el lienzo se pregunta antes: reemplazar o agregar.
    if (this.studio.canvasHasContent()) {
      this.asking.set(blueprint.id);
    } else {
      this.studio.requestBlueprint({ blueprint, mode: 'replace' });
    }
  }

  choose(blueprint: DataBlueprint, mode: BlueprintLoad['mode']): void {
    this.asking.set(null);
    this.studio.requestBlueprint({ blueprint, mode });
  }
}
