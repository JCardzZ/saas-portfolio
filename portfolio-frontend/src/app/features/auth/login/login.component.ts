import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/errors/http-error';
import { AlertComponent } from '../../../shared/ui/alert.component';

const DEFAULT_RETURN_URL = '/admin';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, AlertComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly forms = inject(NonNullableFormBuilder);
  /** Una persona entra con su correo; el cliente de máquina, con su id y su secreto. */
  readonly mode = signal<'user' | 'client'>('user');
  readonly userForm = this.forms.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly form = this.forms.group({
    clientId: ['', Validators.required],
    clientSecret: ['', Validators.required],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  choose(mode: 'user' | 'client'): void {
    this.mode.set(mode);
    this.error.set(null);
  }

  submit(): void {
    const form = this.mode() === 'user' ? this.userForm : this.form;
    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }
    const { email, password } = this.userForm.getRawValue();
    const { clientId, clientSecret } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    (this.mode() === 'user' ? this.auth.loginUser(email, password) : this.auth.login(clientId, clientSecret))
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.returnUrl()),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  // Solo rutas internas: evita que un enlace manipulado redirija fuera de la aplicación.
  private returnUrl(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested?.startsWith('/') && !requested.startsWith('//') ? requested : DEFAULT_RETURN_URL;
  }
}
