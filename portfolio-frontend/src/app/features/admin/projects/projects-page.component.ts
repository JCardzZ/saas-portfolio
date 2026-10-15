import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Project, ProjectRequest } from '../../../core/api';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ProjectsStore } from '../data/projects.store';
import { TechnologiesStore } from '../data/technologies.store';

@Component({
    selector: 'app-projects-page',
    imports: [ReactiveFormsModule, AlertComponent],
    providers: [ProjectsStore, TechnologiesStore],
    templateUrl: './projects-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectsPageComponent implements OnInit {
  readonly store = inject(ProjectsStore);
  readonly technologies = inject(TechnologiesStore);

  readonly form = inject(NonNullableFormBuilder).group({
    title: ['', Validators.required],
    summary: ['', Validators.required],
    githubRepoUrl: ['', Validators.required],
    demoVideoUrl: [''],
    metricsImpact: [''],
    technologiesUsed: [[] as string[]],
  });
  readonly editingId = signal<string | null>(null);

  private readonly technologyNames = computed(
    () => new Map(this.technologies.items().map((technology) => [technology.id, technology.name])),
  );

  ngOnInit(): void {
    this.store.load();
    this.technologies.load();
  }

  technologyName(id: string): string {
    return this.technologyNames().get(id) ?? id;
  }

  isTechnologySelected(id: string): boolean {
    return this.form.controls.technologiesUsed.value.includes(id);
  }

  toggleTechnology(id: string): void {
    const control = this.form.controls.technologiesUsed;
    control.setValue(
      control.value.includes(id) ? control.value.filter((selected) => selected !== id) : [...control.value, id],
    );
    control.markAsDirty();
  }

  edit(project: Project): void {
    this.editingId.set(project.id ?? null);
    this.form.reset({
      title: project.title ?? '',
      summary: project.summary ?? '',
      githubRepoUrl: project.githubRepoUrl ?? '',
      demoVideoUrl: project.demoVideoUrl ?? '',
      metricsImpact: project.metricsImpact ?? '',
      technologiesUsed: project.technologiesUsed ?? [],
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.store.save(this.editingId(), this.toRequest()).subscribe((saved) => {
      if (saved) {
        this.cancelEdit();
      }
    });
  }

  remove(project: Project): void {
    if (!project.id || !confirm(`¿Eliminar el proyecto "${project.title}"?`)) {
      return;
    }
    const id = project.id;
    this.store.remove(id).subscribe((removed) => {
      if (removed && this.editingId() === id) {
        this.cancelEdit();
      }
    });
  }

  // Los opcionales vacíos se omiten para que la API guarde null en lugar de cadenas vacías.
  private toRequest(): ProjectRequest {
    const value = this.form.getRawValue();
    return {
      title: value.title,
      summary: value.summary,
      githubRepoUrl: value.githubRepoUrl,
      demoVideoUrl: value.demoVideoUrl.trim() || undefined,
      metricsImpact: value.metricsImpact.trim() || undefined,
      technologiesUsed: value.technologiesUsed,
    };
  }
}
