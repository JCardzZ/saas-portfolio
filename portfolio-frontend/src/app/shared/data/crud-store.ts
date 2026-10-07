import { signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';

import { describeHttpError } from '../../core/errors/http-error';

export interface CrudApi<TItem, TRequest> {
  list(): Observable<TItem[]>;
  create(request: TRequest): Observable<unknown>;
  update(id: string, request: TRequest): Observable<unknown>;
  remove(id: string): Observable<unknown>;
}

/**
 * Estado de un listado con alta, edición y baja. Las páginas solo leen las
 * signals y llaman a los métodos; no conocen el cliente HTTP.
 */
export abstract class CrudStore<TItem, TRequest> {
  protected abstract readonly api: CrudApi<TItem, TRequest>;

  private readonly _items = signal<TItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();

  load(): void {
    this._loading.set(true);
    this._error.set(null);
    this.api
      .list()
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (items) => this._items.set(items),
        error: (error: unknown) => this._error.set(describeHttpError(error)),
      });
  }

  /** Crea si `id` es `null`, actualiza en caso contrario. Emite `true` si se guardó. */
  save(id: string | null, request: TRequest): Observable<boolean> {
    return this.mutate(id === null ? this.api.create(request) : this.api.update(id, request));
  }

  remove(id: string): Observable<boolean> {
    return this.mutate(this.api.remove(id));
  }

  private mutate(operation: Observable<unknown>): Observable<boolean> {
    this._saving.set(true);
    this._error.set(null);
    return operation.pipe(
      map(() => true),
      tap(() => this.load()),
      catchError((error: unknown) => {
        this._error.set(describeHttpError(error));
        return of(false);
      }),
      finalize(() => this._saving.set(false)),
    );
  }
}
