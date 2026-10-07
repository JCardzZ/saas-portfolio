import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { BASE_PATH } from './core/api';
import { runtimeConfig } from './core/config/runtime-config';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { unauthorizedInterceptor } from './core/interceptors/unauthorized.interceptor';
import { lazyMockApiInterceptor } from './core/mock/mock-api.loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    provideHttpClient(
      withInterceptors([
        jwtInterceptor,
        unauthorizedInterceptor,
        // El último de la cadena: en modo demo responde él y ninguna petición sale a la red.
        // Va siempre registrado porque el modo demo puede activarse al arrancar (API caída).
        lazyMockApiInterceptor,
      ]),
    ),
    // Con fábrica y no con valor: la dirección llega de /config.json después de evaluarse este módulo.
    { provide: BASE_PATH, useFactory: () => runtimeConfig.apiBaseUrl },
  ],
};
