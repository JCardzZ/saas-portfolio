import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';

import { ArchitectureProject, ArchitectureProjectSummary, ArchitectureStudioService as ArchitectureStudioApi } from '../../../core/api';
import { CatalogCategory, SERVICE_CATALOG } from './cloud-catalog.data';
import { CatalogRow, CostOverrides, mergeCatalog } from './cloud-costs.data';
import {
  PROJECT_FORMAT, PROJECT_VERSION, STUDIO_PRESETS, SERVER_PRESET_IDS, StudioProject, parseProject,
} from './studio-project';

/** Algo que se puede abrir en el lienzo: un punto de partida local, una plantilla o un proyecto guardado. */
export interface StudioEntry {
  id: string;
  name: string;
  summary: string;
  /** `local`: lo construye el navegador. `preset` y `saved`: los sirve el backend. */
  kind: 'local' | 'preset' | 'saved';
  build?: () => StudioProject;
}

export interface TerraformFiles {
  mainTf: string;
  variablesTf: string;
}

const LOCAL_ENTRIES: StudioEntry[] = STUDIO_PRESETS.map((preset) => ({
  id: preset.id, name: preset.name, summary: preset.summary, kind: 'local', build: preset.build,
}));

/**
 * Proyectos del Estudio de arquitectura. El backend es la fuente de las plantillas y de los
 * proyectos guardados; si no responde, el estudio sigue con las plantillas que lleva dentro.
 * La arquitectura de referencia y el lienzo en blanco son siempre locales.
 */
@Injectable({ providedIn: 'root' })
export class ArchitectureStudioService {
  private readonly api = inject(ArchitectureStudioApi);

  private readonly _entries = signal<StudioEntry[]>(LOCAL_ENTRIES);
  readonly entries = this._entries.asReadonly();
  /** De dónde salen las plantillas que se están ofreciendo. */
  readonly source = signal<'local' | 'server'>('local');

  /** Catálogo de servicios: el del estudio, con los nombres y marcas que sirva el backend. */
  readonly catalog = signal<CatalogCategory[]>(SERVICE_CATALOG);
  /** Costes servidos por el backend, que mandan sobre los que lleva el estudio. */
  readonly costs = signal<CostOverrides>({});
  readonly catalogSource = signal<'local' | 'server'>('local');

  /** Pide al backend sus plantillas, sus proyectos guardados y su catálogo de servicios. */
  load(): void {
    this.loadProjects();
    this.api.publicArchitectureCatalogGet().subscribe({
      next: (rows) => {
        if (rows.length === 0) {
          return;
        }
        const merged = mergeCatalog(SERVICE_CATALOG, rows as CatalogRow[]);
        this.catalog.set(merged.catalog);
        this.costs.set(merged.costs);
        this.catalogSource.set('server');
      },
      error: () => this.catalogSource.set('local'),
    });
  }

  private loadProjects(): void {
    this.api.publicArchitectureProjectsGet().subscribe({
      next: (projects) => {
        const remote = projects.map((project): StudioEntry => ({
          id: project.id, name: project.title, summary: project.description ?? '', kind: project.isPreset ? 'preset' : 'saved',
        }));
        const local = LOCAL_ENTRIES.filter((entry) => !SERVER_PRESET_IDS.includes(entry.id));
        this._entries.set([
          ...local.filter((entry) => entry.id !== 'blank'),
          ...remote.filter((entry) => entry.kind === 'preset'),
          ...remote.filter((entry) => entry.kind === 'saved'),
          ...local.filter((entry) => entry.id === 'blank'),
        ]);
        this.source.set('server');
      },
      error: () => this.source.set('local'),
    });
  }

  /** El grafo de una entrada: construido aquí si es local, pedido al backend si no. */
  open(entry: StudioEntry): Observable<StudioProject> {
    if (entry.build) {
      return of(entry.build());
    }
    return this.api.publicArchitectureProjectsIdGet(entry.id).pipe(map(toStudioProject));
  }

  /** Guarda el lienzo como proyecto nuevo o, con `id`, actualiza uno guardado. Requiere sesión de administrador. */
  save(project: StudioProject, title: string, id?: string): Observable<ArchitectureProjectSummary> {
    const request = {
      title, cloudProvider: project.provider,
      nodes: project.nodes as unknown as { [key: string]: unknown }[],
      connections: project.links as unknown as { [key: string]: unknown }[],
      zones: project.zones as unknown as { [key: string]: unknown }[],
    };
    const call = id ? this.api.adminArchitectureProjectsIdPut(id, request) : this.api.adminArchitectureProjectsPost(request);
    return call.pipe(tap(() => this.loadProjects()));
  }

  /** `main.tf` y `variables.tf` compilados por el backend. */
  terraform(project: StudioProject): Observable<TerraformFiles> {
    return this.api.publicArchitectureGenerateTerraformPost({
      cloudProvider: project.provider,
      nodes: project.nodes as unknown as { [key: string]: unknown }[],
      connections: project.links as unknown as { [key: string]: unknown }[],
    });
  }
}

/** Lo que llega del backend pasa por la misma validación que un archivo importado. */
function toStudioProject(project: ArchitectureProject): StudioProject {
  const parsed = parseProject(JSON.stringify({
    format: PROJECT_FORMAT, version: PROJECT_VERSION, provider: project.cloudProvider,
    nodes: project.nodes, links: project.connections, zones: project.zones,
  }));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}
