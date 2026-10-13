import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

/** Cada sección del panel y los permisos con los que se puede entrar en ella. */
export const SECTIONS: readonly { path: string; label: string; permissions: string[] }[] = [
  { path: 'technologies', label: 'Tecnologías', permissions: ['cms:read'] },
  { path: 'projects', label: 'Proyectos', permissions: ['cms:read'] },
  { path: 'articles', label: 'Artículos', permissions: ['cms:read'] },
  { path: 'assistant', label: 'Asistente IA', permissions: ['ai:reindex', 'profile:write'] },
  { path: 'features', label: 'Flags', permissions: ['flags:read'] },
  { path: 'users', label: 'Usuarios', permissions: ['users:manage'] },
];

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly who = this.auth.who;
  /** Secciones del panel que puede ver quien ha entrado. La API vuelve a comprobarlo en cada petición. */
  readonly sections = computed(() => SECTIONS.filter((section) => section.permissions.some((permission) => this.auth.can(permission))));

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
