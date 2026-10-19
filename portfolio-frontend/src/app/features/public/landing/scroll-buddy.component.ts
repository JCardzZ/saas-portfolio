import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { DeliveryTabsService, DeliveryTab } from '../delivery/delivery-tabs.service';
import { PAGE_SECTIONS } from '../navbar/page-sections';

/** Lo que dice el robot de cada sección. */
const LINES: Record<string, { en: string; es: string }> = {
  plataforma: { en: 'This is how it’s built inside', es: 'Así está hecho por dentro' },
  entrega: { en: 'What’s live, and how it ships', es: 'Lo que está en producción y cómo llega' },
  cloud: { en: 'Draw it on any cloud', es: 'Dibújalo en cualquier nube' },
  mcp: { en: 'Use it from your own AI', es: 'Úsalo desde tu propia IA' },
  proyectos: { en: 'Real work, with its code', es: 'Trabajo real, con su código' },
  tecnologias: { en: 'My stack, by area', es: 'Mi stack, por área' },
  articulos: { en: 'Notes I’ve written', es: 'Notas que he escrito' },
  trayectoria: { en: 'Where I’ve been', es: 'Por dónde he pasado' },
};

/** En la sección de entrega, la frase sigue a la pestaña abierta. */
const DELIVERY_LINES: Record<DeliveryTab, { en: string; es: string }> = {
  arquitectura: { en: 'All of this is running right now', es: 'Todo esto está corriendo ahora' },
  historial: { en: 'Every merge went through CI', es: 'Cada merge pasó por la CI' },
  pipeline: { en: 'This runs on every change', es: 'Esto corre en cada cambio' },
  despliegues: { en: 'And this is how it rolls back', es: 'Y así vuelve atrás si falla' },
};

/**
 * Un robot pequeño que acompaña al bajar por la página: aparece al dejar atrás el hero, señala la
 * sección que se está leyendo y dice en una frase qué hay en ella. Solo en pantallas anchas (≥ 1600
 * px), en el margen izquierdo, donde no tapa contenido. Decorativo: el título de cada sección ya
 * lo dice todo (`aria-hidden`).
 */
@Component({
  selector: 'app-scroll-buddy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      class="buddy pointer-events-none fixed z-nav hidden min-[1600px]:block"
      [class.buddy-on]="line()"
      aria-hidden="true"
      data-testid="scroll-buddy"
    >
      @if (line(); as text) {
        <p class="buddy-bubble mb-2 rounded-card border border-line-subtle bg-surface-1/90 px-3 py-2 text-body-sm font-medium text-ink-1 shadow-floating backdrop-blur">
          {{ text }} <span class="text-accent-text">→</span>
        </p>
      }
      <svg viewBox="0 0 64 64" class="buddy-bot h-14 w-14">
        <line x1="40" y1="10" x2="44" y2="3" stroke="var(--border-strong)" stroke-width="2" stroke-linecap="round" />
        <circle cx="44.5" cy="3.5" r="3" fill="var(--accent-solid)" />
        <rect x="10" y="10" width="44" height="36" rx="16" fill="var(--text-1)" />
        <rect x="16" y="17" width="32" height="20" rx="9" fill="var(--bg-canvas)" />
        <rect class="buddy-eye" x="22" y="22" width="6" height="9" rx="3" fill="var(--accent-solid)" />
        <rect class="buddy-eye" x="36" y="22" width="6" height="9" rx="3" fill="var(--accent-solid)" />
        <rect x="20" y="48" width="24" height="12" rx="6" fill="var(--text-1)" />
        <!-- Brazo que señala a la derecha, hacia el contenido. -->
        <path class="buddy-arm" d="M44 52 L58 46" stroke="var(--text-1)" stroke-width="4" stroke-linecap="round" />
      </svg>
    </div>
  `,
  styles: `
    .buddy {
      left: max(1rem, calc((100vw - 72rem) / 2 - 10rem));
      bottom: calc(var(--dock-bottom, 0px) + var(--pill-space, 0px) + 1.25rem + env(safe-area-inset-bottom, 0px));
      width: 9.5rem;
      opacity: 0;
      transform: translateY(1rem);
      transition: opacity var(--duration-slow) var(--ease-standard), transform var(--duration-slow) var(--ease-emphasized);
    }
    .buddy-on { opacity: 1; transform: none; }
    .buddy-bot { animation: buddy-float 3.2s var(--ease-standard) infinite; }
    .buddy-eye { transform-origin: center; transform-box: fill-box; animation: buddy-blink 4.2s infinite; }
    .buddy-arm { transform-origin: 44px 52px; transform-box: view-box; animation: buddy-point 1.6s var(--ease-standard) infinite; }
    @keyframes buddy-float { 50% { transform: translateY(-4px); } }
    @keyframes buddy-blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.1); } }
    @keyframes buddy-point { 50% { transform: rotate(-8deg); } }
  `,
})
export class ScrollBuddyComponent {
  private readonly language = inject(LanguageService);
  private readonly deliveryTabs = inject(DeliveryTabsService);
  private readonly active = signal<string | null>(null);
  readonly line = computed(() => {
    const id = this.active();
    const text = id === 'entrega' ? DELIVERY_LINES[this.deliveryTabs.active()] : id ? LINES[id] : undefined;
    return text ? text[this.language.lang()] : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const visible = new Map<string, number>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
          // La sección más visible; ninguna mientras se ve el hero.
          const best = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
          this.active.set(best && best[1] > 0.08 ? best[0] : null);
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75] },
      );
      const watch = () => {
        for (const section of PAGE_SECTIONS) {
          const element = document.getElementById(section.id);
          if (element) observer.observe(element);
        }
        const mcp = document.getElementById('mcp');
        if (mcp) observer.observe(mcp);
      };
      watch();
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
