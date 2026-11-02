import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { FlagService } from '../../../core/flags/flag.service';
import { SECTIONS, SECTION_META } from '../layout/admin-layout.component';

/** Inicio del panel: quién ha entrado, con qué rol, y las secciones que puede abrir. */
@Component({
    selector: 'app-admin-home',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section class="space-y-6">
      @if (redesign()) {
        <!-- Banner de bienvenida: degradado vivo, saludo y el rol de quien ha entrado. -->
        <div class="admin-banner" data-testid="admin-banner">
          <span class="admin-banner-orb admin-banner-orb-a" aria-hidden="true"></span>
          <span class="admin-banner-orb admin-banner-orb-b" aria-hidden="true"></span>
          <p class="admin-banner-kicker">Portfolio CMS</p>
          <p class="admin-banner-title">Hola{{ who() ? ', ' + firstName() : '' }}</p>
          <p class="admin-banner-sub">{{ sections().length }} secciones a tu alcance · rol {{ who()?.role }}</p>
        </div>
      }
      <header>
        <h1 class="text-2xl font-semibold">Panel de administración</h1>
        @if (who(); as current) {
          <p class="mt-1 text-sm text-slate-600">Has entrado como <strong>{{ current.name }}</strong>, con el rol <strong>{{ current.role }}</strong>.</p>
        }
      </header>

      @if (redesign() && sections().length) {
        <!-- Panel rediseñado: cada sección con su icono, su color y para qué sirve. -->
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (section of sections(); track section.path; let i = $index) {
            <li class="admin-rise" [style.--i]="i">
              <a class="admin-tile" [routerLink]="section.path" [style.--sec]="meta[section.path]?.color">
                <span class="admin-tile-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="meta[section.path]?.icon" /></svg>
                </span>
                <span class="min-w-0">
                  <span class="block font-semibold text-[var(--a-text-1)]">{{ section.label }}</span>
                  <span class="mt-0.5 block text-sm text-[var(--a-text-3)]">{{ meta[section.path]?.hint }}</span>
                </span>
                <span class="admin-tile-go" aria-hidden="true">→</span>
              </a>
            </li>
          }
        </ul>
      } @else if (sections().length) {
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (section of sections(); track section.path) {
            <li><a class="card block font-medium text-indigo-700 hover:bg-slate-50" [routerLink]="section.path">{{ section.label }}</a></li>
          }
        </ul>
      } @else {
        <p class="card text-sm text-slate-600">Tu rol no da acceso a ninguna sección del panel.</p>
      }

      @if (permissions().length) {
        <div class="card">
          <h2 class="text-sm font-semibold">Tus permisos</h2>
          <ul class="mt-2 flex flex-wrap gap-2" data-testid="own-permissions">
            @for (permission of permissions(); track permission) {
              <li class="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700">{{ permission }}</li>
            }
          </ul>
        </div>
      }
    </section>
  `
})
export class AdminHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly flags = inject(FlagService);

  readonly who = this.auth.who;
  readonly sections = computed(() => SECTIONS.filter((section) => section.permissions.some((permission) => this.auth.can(permission))));
  readonly permissions = computed(() => this.auth.profile()?.permissions ?? []);
  readonly redesign = computed(() => this.flags.isEnabled('admin.redesign'));
  readonly meta = SECTION_META;
  readonly firstName = computed(() => (this.who()?.name ?? '').split(/\s+/)[0]);
}
