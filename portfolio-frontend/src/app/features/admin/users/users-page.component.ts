import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';

import { AdminUsersService, RoleDefinition, UserAccount, UserRole, UserUpdateRequest } from '../../../core/api';
import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/errors/http-error';
import { AlertComponent } from '../../../shared/ui/alert.component';

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 72;

/**
 * Usuarios del panel: quién puede entrar y con qué rol. No hay registro público; las cuentas se
 * crean aquí. Las contraseñas solo viajan al crearlas o cambiarlas: la API nunca las devuelve.
 */
@Component({
    selector: 'app-users-page',
    imports: [DatePipe, ReactiveFormsModule, AlertComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './users-page.component.html'
})
export class UsersPageComponent implements OnInit {
  private readonly api = inject(AdminUsersService);
  private readonly auth = inject(AuthService);

  readonly users = signal<UserAccount[]>([]);
  readonly roles = signal<RoleDefinition[]>([]);
  readonly loading = signal(false);
  readonly creating = signal(false);
  /** Id de la cuenta que se está guardando, para bloquear solo su fila. */
  readonly saving = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /** Cuenta a la que se le está escribiendo una contraseña nueva. */
  readonly resetting = signal<string | null>(null);

  readonly roleNames: UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD), Validators.maxLength(MAX_PASSWORD)]],
    role: ['VIEWER' as UserRole, Validators.required],
  });
  readonly newPassword = inject(NonNullableFormBuilder).control('', [Validators.required, Validators.minLength(MIN_PASSWORD), Validators.maxLength(MAX_PASSWORD)]);

  ngOnInit(): void {
    this.load();
  }

  /** La propia cuenta no se puede desactivar ni cambiar de rol desde aquí: la API tampoco lo permite. */
  isSelf(user: UserAccount): boolean {
    return this.auth.profile()?.subject === user.id;
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ users: this.api.listUsers(), roles: this.api.listRoles() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ users, roles }) => {
          this.users.set(users);
          this.roles.set(roles);
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.createUser(this.form.getRawValue())
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (user) => {
          this.users.update((users) => [...users, user]);
          this.notice.set(`Cuenta creada para ${user.email}.`);
          this.form.reset({ email: '', displayName: '', password: '', role: 'VIEWER' });
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  setRole(user: UserAccount, role: string): void {
    this.update(user, { role: role as UserRole }, `${user.email} pasa a ${role}.`);
  }

  setActive(user: UserAccount, active: boolean): void {
    this.update(user, { active }, active ? `${user.email} puede volver a entrar.` : `${user.email} ya no puede entrar y sus sesiones se han cerrado.`);
  }

  savePassword(user: UserAccount): void {
    if (this.newPassword.invalid) {
      this.newPassword.markAsTouched();
      return;
    }
    this.update(user, { password: this.newPassword.value }, `Contraseña de ${user.email} cambiada; sus sesiones se han cerrado.`, () => {
      this.resetting.set(null);
      this.newPassword.reset('');
    });
  }

  startReset(user: UserAccount): void {
    this.newPassword.reset('');
    this.resetting.set(user.id);
  }

  private update(user: UserAccount, change: UserUpdateRequest, done: string, after: () => void = () => undefined): void {
    this.saving.set(user.id);
    this.error.set(null);
    this.notice.set(null);
    this.api.updateUser(user.id, change)
      .pipe(finalize(() => this.saving.set(null)))
      .subscribe({
        next: (updated) => {
          this.users.update((users) => users.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
          this.notice.set(done);
          after();
        },
        // La fila vuelve a pintarse con lo que había: el selector no se queda en un valor que no se guardó.
        error: (error: unknown) => {
          this.error.set(describeHttpError(error));
          this.users.update((users) => [...users]);
        },
      });
  }
}
