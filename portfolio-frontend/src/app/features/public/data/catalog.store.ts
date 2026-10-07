import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';

import { Project, PublicCatalogShowcasesService, Technology } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';

export interface TechnologyGroup {
  category: string;
  technologies: Technology[];
}

/** Proyectos y tecnologías del catálogo público. */
@Injectable()
export class CatalogStore {
  private readonly api = inject(PublicCatalogShowcasesService);

  private readonly _projects = signal<Project[]>([]);
  private readonly _technologies = signal<Technology[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly projects = this._projects.asReadonly();
  readonly technologies = this._technologies.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Tecnologías agrupadas por categoría, con las destacadas primero dentro de cada grupo. */
  readonly technologyGroups = computed<TechnologyGroup[]>(() => {
    const groups = new Map<string, Technology[]>();
    for (const technology of this._technologies()) {
      const category = technology.category ?? 'Otras';
      groups.set(category, [...(groups.get(category) ?? []), technology]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, technologies]) => ({
        category,
        technologies: [...technologies].sort((a, b) => Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false)),
      }));
  });

  private readonly technologyNames = computed(
    () => new Map(this._technologies().map((technology) => [technology.id, technology.name])),
  );

  technologyName(id: string): string {
    return this.technologyNames().get(id) ?? id;
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);
    forkJoin({
      technologies: this.api.publicTechnologiesGet(),
      projects: this.api.publicProjectsGet(),
    })
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: ({ technologies, projects }) => {
          this._technologies.set(technologies);
          this._projects.set(projects);
        },
        error: (error: unknown) => this._error.set(describeHttpError(error)),
      });
  }
}
