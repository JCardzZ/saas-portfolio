import { environment } from '../../../environments/environment';

/** Configuración que se puede cambiar sin recompilar: se sirve en `/config.json`. */
export interface RuntimeConfig {
  /** Raíz de la API, sin barra final (p. ej. `https://api.ejemplo.dev/v1`). */
  apiBaseUrl: string;
  /** Con `true` la aplicación no llama a la API y usa datos simulados (core/mock). */
  mockMode: boolean;
  /**
   * Por qué está activo el modo demo: `configured` si viene compilado así y `backend-unavailable`
   * si se activó al arrancar porque la API no respondía. `null` con el modo demo apagado.
   */
  demoReason: DemoReason | null;
}

export type DemoReason = 'configured' | 'backend-unavailable';

export const RUNTIME_CONFIG_URL = 'config.json';
const LOAD_TIMEOUT_MS = 2000;
/** Espera máxima a `/telemetry/health` al arrancar antes de pasar al modo demo. */
export const HEALTH_TIMEOUT_MS = 3000;

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

/**
 * Comprueba que la API responde y, si no, activa el modo demo para toda la aplicación: mejor
 * un sitio navegable con datos simulados (y la insignia que lo dice) que una página de errores.
 * Se llama antes de iniciar Angular, porque los componentes leen `mockMode` al crearse. No
 * hace nada si el modo demo ya estaba activo. Se decide una vez por carga de página.
 */
export async function fallBackToDemoIfBackendIsDown(
  fetcher: typeof fetch = fetch, timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<void> {
  if (state.mockMode || (await backendResponds(fetcher, timeoutMs))) {
    return;
  }
  state.mockMode = true;
  state.demoReason = 'backend-unavailable';
}

/**
 * `true` si `/telemetry/health` contesta 2xx a tiempo (`DEGRADED` también es 200: sin Redis o
 * sin IA la API sigue sirviendo). Un 503 (sin base de datos), un error de red o de CORS, o el
 * silencio cuentan como que no responde.
 */
export async function backendResponds(fetcher: typeof fetch = fetch, timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetcher(`${state.apiBaseUrl}/telemetry/health`, {
      cache: 'no-store', credentials: 'omit', signal: abort.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Vuelve a los valores compilados. Para los tests. */
export function resetRuntimeConfig(): void {
  Object.assign(state, defaults());
}

function defaults(): RuntimeConfig {
  return {
    apiBaseUrl: environment.apiBaseUrl,
    mockMode: environment.mockMode,
    demoReason: environment.mockMode ? 'configured' : null,
  };
}
