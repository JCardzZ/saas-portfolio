import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { FlagService } from '../../../core/flags/flag.service';

/** Cada sección del panel y los permisos con los que se puede entrar en ella. */
export const SECTIONS: readonly { path: string; label: string; permissions: string[] }[] = [
  { path: 'technologies', label: 'Tecnologías', permissions: ['cms:read'] },
  { path: 'projects', label: 'Proyectos', permissions: ['cms:read'] },
  { path: 'articles', label: 'Artículos', permissions: ['cms:read'] },
  { path: 'assistant', label: 'Asistente IA', permissions: ['ai:reindex', 'profile:write'] },
  { path: 'features', label: 'Flags', permissions: ['flags:read'] },
  { path: 'users', label: 'Usuarios', permissions: ['users:manage'] },
];

/**
 * Panel rediseñado (`admin.redesign`): cada sección con su icono (trazos de 24×24), el grupo en que
 * aparece en la barra lateral y una línea que dice para qué sirve.
 */
export const SECTION_META: Record<string, { icon: string; group: 'Contenido' | 'Plataforma'; hint: string }> = {
  technologies: { group: 'Contenido', hint: 'El stack que se muestra en la portada', icon: 'M8 6 2 12l6 6M16 6l6 6-6 6' },
  projects: { group: 'Contenido', hint: 'Casos y proyectos publicados', icon: 'M3 7h18v12H3zM8 7V5h8v2' },
  articles: { group: 'Contenido', hint: 'Artículos del blog', icon: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6' },
  assistant: { group: 'Plataforma', hint: 'Lo que sabe la IA del sitio', icon: 'M12 3v3M5 9h14v10H5zM9 14h.01M15 14h.01' },
  features: { group: 'Plataforma', hint: 'Encender y apagar funcionalidades sin desplegar', icon: 'M4 21V4M4 4h12l-2 4 2 4H4' },
  users: { group: 'Plataforma', hint: 'Personas, roles y permisos', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6' },
};

@Component({
    selector: 'app-admin-layout',
    imports: [RouterLink, RouterLinkActive, RouterOutlet],
    templateUrl: './admin-layout.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly flags = inject(FlagService);

  readonly who = this.auth.who;
  /** Secciones del panel que puede ver quien ha entrado. La API vuelve a comprobarlo en cada petición. */
  readonly sections = computed(() => SECTIONS.filter((section) => section.permissions.some((permission) => this.auth.can(permission))));

  /** Panel rediseñado: barra lateral con iconos, tema oscuro e interruptores (flag `admin.redesign`). */
  readonly redesign = computed(() => this.flags.isEnabled('admin.redesign'));
  readonly meta = SECTION_META;
  /** Secciones agrupadas como en la barra lateral: contenido del sitio y plataforma. */
  readonly groups = computed(() => (['Contenido', 'Plataforma'] as const)
    .map((name) => ({ name, sections: this.sections().filter((section) => SECTION_META[section.path]?.group === name) }))
    .filter((group) => group.sections.length > 0));
  /** En pantallas estrechas la barra lateral es un cajón. */
  readonly drawerOpen = signal(false);
  /** Rótulo del icono de la barra bajo el cursor o con el foco. */
  readonly tip = signal<{ label: string; x: number; y: number } | null>(null);

  showTip(event: Event, label: string): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tip.set({ label, x: box.right + 12, y: box.top + box.height / 2 });
  }

  private readonly url = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  /** Sección abierta, para el título de la cabecera. */
  readonly current = computed(() => {
    const path = this.url().split(/[?#]/)[0].split('/')[2] ?? '';
    return SECTIONS.find((section) => section.path === path) ?? null;
  });
  /** Iniciales de quien ha entrado, para su avatar. */
  readonly initials = computed(() => (this.who()?.name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join(''));

  logout(): void {
    this.tip.set(null);
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
