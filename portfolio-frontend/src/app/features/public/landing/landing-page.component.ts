import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { IconPopLayerComponent } from '../../../shared/ui/icon-pop-layer.component';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TechIconKey, techIconFor, techKeyFor } from '../../../shared/ui/tech-icons';
import { ArticlesHubComponent } from '../articles/articles-hub.component';
import { CareerTimelineComponent } from '../career/career-timeline.component';
import { RagChatComponent } from '../chat/rag-chat.component';
import { CloudInfraComponent } from '../cloud/cloud-infra.component';
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

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    PublicNavbarComponent,
    CvDownloadComponent,
    CvPickerComponent,
    RagChatComponent,
    CareerTimelineComponent,
    ArticlesHubComponent,
    CloudInfraComponent,
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
  ],
  providers: [CatalogStore],
  templateUrl: './landing-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent implements OnInit {
  readonly catalog = inject(CatalogStore);

  // Un enlace a /#chat abre el asistente directamente.
  readonly chatOpen = signal(inject(ActivatedRoute).snapshot.fragment === 'chat');
  readonly skeletons = [0, 1, 2];
  readonly iconFor = techIconFor;
  readonly inspector = inject(TraceInspectorService);

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
