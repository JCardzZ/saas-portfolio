import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, effect, inject, signal, viewChild } from '@angular/core';

import { ThemeService } from '../../../../core/theme/theme.service';
import { hasFastWebGL } from '../../../../shared/ui/webgl-support';
import type { BackdropPalette, BackdropScene } from './network-scene';

/**
 * Fondo fijo de toda la página pública: una malla de red 3D (servidores, enlaces y paquetes) detrás del contenido (`-z-10`, sin eventos
 * de puntero), que no cambia la maqueta de nada. Three.js se pide con `import()` cuando el
 * navegador está libre. Dibuja a ~30 fps, se para con la pestaña oculta y, con
 * `prefers-reduced-motion`, se queda quieta. Sin WebGL, en un móvil o con ahorro de datos, solo
 * quedan el color de fondo y la marca de agua.
 */
@Component({
  selector: 'app-galaxy-backdrop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed inset-0 -z-10 block bg-canvas', 'aria-hidden': 'true' },
  template: `
    <canvas #canvas class="absolute inset-0 block h-full w-full" [class.opacity-0]="!ready()" style="transition: opacity 1.2s ease"></canvas>
    <!-- Aurora: luz del acento detrás del robot y viñeta en los bordes, para que el fondo tenga profundidad. -->
    <div class="aurora absolute inset-0" data-testid="aurora"></div>
    <!--
      Marca de agua: iconografía de desarrollo en trazo fino, repetida en mosaico como el fondo de un
      chat. Muy tenue y quieta: animarla obligaría a recomponer una capa del tamaño de la pantalla.
    -->
    <svg class="doodles absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <pattern id="dev-doodles" width="240" height="240" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--text-1)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <!-- </> -->
            <path d="M22 30l-10 10 10 10M42 30l10 10-10 10M36 26l-8 28" />
            <!-- { } -->
            <path d="M150 18c-6 0-6 4-6 10s-2 8-6 8c4 0 6 2 6 8s0 10 6 10M168 18c6 0 6 4 6 10s2 8 6 8c-4 0-6 2-6 8s0 10-6 10" />
            <!-- terminal >_ -->
            <rect x="86" y="92" width="44" height="32" rx="5" /><path d="M94 102l7 6-7 6M106 116h12" />
            <!-- base de datos -->
            <ellipse cx="200" cy="104" rx="14" ry="5" /><path d="M186 104v20c0 3 6 5 14 5s14-2 14-5v-20M186 114c0 3 6 5 14 5s14-2 14-5" />
            <!-- rama de git -->
            <circle cx="30" cy="150" r="4" /><circle cx="30" cy="190" r="4" /><circle cx="54" cy="162" r="4" /><path d="M30 154v32M54 166c0 12-24 10-24 20" />
            <!-- nube -->
            <path d="M150 196h34a10 10 0 0 0 0-20 14 14 0 0 0-27-4 9 9 0 0 0-7 24z" />
            <!-- engranaje -->
            <circle cx="104" cy="200" r="7" /><path d="M104 186v5M104 209v5M90 200h5M113 200h5M94 190l4 4M110 206l4 4M94 210l4-4M110 194l4-4" />
          </g>
          <g fill="var(--text-1)" font-family="var(--font-mono)" font-size="14">
            <text x="96" y="40">=&gt;</text>
            <text x="20" y="98">#</text>
            <text x="210" y="60">;</text>
            <text x="200" y="226">λ</text>
            <text x="64" y="236">$_</text>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dev-doodles)" />
    </svg>
  `,
  styles: `
    /* Textura, no dibujo: a 0,15 los iconos competían con el contenido de cada tarjeta. */
    .doodles { opacity: 0.06; }
    :host-context([data-theme='light']) .doodles { opacity: 0.035; }
    /* Solo gradientes estáticos: no se anima ni se repinta al desplazar. Sin WebGL también se ve. */
    .aurora {
      --glow: 1;
      background:
        radial-gradient(55% 45% at 50% 62%, rgb(var(--c-accent-solid) / calc(0.16 * var(--glow))), transparent 70%),
        radial-gradient(40% 35% at 15% 20%, rgb(var(--c-accent-solid) / calc(0.08 * var(--glow))), transparent 70%),
        radial-gradient(45% 40% at 88% 30%, rgb(var(--c-accent-solid) / calc(0.07 * var(--glow))), transparent 70%),
        radial-gradient(120% 90% at 50% 50%, transparent 55%, rgb(var(--c-canvas) / 0.75) 100%);
    }
    /* En claro el lima sobre gris se ensucia: la mitad de luz. */
    :host-context([data-theme='light']) .aurora { --glow: 0.5; }
    @media (prefers-color-scheme: light) { :host-context(html:not([data-theme='dark'])) .aurora { --glow: 0.5; } }
  `,
})
export class GalaxyBackdropComponent {
  readonly ready = signal(false);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private scene: BackdropScene | null = null;

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
    if (!canvas || !worthRendering() || !hasFastWebGL()) return;
    let scene: BackdropScene;
    try {
      const [three, { createNetworkScene }] = await Promise.all([import('../../../../shared/three/three-lite'), import('./network-scene')]);
      scene = createNetworkScene(three, canvas, readPalette());
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

/**
 * La malla es decoración: en un móvil (pantalla estrecha y táctil) o con «ahorro de datos» no se
 * dibuja, para no gastar batería ni GPU. Queda el color de fondo y la marca de agua.
 */
function worthRendering(): boolean {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const phone = matchMedia('(max-width: 639px) and (pointer: coarse)').matches;
  return !saveData && !phone;
}

function readPalette(): BackdropPalette {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string) => css.getPropertyValue(name).trim() || 'gray';
  const root = document.documentElement;
  return {
    accent: get('--accent-solid'),
    ink: get('--text-3'),
    light: root.getAttribute('data-theme') === 'light' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: light)').matches),
  };
}
