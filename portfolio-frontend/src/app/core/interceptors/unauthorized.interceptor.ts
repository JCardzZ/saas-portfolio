import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { requiresToken } from './jwt.interceptor';

/** La petición ya se repitió tras renovar la sesión: si vuelve a fallar, no se insiste. */
const RETRIED = new HttpContextToken<boolean>(() => false);

/**
 * Un 401 en una ruta protegida significa que el token de acceso ha caducado o ya no vale. Si la
 * sesión se puede renovar, se renueva una vez y se repite la petición; si no, se cierra la sesión
 * y se vuelve al inicio de sesión.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const giveUp = (error: unknown) => {
    auth.logout();
    void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
    return throwError(() => error);
  };

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !requiresToken(request.url)) {
        return throwError(() => error);
      }
      if (request.context.get(RETRIED) || !auth.canRefresh()) {
        return giveUp(error);
      }
      return auth.refresh().pipe(
        switchMap((renewed) => {
          const token = renewed ? auth.token() : null;
          return token
            ? next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` }, context: request.context.set(RETRIED, true) }))
                .pipe(catchError((again: unknown) => (again instanceof HttpErrorResponse && again.status === 401 ? giveUp(again) : throwError(() => again))))
            : giveUp(error);
        }),
      );
    }),
  );
};
