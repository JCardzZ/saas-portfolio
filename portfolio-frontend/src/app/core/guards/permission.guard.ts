import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';

/**
 * Deja entrar a una página del panel solo a quien tiene alguno de esos permisos; al resto lo
 * lleva al inicio del panel. Es una cortesía: la API vuelve a comprobarlo en cada petición.
 */
export function permissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    return permissions.some((permission) => auth.can(permission)) ? true : inject(Router).createUrlTree(['/admin']);
  };
}
