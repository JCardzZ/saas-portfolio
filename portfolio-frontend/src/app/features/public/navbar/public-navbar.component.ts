import {
  ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, HostListener, afterNextRender, inject, output, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { LanguageSwitchComponent } from '../../../core/i18n/language-switch.component';
import { LanguageService } from '../../../core/i18n/language.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { CvDownloadComponent } from '../../../shared/ui/cv-download.component';
import { PAGE_SECTIONS } from './page-sections';

export { PAGE_SECTIONS } from './page-sections';

/**
 * Barra fija: transparente sobre el hero y de vidrio en cuanto se hace scroll. Enlaza a todas las
 * secciones y marca la que se está leyendo. Si no caben en una fila (por debajo de 1024 px), los
 * enlaces pasan al menú «Secciones».
 */
@Component({
  selector: 'app-public-navbar',
  standalone: true,
  imports: [RouterLink, CvDownloadComponent, LanguageSwitchComponent],
  template: `
    <header
      class="safe-top safe-x fixed inset-x-0 top-0 z-nav border-b transition-colors duration-slow ease-standard"
      style="right: var(--dock-right, 0px)"
      [class]="scrolled() || menuOpen() ? 'border-line-subtle bg-canvas/70 backdrop-blur-xl' : 'border-transparent bg-transparent'"
    >
      <nav class="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-1 max-[399px]:px-4" aria-label="Principal">
        <a routerLink="/" class="ui-focus tap rounded-mark text-title-3 text-ink-1">Manuel Cardoza</a>

        <ul class="hidden items-center gap-1 lg:flex">
          @for (section of sections; track section.id) {
            <li>
              <a
                routerLink="/"
                [fragment]="section.id"
                class="nav-link ui-focus"
                [class.nav-link-active]="active() === section.id"
                [attr.aria-current]="active() === section.id ? 'true' : null"
              >{{ labelOf(section) }}</a>
            </li>
          }
        </ul>

        <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div class="relative lg:hidden">
            <button
              type="button"
              class="ui-btn-ghost max-sm:ui-btn-icon"
              aria-haspopup="true"
              aria-controls="menu-secciones"
              [attr.aria-expanded]="menuOpen()"
              [attr.aria-label]="sectionsWord() + (activeLabel() ? ': ' + activeLabel() : '')"
              (click)="menuOpen.set(!menuOpen())"
            >
              <svg viewBox="0 0 16 16" class="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>
              <span class="hidden sm:inline">{{ activeLabel() || sectionsWord() }}</span>
              <svg viewBox="0 0 12 12" class="hidden h-3 w-3 sm:block" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
            </button>
            @if (menuOpen()) {
              <ul id="menu-secciones" class="absolute right-0 top-[calc(100%+0.5rem)] z-10 w-56 animate-fade-in rounded-panel border border-line-strong bg-surface-2 p-1 shadow-floating">
                @for (section of sections; track section.id) {
                  <li>
                    <a
                      routerLink="/"
                      [fragment]="section.id"
                      class="ui-focus tap flex items-center justify-between rounded-control px-3 py-2 text-body-sm transition-colors duration-fast hover:bg-surface-3 hover:text-ink-1"
                      [class]="active() === section.id ? 'text-ink-1' : 'text-ink-2'"
                      [attr.aria-current]="active() === section.id ? 'true' : null"
                      (click)="menuOpen.set(false)"
                    >
                      {{ labelOf(section) }}
                      @if (active() === section.id) {
                        <span class="h-1.5 w-1.5 rounded-full bg-accent-text" aria-hidden="true"></span>
                      }
                    </a>
                  </li>
                }
                <li class="mt-1 flex items-center justify-between border-t border-line-subtle px-3 pb-1 pt-2 text-body-sm text-ink-2 sm:hidden">
                  {{ en() ? 'Language' : 'Idioma' }}
                  <app-language-switch />
                </li>
              </ul>
            }
          </div>

          <!-- Tema: sistema → claro → oscuro. El icono dice el que hay elegido. -->
          <button
            type="button"
            class="ui-btn-ghost ui-btn-icon"
            data-testid="theme-toggle"
            [attr.aria-label]="themeWord() + themeLabel()"
            [attr.title]="themeWord() + themeLabel()"
            (click)="theme.next()"
          >
            <!-- Un SVG por icono: dentro de un bloque de control, un <path> suelto pierde el espacio de nombres SVG. -->
            @switch (theme.choice()) {
              @case ('light') { <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1 1M16.7 16.7l1 1M6.3 17.7l1-1M16.7 7.3l1-1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" /></svg> }
              @case ('dark') { <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" /></svg> }
              @default { <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H4zM9 20h6M12 16v4" /></svg> }
            }
          </button>
          <!-- En móvil el interruptor va dentro del menú: en la barra no cabe en una fila. -->
          <app-language-switch class="hidden sm:block" />
          <!-- Con los enlaces en la barra (lg) no cabe: el CV sigue en el hero y en el pie. -->
          <app-cv-download class="hidden md:inline-block lg:hidden" variant="nav" />
          <!-- La acción primaria de la barra. -->
          <button type="button" class="ui-btn-primary" [attr.aria-label]="en() ? 'Ask the AI' : 'Preguntar a la IA'" (click)="openChat.emit()">
            <span>{{ en() ? 'Ask' : 'Preguntar' }}<span class="hidden sm:inline">{{ en() ? ' the AI' : ' a la IA' }}</span></span>
            <!-- El atajo es de teclado: en táctil o sin sitio no se muestra. -->
            <kbd class="hidden rounded-mark border border-accent-on/40 px-1 font-mono text-mono-sm text-accent-on [@media(hover:hover)]:sm:inline">{{ shortcut }}</kbd>
          </button>
        </div>
      </nav>
    </header>
  `,
  styles: `
    .nav-link {
      position: relative;
      display: inline-flex;
      align-items: center;
      height: 2rem;
      padding: 0 0.75rem;
      border-radius: var(--radius-control);
      font-size: 0.875rem;
      color: var(--text-2);
      transition: color var(--duration-fast) var(--ease-standard);
    }
    .nav-link:hover, .nav-link-active { color: var(--text-1); }
    /* La sección que se está leyendo: una línea de 2 px en el acento, además del texto más claro. */
    .nav-link-active::after {
      content: '';
      position: absolute;
      inset: auto 0.75rem -0.25rem;
      height: 2px;
      border-radius: 1px;
      background: var(--accent-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicNavbarComponent {
  readonly openChat = output<void>();
  readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  readonly en = computed(() => this.language.lang() === 'en');
  readonly sectionsWord = computed(() => (this.en() ? 'Sections' : 'Secciones'));
  readonly themeWord = computed(() => (this.en() ? 'Theme: ' : 'Tema: '));
  readonly themeLabel = computed(() =>
    this.en()
      ? ({ system: 'system', light: 'light', dark: 'dark' })[this.theme.choice()] + '. Change'
      : ({ system: 'el del sistema', light: 'claro', dark: 'oscuro' })[this.theme.choice()] + '. Cambiar',
  );

  labelOf(section: { label: string; labelEn: string }): string {
    return this.en() ? section.labelEn : section.label;
  }
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);
  /** Ancla de la sección que cruza el centro de la ventana, o `null` sobre el hero. */
  readonly active = signal<string | null>(null);
  readonly sections = PAGE_SECTIONS;
  readonly shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }
      // Una franja fina en el centro de la ventana: la sección que la toca es la activa.
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.active.set(entry.target.id);
            } else if (this.active() === entry.target.id) {
              this.active.set(null);
            }
          }
        },
        { rootMargin: '-45% 0px -54% 0px' },
      );
      for (const section of PAGE_SECTIONS) {
        const element = document.getElementById(section.id);
        if (element) {
          observer.observe(element);
        }
      }
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  activeLabel(): string | null {
    const section = PAGE_SECTIONS.find((item) => item.id === this.active());
    return section ? this.labelOf(section) : null;
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.menuOpen() && !this.host.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }
}
