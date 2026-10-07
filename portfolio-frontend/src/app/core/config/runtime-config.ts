import { environment } from '../../../environments/environment';

/** Configuración que se puede cambiar sin recompilar: se sirve en `/config.json`. */
export interface RuntimeConfig {
  /** Raíz de la API, sin barra final (p. ej. `https://api.ejemplo.dev/v1`). */
  apiBaseUrl: string;
  /** Con `true` la aplicación no llama a la API y usa datos simulados (core/mock). */
  mockMode: boolean;
}

export const RUNTIME_CONFIG_URL = 'config.json';
const LOAD_TIMEOUT_MS = 2000;

const state: RuntimeConfig = defaults();

/**
 * Configuración vigente. Arranca con los valores compilados (`environment`) y `main.ts` la
 * completa con `/config.json` antes de iniciar Angular. Se lee al usarla, nunca en una constante
 * de módulo: los módulos se evalúan antes de que llegue el archivo.
 */
export const runtimeConfig: Readonly<RuntimeConfig> = state;

/**
 * Lee `/config.json` y aplica lo que trae. Nunca falla: si el archivo no existe, tarda demasiado
 * o no es válido, se conservan los valores compilados y la aplicación arranca igual.
 */
export async function loadRuntimeConfig(
  fetcher: typeof fetch = fetch, timeoutMs = LOAD_TIMEOUT_MS,
): Promise<void> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    // Sin caché: es justo el archivo que cambia entre despliegues sin cambiar de nombre.
    const response = await fetcher(RUNTIME_CONFIG_URL, { cache: 'no-store', signal: abort.signal });
    if (response.ok) {
      Object.assign(state, parseRuntimeConfig(await response.json()));
    }
  } catch {
    // Sin archivo, sin red o con otro contenido (un hosting de SPA devuelve index.html): valen los compilados.
  } finally {
    clearTimeout(timer);
  }
}

/** El archivo llega de la red: solo se aceptan los campos conocidos y con forma válida. */
export function parseRuntimeConfig(value: unknown): Partial<RuntimeConfig> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const apiBaseUrl = normalizeApiBaseUrl((value as Record<string, unknown>)['apiBaseUrl']);
  return apiBaseUrl === null ? {} : { apiBaseUrl };
}

/** Admite una URL http(s) absoluta o una ruta desde la raíz (`/v1`); devuelve `null` si no lo es. */
export function normalizeApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const url = value.trim().replace(/\/+$/, '');
  if (/^\/(?!\/)[\w\-./~%]*$/.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const plain = !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    return plain && (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? url : null;
  } catch {
    return null;
  }
}

/** Vuelve a los valores compilados. Para los tests. */
export function resetRuntimeConfig(): void {
  Object.assign(state, defaults());
}

function defaults(): RuntimeConfig {
  return { apiBaseUrl: environment.apiBaseUrl, mockMode: environment.mockMode };
}
