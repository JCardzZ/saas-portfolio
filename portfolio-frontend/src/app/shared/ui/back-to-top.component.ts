import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, afterNextRender, inject, signal } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Radio del anillo de progreso (en el viewBox de 44 × 44). */
const RING_R = 20;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * Botón «volver arriba»: una flecha discreta que aparece al bajar más de una pantalla, con un anillo
 * fino que dice cuánto de la página se ha recorrido. Un toque sube con suavidad (al instante con
 * `prefers-reduced-motion`). Va abajo a la derecha y deja el hueco del inspector acoplado y de la
 * píldora de la esquina (`--dock-bottom`, `--dock-right`, `--pill-space`) y las zonas seguras.
 */
@Component({
  selector: 'app-back-to-top',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      class="to-top ui-focus"
      [class.shown]="shown()"
      [attr.aria-hidden]="!shown()"
      [attr.tabindex]="shown() ? 0 : -1"
      [attr.aria-label]="'Volver arriba' | t"
      [title]="'Volver arriba' | t"
      data-testid="back-to-top"
      (click)="toTop()"
    >
      <svg class="progress" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" [attr.r]="ringR" class="track" />
        <circle cx="22" cy="22" [attr.r]="ringR" class="bar" [attr.stroke-dasharray]="ringLength" [attr.stroke-dashoffset]="ringLength * (1 - progress())" />
      </svg>
      <svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6M6.5 11.5 12 6l5.5 5.5" /></svg>
    </button>
  `,
  styles: `
    .to-top {
      position: fixed; z-index: 40; display: grid; place-items: center; width: 2.75rem; height: 2.75rem;
      right: calc(1.25rem + var(--dock-right, 0px) + env(safe-area-inset-right, 0px));
      bottom: calc(1.25rem + var(--dock-bottom, 0px) + var(--pill-space, 0px) + env(safe-area-inset-bottom, 0px));
      border: 1px solid var(--border-subtle); border-radius: 999px; background: rgb(var(--c-surface-1) / 0.8);
      color: var(--text-2); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      box-shadow: var(--shadow-floating);
      opacity: 0; transform: translateY(0.75rem) scale(0.9); pointer-events: none;
      transition: opacity var(--duration-base) var(--ease-standard), transform var(--duration-base) var(--ease-emphasized), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
    }
    .to-top.shown { opacity: 1; transform: none; pointer-events: auto; }
    .to-top:hover { color: var(--text-1); border-color: var(--border-strong); }
    .to-top:hover .arrow { transform: translateY(-2px); }
    .progress { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
    .track { fill: none; stroke: transparent; stroke-width: 2; }
    .bar { fill: none; stroke: var(--accent-solid); stroke-width: 2; stroke-linecap: round; transition: stroke-dashoffset 80ms linear; }
    .arrow { width: 1.125rem; height: 1.125rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--duration-fast) var(--ease-standard); }
    @media (prefers-reduced-motion: reduce) { .to-top, .arrow, .bar { transition: none; } }
  `,
})
export class BackToTopComponent {
  readonly ringR = RING_R;
  readonly ringLength = RING_LENGTH;
  /** Visible a partir de una pantalla de recorrido. */
  readonly shown = signal(false);
  /** Parte de la página recorrida, de 0 a 1. */
  readonly progress = signal(0);

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      let frame = 0;
      const update = () => {
        frame = 0;
        const root = document.documentElement;
        const max = root.scrollHeight - innerHeight;
        const y = scrollY;
        const shown = y > innerHeight;
        const progress = max > 0 ? Math.min(1, y / max) : 0;
        if (shown !== this.shown() || Math.abs(progress - this.progress()) > 0.005) {
          zone.run(() => {
            this.shown.set(shown);
            this.progress.set(progress);
          });
        }
      };
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      zone.runOutsideAngular(() => addEventListener('scroll', onScroll, { passive: true }));
      update();
      destroyRef.onDestroy(() => {
        removeEventListener('scroll', onScroll);
        cancelAnimationFrame(frame);
      });
    });
  }

  toTop(): void {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Para quien navega con teclado: el foco vuelve al principio de la página (el enlace de la marca).
    (document.querySelector<HTMLElement>('header a, main a, a') ?? document.body).focus({ preventScroll: true });
  }
}
