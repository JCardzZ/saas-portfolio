import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { ProfileService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';

/** Mismos límites que valida el backend; aquí solo evitan una subida que se va a rechazar. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png'];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Foto de perfil del CV: verla, cambiarla y quitarla. */
@Component({
  selector: 'app-profile-photo-card',
  standalone: true,
  template: `
    <div class="card space-y-4">
      <div>
        <h2 class="text-base font-semibold">Foto de perfil del CV</h2>
        <p class="mt-1 max-w-prose text-sm text-slate-600">
          Aparece en el marco de la barra lateral de los cuatro CV maquetados. Sin foto, el marco muestra tus iniciales.
          Quien descarga el CV puede pedirlo sin foto; la versión ATS nunca la lleva.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[1.6rem] border border-slate-300 bg-slate-100 text-xs text-slate-500">
          @if (previewUrl(); as url) {
            <img class="h-full w-full object-cover" [src]="url" alt="Foto de perfil actual" (error)="onPreviewError()" />
          } @else {
            Sin foto
          }
        </div>

        <div class="space-y-2">
          <label class="btn-primary inline-block cursor-pointer" [class.opacity-60]="busy()">
            {{ busy() ? 'Guardando…' : hasPhoto() ? 'Cambiar foto' : 'Subir foto' }}
            <input type="file" class="sr-only" [accept]="accept" [disabled]="busy()" (change)="onFileChosen($event)" />
          </label>
          @if (hasPhoto()) {
            <button type="button" class="ml-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" [disabled]="busy()" (click)="remove()">
              Quitar foto
            </button>
          }
          <p class="text-xs text-slate-500">JPEG o PNG, hasta 2 MB. Mejor cuadrada: se recorta al centro.</p>
        </div>
      </div>

      @if (error(); as message) {
        <p class="text-sm text-red-700" role="alert">{{ message }}</p>
      }
      @if (notice(); as message) {
        <p class="text-sm text-slate-600" role="status">{{ message }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePhotoCardComponent {
  private readonly api = inject(ProfileService);

  readonly accept = PHOTO_TYPES.join(',');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /** En modo demo no hay backend que guarde la foto: se parte de "sin foto". */
  readonly hasPhoto = signal(!runtimeConfig.mockMode);
  /** Cambia tras cada subida para que el navegador vuelva a pedir la imagen. */
  private readonly version = signal(0);
  /** Vista previa local de lo recién subido, para el modo demo. */
  private readonly localPreview = signal<string | null>(null);

  readonly previewUrl = computed(() => {
    if (!this.hasPhoto()) {
      return null;
    }
    return this.localPreview() ?? `${runtimeConfig.apiBaseUrl}/public/profile/photo?v=${this.version()}`;
  });

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.upload(file);
    }
  }

  upload(file: File): void {
    this.error.set(null);
    this.notice.set(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      this.error.set('La foto debe ser una imagen JPEG o PNG.');
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      this.error.set('La foto supera el máximo de 2 MB.');
      return;
    }

    this.busy.set(true);
    this.api.adminProfilePhotoPut(file).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.localPreview.set(runtimeConfig.mockMode ? URL.createObjectURL(file) : null);
        this.version.update((version) => version + 1);
        this.hasPhoto.set(true);
        this.notice.set(runtimeConfig.mockMode
          ? 'Modo demo: la foto no se guarda. Con el backend, el CV la usa desde la siguiente descarga.'
          : 'Foto guardada. El CV la usa desde la siguiente descarga; las miniaturas del selector se actualizan con ./gradlew exportCv.');
      },
      error: (error: unknown) => this.error.set(describeHttpError(error)),
    });
  }

  remove(): void {
    this.error.set(null);
    this.notice.set(null);
    this.busy.set(true);
    this.api.adminProfilePhotoDelete().pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.localPreview.set(null);
        this.hasPhoto.set(false);
        this.notice.set('Foto eliminada. El CV vuelve a mostrar las iniciales.');
      },
      error: (error: unknown) => this.error.set(describeHttpError(error)),
    });
  }

  /** El backend responde 404 cuando no hay foto. */
  onPreviewError(): void {
    this.hasPhoto.set(false);
  }
}
