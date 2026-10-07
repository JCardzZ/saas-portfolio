import { ChangeDetectionStrategy, Component, HostListener, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CvDownloadComponent } from '../../../shared/ui/cv-download.component';

/** Barra fija: transparente sobre el hero y de vidrio en cuanto se hace scroll. */
@Component({
  selector: 'app-public-navbar',
  standalone: true,
  imports: [RouterLink, CvDownloadComponent],
  template: `
    <header
      class="fixed inset-x-0 top-0 z-40 border-b transition duration-500 ease-spring"
      style="right: var(--dock-right, 0px)"
      [class]="scrolled() ? 'border-white/10 bg-black/70 backdrop-blur-xl' : 'border-transparent bg-transparent'"
    >
      <nav class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5" aria-label="Principal">
        <a routerLink="/" class="focus-ring rounded-md text-[15px] font-semibold tracking-tight text-white">
          SaaS Portfolio
        </a>

        <div class="flex items-center gap-1 sm:gap-2">
          <a routerLink="/" fragment="plataforma" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white sm:block">Arquitectura</a>
          <a routerLink="/" fragment="proyectos" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white sm:block">Proyectos</a>
          <a routerLink="/" fragment="tecnologias" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white sm:block">Tecnologías</a>
          <a routerLink="/" fragment="articulos" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white lg:block">Artículos</a>
          <a routerLink="/" fragment="trayectoria" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white md:block">Trayectoria</a>
          <app-cv-download class="hidden md:inline-block" variant="nav" />
          <a routerLink="/admin" class="focus-ring hidden rounded-full px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white sm:block">Admin</a>
          <button
            type="button"
            class="focus-ring glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm text-zinc-100 transition duration-300 ease-spring hover:bg-white/15"
            (click)="openChat.emit()"
          >
            Preguntar a la IA
            <kbd class="rounded border border-white/15 px-1.5 font-mono text-[11px] text-zinc-400">{{ shortcut }}</kbd>
          </button>
        </div>
      </nav>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicNavbarComponent {
  readonly openChat = output<void>();
  readonly scrolled = signal(false);
  readonly shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 12);
  }
}
