import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideApi } from './core/api';
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
        ...(environment.mockMode ? [lazyMockApiInterceptor] : []),
      ]),
    ),
    provideApi(environment.apiBaseUrl),
  ],
};
