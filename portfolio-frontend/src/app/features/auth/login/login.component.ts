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

  readonly form = inject(NonNullableFormBuilder).group({
    clientId: ['', Validators.required],
    clientSecret: ['', Validators.required],
  });
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { clientId, clientSecret } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    this.auth
      .login(clientId, clientSecret)
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
