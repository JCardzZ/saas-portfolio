import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, output, ElementRef, NgZone, afterNextRender, effect, inject, input, signal, viewChild,
} from '@angular/core';

import { LanguageService } from '../../../../core/i18n/language.service';
import { ThemeService } from '../../../../core/theme/theme.service';
import { TECH_ICONS, TechIconKey } from '../../../../shared/ui/tech-icons';
import type { HeroScene, ScenePalette, SceneTech } from './hero-scene';
import { HELP_BY_CATEGORY, STACK_CARDS } from './stack-cards';

/**
 * Las fichas del mazo: con qué está hecha la plataforma y los servicios de nube que dibuja el
 * Estudio (los principales de cada una, no el catálogo entero: el globo no debe verse cargado).
 * Los iconos de AWS, Azure y Google Cloud son los oficiales, sin modificar y con su nombre.
 */
const STACK: readonly TechIconKey[] = [
  'java', 'spring', 'angular', 'postgresql', 'redis', 'gemini', 'docker', 'kubernetes', 'terraform', 'githubActions', 'github',
  'cloudflare', 'caddy', 'neon', 'upstash', 'tailwind', 'jwt', 'opentelemetry', 'prometheus', 'kafka',
  'aws', 'awsEks', 'awsLambda', 'awsRds', 'awsAurora', 'awsElastiCache', 'awsApiGateway', 'awsSqs', 'awsCloudFront', 'awsBedrock',
  'azure', 'azAks', 'azContainerApps', 'azFunctions', 'azPostgresql', 'azCosmosDb', 'azApiManagement', 'azServiceBus', 'azFrontDoor', 'azOpenAi',
  'gcp', 'gcpGke', 'gcpCloudRun', 'gcpCloudSql', 'gcpAlloyDb', 'gcpSpanner', 'gcpPubSub', 'bigquery', 'gcpApigee', 'gcpVertexAi',
  'oci',
];

type StackGroup = 'platform' | 'aws' | 'azure' | 'gcp' | 'all';

/** Índices de STACK de cada grupo del globo (`null` = todos). */
function groupIndices(group: StackGroup): ReadonlySet<number> | null {
  if (group === 'all') return null;
  const inGroup = (key: TechIconKey): boolean => {
    switch (group) {
      case 'platform': return STACK_CARDS[key]?.where === 'platform';
      case 'aws': return key.startsWith('aws');
      case 'azure': return key === 'azure' || key.startsWith('az');
      case 'gcp': return key.startsWith('gcp') || key === 'bigquery';
    }
  };
  return new Set(STACK.flatMap((key, index) => (inGroup(key) ? [index] : [])));
}

/** Desplazamiento (px) a partir del cual una pulsación es un arrastre y no un clic. */
const DRAG_THRESHOLD = 6;

/**
 * Lienzo del hero 3D. Three.js se pide con `import()` al pintarse, así que no pesa en el arranque.
 * Si el navegador no tiene WebGL (o falla), no se pinta nada. Con `prefers-reduced-motion`
 * se dibuja una sola vez, quieta. Fuera de pantalla o con la pestaña oculta, no dibuja.
 * El lienzo ocupa toda la pantalla y es un botón: pulsarlo (o Intro/Espacio) abre el mazo de
 * tecnologías que sostiene el robot; arrastrar (o las flechas) gira los anillos, pulsar una ficha la
 * trae al frente y Esc lo recoge. La lista también está en texto para lectores de pantalla.
 */
