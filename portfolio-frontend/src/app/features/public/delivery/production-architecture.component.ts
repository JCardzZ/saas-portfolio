import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { PipelineStatus, TOPOLOGY, TopologyNode, formatDate, formatDuration } from './delivery-data';
import { DeliveryStatusService } from './delivery-status.service';
import { StageEdge, StageGraphComponent, StageNode, revealDetail } from './stage-graph.component';

interface Fact {
  label: string;
  value: string;
}

/**
 * Lo que hay desplegado hoy, no una arquitectura de referencia. Las piezas y su estado salen de
 * deploy/topology.json: `live` es lo que está en producción y `planned` lo decidido que aún no
 * se ha desplegado (borde punteado). Los datos de cada pieza son los de la última ejecución real.
 */
@Component({
    selector: 'app-production-architecture',
    imports: [TranslatePipe, StageGraphComponent, TheaterToggleComponent],
    hostDirectives: [TheaterDirective],
    host: { class: 'bento-card block' },
    template: `
    <app-theater-toggle name="Arquitectura en producción" />
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-10">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Arquitectura en producción' | t }}</h3>
      <p class="text-xs text-ink-3">{{ 'La de hoy, generada de' | t }} <code class="break-all font-mono">deploy/topology.json</code></p>
    </div>

    <app-stage-graph
      class="theater-stage mt-6"
      [nodes]="nodes"
      [edges]="edges"
      [activeId]="activeId()"
      label="Piezas de la arquitectura en producción"
      [stageNames]="stageNames"
      [animated]="true"
      (picked)="pick($event)"
    />

    <ul class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2" [attr.aria-label]="'Leyenda' | t">
      <li class="inline-flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-status-ok" aria-hidden="true"></span>{{ 'En producción' | t }}</li>
      <li class="inline-flex items-center gap-2"><span class="w-4 border-t border-dashed border-line-control" aria-hidden="true"></span>{{ 'Planificado' | t }}</li>
    </ul>

    <div #detail class="mt-4 min-h-[7rem] scroll-mb-24 scroll-mt-24 rounded-panel border border-line-subtle bg-surface-2 p-4" aria-live="polite">
      @if (active(); as node) {
        <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-1">
          {{ node.label }}
          <span class="rounded-full border px-2 py-0.5 text-xs font-medium"
            [class]="node.status === 'live' ? 'border-status-ok/40 text-status-ok' : 'border-dashed border-line-control text-ink-2'">
            {{ node.status === 'live' ? ('en producción' | t) : 'planificado' }}
          </span>
        </p>
        <p class="mt-1 text-sm text-ink-2">{{ node.what }}</p>
        <p class="mt-1 text-sm text-ink-2"><span class="text-ink-2">{{ 'Por qué:' | t }}</span> {{ node.why }}</p>
        @if (facts().length > 0) {
          <dl class="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            @for (fact of facts(); track fact.label) {
              <div class="flex justify-between gap-3"><dt class="text-ink-3">{{ fact.label }}</dt><dd class="break-all text-right font-mono text-ink-1">{{ fact.value }}</dd></div>
            }
          </dl>
        } @else if (node.status === 'planned') {
          <p class="mt-3 text-xs text-ink-3">{{ 'Sin datos de despliegue: todavía no existe en producción.' | t }}</p>
        }
      } @else {
        <p class="text-sm text-ink-2">{{ 'Toca una pieza para ver qué es, por qué se eligió y sus datos reales.' | t }}</p>
      }
    </div>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductionArchitectureComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);

  private readonly detail = viewChild<ElementRef<HTMLElement>>('detail');

  readonly activeId = signal<string | null>(null);
  readonly stageNames = TOPOLOGY.stages;

  readonly nodes: StageNode[] = TOPOLOGY.nodes.map((node) => ({
    id: node.id,
    stage: node.stage,
    label: node.label,
    detail: node.role,
    icon: node.icon,
    tone: node.status === 'live' ? 'ok' : 'planned',
    toneLabel: node.status === 'live' ? 'en producción' : 'planificado',
  }));

  /** Una conexión es real solo si lo son sus dos extremos. */
  readonly edges: StageEdge[] = TOPOLOGY.links.map((link) => ({
    from: link.from,
    to: link.to,
    planned: [link.from, link.to].some((id) => TOPOLOGY.nodes.find((node) => node.id === id)?.status === 'planned'),
  }));

  readonly active = computed(() => TOPOLOGY.nodes.find((node) => node.id === this.activeId()) ?? null);
  readonly facts = computed(() => {
    const node = this.active();
    const status = this.delivery.status();
    return node && status && node.status === 'live' ? factsOf(node, status) : [];
  });

  ngOnInit(): void {
    this.delivery.load();
  }

  pick(id: string): void {
    this.activeId.set(id);
    revealDetail(this.detail());
  }
}

/** Datos reales de una pieza, tomados de la última ejecución publicada. Lo que no se sabe no se muestra. */
export function factsOf(node: TopologyNode, status: PipelineStatus): Fact[] {
  const { ci, cd } = status.workflows;
  const job = (workflow: typeof ci, id: string) => workflow?.jobs.find((item) => item.id === id);
  const facts: (Fact | null)[] = [];
  const add = (label: string, value: unknown) => facts.push(value === undefined || value === null || value === '' ? null : { label, value: String(value) });

  switch (node.facts) {
    case 'repo':
      add('Repositorio', status.repository);
      add('Último commit verificado', ci?.sha.slice(0, 7));
      break;
    case 'ci':
      add('Última CI en main', ci ? `#${ci.runNumber} · ${ci.conclusion === 'success' ? 'correcta' : 'fallida'}` : null);
      add('Fecha', formatDate(ci?.finishedAt));
      add('Duración', formatDuration(ci?.durationSeconds));
      add('Último despliegue', formatDate(cd?.finishedAt));
      break;
    case 'image': {
      const published = job(ci, 'publish-image');
      add('Imagen publicada', published?.status === 'success' ? `sha-${ci!.sha.slice(0, 7)}` : null);
      add('Digest', published?.metrics['digest']);
      add('Paquetes en el SBOM', published?.metrics['sbomPackages']);
      break;
    }
    case 'frontend': {
      const deployed = job(cd, 'frontend-deploy');
      if (deployed?.status === 'success') {
        add('Commit desplegado', (deployed.metrics['deployedSha'] ?? cd!.sha).toString().slice(0, 7));
        add('Fecha del despliegue', formatDate(cd!.finishedAt));
      }
      break;
    }
    case 'backend': {
      const deployed = job(cd, 'deploy');
      if (deployed?.status === 'success') {
        add('Imagen desplegada', deployed.metrics['digest']);
        add('Fecha del despliegue', formatDate(cd!.finishedAt));
      }
      break;
    }
  }
  return facts.filter((fact): fact is Fact => fact !== null);
}
