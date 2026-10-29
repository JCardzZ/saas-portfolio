import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { runtimeConfig } from '../config/runtime-config';

/** Lo escribe el CD en cada despliegue del frontend (tools/write-version.mjs), junto a config.json. */
export const RELEASE_INFO_URL = 'version.json';
export const MAX_RELEASE_NOTES = 8;

export type ReleaseNoteType = 'feat' | 'fix' | 'perf';

export interface ReleaseNote {
  type: ReleaseNoteType;
  scope: string | null;
  text: string;
}

/** La versión que sirve este sitio: una etiqueta vX.Y.Z por despliegue, calculada con Conventional Commits. */
export interface ReleaseInfo {
  version: string;
  /** La etiqueta anterior, para comparar; `null` en la primera. */
  previous: string | null;
  sha: string;
  deployedAt: Date;
  /** `owner/repo` en GitHub, para enlazar la release, el commit y la comparación. */
  repository: string;
  notes: ReleaseNote[];
}

/** Qué versión contesta la API (`GET /telemetry/health` → `version`), que se despliega aparte. */
export type ApiVersion =
  | { state: 'loading' }
  | { state: 'known'; version: string }
  | { state: 'unknown' }
  | { state: 'unreachable' };

const VERSION = /^v\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const NOTE_TYPES: readonly string[] = ['feat', 'fix', 'perf'];
const MAX_NOTE_LENGTH = 160;
const MAX_SCOPE_LENGTH = 32;

/** El archivo llega de la red: se acepta solo con la forma exacta que escribe el CD. */
export function parseReleaseInfo(value: unknown): ReleaseInfo | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const deployedAt = typeof raw['deployedAt'] === 'string' ? new Date(raw['deployedAt']) : null;
  if (raw['schema'] !== 1 || !matches(raw['version'], VERSION) || !matches(raw['sha'], SHA)
    || !matches(raw['repository'], REPOSITORY) || !deployedAt || Number.isNaN(deployedAt.getTime())) {
    return null;
  }
  const previous = matches(raw['previous'], VERSION) ? raw['previous'] : null;
  const notes = (Array.isArray(raw['notes']) ? raw['notes'] : []).map(parseNote).filter((note) => note !== null);
  return {
    version: raw['version'], previous, sha: raw['sha'], deployedAt, repository: raw['repository'],
    notes: notes.slice(0, MAX_RELEASE_NOTES),
  };
}

function parseNote(value: unknown): ReleaseNote | null {
  const { type, scope, text } = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (typeof type !== 'string' || !NOTE_TYPES.includes(type) || typeof text !== 'string' || !text.trim()) {
    return null;
  }
  const cleanScope = typeof scope === 'string' && scope.trim() ? scope.trim().slice(0, MAX_SCOPE_LENGTH) : null;
  return { type: type as ReleaseNoteType, scope: cleanScope, text: text.trim().slice(0, MAX_NOTE_LENGTH) };
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

/** Enlaces a GitHub de una release: sus notas, el commit desplegado y lo que cambió desde la anterior. */
export function releaseLinks(release: ReleaseInfo): { notes: string; commit: string; compare: string | null } {
  const base = `https://github.com/${release.repository}`;
  return {
    notes: `${base}/releases/tag/${release.version}`,
    commit: `${base}/commit/${release.sha}`,
    compare: release.previous ? `${base}/compare/${release.previous}...${release.version}` : null,
  };
}

/**
 * La versión desplegada del sitio y, bajo demanda, la de la API. `version.json` es un archivo
 * estático del propio despliegue: no se llama a GitHub. Sin él (un build local), en desarrollo se
 * informa de que es un build local y en producción no se muestra nada.
 */
@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private readonly http = inject(HttpClient);
  private requested = false;
  private apiRequested = false;

  private readonly _release = signal<ReleaseInfo | null>(null);
  private readonly _local = signal(false);
  private readonly _api = signal<ApiVersion>({ state: 'loading' });

  readonly release = this._release.asReadonly();
  /** `true` en un build sin desplegar (desarrollo): no hay versión que mostrar. */
  readonly local = this._local.asReadonly();
  readonly api = this._api.asReadonly();

  load(): void {
    if (this.requested) {
      return;
    }
    this.requested = true;
    this.http.get<unknown>(RELEASE_INFO_URL, { headers: { 'Cache-Control': 'no-cache' } }).pipe(
      map(parseReleaseInfo),
      catchError(() => of(null)),
    ).subscribe((release) => {
      this._release.set(release);
      this._local.set(!release && !environment.production);
    });
  }

  /** Solo al abrir las novedades: cargar la página no le cuesta una petición más a la API. */
  loadApiVersion(): void {
    if (this.apiRequested) {
      return;
    }
    this.apiRequested = true;
    this.http.get<unknown>(`${runtimeConfig.apiBaseUrl}/telemetry/health`).pipe(
      map((body): ApiVersion => {
        const version = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
        return matches(version['version'], VERSION) ? { state: 'known', version: version['version'] } : { state: 'unknown' };
      }),
      catchError(() => of<ApiVersion>({ state: 'unreachable' })),
    ).subscribe((api) => this._api.set(api));
  }
}
