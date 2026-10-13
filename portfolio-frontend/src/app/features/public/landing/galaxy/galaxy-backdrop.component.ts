import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, effect, inject, signal, viewChild } from '@angular/core';

import { ThemeService } from '../../../../core/theme/theme.service';
import type { GalaxyPalette, GalaxyScene } from './galaxy-scene';

/**
 * Fondo fijo de toda la página pública: una galaxia 3D detrás del contenido (`-z-10`, sin eventos
 * de puntero), que no cambia la maqueta de nada. Three.js se pide con `import()` cuando el
 * navegador está libre. Dibuja a ~30 fps, se para con la pestaña oculta y, con
 * `prefers-reduced-motion`, se queda quieta. Sin WebGL, solo queda el color de fondo.
 */
@Component({
  selector: 'app-galaxy-backdrop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed inset-0 -z-10 block bg-canvas', 'aria-hidden': 'true' },
  template: `<canvas #canvas class="block h-full w-full" [class.opacity-0]="!ready()" style="transition: opacity 1.2s ease"></canvas>`,
})
export class GalaxyBackdropComponent {
  readonly ready = signal(false);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private scene: GalaxyScene | null = null;

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    effect(() => {
      this.theme.effective();
      queueMicrotask(() => this.scene?.setPalette(readPalette()));
    });
    afterNextRender(() => {
      const start = () => zone.runOutsideAngular(() => void this.start(destroyRef));
      if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 });
      else setTimeout(start, 500);
    });
  }

  private async start(destroyRef: DestroyRef): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    let scene: GalaxyScene;
    try {
      const [three, { createGalaxyScene }] = await Promise.all([import('three'), import('./galaxy-scene')]);
      scene = createGalaxyScene(three, canvas, readPalette());
      this.scene = scene;
    } catch {
      return;
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - last > 32) {
        last = now;
        scene.frame((now - started) / 1000);
      }
      if (!still) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const resize = () => {
      scene.resize(innerWidth, innerHeight);
      kick();
    };
    const onScroll = () => {
      scene.scroll(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
      if (still) kick();
    };
    addEventListener('resize', resize, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', kick);
    resize();
    onScroll();
    this.ready.set(true);
    kick();
    destroyRef.onDestroy(() => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', kick);
      scene.dispose();
      this.scene = null;
    });
  }
}

function readPalette(): GalaxyPalette {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string) => css.getPropertyValue(name).trim() || 'gray';
  const root = document.documentElement;
  return {
    accent: get('--accent-solid'),
    ink: get('--text-3'),
    light: root.getAttribute('data-theme') === 'light' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: light)').matches),
  };
}
