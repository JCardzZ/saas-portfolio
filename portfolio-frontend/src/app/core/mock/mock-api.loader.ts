import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';

/**
 * Carga el interceptor del modo demo solo cuando hace falta. Así sus datos simulados (y el
 * código del estudio que usa para simular el backend) no viajan en el bundle inicial de
 * producción, donde el modo demo está apagado.
 */
export const lazyMockApiInterceptor: HttpInterceptorFn = (request, next) =>
  from(import('./mock-api.interceptor')).pipe(switchMap((module) => module.mockApiInterceptor(request, next)));
