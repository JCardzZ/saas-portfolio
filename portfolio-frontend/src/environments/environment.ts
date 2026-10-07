/**
 * Entorno base: lo usan los tests y cualquier configuración sin sustitución propia.
 * `ng serve` usa environment.development.ts y `npm run build`, environment.prod.ts.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'https://api.example.com/v1',
  // Con true la aplicación no llama a la API y usa datos simulados (core/mock).
  mockMode: true,
};
