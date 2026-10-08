import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of, switchMap, timeout } from 'rxjs';

import { PipelineStatus, WORKFLOWS, parsePipelineStatus } from './delivery-data';

/** Copia incluida en el sitio: la escribe el despliegue con lo último publicado. */
export const STATUS_SNAPSHOT_URL = 'pipeline-status.json';
/** Repositorio del que se publica el estado, en la rama `badges`. */
export const STATUS_REPOSITORY = 'JCardzZ/saas-portfolio';
export const STATUS_REMOTE_URL = `https://raw.githubusercontent.com/${STATUS_REPOSITORY}/badges/pipeline-status.json`;
const REMOTE_TIMEOUT_MS = 3000;

export type StatusSource = 'remote' | 'snapshot';

/**
 * Estado real de las últimas ejecuciones de CI y CD. Se lee un archivo estático publicado por los
 * propios workflows: el navegador nunca llama a la API de GitHub ni maneja tokens. Primero la copia
 * más reciente (solo accesible con el repositorio público) y, si no, la incluida en el despliegue.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryStatusService {
  private readonly http = inject(HttpClient);

  private readonly _status = signal<PipelineStatus | null>(null);
  private readonly _source = signal<StatusSource | null>(null);
  private readonly _loaded = signal(false);
  private requested = false;

  readonly status = this._status.asReadonly();
  readonly source = this._source.asReadonly();
  /** `true` cuando ya se sabe si hay datos o no. */
  readonly loaded = this._loaded.asReadonly();
  readonly workflows = WORKFLOWS;

  load(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    const read = (url: string, source: StatusSource) =>
      this.http.get<unknown>(url).pipe(map((body) => ({ status: parsePipelineStatus(body), source })));

    read(STATUS_REMOTE_URL, 'remote').pipe(
      timeout(REMOTE_TIMEOUT_MS),
      catchError(() => of({ status: null, source: 'remote' as StatusSource })),
      switchMap((result) => (result.status ? of(result) : read(STATUS_SNAPSHOT_URL, 'snapshot'))),
      catchError(() => of({ status: null, source: 'snapshot' as StatusSource })),
    ).subscribe(({ status, source }) => {
      this._status.set(status);
      this._source.set(status ? source : null);
      this._loaded.set(true);
    });
  }
}
