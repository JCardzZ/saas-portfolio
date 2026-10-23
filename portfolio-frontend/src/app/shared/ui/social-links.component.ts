import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { siGithub } from 'simple-icons';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Perfiles del autor. Cambiar aquí si cambia alguna URL. */
export const PROFILE_LINKS = {
  github: 'https://github.com/JCardzZ',
  linkedin: 'https://www.linkedin.com/in/manuel-de-jes%C3%BAs-c-96854b222/',
} as const;

/**
 * Logo [in] de LinkedIn: su guía (brand.linkedin.com/in-logo) permite enlazarlo al perfil, en azul,
 * negro o blanco y sin modificar, pero solo con el archivo oficial de su página de descargas (que
 * exige aceptar sus condiciones). Hasta que ese archivo esté en `public/brand/linkedin-in.svg` y
 * `LINKEDIN_LOGO_AVAILABLE` pase a `true`, se muestra un símbolo propio con el nombre en texto
 * (docs/brand-usage.md). No se intenta cargar sin más: un 404 en cada visita ensuciaría la consola.
 */
const LINKEDIN_LOGO = '/brand/linkedin-in.svg';
const LINKEDIN_LOGO_AVAILABLE = false;

/**
 * GitHub y LinkedIn como botones de icono con su nombre accesible. El logo de GitHub va en blanco
 * sobre fondo oscuro, como pide su guía; los dos abren en otra pestaña.
 */
@Component({
  selector: 'app-social-links',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'flex items-center gap-1' },
  template: `
    <a class="ui-btn-ghost ui-btn-icon tap" [href]="links.github" target="_blank" rel="noopener me" [attr.aria-label]="'GitHub de Manuel Cardoza' | t" title="GitHub" data-testid="social-github">
      <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true"><path [attr.d]="githubPath" fill="var(--text-1)" /></svg>
    </a>
    <a class="ui-btn-ghost tap" [class.ui-btn-icon]="officialLinkedin()" [class.gap-2]="!officialLinkedin()" [href]="links.linkedin" target="_blank" rel="noopener me" [attr.aria-label]="'LinkedIn de Manuel Cardoza' | t" title="LinkedIn" data-testid="social-linkedin">
      @if (officialLinkedin()) {
        <img [src]="linkedinLogo" alt="" class="h-5 w-5" (error)="officialLinkedin.set(false)" />
      } @else {
        <!-- Símbolo propio (persona) + nombre: no es el logo de LinkedIn. -->
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>
        <span class="text-body-sm">LinkedIn</span>
      }
    </a>
  `,
})
export class SocialLinksComponent {
  readonly links = PROFILE_LINKS;
  readonly githubPath = siGithub.path;
  readonly linkedinLogo = LINKEDIN_LOGO;
  /** Logo oficial si está disponible; si falla al cargar, queda el símbolo propio. */
  readonly officialLinkedin = signal(LINKEDIN_LOGO_AVAILABLE);
}
