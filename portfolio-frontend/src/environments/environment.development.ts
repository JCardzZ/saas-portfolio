export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080/v1',
  // TEMPORAL: con true la aplicación no llama a la API y usa datos simulados (core/mock).
  // Ponlo en false para trabajar contra el backend local.
  mockMode: true,
};
