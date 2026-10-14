import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { IconPopLayerComponent } from '../../../shared/ui/icon-pop-layer.component';
import { SectionHeaderComponent } from '../../../shared/ui/section-header.component';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TechIconKey, techIconFor, techKeyFor } from '../../../shared/ui/tech-icons';
import { ArticlesHubComponent } from '../articles/articles-hub.component';
import { CareerTimelineComponent } from '../career/career-timeline.component';
import { RagChatComponent } from '../chat/rag-chat.component';
import { CloudInfraComponent } from '../cloud/cloud-infra.component';
import { DataBlueprintsComponent } from '../cloud/data-blueprints.component';
import { DeployTimelineComponent } from '../delivery/deploy-timeline.component';
import { PipelineViewComponent } from '../delivery/pipeline-view.component';
import { ProductionArchitectureComponent } from '../delivery/production-architecture.component';
import { CatalogStore } from '../data/catalog.store';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { PublicNavbarComponent } from '../navbar/public-navbar.component';
import { ArchitectureCanvasComponent } from '../widgets/architecture-canvas.component';
import { EventConsoleComponent } from '../widgets/event-console.component';
import { IngestionSandboxComponent } from '../widgets/ingestion-sandbox.component';
import { MultiTenantShieldComponent } from '../widgets/multi-tenant-shield.component';
import { ResiliencePipelineComponent } from '../widgets/resilience-pipeline.component';
import { TraceInspectorComponent } from '../widgets/trace-inspector.component';
import { CvDownloadComponent, CvPickerComponent } from '../../../shared/ui/cv-download.component';
import { TelemetryMonitorComponent } from '../widgets/telemetry-monitor.component';
import { VectorMatrixComponent } from '../widgets/vector-matrix.component';
import { FlagService } from '../../../core/flags/flag.service';
import { McpSectionComponent } from '../mcp/mcp-section.component';
import { HERO_ROLE_PLACEHOLDER } from './hero-content';
import { LanguageService } from '../../../core/i18n/language.service';
import { LANDING_COPY } from './landing-copy';
import { HeroSceneComponent } from './hero3d/hero-scene.component';
import { GalaxyBackdropComponent } from './galaxy/galaxy-backdrop.component';
import { ScrollBuddyComponent } from './scroll-buddy.component';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    RouterLink,
    SectionHeaderComponent,
    HeroSceneComponent,
    GalaxyBackdropComponent,
    ScrollBuddyComponent,
    PublicNavbarComponent,
    CvDownloadComponent,
    CvPickerComponent,
    RagChatComponent,
    CareerTimelineComponent,
    ArticlesHubComponent,
    CloudInfraComponent,
    DataBlueprintsComponent,
    DeployTimelineComponent,
    PipelineViewComponent,
    ProductionArchitectureComponent,
    TechIconComponent,
    IconPopLayerComponent,
    ArchitectureCanvasComponent,
    EventConsoleComponent,
    IngestionSandboxComponent,
    MultiTenantShieldComponent,
    ResiliencePipelineComponent,
    TraceInspectorComponent,
    TelemetryMonitorComponent,
    VectorMatrixComponent,
    McpSectionComponent,
  ],
  providers: [CatalogStore],
  templateUrl: './landing-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent implements OnInit {
  readonly catalog = inject(CatalogStore);
  private readonly flags = inject(FlagService);
  /** La sección del servidor MCP solo existe con su flag encendida. */
  readonly mcpSection = computed(() => this.flags.isEnabled('mcp.section'));

  // Un enlace a /#chat abre el asistente directamente.
  readonly chatOpen = signal(inject(ActivatedRoute).snapshot.fragment === 'chat');
  readonly skeletons = [0, 1, 2];
  readonly iconFor = techIconFor;
  readonly inspector = inject(TraceInspectorService);
  /** Marcador temporal: ver hero-content.ts. */
  readonly i18n = inject(LanguageService);
  /** El mazo de tecnologías del hero está abierto: el texto del hero se atenúa. */
  readonly immersive = signal(false);
  /** Desplazamiento con inercia (solo ratón/trackpad y sin «reducir movimiento»). */
  private readonly smoothScroll = (() => {
    const destroyRef = inject(DestroyRef);
    // Se carga aparte: no pesa en el arranque.
    afterNextRender(() => void import('./smooth-scroll').then(({ startSmoothScroll }) => destroyRef.onDestroy(startSmoothScroll())));
    return true;
  })();
  private readonly chat = viewChild(RagChatComponent);

  /** Pregunta hecha al robot del hero: se abre el asistente y se le envía. */
  askAi(question: string): void {
    this.chatOpen.set(true);
    setTimeout(() => this.chat()?.ask(question));
  }
  readonly copy = LANDING_COPY;
  readonly heroRole = computed(() => this.i18n.t(HERO_ROLE_PLACEHOLDER));
  /** Letras del nombre y del rol (los espacios, sin romper la línea). */
  readonly nameLetters = computed(() => [...this.i18n.t(this.copy.heroTitle)].map((c) => (c === ' ' ? '\u00a0' : c)));
  readonly roleLetters = computed(() => [...this.heroRole()].map((c) => (c === ' ' ? '\u00a0' : c)));

  /** Clase de la tarjeta «¿Cómo está construido?», que cierra la rejilla de proyectos. */
  readonly askSpan = computed(() => ASK_SPAN[askCardColumns(this.catalog.projects().length)]);

  /** Tecnología cuya traza se puede inspeccionar desde su logo del catálogo, o `null`. */
  inspectable(name: string | undefined): TechIconKey | null {
    return TraceInspectorService.inspectable(techKeyFor(name) ?? undefined);
  }

  ngOnInit(): void {
    this.catalog.load();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.chatOpen.update((open) => !open);
    }
  }

  hideBrokenIcon(event: Event): void {
    (event.target as HTMLImageElement).hidden = true;
  }
}

const ASK_SPAN = { 2: 'md:col-span-2', 4: 'md:col-span-4', 6: 'md:col-span-6' } as const;

/**
 * Columnas (de 6) de la tarjeta que cierra la rejilla de proyectos: las que queden libres en su
 * fila, para que ninguna tarjeta se quede sola con un hueco al lado. El primer proyecto ocupa 4 y
 * los demás 2.
 */
export function askCardColumns(projects: number): 2 | 4 | 6 {
  if (projects === 0) {
    return 6;
  }
  if (projects === 1) {
    return 2;
  }
  // Tarjetas pequeñas que ya ocupan la fila de la última: en la primera fila solo cabe una.
  return ([6, 4, 2] as const)[(projects - 2) % 3];
}
