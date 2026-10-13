import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, ElementRef, NgZone, afterNextRender, effect, inject, input, signal, viewChild,
} from '@angular/core';

import { LanguageService } from '../../../../core/i18n/language.service';
import { ThemeService } from '../../../../core/theme/theme.service';
import { TECH_ICONS, TechIconKey } from '../../../../shared/ui/tech-icons';
import type { HeroScene, ScenePalette, SceneTech } from './hero-scene';

/** Las tecnologías con las que está hecha la plataforma, en el orden en que salen del mazo. */
const STACK: readonly TechIconKey[] = [
  'java', 'spring', 'angular', 'postgresql', 'redis', 'docker', 'kubernetes', 'terraform', 'githubActions', 'tailwind', 'jwt', 'gemini',
];

/**
 * Lienzo del hero 3D. Three.js se pide con `import()` al pintarse, así que no pesa en el arranque.
 * Si el navegador no tiene WebGL (o falla), no se pinta nada. Con `prefers-reduced-motion`
 * se dibuja una sola vez, quieta. Fuera de pantalla o con la pestaña oculta, no dibuja.
 * El lienzo es un botón: pulsarlo (o Intro/Espacio) abre el abanico de tecnologías que sostiene el
 * robot; la lista también está en texto para lectores de pantalla.
 */
@Component({
  selector: 'app-hero-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- Sin WebGL no hay avatar: el nombre gigante se basta solo. -->
    @if (!failed()) {
      <button
        #frame
        type="button"
        class="ui-focus relative block h-full w-full cursor-pointer rounded-card"
        data-testid="hero-stack-toggle"
        [attr.aria-pressed]="open()"
        [attr.aria-label]="label()"
        (click)="toggle()"
      >
        <canvas #canvas class="block h-full w-full" [class.opacity-0]="!ready()" style="transition: opacity 600ms ease" aria-hidden="true"></canvas>
        @if (ready()) {
          <span
            class="pointer-events-none absolute bottom-3 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full border border-line-subtle bg-surface-1/80 px-3 py-1 font-mono text-mono-sm text-ink-2 backdrop-blur"
            aria-hidden="true"
          >{{ hint() }}</span>
        }
      </button>
    }
  `,
})
export class HeroSceneComponent {
  /** Para los tests: sin WebGL. */
  readonly enabled = input(true);

  readonly ready = signal(false);
  readonly open = signal(false);
  readonly hovered = signal<string | null>(null);
  private readonly i18n = inject(LanguageService);
  private readonly titles = STACK.map((key) => TECH_ICONS[key].title);
  readonly label = computed(() =>
    this.i18n.lang() === 'en'
      ? `${this.open() ? 'Put away' : 'Show'} the platform stack: ${this.titles.join(', ')}`
      : `${this.open() ? 'Recoger' : 'Mostrar'} las tecnologías de la plataforma: ${this.titles.join(', ')}`,
  );
  readonly hint = computed(() => {
    const en = this.i18n.lang() === 'en';
    if (this.hovered()) return this.hovered();
    if (this.open()) return en ? 'Click again to put them away' : 'Pulsa otra vez para recogerlas';
    return en ? 'Click the robot to see my stack' : 'Pulsa el robot para ver mi stack';
  });
  private kickFrame: (() => void) | null = null;
  readonly failed = signal(false);

  toggle(): void {
    if (!this.scene) return;
    this.open.set(this.scene.toggleStack());
    this.hovered.set(null);
    this.kickFrame?.();
  }

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frameRef = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly theme = inject(ThemeService);
  private scene: HeroScene | null = null;
  private readonly zone = inject(NgZone);

  constructor() {
    const zone = this.zone;
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
      const techs: SceneTech[] = STACK.map((key) => TECH_ICONS[key]).map(({ title, path, color }) => ({ title, path, color }));
      scene = createHeroScene(three, canvas, readPalette(), !still, techs);
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

    this.kickFrame = kick;
    const zoneRef = this.zone;
    const onPointer = (event: PointerEvent) => {
      scene.pointer((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
      const box = canvas.getBoundingClientRect();
      const title = scene.pick(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      if (title !== this.hovered()) zoneRef.run(() => this.hovered.set(title));
      if (reduced) kick();
    };
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
