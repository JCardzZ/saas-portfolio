import {
  ChangeDetectionStrategy, Component, ViewEncapsulation, DestroyRef, computed, output, ElementRef, NgZone, afterNextRender, effect, inject, input, signal, viewChild,
} from '@angular/core';

import { LanguageService } from '../../../../core/i18n/language.service';
import { ThemeService } from '../../../../core/theme/theme.service';
import { TECH_ICONS, TechIconKey } from '../../../../shared/ui/tech-icons';
import type { HeroScene, ScenePalette, SceneTech } from './hero-scene';
import { HERO_ROLE_PLACEHOLDER } from '../hero-content';
import { PAGE_SECTIONS } from '../../navbar/page-sections';
import { GUIDE_SCRIPT } from './guide-script';
import { HeroSound, bestVoice, countVisit, greeting } from './hero-sound';
import { hasFastWebGL } from '../../../../shared/ui/webgl-support';
import type * as StackCardsModule from './stack-cards';

/** Textos de las cartas: se cargan con la escena 3D (no pesan en el arranque). */
let cards: typeof StackCardsModule | null = null;

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
      case 'platform': return cards?.STACK_CARDS[key]?.where === 'platform';
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
  // Al guiar, el componente entero sube de capa: su `z-0` limitaría el lienzo y el láser bajo las tarjetas.
  host: { class: 'block', '[style.z-index]': 'guiding() ? 44 : null' },
  // Estilos del bocadillo, la isla de filtros y la píldora: viajan con la escena, que se carga aparte.
  encapsulation: ViewEncapsulation.None,
  styles: `
/* Bocadillo del robot: una cola hacia la cabeza (a la izquierda, o abajo en pantallas estrechas). */
.speech { will-change: transform; }
.speech-body { position: relative; width: min(21rem, calc(100vw - 2rem)); }
.speech-body::after {
  content: '';
  position: absolute;
  left: -7px;
  top: calc(50% - 6px);
  width: 12px;
  height: 12px;
  background: inherit;
  border-left: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  transform: rotate(45deg);
}
.speech-narrow .speech-body::after { left: calc(50% - 6px); top: -7px; transform: rotate(135deg); }
.caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.12em;
  background: rgb(var(--c-accent-solid));
  animation: caret-blink 1s steps(1) infinite;
}
@keyframes caret-blink { 50% { opacity: 0; } }

/* Bocadillo a la izquierda del robot (modo guía, robot en el margen derecho): cola a la derecha. */
.speech-top .speech-body::after { left: 78%; top: auto; bottom: -7px; transform: rotate(-45deg); }
.tour-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.4rem 0.35rem 1rem;
  border-radius: 999px;
  background: rgb(var(--c-canvas) / 0.92);
  box-shadow: 0 0 0 1px var(--border-subtle), 0 12px 40px rgb(0 0 0 / 0.35);
  backdrop-filter: blur(16px);
  animation: island-count var(--duration-slow) var(--ease-emphasized);
}
.tour-progress { width: 7rem; height: 3px; border-radius: 2px; background: rgb(var(--c-ink-1) / 0.12); overflow: hidden; }
.tour-progress > span { display: block; height: 100%; background: rgb(var(--c-accent-solid)); transition: width var(--duration-slow) var(--ease-emphasized); }

.guide-switch { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2rem; border-radius: 999px; }
.guide-switch-track {
  position: relative; width: 2.25rem; height: 1.25rem; border-radius: 999px;
  background: rgb(var(--c-ink-1) / 0.15); transition: background var(--duration-base) var(--ease-standard);
}
.guide-switch-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem; width: 1rem; height: 1rem; border-radius: 999px;
  background: var(--text-1); transition: transform var(--duration-base) var(--ease-emphasized);
}
.guide-switch[aria-checked='true'] .guide-switch-track { background: rgb(var(--c-accent-solid)); }
.guide-switch[aria-checked='true'] .guide-switch-thumb { transform: translateX(1rem); background: rgb(var(--c-accent-on)); }
.guide-switch:focus-visible { outline: 2px solid rgb(var(--c-accent-solid)); outline-offset: 2px; }

/* Play: triángulo de esquinas redondeadas, grande y sin adornos. */
.play-icon { width: 1.375rem; height: 1.375rem; flex-shrink: 0; }
.play-icon-accent { color: rgb(var(--c-accent-solid)); filter: drop-shadow(0 0 8px rgb(var(--c-accent-solid) / 0.45)); }
.laser { opacity: 0; transition: opacity var(--duration-base) var(--ease-standard); }
.laser-on { opacity: 1; }
.laser-core { stroke-width: 2.5; stroke-linecap: round; }
.laser-glow { stroke-width: 10; stroke-linecap: round; opacity: 0.35; filter: blur(4px); }
.laser-hit { filter: drop-shadow(0 0 8px rgb(var(--c-accent-solid))); }
.laser-on .laser-ring { animation: laser-ring 1.1s var(--ease-standard) infinite; transform-box: fill-box; transform-origin: center; }
@keyframes laser-ring { from { transform: scale(1); opacity: 0.9; } to { transform: scale(4); opacity: 0; } }
/* La tarjeta que el robot «toca»: se ilumina y se desplaza como si la empujara con el láser. */
/* Abrir paso: la tarjeta junto al robot se aparta hacia la izquierda y gira un poco, como empujada. */
main :is(.bento-card, .theater-card, article) {
  transition: transform 700ms var(--ease-emphasized), opacity 700ms var(--ease-standard);
}
.robot-part:not(.robot-touch) {
  transform: perspective(1400px) translateX(-56px) rotateY(6deg) scale(0.985);
  opacity: 0.92;
}
@media (prefers-reduced-motion: reduce) { .robot-part:not(.robot-touch) { transform: none; } }
.robot-touch {
  /* Como una lámina: bisagra en el borde izquierdo, el derecho (donde la agarra) sube hacia él. */
  transform-origin: left center;
  position: relative;
  box-shadow: 0 0 0 1px rgb(var(--c-accent-solid) / 0.8), 0 30px 60px rgb(0 0 0 / 0.45), 0 0 48px rgb(var(--c-accent-solid) / 0.22) !important;
  animation: robot-lamina 3.2s var(--ease-standard) infinite;
}
@keyframes robot-lamina {
  0%, 100% { transform: perspective(1800px) rotateY(-3deg) translateZ(8px); }
  50% { transform: perspective(1800px) rotateY(-5.5deg) translateZ(18px); }
}
@media (prefers-reduced-motion: reduce) { .robot-touch { animation: none; } .laser-on .laser-ring { animation: none; } }

/* Isla dinámica de los filtros del globo. */
.island {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
  align-items: center;
  max-width: 100%;
  padding: 0.3rem;
  border-radius: 999px;
  background: rgb(var(--c-canvas) / 0.92);
  box-shadow: 0 0 0 1px var(--border-subtle), 0 12px 40px rgb(0 0 0 / 0.35);
  backdrop-filter: blur(16px);
}
.island-thumb {
  position: absolute;
  top: 0.3rem;
  bottom: 0.3rem;
  left: 0.3rem;
  width: calc((100% - 0.6rem - 2.5rem) / 5);
  border-radius: 999px;
  background: rgb(var(--c-accent-solid));
  box-shadow: 0 0 18px rgb(var(--c-accent-solid) / 0.45);
  transition: transform var(--duration-slow) var(--ease-emphasized);
}
.island-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 2.25rem;
  padding: 0 0.875rem;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 999px;
  transition: color var(--duration-base) var(--ease-standard);
}
.island-option:hover { color: var(--text-1); }
.island-option-on, .island-option-on:hover { color: rgb(var(--c-accent-on)); font-weight: 600; }
.island-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  animation: island-count var(--duration-slow) var(--ease-emphasized);
}
@keyframes island-count { from { opacity: 0; transform: translateY(6px) scale(0.8); } }
.island-sound {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  margin-left: 0.25rem;
  border-radius: 999px;
  color: var(--text-2);
}
.island-sound:hover { color: var(--text-1); background: rgb(var(--c-ink-1) / 0.08); }
.island :focus-visible { outline: 2px solid rgb(var(--c-accent-solid)); outline-offset: 2px; }
@media (max-width: 639px) {
  .island-option { padding: 0 0.5rem; font-size: 0.75rem; }
}
/* En pantallas muy estrechas las cinco opciones no caben en una fila: pasan a dos, sin indicador
   deslizante (el activo lleva su propio fondo) y con esquinas de tarjeta en lugar de píldora. */
@media (max-width: 479px) {
  .island { display: flex; flex-wrap: wrap; justify-content: center; border-radius: 1.25rem; gap: 0.125rem; }
  .island-thumb { display: none; }
  .island-option-on { background: rgb(var(--c-accent-solid)); }
}

/* La píldora del robot late suave mientras el mazo está cerrado, para que se descubra. */
.hint-glow {
  animation: hint-glow 2.6s var(--ease-standard) infinite;
}
@keyframes hint-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgb(var(--c-accent-solid) / 0); border-color: var(--border-subtle); }
  50% { box-shadow: 0 0 18px 2px rgb(var(--c-accent-solid) / 0.35); border-color: rgb(var(--c-accent-solid) / 0.7); }
}

  `,
  template: `
    <!-- Sin WebGL no hay avatar: el nombre gigante se basta solo. -->
    @if (!failed()) {
      <div #frame class="relative h-full w-full">
      <!--
        El lienzo es fijo y queda detrás del contenido: así el robot puede dejar el hero y acompañar
        al visitante por la página (modo guía, en pantallas anchas).
      -->
      <canvas #canvas class="pointer-events-none fixed inset-0 block h-dvh w-screen" [style.z-index]="guiding() ? 44 : -5" [class.hero-canvas]="!guiding()" [class.opacity-0]="!ready()" style="transition: opacity 600ms ease" aria-hidden="true"></canvas>
      <!--
        Bocadillo del robot: en cinco segundos, qué hago, escrito a máquina y rotando. Sigue a la
        cabeza (se posiciona escribiendo el estilo, sin detección de cambios). Se retira con el
        mazo abierto. El texto completo está también para lectores de pantalla.
      -->
      <div
        #bubble
        class="speech pointer-events-none fixed left-0 top-0 z-[45] transition-opacity duration-slow"
        [class.opacity-0]="!ready() || open() || (guiding() && !guideLine())"
        [class.invisible]="!ready() || open() || (guiding() && !guideLine())"
        [class.speech-narrow]="narrow"
        [class.speech-top]="guiding()"
      >
        @if (guideLine(); as g) {
          <!-- En modo guía: la sección que se está viendo. -->
          <div class="speech-body rounded-card border border-line-subtle bg-surface-1/90 px-4 py-3 shadow-floating backdrop-blur-xl" data-testid="guide-bubble">
            <span class="block font-mono text-mono-sm text-accent-text">{{ g.title }}</span>
            <span class="mt-1 block text-body font-medium text-ink-1">{{ g.text }}</span>
          </div>
        }
        <div class="speech-body rounded-card border border-line-subtle bg-surface-1/85 px-4 py-3 shadow-floating backdrop-blur-xl" [class.hidden]="guiding()">
          <span class="flex items-start justify-between gap-2">
            <span class="min-w-0">
              <span class="block text-body-sm font-medium text-ink-2">{{ hello() }}</span>
              <span class="block font-mono text-mono-sm text-ink-3">{{ pitch().lead }}</span>
            </span>
            <!-- Sonido y voz: apagados por defecto. -->
            <button
              type="button"
              class="ui-btn-ghost ui-btn-icon pointer-events-auto -mr-2 -mt-1 shrink-0"
              data-testid="hero-sound"
              [attr.aria-pressed]="soundOn()"
              [attr.aria-label]="i18n.lang() === 'en' ? (soundOn() ? 'Turn sound and voice off' : 'Turn sound and voice on') : (soundOn() ? 'Apagar sonido y voz' : 'Encender sonido y voz')"
              (click)="toggleSound()"
            >
              @if (soundOn()) {
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
              } @else {
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6" /></svg>
              }
            </button>
          </span>
          <span class="mt-1 block min-h-[2lh] text-title-3 font-semibold text-ink-1"><span #typed aria-hidden="true"></span><span class="caret" aria-hidden="true"></span></span>
          <!-- La invitación a abrir el mazo va aquí (antes, una píldora que tapaba el portátil). -->
          <span class="mt-2 flex items-center gap-2 font-mono text-mono-sm text-ink-3" data-testid="hero-hint">
            <span class="h-1.5 w-1.5 rounded-full bg-accent-solid" aria-hidden="true"></span>{{ hint() }}
          </span>
          <!-- Preguntar al asistente desde el bocadillo: abre el chat con la pregunta ya enviada. -->
          <form class="pointer-events-auto mt-3 flex gap-2" [class.hidden]="narrow" (submit)="submitAsk($event, question)">
            <input
              #question
              type="text"
              class="min-w-0 flex-1 rounded-control border border-line-subtle bg-surface-2 px-3 py-1.5 text-body-sm text-ink-1 placeholder:text-ink-3 focus:border-accent-solid focus:outline-none"
              maxlength="300"
              data-testid="hero-ask"
              [attr.aria-label]="i18n.lang() === 'en' ? 'Ask me something' : 'Pregúntame algo'"
              [placeholder]="i18n.lang() === 'en' ? 'Ask me something…' : 'Pregúntame algo…'"
            />
            <button type="submit" class="ui-btn-primary shrink-0">{{ i18n.lang() === 'en' ? 'Ask' : 'Preguntar' }}</button>
          </form>
          @if (guideAvailable()) {
            @if (askGuide()) {
              <!-- Primera visita: pide permiso antes de guiar. -->
              <div class="pointer-events-auto mt-3 border-t border-line-subtle pt-3" data-testid="guide-ask">
                <p class="text-body-sm font-medium text-ink-1">{{ i18n.lang() === 'en' ? 'Want me to show you around?' : '¿Quieres que te guíe por la plataforma?' }}</p>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="ui-btn-primary flex-1 justify-center gap-2" data-testid="tour-accept" (click)="acceptGuide()"><svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.6v14.8a1.4 1.4 0 0 0 2.1 1.2l12-7.4a1.4 1.4 0 0 0 0-2.4l-12-7.4A1.4 1.4 0 0 0 7 4.6z" /></svg>{{ i18n.lang() === 'en' ? 'Yes, guide me' : 'Sí, guíame' }}</button>
                  <button type="button" class="ui-btn-secondary flex-1 justify-center" data-testid="tour-decline" (click)="declineGuide()">{{ i18n.lang() === 'en' ? 'No, thanks' : 'No, gracias' }}</button>
                </div>
              </div>
            } @else {
              <div class="pointer-events-auto mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-3">
                <button type="button" class="ui-btn-ghost -ml-2 gap-2" data-testid="tour-start" (click)="startTour()">
                  <svg class="play-icon play-icon-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.6v14.8a1.4 1.4 0 0 0 2.1 1.2l12-7.4a1.4 1.4 0 0 0 0-2.4l-12-7.4A1.4 1.4 0 0 0 7 4.6z" /></svg>
                  {{ i18n.lang() === 'en' ? 'Guided tour' : 'Recorrido guiado' }}
                </button>
                <!-- Interruptor: que el robot acompañe al bajar con el scroll (apagado por defecto). -->
                <button type="button" role="switch" class="guide-switch" data-testid="guide-follow" [attr.aria-checked]="guideFollow()" (click)="toggleFollow()">
                  <span class="guide-switch-track" aria-hidden="true"><span class="guide-switch-thumb"></span></span>
                  <span class="text-body-sm text-ink-2">{{ i18n.lang() === 'en' ? 'Walk with me' : 'Acompañarme al bajar' }}</span>
                </button>
              </div>
            }
          }
        </div>
      </div>
      <!--
        Láser: del dedo del robot a la tarjeta que explica. Se dibuja en cada fotograma escribiendo
        atributos (sin detección de cambios); la tarjeta tocada se mueve un poco (.robot-touch).
      -->
      <svg #laser class="laser pointer-events-none fixed inset-0 z-[45] h-dvh w-screen" aria-hidden="true">
        <defs>
          <linearGradient id="laser-gradient" gradientUnits="userSpaceOnUse" #laserGradient>
            <stop offset="0" stop-color="var(--accent-solid)" stop-opacity="0.15" />
            <stop offset="1" stop-color="var(--accent-solid)" stop-opacity="1" />
          </linearGradient>
        </defs>
        <line #laserGlow class="laser-glow" stroke="url(#laser-gradient)" />
        <line #laserCore class="laser-core" stroke="url(#laser-gradient)" />
        <circle #laserHit class="laser-hit" r="7" fill="var(--accent-solid)" />
        <circle #laserRing class="laser-ring" r="7" fill="none" stroke="var(--accent-solid)" />
      </svg>
      @if (tour(); as current) {
        <!-- Control del recorrido guiado: abajo, centrado; Esc o desplazarse a mano lo detienen. -->
        <div class="tour-pill fixed bottom-[calc(1.25rem+var(--dock-bottom,0px)+env(safe-area-inset-bottom,0px))] left-1/2 z-[46] -translate-x-1/2" data-testid="tour-controls" role="group" [attr.aria-label]="i18n.lang() === 'en' ? 'Guided tour' : 'Recorrido guiado'">
          <span class="font-mono text-mono-sm text-ink-3">{{ i18n.lang() === 'en' ? 'Guided tour' : 'Recorrido' }} · {{ current.index + 1 }}/{{ current.total }}</span>
          <span class="tour-progress" aria-hidden="true"><span [style.width.%]="((current.index + 1) / current.total) * 100"></span></span>
          <button type="button" class="island-sound" [attr.aria-label]="current.paused ? (i18n.lang() === 'en' ? 'Resume' : 'Reanudar') : (i18n.lang() === 'en' ? 'Pause' : 'Pausar')" (click)="toggleTourPause()">
            @if (current.paused) {
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
            } @else {
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
            }
          </button>
          <button type="button" class="island-sound" [attr.aria-label]="i18n.lang() === 'en' ? 'End the tour' : 'Terminar el recorrido'" (click)="stopTour()">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      }
      <p class="sr-only" aria-live="polite">{{ guideLine() ? guideLine()!.title + '. ' + guideLine()!.text : '' }}</p>
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
        (dblclick)="stretch()"
        (focus)="keyFocus.set($any($event.target).matches(':focus-visible'))"
        (blur)="keyFocus.set(false)"
      >
        @if (ready() && (open() || keyFocus())) {
          <!-- Con el mazo abierto (el bocadillo se oculta), las indicaciones van en esta píldora. -->
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
          <!--
            Isla dinámica: píldora negra con un indicador que se desliza bajo el grupo activo y su
            número, que aparece animado. Las opciones tienen el mismo ancho para que el indicador
            solo tenga que moverse (transform).
          -->
          <div class="island" role="radiogroup" [attr.aria-label]="i18n.lang() === 'en' ? 'Show' : 'Mostrar'" data-testid="stack-filters">
            <span class="island-thumb" aria-hidden="true" [style.transform]="'translateX(' + activeIndex() * 100 + '%)'"></span>
            @for (option of filters(); track option.id) {
              <button
                type="button"
                role="radio"
                class="island-option"
                [class.island-option-on]="filter() === option.id"
                [attr.aria-checked]="filter() === option.id"
                (click)="setFilter(option.id)"
              >
                <span>{{ option.label }}</span>
                @if (filter() === option.id) {
                  <span class="island-count">{{ option.count }}</span>
                }
              </button>
            }
            <!-- El bocadillo se oculta con el globo abierto: aquí también se puede apagar la voz. -->
            <button
              type="button"
              class="island-sound"
              data-testid="hero-sound-globe"
              [attr.aria-pressed]="soundOn()"
              [attr.aria-label]="i18n.lang() === 'en' ? (soundOn() ? 'Turn sound and voice off' : 'Turn sound and voice on') : (soundOn() ? 'Apagar sonido y voz' : 'Encender sonido y voz')"
              (click)="toggleSound()"
            >
              @if (soundOn()) {
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7" /></svg>
              } @else {
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6" /></svg>
              }
            </button>
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
  /** Foco de teclado en la escena: la píldora reaparece para que se vea dónde está el foco. */
  readonly keyFocus = signal(false);
  /** Modo guía disponible: pantalla ancha (el robot camina por el margen) y 3D activo. */
  readonly guideAvailable = signal(false);
  /** Primera visita: aún no ha respondido si quiere que le guíe. */
  readonly askGuide = signal(readPref('robot-guide-asked') === null);
  /** Que el robot acompañe al bajar con el scroll (lo elige el visitante; apagado por defecto). */
  readonly guideFollow = signal(readPref('robot-guide-follow') === 'on');
  private refreshGuide: (() => void) | null = null;
  /** El robot ha dejado el hero y acompaña por la página. */
  readonly guiding = signal(false);
  /** Lo que dice ahora en modo guía (sección actual), o nada. */
  readonly guideLine = signal<{ title: string; text: string } | null>(null);
  /** Recorrido guiado en marcha. */
  readonly tour = signal<{ index: number; total: number; paused: boolean } | null>(null);
  private tourRun = 0;
  private tourResume: (() => void) | null = null;
  private guideSection: string | null = null;
  private lineTimer = 0;
  /** Ya están los textos de las cartas (para recalcular la carta y los filtros). */
  private readonly cardsReady = signal(false);
  /** Avisa al hero de que el mazo se abre o se recoge (atenúa su texto). */
  readonly stackOpen = output<boolean>();
  /** Pregunta escrita en el bocadillo: la página abre el asistente con ella. */
  readonly ask = output<string>();
  private readonly sound = new HeroSound();
  readonly soundOn = signal(this.sound.enabled);
  private readonly visits = countVisit();
  readonly hello = computed(() => greeting(this.i18n.lang(), this.visits));

  toggleSound(): void {
    this.soundOn.set(this.sound.toggle());
    this.sound.pop();
    if (this.soundOn()) {
      // Al encenderlo, se presenta: así se oye enseguida que funciona.
      this.speakText(`${this.hello()}. ${this.i18n.lang() === 'en' ? 'Click me to see my stack.' : 'Pulsa sobre mí para ver mi stack.'}`);
    } else {
      globalThis.speechSynthesis?.cancel();
      this.scene?.speak(false);
    }
  }

  submitAsk(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    const question = field.value.trim();
    if (!question) return;
    field.value = '';
    this.ask.emit(question);
  }

  /**
   * Narración: con el sonido encendido, el robot dice en voz alta lo que muestra (saludo, cada frase
   * del bocadillo, la carta que enseña, el filtro, la carta que lanza). Una frase nueva corta la
   * anterior; apagar el sonido calla al instante.
   */
  private speakText(text: string, interrupt = true): void {
    const voice = globalThis.speechSynthesis;
    if (!this.soundOn() || !voice || !text.trim()) return;
    // Lo que hace el visitante (abrir, elegir una carta…) corta lo anterior; el bocadillo, no.
    if (!interrupt && (voice.speaking || voice.pending)) return;
    voice.cancel();
    const en = this.i18n.lang() === 'en';
    const utterance = new SpeechSynthesisUtterance(text.replace(/[👋↗→·]/gu, ' '));
    const natural = bestVoice(en ? 'en' : 'es');
    if (natural) utterance.voice = natural;
    utterance.lang = natural?.lang ?? (en ? 'en-US' : 'es-ES');
    utterance.rate = 1.02;
    utterance.onstart = () => this.scene?.speak(true);
    utterance.onend = utterance.onerror = () => this.scene?.speak(false);
    voice.speak(utterance);
  }

  private say(): void {
    const en = this.i18n.lang() === 'en';
    this.speakText(`${this.hello()}. ${en ? 'Here is my stack. Pick any card.' : 'Este es mi stack. Elige cualquier carta.'}`);
  }

  /** Bocadillo: dice cada frase cuando empieza a escribirla (si nadie está mirando el globo). */
  private narrateLine(line: string): void {
    if (this.open() || this.guiding()) return;
    this.speakText(`${this.pitch().lead} ${line}.`, false);
  }

  readonly open = signal(false);
  readonly hovered = signal<string | null>(null);
  readonly i18n = inject(LanguageService);
  /** Grupo del globo a la vista; al abrir, primero lo que usa la plataforma. */
  readonly filter = signal<StackGroup>('platform');
  readonly filters = computed(() => {
    this.cardsReady();
    const en = this.i18n.lang() === 'en';
    const label: Record<StackGroup, string> = {
      platform: en ? 'Platform' : 'Plataforma', aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud', all: en ? 'All' : 'Todo',
    };
    return (['platform', 'aws', 'azure', 'gcp', 'all'] as const).map((id) => ({ id, label: label[id], count: groupIndices(id)?.size ?? STACK.length }));
  });

  readonly activeIndex = computed(() => this.filters().findIndex((item) => item.id === this.filter()));

  setFilter(group: StackGroup): void {
    this.filter.set(group);
    const option = this.filters().find((item) => item.id === group);
    if (option) this.speakText(this.i18n.lang() === 'en' ? `${option.label}: ${option.count} technologies` : `${option.label}: ${option.count} tecnologías`);
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
  private heroRoleText(): string {
    return this.i18n.t(HERO_ROLE_PLACEHOLDER);
  }
  readonly failed = signal(false);
  /** La carta de la mano derecha sigue a la ficha al frente y al idioma. */
  private readonly infoSync = effect(() => {
    const info = this.card();
    const en = this.i18n.lang() === 'en';
    this.scene?.showInfo(
      info
        ? {
            category: info.category,
            name: info.name,
            status: info.platform ? (en ? 'In this platform' : 'En esta plataforma') : en ? 'In the Studio' : 'En el Estudio',
            live: info.platform,
            whatLabel: en ? 'What it is' : 'Qué es',
            what: info.about,
            forLabel: en ? 'What it’s for' : 'Para qué sirve',
            use: info.use,
            helpLabel: en ? 'How I can help you' : 'Cómo te puedo ayudar',
            help: info.help,
            signature: 'Manuel Cardoza · ' + this.heroRoleText(),
          }
        : null,
    );
    this.kickFrame?.();
  });
  /** Dice la carta que enseña: qué es y cómo ayudo. Solo cuando cambia la carta. */
  private lastSpoken: string | null = null;
  private readonly cardVoice = effect(() => {
    const info = this.card();
    const key = info ? `${info.title}|${this.i18n.lang()}` : null;
    if (key === this.lastSpoken) return;
    this.lastSpoken = key;
    if (!info) return;
    const en = this.i18n.lang() === 'en';
    this.speakText(`${info.name}. ${info.about} ${info.use} ${en ? 'How I can help you:' : 'Cómo te puedo ayudar:'} ${info.help}`);
  });

  readonly focused = signal<string | null>(null);
  /** Ficha de la tecnología que está al frente, en el idioma activo. */
  readonly card = computed(() => {
    const title = this.focused();
    const key = title ? STACK.find((item) => TECH_ICONS[item].title === title) : undefined;
    this.cardsReady();
    const data = key ? cards?.STACK_CARDS[key] : undefined;
    if (!title || !data) return null;
    const en = this.i18n.lang() === 'en';
    return {
      name: title,
      use: this.i18n.t(cards!.USE_BY_CATEGORY[data.category.en] ?? data.about),
      help: this.i18n.t(cards!.HELP_BY_CATEGORY[data.category.en] ?? data.about),
      category: this.i18n.t(data.category),
      title: en ? `I'll help you build with ${title}` : `Te ayudo a construir con ${title}`,
      about: this.i18n.t(data.about),
      platform: data.where === 'platform',
      where: data.where === 'platform' ? (en ? '✓ Used in this platform' : '✓ Usado en esta plataforma') : en ? 'Available in the Studio' : 'Disponible en el Estudio',
      back: en ? 'Click to send it back' : 'Pulsa para devolverla',
    };
  });
  private readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private press: { x: number; y: number; lastX: number; dragged: boolean; grabbed: boolean } | null = null;
  private suppressClick = false;

  pressStart(event: PointerEvent): void {
    this.press = { x: event.clientX, y: event.clientY, lastX: event.clientX, dragged: false, grabbed: false };
  }

  private toCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const box = this.canvas()?.nativeElement.getBoundingClientRect();
    return box ? { x: ((clientX - box.left) / box.width) * 2 - 1, y: -((clientY - box.top) / box.height) * 2 + 1 } : null;
  }

  /** Arrastre: lo llama el listener de `pointermove` de la ventana. */
  private pressMove(event: PointerEvent): void {
    const press = this.press;
    if (!press || !this.scene) return;
    if (!press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD) {
      press.dragged = true;
      // Si el arrastre empieza sobre una ficha, se agarra (para lanzarla); si no, gira el globo.
      const start = this.toCanvas(press.x, press.y);
      press.grabbed = !!(start && this.open() && this.scene.grab(start.x, start.y));
      if (press.grabbed) this.sound.tick();
    }
    if (press.grabbed) {
      const point = this.toCanvas(event.clientX, event.clientY);
      if (point) this.scene.fling(point.x, point.y);
      this.kickFrame?.();
    } else if (press.dragged) {
      this.scene.drag((event.clientX - press.lastX) / Math.max(1, innerWidth));
      this.kickFrame?.();
    }
    press.lastX = event.clientX;
  }

  pressEnd(_event: PointerEvent): void {
    if (this.press?.grabbed) {
      this.scene?.release();
      this.speakText(this.i18n.lang() === 'en' ? 'Whee!' : '¡Allá va!');
    }
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
    const wasOpen = this.open();
    const state = this.scene.activate(point?.x ?? null, point?.y ?? null);
    if (!wasOpen && state.open) this.say();
    if (state.open !== wasOpen || state.focused) this.sound.pop();
    this.setOpen(state.open);
    this.focused.set(state.focused);
    this.kickFrame?.();
  }

  private setOpen(open: boolean): void {
    if (open !== this.open()) this.stackOpen.emit(open);
    this.open.set(open);
  }

  /** Secciones presentes en la página, en orden. */
  private sections(): string[] {
    const ids = [...PAGE_SECTIONS.map((section) => section.id), 'mcp'];
    return ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
      .sort((a, b) => a.offsetTop - b.offsetTop)
      .map((el) => el.id);
  }

  /** Dice (bocadillo y, con sonido, voz) lo de una sección. `long` en el recorrido. */
  private present(id: string, long: boolean): Promise<void> {
    const script = GUIDE_SCRIPT[id];
    if (!script) return Promise.resolve();
    const text = this.i18n.t(long ? script.long : script.short);
    this.touchSection = id;
    this.scene?.hold({ title: this.i18n.t(script.title), items: script.items[this.i18n.lang()] });
    this.zone.run(() => this.guideLine.set({ title: this.i18n.t(script.title), text }));
    clearTimeout(this.lineTimer);
    if (!long) this.lineTimer = window.setTimeout(() => this.zone.run(() => this.guideLine.set(null)), 4500);
    return new Promise((resolve) => {
      const voice = globalThis.speechSynthesis;
      if (!this.soundOn() || !voice) {
        setTimeout(resolve, long ? Math.max(5000, text.length * 55) : 0);
        return;
      }
      this.speakText(text);
      const started = Date.now();
      const wait = () => (voice.speaking && Date.now() - started < 30000 ? setTimeout(wait, 250) : setTimeout(resolve, 900));
      setTimeout(wait, 600);
    });
  }

  /** Recorrido guiado: baja sección a sección, se detiene y explica cada una. */
  async startTour(): Promise<void> {
    const ids = this.sections();
    if (!ids.length) return;
    const run = ++this.tourRun;
    this.tour.set({ index: 0, total: ids.length, paused: false });
    document.documentElement.classList.add('robot-touring');
    for (let index = 0; index < ids.length; index++) {
      if (run !== this.tourRun) return;
      this.tour.set({ index, total: ids.length, paused: false });
      const el = document.getElementById(ids[index]);
      if (el) await animateScrollTo(el.getBoundingClientRect().top + scrollY - 88, 1500);
      if (run !== this.tourRun) return;
      this.guideSection = ids[index];
      await this.present(ids[index], true);
      while (this.tour()?.paused && run === this.tourRun) {
        await new Promise<void>((resolve) => (this.tourResume = resolve));
      }
    }
    if (run !== this.tourRun) return;
    // Al terminar, se despide y vuelve a su silla: la página sube al inicio y él se sienta.
    const en = this.i18n.lang() === 'en';
    this.zone.run(() => this.guideLine.set({ title: en ? 'That’s all' : 'Eso es todo', text: en ? 'Back to my desk. Ask me anything!' : 'Vuelvo a mi escritorio. ¡Pregúntame lo que quieras!' }));
    this.speakText(en ? 'That’s the tour. Back to my desk.' : 'Ese fue el recorrido. Vuelvo a mi escritorio.');
    await new Promise((resolve) => setTimeout(resolve, 2200));
    if (run !== this.tourRun) return;
    await animateScrollTo(0, 1800);
    if (run === this.tourRun) this.stopTour();
  }

  toggleTourPause(): void {
    const current = this.tour();
    if (!current) return;
    this.tour.set({ ...current, paused: !current.paused });
    if (current.paused) {
      this.tourResume?.();
      this.tourResume = null;
    } else {
      globalThis.speechSynthesis?.cancel();
    }
  }

  stopTour(): void {
    this.tourRun++;
    this.touchSection = null;
    this.scene?.hold(null);
    queueMicrotask(() => this.refreshGuide?.());
    document.documentElement.classList.remove('robot-touring');
    this.tour.set(null);
    this.tourResume?.();
    this.tourResume = null;
    globalThis.speechSynthesis?.cancel();
    this.scene?.speak(false);
    clearTimeout(this.lineTimer);
    this.lineTimer = window.setTimeout(() => this.zone.run(() => this.guideLine.set(null)), 2500);
  }

  acceptGuide(): void {
    writePref('robot-guide-asked', 'yes');
    this.askGuide.set(false);
    void this.startTour();
  }

  declineGuide(): void {
    writePref('robot-guide-asked', 'no');
    this.askGuide.set(false);
    this.speakText(this.i18n.lang() === 'en' ? 'Sure. I’ll be right here.' : 'De acuerdo. Aquí estaré.');
  }

  toggleFollow(): void {
    this.guideFollow.set(!this.guideFollow());
    writePref('robot-guide-follow', this.guideFollow() ? 'on' : 'off');
    this.refreshGuide?.();
  }

  /** Doble clic: se despereza (solo con el mazo recogido). */
  stretch(): void {
    if (this.open()) return;
    this.scene?.stretch();
    this.speakText(this.i18n.lang() === 'en' ? 'Time for a little stretch.' : 'Un estiramiento rapidito.');
    this.kickFrame?.();
  }

  key(event: KeyboardEvent): void {
    if (!this.scene || !this.open()) return;
    if (event.key === 'Escape') {
      globalThis.speechSynthesis?.cancel();
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
  private readonly laser = viewChild<ElementRef<SVGSVGElement>>('laser');
  private readonly laserGradient = viewChild<ElementRef<SVGLinearGradientElement>>('laserGradient');
  private readonly laserCore = viewChild<ElementRef<SVGLineElement>>('laserCore');
  private readonly laserGlow = viewChild<ElementRef<SVGLineElement>>('laserGlow');
  private readonly laserHit = viewChild<ElementRef<SVGCircleElement>>('laserHit');
  private readonly laserRing = viewChild<ElementRef<SVGCircleElement>>('laserRing');
  /** Sección que el robot está explicando (su tarjeta recibe el láser). */
  private touchSection: string | null = null;
  private touched: HTMLElement | null = null;
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
      if (!this.enabled() || !hasFastWebGL()) {
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
      const [three, { createHeroScene }, cardTexts] = await Promise.all([import('three'), import('./hero-scene'), import('./stack-cards')]);
      cards = cardTexts;
      this.cardsReady.set(true);
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const techs: SceneTech[] = STACK.map((key) => TECH_ICONS[key]).map(({ title, path, color, image }) => ({
        title, path, color, image: image ? `/${image}` : undefined,
      }));
      scene = createHeroScene(three, canvas, readPalette(), !still, techs);
      scene.onBounce(() => this.sound.bounce());
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
      if ((!visible && !this.guiding()) || document.hidden) {
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
    // Láser y «toque»: mientras explica una sección (y está señalando), un haz va de su dedo a la
    // tarjeta más visible de esa sección, que reacciona.
    // Abrir paso: con el robot caminando, las tarjetas que tiene al lado se apartan con suavidad.
    let parted = new Set<HTMLElement>();
    const partWay = () => {
      const walking = this.guiding() && !pointing && !this.open();
      scene.sweep(walking);
      const next = new Set<HTMLElement>();
      if (walking) {
        const head = scene.anchor(false, 'top');
        const robotLeft = head.x - 140;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('main .bento-card, main .theater-card, main article'))) {
          const r = el.getBoundingClientRect();
          if (r.bottom < head.y - 40 || r.top > innerHeight || r.right < robotLeft - 60) continue;
          next.add(el);
        }
      }
      for (const el of Array.from(parted)) if (!next.has(el)) el.classList.remove('robot-part');
      for (const el of Array.from(next)) el.classList.add('robot-part');
      parted = next;
    };
    const placeLaser = () => {
      partWay();
      const svg = this.laser()?.nativeElement;
      if (!svg) return;
      const tip = this.guiding() && this.guideLine() && this.touchSection ? scene.fingertip() : null;
      const section = this.touchSection ? document.getElementById(this.touchSection) : null;
      let target: HTMLElement | null = null;
      if (tip && section) {
        const candidates = section.querySelectorAll<HTMLElement>('.bento-card, .theater-card, article');
        // La tarjeta bien visible más cercana al robot (el de más a la derecha): así el brazo no
        // cruza otras tarjetas para llegar.
        let right = -Infinity;
        for (const el of Array.from(candidates)) {
          const r = el.getBoundingClientRect();
          const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
          if (visible >= Math.min(160, r.height * 0.6) && r.right > right + 8 && !el.closest('.robot-touch:not(:scope)')) {
            right = r.right;
            target = el;
          }
        }
      }
      if (target !== this.touched) {
        this.touched?.classList.remove('robot-touch');
      for (const el of Array.from(document.querySelectorAll('.robot-part'))) el.classList.remove('robot-part');
        target?.classList.add('robot-touch');
        this.touched = target;
      }
      svg.classList.toggle('laser-on', !!(tip && target));
      if (!tip || !target) return;
      const r = target.getBoundingClientRect();
      const top = Math.max(r.top, 70);
      const bottom = Math.min(r.bottom, innerHeight - 60);
      // El láser escanea la tarjeta por dentro, de un lado a otro, mientras la explica.
      const now = performance.now();
      const hx = r.right - 24 - Math.min(r.width - 48, 360) * (0.5 + 0.5 * Math.sin(now / 900));
      const hy = top + 30 + (bottom - top - 60) * (0.5 + 0.5 * Math.sin(now / 1700));
      for (const line of [this.laserCore()?.nativeElement, this.laserGlow()?.nativeElement]) {
        line?.setAttribute('x1', String(tip.x));
        line?.setAttribute('y1', String(tip.y));
        line?.setAttribute('x2', String(hx));
        line?.setAttribute('y2', String(hy));
      }
      const gradient = this.laserGradient()?.nativeElement;
      gradient?.setAttribute('x1', String(tip.x));
      gradient?.setAttribute('y1', String(tip.y));
      gradient?.setAttribute('x2', String(hx));
      gradient?.setAttribute('y2', String(hy));
      for (const dot of [this.laserHit()?.nativeElement, this.laserRing()?.nativeElement]) {
        dot?.setAttribute('cx', String(hx));
        dot?.setAttribute('cy', String(hy));
      }
    };
    const bubbleAt = { x: -1000, y: -1000 };
    let bubbleGuide = false;
    const placeBubble = () => {
      placeLaser();
      const el = bubbleEl();
      if (!el) return;
      const guide = this.guiding();
      const raw = scene.anchor(this.narrow && !guide, guide ? 'top' : undefined);
      // Margen muerto: la respiración del robot no debe hacer temblar el bocadillo (ni sus botones).
      if (Math.hypot(raw.x - bubbleAt.x, raw.y - bubbleAt.y) > 6 || guide !== bubbleGuide) {
        bubbleAt.x = raw.x;
        bubbleAt.y = raw.y;
        bubbleGuide = guide;
      }
      const at = bubbleAt;
      // Al estirarse el robot, el bocadillo se aparta empujado por su mano, y el nombre y el rol
      // (en la página) se mueven con la misma variable.
      const lift = scene.stretchLevel();
      document.documentElement.style.setProperty('--robot-lift', lift.toFixed(3));
      const pushed = `translate3d(${Math.round(lift * 46)}px, ${Math.round(-lift * 18)}px, 0) rotate(${(lift * 2.5).toFixed(2)}deg)`;
      el.style.transform = (guide
        ? `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translate(-82%, calc(-100% - 14px))`
        : this.narrow
        ? `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translate(-50%, -50%)`
        : `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translateY(-50%)`) + (guide ? '' : ' ' + pushed);
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
        this.narrateLine(text);
        target.textContent = text;
        line++;
        return;
      }
      if (hold > 0) {
        hold--;
      } else if (!erasing) {
        if (shown === 0) this.narrateLine(text);
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
      // Habla mientras escribe (no mientras lee o borra), y calla con el mazo abierto.
      scene.talk(!erasing && hold === 0 && shown < text.length && !this.open() && !this.guiding());
    };
    const typing = setInterval(type, reduced ? 3500 : 55);
    type();

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      scene.resize(Math.max(1, box.width), Math.max(1, box.height));
      this.zone.run(() => this.guideAvailable.set(innerWidth >= 1280));
      updateGuide();
      kick();
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);

    // ---- Modo guía -------------------------------------------------------------------------
    // Con la página desplazada más allá del hero, el robot va al margen derecho (entre el contenido
    // y el borde, o el inspector acoplado) y presenta la sección que se está leyendo.
    let settleTimer = 0;
    let pointing = false;
    const visibleSections = new Map<string, number>();
    const sectionsSeen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visibleSections.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        const best = [...visibleSections.entries()].sort((a, b) => b[1] - a[1])[0];
        const id = best && best[1] > 0.12 ? best[0] : null;
        if (this.guiding() && id && id !== this.guideSection && !this.tour()) {
          this.guideSection = id;
          void this.present(id, false);
        }
      },
      { threshold: [0, 0.15, 0.3, 0.6] },
    );
    const watchSections = () => {
      for (const id of [...PAGE_SECTIONS.map((section) => section.id), 'mcp']) {
        const el = document.getElementById(id);
        if (el) sectionsSeen.observe(el);
      }
    };
    watchSections();
    this.refreshGuide = () => updateGuide();
    const rewatch = setInterval(watchSections, 3000);
    const updateGuide = () => {
      const on = this.guideAvailable() && scrollY > innerHeight * 0.55 && !this.open() && (this.guideFollow() || !!this.tour());
      if (on !== this.guiding()) {
        this.zone.run(() => {
          this.guiding.set(on);
          if (!on) {
            this.guideLine.set(null);
            this.guideSection = null;
            scene.hold(null);
          } else if (!this.tour()) {
            // Al llegar al margen, presenta la sección que ya se está viendo.
            const best = [...visibleSections.entries()].sort((a, b) => b[1] - a[1])[0];
            if (best && best[1] > 0.12) {
              this.guideSection = best[0];
              void this.present(best[0], false);
            }
          }
        });
        document.documentElement.classList.toggle('robot-guide', on);
      }
      if (!on) {
        scene.guide(null);
        return;
      }
      const dockRight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-right')) || 0;
      const width = innerWidth - dockRight;
      const gutter = Math.max(120, (width - 1152) / 2);
      const dockBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-bottom')) || 0;
      scene.guide({ x: width - Math.max(150, gutter * 0.62), y: (innerHeight - dockBottom) * 0.8, widthPx: gutter * 0.95, point: pointing || !!this.tour() });
    };
    resize();

    this.kickFrame = kick;
    const zoneRef = this.zone;
    const onPointer = (event: PointerEvent) => {
      this.pressMove(event);
      scene.pointer((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
      const box = canvas.getBoundingClientRect();
      const title = scene.pick(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      if (title !== this.hovered()) {
        if (title) this.sound.tick();
        zoneRef.run(() => this.hovered.set(title));
      }
      if (reduced) kick();
    };
    const onScroll = () => {
      scene.scroll(scrollY);
      // Mientras se desplaza, camina; al detenerse, señala la sección.
      pointing = false;
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        pointing = true;
        updateGuide();
      }, 450);
      updateGuide();
      kick();
    };
    // Desplazarse a mano (rueda, toque, teclado) detiene el recorrido guiado.
    const interrupt = (event: Event) => {
      if (!this.tour()) return;
      if (event instanceof KeyboardEvent && !['Escape', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(event.key)) return;
      if ((event.target as HTMLElement | null)?.closest?.('[data-testid="tour-controls"]')) return;
      this.zone.run(() => this.stopTour());
    };
    addEventListener('wheel', interrupt, { passive: true });
    addEventListener('touchstart', interrupt, { passive: true });
    addEventListener('keydown', interrupt);
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
      clearInterval(rewatch);
      sectionsSeen.disconnect();
      removeEventListener('wheel', interrupt);
      removeEventListener('touchstart', interrupt);
      removeEventListener('keydown', interrupt);
      document.documentElement.classList.remove('robot-guide');
      this.touched?.classList.remove('robot-touch');
      this.tourRun++;
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

/** Desplaza la página hasta `top` con una curva suave (ease-in-out), en `duration` ms. */
function animateScrollTo(top: number, duration: number): Promise<void> {
  const from = scrollY;
  const to = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(to - from) < 2) {
    scrollTo(0, to);
    return Promise.resolve();
  }
  const started = performance.now();
  return new Promise((resolve) => {
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      scrollTo(0, from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento, la elección dura lo que la página.
  }
}
