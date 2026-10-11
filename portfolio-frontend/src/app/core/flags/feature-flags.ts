import {
  ErrorCode, OpenFeature, OpenFeatureEventEmitter, Provider, ProviderEvents, ResolutionDetails, StandardResolutionReasons,
} from '@openfeature/web-sdk';

import { runtimeConfig } from '../config/runtime-config';

/** Las flags que conoce el frontend. Son las mismas que declara el backend (`FeatureFlagDomain`). */
export const FEATURE_FLAGS = [
  'studio.smart-rules', 'cloud.oracle', 'studio.system-design', 'studio.system-templates', 'mcp.section',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];
export type FlagValues = Record<FeatureFlagKey, boolean>;

/** Valores del build: todo lo nuevo, apagado. Valen mientras el backend no diga otra cosa. */
export const BUILD_DEFAULTS: Readonly<FlagValues> = Object.freeze(
  Object.fromEntries(FEATURE_FLAGS.map((key) => [key, false])) as FlagValues,
);

/**
 * En modo demo no hay backend que guarde las flags: lo que se enciende en la administración
 * simulada se queda en este navegador, en esta clave. Fuera del modo demo no se lee nunca.
 */
export const DEMO_FLAGS_STORAGE_KEY = 'demo-feature-flags';
const LOAD_TIMEOUT_MS = 2000;

export function isFeatureFlagKey(key: unknown): key is FeatureFlagKey {
  return typeof key === 'string' && (FEATURE_FLAGS as readonly string[]).includes(key);
}

/** Lo que responde `GET /public/features` llega de la red: solo claves conocidas con un booleano. */
export function parseFlags(value: unknown): Partial<FlagValues> {
  const flags: Partial<FlagValues> = {};
  if (!Array.isArray(value)) {
    return flags;
  }
  for (const entry of value) {
    const { key, enabled } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if (isFeatureFlagKey(key) && typeof enabled === 'boolean') {
      flags[key] = enabled;
    }
  }
  return flags;
}

export function demoOverrides(): Partial<FlagValues> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DEMO_FLAGS_STORAGE_KEY) ?? '{}');
    return parseFlags(Object.entries(stored as Record<string, unknown>).map(([key, enabled]) => ({ key, enabled })));
  } catch {
    // Sin almacenamiento (ventana privada) o con otro contenido: valen los del build.
    return {};
  }
}

export function saveDemoOverride(key: FeatureFlagKey, enabled: boolean): void {
  try {
    localStorage.setItem(DEMO_FLAGS_STORAGE_KEY, JSON.stringify({ ...demoOverrides(), [key]: enabled }));
  } catch {
    // Sin almacenamiento el cambio dura lo que la página.
  }
}

/**
 * Proveedor de OpenFeature del frontend. Lee todas las flags una vez, al iniciarse, y después
 * responde sin esperar (el modelo del SDK web). Si la lectura falla, se queda con los valores
 * del build: una flag que no se puede leer está apagada.
 */
export class PlatformFlagsProvider implements Provider {
  readonly metadata = { name: 'portfolio-platform' } as const;
  readonly runsOn = 'client' as const;
  readonly events = new OpenFeatureEventEmitter();
  private values: FlagValues = { ...BUILD_DEFAULTS };

  constructor(private readonly load: () => Promise<Partial<FlagValues>>) {}

  async initialize(): Promise<void> {
    try {
      this.values = { ...BUILD_DEFAULTS, ...(await this.load()) };
    } catch {
      this.values = { ...BUILD_DEFAULTS };
    }
  }

  /** Aplica un cambio hecho en esta sesión (la administración) sin volver a pedir la lista. */
  set(key: FeatureFlagKey, enabled: boolean): void {
    this.values = { ...this.values, [key]: enabled };
    this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [key] });
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    return isFeatureFlagKey(flagKey)
      ? { value: this.values[flagKey], reason: StandardResolutionReasons.STATIC }
      : { value: defaultValue, reason: StandardResolutionReasons.ERROR, errorCode: ErrorCode.FLAG_NOT_FOUND };
  }

  resolveStringEvaluation(_flagKey: string, defaultValue: string): ResolutionDetails<string> {
    return notBoolean(defaultValue);
  }

  resolveNumberEvaluation(_flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return notBoolean(defaultValue);
  }

  resolveObjectEvaluation<T>(_flagKey: string, defaultValue: T): ResolutionDetails<T> {
    return notBoolean(defaultValue);
  }
}

function notBoolean<T>(value: T): ResolutionDetails<T> {
  return { value, reason: StandardResolutionReasons.ERROR, errorCode: ErrorCode.TYPE_MISMATCH };
}

let active: PlatformFlagsProvider | null = null;

/** Proveedor registrado por `loadFeatureFlags`, o `null` si aún no se ha llamado (los tests). */
export function activeFlagsProvider(): PlatformFlagsProvider | null {
  return active;
}

/**
 * Registra el proveedor y espera a que lea las flags. `main.ts` lo llama antes de iniciar
 * Angular, porque los componentes deciden qué pintar al crearse. Nunca falla ni retrasa el
 * arranque más de `timeoutMs`.
 */
export async function loadFeatureFlags(fetcher: typeof fetch = fetch, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  active = new PlatformFlagsProvider(() => readFlags(fetcher, timeoutMs));
  await OpenFeature.setProviderAndWait(active);
}

async function readFlags(fetcher: typeof fetch, timeoutMs: number): Promise<Partial<FlagValues>> {
  if (runtimeConfig.mockMode) {
    return demoOverrides();
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetcher(`${runtimeConfig.apiBaseUrl}/public/features`, {
      cache: 'no-store', credentials: 'omit', signal: abort.signal,
    });
    return response.ok ? parseFlags(await response.json()) : {};
  } finally {
    clearTimeout(timer);
  }
}
