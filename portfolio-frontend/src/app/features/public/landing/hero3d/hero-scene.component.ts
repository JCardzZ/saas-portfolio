import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, effect, inject, input, signal, viewChild,
} from '@angular/core';

import { ThemeService } from '../../../../core/theme/theme.service';
import { HeroStackComponent } from '../hero-stack.component';
import type { HeroScene, ScenePalette } from './hero-scene';

/**
 * Lienzo del hero 3D. Three.js se pide con `import()` al pintarse, así que no pesa en el arranque.
 * Si el navegador no tiene WebGL (o falla), queda la versión en CSS 3D. Con `prefers-reduced-motion`
 * se dibuja una sola vez, quieta. Fuera de pantalla o con la pestaña oculta, no dibuja.
 */
@Component({
  selector: 'app-hero-scene',
  standalone: true,
  imports: [HeroStackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (failed()) {
      <app-hero-stack />
    } @else {
      <div #frame class="relative h-full w-full" aria-hidden="true">
        <canvas #canvas class="block h-full w-full" [class.opacity-0]="!ready()" style="transition: opacity 600ms ease"></canvas>
      </div>
    }
  `,
})
export class HeroSceneComponent {
  /** Para los tests: sin WebGL, directamente la versión en CSS. */
  readonly enabled = input(true);

  readonly ready = signal(false);
  readonly failed = signal(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frameRef = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly theme = inject(ThemeService);
  private scene: HeroScene | null = null;

  constructor() {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    effect(() => {
      this.theme.effective();
      // El tema cambia variables CSS: se leen tras aplicarse.
      queueMicrotask(() => this.scene?.setPalette(readPalette()));
    });

    afterNextRender(() => {
      if (!this.enabled() || !hasWebGL()) {
        this.failed.set(true);
        return;
      }
      zone.runOutsideAngular(() => void this.start(destroyRef));
    });
  }

  private async start(destroyRef: DestroyRef): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    const frame = this.frameRef()?.nativeElement;
    if (!canvas || !frame) {
      return;
    }
    let scene: HeroScene;
    try {
      const [three, { createHeroScene }] = await Promise.all([import('three'), import('./hero-scene')]);
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene = createHeroScene(three, canvas, readPalette(), !still);
      this.scene = scene;
    } catch {
      this.failed.set(true);
      return;
    }

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    let raf = 0;
    const started = performance.now();
    const loop = () => {
      raf = 0;
      if (!visible || document.hidden) {
        return;
      }
      scene.frame((performance.now() - started) / 1000);
      if (!reduced) {
        raf = requestAnimationFrame(loop);
      }
    };
    const kick = () => {
      if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };

    const resize = () => {
      const box = frame.getBoundingClientRect();
      scene.resize(Math.max(1, box.width), Math.max(1, box.height));
      kick();
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(frame);
    resize();

    const onPointer = (event: PointerEvent) => scene.pointer((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
    const onScroll = () => {
      scene.scroll(scrollY / Math.max(1, innerHeight * 0.8));
      kick();
    };
    const onVisibility = () => kick();
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    seen.observe(frame);

    this.ready.set(true);
    kick();

    destroyRef.onDestroy(() => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
      seen.disconnect();
      removeEventListener('pointermove', onPointer);
      removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.dispose();
      this.scene = null;
    });
  }
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Colores del tema activo, leídos de las variables CSS de design-tokens.js. */
function readPalette(): ScenePalette {
  const css = getComputedStyle(document.documentElement);
  // Sin variable (no debería pasar), gris medio.
  const get = (name: string) => css.getPropertyValue(name).trim() || 'gray';
  return {
    accent: get('--accent-solid'),
    accentText: get('--accent-text'),
    ink: get('--text-1'),
    muted: get('--text-3'),
    surface: get('--bg-surface-2'),
    line: get('--border-strong'),
    light: css.getPropertyValue('color-scheme').trim() === 'light' || document.documentElement.getAttribute('data-theme') === 'light'
      || (!document.documentElement.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: light)').matches),
  };
}
