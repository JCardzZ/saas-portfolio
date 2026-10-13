import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { SECTIONS } from '../layout/admin-layout.component';

/** Inicio del panel: quién ha entrado, con qué rol, y las secciones que puede abrir. */
@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header>
        <h1 class="text-2xl font-semibold">Panel de administración</h1>
        @if (who(); as current) {
          <p class="mt-1 text-sm text-slate-600">Has entrado como <strong>{{ current.name }}</strong>, con el rol <strong>{{ current.role }}</strong>.</p>
        }
      </header>

      @if (sections().length) {
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
  `,
})
export class AdminHomeComponent {
  private readonly auth = inject(AuthService);

  readonly who = this.auth.who;
  readonly sections = computed(() => SECTIONS.filter((section) => section.permissions.some((permission) => this.auth.can(permission))));
  readonly permissions = computed(() => this.auth.profile()?.permissions ?? []);
}