@Component({
  selector: 'app-hero-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- Sin WebGL no hay avatar: el nombre gigante se basta solo. -->
    @if (!failed()) {
      <div #frame class="relative h-full w-full">
      <canvas #canvas class="hero-canvas pointer-events-none absolute inset-0 block h-full w-full" [class.opacity-0]="!ready()" style="transition: opacity 600ms ease" aria-hidden="true"></canvas>
      <!--
        Bocadillo del robot: en cinco segundos, qué hago, escrito a máquina y rotando. Sigue a la
        cabeza (se posiciona escribiendo el estilo, sin detección de cambios). Se retira con el
        mazo abierto. El texto completo está también para lectores de pantalla.
      -->
      <div
        #bubble
        class="speech pointer-events-none absolute left-0 top-0 z-10 transition-opacity duration-slow"
        [class.opacity-0]="!ready() || open()"
        [class.speech-narrow]="narrow"
        aria-hidden="true"
      >
        <div class="speech-body rounded-card border border-line-subtle bg-surface-1/85 px-4 py-3 shadow-floating backdrop-blur-xl">
          <span class="block font-mono text-mono-sm text-ink-3">{{ pitch().lead }}</span>
          <span class="mt-1 block text-title-3 font-semibold text-ink-1"><span #typed></span><span class="caret" aria-hidden="true"></span></span>
        </div>
      </div>
      <p class="sr-only">{{ pitch().lead }} {{ pitch().lines.join(' · ') }}</p>
      <!-- Zona pulsable: empieza bajo la barra fija para que esta no la tape. -->
      <button
        type="button"
        class="absolute inset-x-0 bottom-0 top-[calc(4.5rem+env(safe-area-inset-top,0px))] group block outline-none max-[399px]:top-[calc(7rem+env(safe-area-inset-top,0px))]"
        [class.cursor-grab]="open()"
        [class.cursor-pointer]="!open()"
        style="touch-action: pan-y"
        data-testid="hero-stack-toggle"
        [attr.aria-pressed]="open()"
        [attr.aria-label]="label()"
        (pointerdown)="pressStart($event)"
        (pointerup)="pressEnd($event)"
        (pointercancel)="pressEnd($event)"
        (click)="activate($event)"
        (keydown)="key($event)"
      >
        @if (ready()) {
          <!-- El foco de teclado se ve en esta píldora, no como un marco alrededor de la escena. -->
          <span
            [class.hint-glow]="!open()"
            class="pointer-events-none absolute bottom-[max(7rem,15dvh)] left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 truncate rounded-full border border-line-subtle bg-surface-1/80 group-focus-visible:border-accent-solid group-focus-visible:ring-2 group-focus-visible:ring-accent-solid/40 px-3 py-1 font-mono text-mono-sm text-ink-2 backdrop-blur"
            aria-hidden="true"
          >{{ hint() }}</span>
        }
      </button>
      @if (open()) {
        <!-- Filtros del globo: fuera del botón, para que pulsarlos no recoja el mazo. -->
        <div
          class="absolute left-1/2 top-[calc(5rem+env(safe-area-inset-top,0px))] z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 animate-fade-in max-[399px]:top-[calc(7.5rem+env(safe-area-inset-top,0px))]"
        >
          <div class="ui-segmented flex-wrap justify-center bg-surface-1/80 backdrop-blur" role="radiogroup" [attr.aria-label]="i18n.lang() === 'en' ? 'Show' : 'Mostrar'" data-testid="stack-filters">
            @for (option of filters(); track option.id) {
              <button
                type="button"
                role="radio"
                class="ui-segment"
                [attr.aria-checked]="filter() === option.id"
                (click)="setFilter(option.id)"
              >{{ option.label }} <span class="ml-1 text-ink-3">{{ option.count }}</span></button>
            }
          </div>
        </div>
      }
      <!-- Lo que dice la ficha, también para lectores de pantalla. -->
      <span class="sr-only" aria-live="polite">{{ card() ? card()!.title + '. ' + card()!.about + ' ' + card()!.help : '' }}</span>
      </div>
    }
  `,
})
export class HeroSceneComponent {
  /** Para los tests: sin WebGL. */
  readonly enabled = input(true);

  readonly ready = signal(false);
  /** Avisa al hero de que el mazo se abre o se recoge (atenúa su texto). */
  readonly stackOpen = output<boolean>();
  readonly open = signal(false);
  readonly hovered = signal<string | null>(null);
  readonly i18n = inject(LanguageService);
  /** Grupo del globo a la vista; al abrir, primero lo que usa la plataforma. */
  readonly filter = signal<StackGroup>('platform');
  readonly filters = computed(() => {
    const en = this.i18n.lang() === 'en';
    const label: Record<StackGroup, string> = {
      platform: en ? 'Platform' : 'Plataforma', aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud', all: en ? 'All' : 'Todo',
    };
    return (['platform', 'aws', 'azure', 'gcp', 'all'] as const).map((id) => ({ id, label: label[id], count: groupIndices(id)?.size ?? STACK.length }));
  });

  setFilter(group: StackGroup): void {
    this.filter.set(group);
    this.scene?.show(groupIndices(group));
    this.focused.set(null);
    this.kickFrame?.();
  }
  private readonly titles = STACK.map((key) => TECH_ICONS[key].title);
  readonly label = computed(() =>
    this.i18n.lang() === 'en'
      ? `${this.open() ? 'Put away' : 'Show'} the platform stack: ${this.titles.join(', ')}`
      : `${this.open() ? 'Recoger' : 'Mostrar'} las tecnologías de la plataforma: ${this.titles.join(', ')}`,
  );
  readonly hint = computed(() => {
    const en = this.i18n.lang() === 'en';
    if (this.focused()) return en ? `${this.focused()} · click to send it back` : `${this.focused()} · pulsa para devolverla`;
    if (this.hovered()) return this.hovered();
    if (this.open()) {
      if (this.touch) return en ? 'Swipe to spin · tap a card' : 'Desliza para girar · toca una ficha';
      return en ? 'Drag to spin · click a card · Esc to put them away' : 'Arrastra para girar · pulsa una ficha · Esc para recogerlas';
    }
    return en ? `Click the robot to see my stack (${STACK.length})` : `Pulsa el robot para ver mi stack (${STACK.length})`;
  });
  private kickFrame: (() => void) | null = null;
  readonly failed = signal(false);
  /** La carta de la mano derecha sigue a la ficha al frente y al idioma. */
  private readonly infoSync = effect(() => {
    const info = this.card();
    const en = this.i18n.lang() === 'en';
    this.scene?.showInfo(
      info
        ? {
            category: info.category,
            title: info.title,
            whatLabel: en ? 'What it is' : 'Qué es',
            what: info.about,
            helpLabel: en ? 'How I help your company' : 'Cómo ayudo a tu empresa',
            help: info.help,
          }
        : null,
    );
    this.kickFrame?.();
  });

  readonly focused = signal<string | null>(null);
  /** Ficha de la tecnología que está al frente, en el idioma activo. */
  readonly card = computed(() => {
    const title = this.focused();
    const key = title ? STACK.find((item) => TECH_ICONS[item].title === title) : undefined;
    const data = key ? STACK_CARDS[key] : undefined;
    if (!title || !data) return null;
    const en = this.i18n.lang() === 'en';
    return {
      help: this.i18n.t(HELP_BY_CATEGORY[data.category.en] ?? data.about),
      category: this.i18n.t(data.category),
      title: en ? `I'll help you build with ${title}` : `Te ayudo a construir con ${title}`,
      about: this.i18n.t(data.about),
      platform: data.where === 'platform',
      where: data.where === 'platform' ? (en ? '✓ Used in this platform' : '✓ Usado en esta plataforma') : en ? 'Available in the Studio' : 'Disponible en el Estudio',
      back: en ? 'Click to send it back' : 'Pulsa para devolverla',
    };
  });
  private readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private press: { x: number; lastX: number; dragged: boolean } | null = null;
  private suppressClick = false;

  pressStart(event: PointerEvent): void {
    this.press = { x: event.clientX, lastX: event.clientX, dragged: false };
  }

  /** Arrastre: lo llama el listener de `pointermove` de la ventana. */
  private pressMove(event: PointerEvent): void {
    const press = this.press;
    if (!press || !this.scene) return;
    if (Math.abs(event.clientX - press.x) > DRAG_THRESHOLD) press.dragged = true;
    if (press.dragged) {
      this.scene.drag((event.clientX - press.lastX) / Math.max(1, innerWidth));
      this.kickFrame?.();
    }
    press.lastX = event.clientX;
  }

  pressEnd(_event: PointerEvent): void {
    this.suppressClick = !!this.press?.dragged;
    this.press = null;
  }

  activate(event: MouseEvent): void {
    if (!this.scene) return;
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    // detail 0: Intro o Espacio. Si no, la pulsación cae en un punto del lienzo.
    const canvas = this.canvas()?.nativeElement;
    const box = canvas?.getBoundingClientRect();
    const point = event.detail === 0 || !box
      ? null
      : { x: ((event.clientX - box.left) / box.width) * 2 - 1, y: -((event.clientY - box.top) / box.height) * 2 + 1 };
    if (!this.open()) this.scene.show(groupIndices(this.filter()));
    const state = this.scene.activate(point?.x ?? null, point?.y ?? null);
    this.setOpen(state.open);
    this.focused.set(state.focused);
    this.kickFrame?.();
  }

  private setOpen(open: boolean): void {
    if (open !== this.open()) this.stackOpen.emit(open);
    this.open.set(open);
  }

  key(event: KeyboardEvent): void {
    if (!this.scene || !this.open()) return;
    if (event.key === 'Escape') {
      this.scene.close();
      this.setOpen(false);
      this.focused.set(null);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      this.scene.nudge(event.key === 'ArrowLeft' ? -1 : 1);
    } else {
      return;
    }
    event.preventDefault();
    this.kickFrame?.();
  }

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly bubble = viewChild<ElementRef<HTMLElement>>('bubble');
  private readonly typed = viewChild<ElementRef<HTMLElement>>('typed');
  /** Pantalla estrecha: el bocadillo va encima de la cabeza y no a su lado. */
  readonly narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
  /** Lo que ofrezco, en frases cortas que el robot escribe una tras otra. */
  readonly pitch = computed(() =>
    this.i18n.lang() === 'en'
      ? {
          lead: 'I can help you',
          lines: [
            'design systems built for your business',
            'modernize legacy into clean REST APIs',
            'move your platform to the cloud',
            'add AI on top of your own data',
            'ship every day with safe CI/CD',
          ],
        }
      : {
          lead: 'Te puedo ayudar a',
          lines: [
            'diseñar sistemas a la medida de tu negocio',
            'modernizar legacy a APIs REST limpias',
            'llevar tu plataforma a la nube',
            'sumar IA sobre tus propios datos',
            'desplegar cada día con CI/CD seguro',
          ],
        },
  );
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
      const techs: SceneTech[] = STACK.map((key) => TECH_ICONS[key]).map(({ title, path, color, image }) => ({
        title, path, color, image: image ? `/${image}` : undefined,
      }));
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
      placeBubble();
      if (!reduced) {
        raf = requestAnimationFrame(loop);
      }
    };
    const kick = () => {
      if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };

    const bubbleEl = () => this.bubble()?.nativeElement;
    const placeBubble = () => {
      const el = bubbleEl();
      if (!el) return;
      const at = scene.anchor(this.narrow);
      el.style.transform = this.narrow
        ? `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translate(-50%, -100%)`
        : `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translateY(-100%)`;
    };
    // Máquina de escribir: escribe, espera, borra y pasa a la siguiente frase.
    let line = 0;
    let shown = 0;
    let erasing = false;
    let hold = 0;
    const type = () => {
      const target = this.typed()?.nativeElement;
      const lines = this.pitch().lines;
      if (!target) return;
      const text = lines[line % lines.length];
      if (reduced) {
        target.textContent = text;
        line++;
        return;
      }
      if (hold > 0) {
        hold--;
      } else if (!erasing) {
        shown = Math.min(text.length, shown + 1);
        if (shown === text.length) {
          erasing = true;
          hold = 40; // ~2,2 s leyendo
        }
      } else {
        shown = Math.max(0, shown - 2);
        if (shown === 0) {
          erasing = false;
          line++;
          hold = 4;
        }
      }
      target.textContent = text.slice(0, shown);
    };
    const typing = setInterval(type, reduced ? 3500 : 55);
    type();

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
      this.pressMove(event);
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
    placeBubble();
    kick();

    destroyRef.onDestroy(() => {
      cancelAnimationFrame(raf);
      clearInterval(typing);
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
