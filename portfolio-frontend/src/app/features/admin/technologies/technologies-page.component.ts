import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Technology } from '../../../core/api';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { TechnologiesStore } from '../data/technologies.store';

@Component({
    selector: 'app-technologies-page',
    imports: [ReactiveFormsModule, AlertComponent],
    providers: [TechnologiesStore],
    templateUrl: './technologies-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TechnologiesPageComponent implements OnInit {
  readonly store = inject(TechnologiesStore);

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    category: ['', Validators.required],
    proficiencyLevel: ['', Validators.required],
    iconUrl: ['', Validators.required],
    isFeatured: [false],
  });
  readonly editingId = signal<string | null>(null);

  ngOnInit(): void {
    this.store.load();
  }

  edit(technology: Technology): void {
    this.editingId.set(technology.id ?? null);
    this.form.reset({
      name: technology.name ?? '',
      category: technology.category ?? '',
      proficiencyLevel: technology.proficiencyLevel ?? '',
      iconUrl: technology.iconUrl ?? '',
      isFeatured: technology.isFeatured ?? false,
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
    this.store.save(this.editingId(), this.form.getRawValue()).subscribe((saved) => {
      if (saved) {
        this.cancelEdit();
      }
    });
  }

  remove(technology: Technology): void {
    if (!technology.id || !confirm(`¿Eliminar la tecnología "${technology.name}"?`)) {
      return;
    }
    const id = technology.id;
    this.store.remove(id).subscribe((removed) => {
      if (removed && this.editingId() === id) {
        this.cancelEdit();
      }
    });
  }
}
