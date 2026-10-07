/**
 * Producción: es el que usa `npm run build` (angular.json lo sustituye por environment.ts).
 * La URL de la API queda fijada en el bundle al compilar.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://api.portfolio.dev/v1',
  // En producción siempre se habla con el backend real: datos, login y telemetría SSE.
  mockMode: false,
};
