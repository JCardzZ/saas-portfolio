import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';

import { runtimeConfig } from '../config/runtime-config';

/**
 * Último interceptor de la cadena. Con el modo demo apagado deja pasar la petición; con él
 * activo (compilado así, o porque la API no respondía al arrancar) carga el interceptor de datos
 * simulados y responde él, sin que nada salga a la red.
 *
 * La carga es siempre con `import()`: así los datos simulados (y el código del estudio que usan
 * para imitar al backend) no viajan en el bundle inicial y solo se descargan si hacen falta.
 */
export const lazyMockApiInterceptor: HttpInterceptorFn = (request, next) =>
  runtimeConfig.mockMode
    ? from(import('./mock-api.interceptor')).pipe(switchMap((module) => module.mockApiInterceptor(request, next)))
    : next(request);
