import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { FlagService } from '../../../core/flags/flag.service';

export { SECTIONS, SECTION_META } from './admin-sections';
import { SECTIONS, SECTION_META } from './admin-sections';
import { CREATE_KINDS, CreateKind, QuickCreateService } from './quick-create';
import { QuickCreateDrawerComponent } from './quick-create-drawer.component';

@Component({
    selector: 'app-admin-layout',
    imports: [RouterLink, RouterLinkActive, RouterOutlet, QuickCreateDrawerComponent],
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
  /** Paleta de creación: lo que este rol puede crear, y el recurso que crea cada sección. */
  readonly create = inject(QuickCreateService);
  readonly creatable = computed(() => CREATE_KINDS.filter((info) => this.auth.can(info.permission)));
  kindOf(path: string): CreateKind | null {
    return this.creatable().find((info) => info.path === path)?.kind ?? null;
  }
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
