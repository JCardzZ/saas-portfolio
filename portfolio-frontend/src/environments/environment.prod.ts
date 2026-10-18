/**
 * Producción: es el que usa `npm run build` (angular.json lo sustituye por environment.ts).
 * `apiBaseUrl` es el valor por defecto: al arrancar se sustituye por el de `/config.json` si existe
 * (core/config/runtime-config.ts), así que cambiar de entorno no obliga a recompilar.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://portfolio-api-751865012819.us-east4.run.app/v1',
  // En producción siempre se habla con el backend real: datos, login y telemetría SSE.
  mockMode: false,
};
