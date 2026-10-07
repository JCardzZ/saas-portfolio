import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

const PROTECTED_PATHS = ['/admin/', '/auth/validate'];

/** Solo las rutas protegidas de nuestra API reciben el token; nunca otros orígenes. */
export function requiresToken(url: string): boolean {
  return PROTECTED_PATHS.some((path) => url.startsWith(environment.apiBaseUrl + path));
}

export const jwtInterceptor: HttpInterceptorFn = (request, next) => {
  if (!requiresToken(request.url)) {
    return next(request);
  }
  const token = inject(AuthService).token();
  return next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);
};
