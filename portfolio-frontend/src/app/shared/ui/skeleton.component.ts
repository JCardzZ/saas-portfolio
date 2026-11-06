import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Forma de la silueta: la de lo que va a aparecer, para que la página no salte al cargar. */
export type SkeletonShape = 'studio' | 'tabs' | 'card' | 'list-card' | 'timeline' | 'code' | 'rows' | 'article';

/**
 * Silueta de carga (skeleton), como en Instagram: la forma de lo que viene, con un brillo que la
 * recorre. Todas las siluetas de la página comparten el mismo brillo (fijado a la ventana), así que
 * se ve una sola pasada. Para un lector de pantalla es un estado: anuncia `label` y nada más.
 * Con «reducir movimiento» la silueta queda quieta.
 */
@Component({
  selector: 'app-skeleton',
  template: `
    <div class="sk" [attr.data-shape]="shape()" role="status" aria-live="polite">
      <span class="sr-only">{{ label() }}</span>
      @switch (shape()) {
        @case ('studio') {
          <div aria-hidden="true">
            <span class="bone h-title w-40"></span>
            <div class="row mt-16"><span class="bone pill w-28"></span><span class="bone pill w-24"></span></div>
            <div class="row mt-12">
              <span class="bone pill w-64"></span><span class="bone pill w-20"></span><span class="bone pill w-16"></span><span class="bone pill w-20"></span>
              <span class="grow"></span><span class="bone pill w-24"></span><span class="bone pill w-32 accent"></span>
            </div>
            <div class="canvas mt-16">
              <span class="node n1"></span>
              <div class="zone">
                <div class="lane"><span class="node"></span></div>
                <div class="lane"><span class="node"></span><span class="node"></span></div>
                <div class="lane"><span class="node"></span><span class="node"></span><span class="node"></span></div>
              </div>
              <div class="lane side"><span class="node"></span><span class="node"></span><span class="node"></span></div>
            </div>
          </div>
        }
        @case ('tabs') {
          <div aria-hidden="true">
            <div class="tabs"><span class="bone tab"></span><span class="bone tab"></span><span class="bone tab"></span><span class="bone tab"></span></div>
            <div class="panel mt-16">
              <span class="bone h-line w-40"></span>
              <span class="bone line w-56 mt-8"></span>
              <div class="grid mt-16">
                @for (cell of cells; track cell) {
                  <span class="node"></span>
                }
              </div>
            </div>
          </div>
        }
        @case ('card') {
          <div aria-hidden="true">
            <span class="bone h-line w-56"></span>
            <span class="bone line mt-12"></span>
            <span class="bone line w-80 mt-8"></span>
            <div class="row mt-16"><span class="bone chip"></span><span class="bone chip"></span><span class="bone chip"></span></div>
          </div>
        }
        @case ('list-card') {
          <div aria-hidden="true">
            <span class="bone line w-32"></span>
            @for (item of items; track item) {
              <div class="row mt-12"><span class="bone dot"></span><span class="bone line w-56"></span></div>
            }
          </div>
        }
        @case ('timeline') {
          <div aria-hidden="true">
            @for (item of items; track item) {
              <div class="stop"><span class="bone dot"></span><div class="grow"><span class="bone line w-24"></span><span class="bone h-line w-56 mt-8"></span><span class="bone line w-40 mt-8"></span></div></div>
            }
          </div>
        }
        @case ('rows') {
          <div aria-hidden="true">
            @for (item of rows; track item) {
              <div class="row line-row"><span class="bone line w-24"></span><span class="bone line w-40"></span><span class="grow"></span><span class="bone line w-20"></span></div>
            }
          </div>
        }
        @case ('article') {
          <div class="article" aria-hidden="true">
            <span class="bone line w-24"></span>
            <span class="bone h-headline w-80 mt-12"></span>
            <span class="bone h-headline w-56 mt-8"></span>
            @for (item of codeLines; track item) {
              <span class="bone line mt-12" [style.width.%]="item + 16"></span>
            }
          </div>
        }
        @case ('code') {
          <div aria-hidden="true">
            <span class="bone h-line w-40"></span>
            <span class="bone line w-80 mt-8"></span>
            <div class="code mt-16">
              @for (item of codeLines; track item) {
                <span class="bone line" [style.width.%]="item"></span>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .sk { padding: 1.5rem; }
    /* Dentro de una tarjeta, el relleno ya lo pone ella. */
    :host(.bento-card) .sk { padding: 0; }
    .row { display: flex; align-items: center; gap: 0.5rem; }
    .grow { flex: 1; min-width: 0; }
    .mt-8 { margin-top: 0.5rem; } .mt-12 { margin-top: 0.75rem; } .mt-16 { margin-top: 1rem; }
    .w-16 { width: 4rem; } .w-20 { width: 5rem; } .w-24 { width: 6rem; } .w-28 { width: 7rem; } .w-32 { width: 8rem; }
    .w-40 { width: 40%; } .w-56 { width: 56%; } .w-64 { width: 16rem; } .w-80 { width: 80%; }
    /* Hueso y brillo: el brillo va fijado a la ventana, así que todas las siluetas comparten una sola pasada. */
    .bone, .node { display: block; background-color: rgb(var(--c-ink-1) / 0.06);
      background-image: linear-gradient(100deg, transparent 35%, rgb(var(--c-ink-1) / 0.08) 50%, transparent 65%);
      background-size: 100vw 100%; background-repeat: no-repeat; background-attachment: fixed; animation: skeleton-shine 1.6s ease-in-out infinite; }
    .bone { border-radius: 0.5rem; }
    .line { height: 0.75rem; }
    .h-line { height: 1.1rem; }
    .h-title { height: 1.5rem; }
    .h-headline { height: 2.25rem; }
    .line-row { padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle); }
    .article { max-width: 44rem; margin: 0 auto; padding-top: 2.5rem; }
    .pill { height: 2.25rem; border-radius: 0.75rem; flex: none; }
    .pill.accent { opacity: 0.8; }
    .chip { width: 4.5rem; height: 1.5rem; border-radius: 9999px; }
    .dot { width: 1.75rem; height: 1.75rem; border-radius: 9999px; flex: none; }
    .canvas { position: relative; display: grid; grid-template-columns: 1fr 4fr 1.2fr; gap: 1.25rem; align-items: center; min-height: 22rem; padding: 1.5rem; border-radius: 1rem; border: 1px dashed var(--border-subtle); }
    .zone { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; padding: 1.25rem; border-radius: 0.875rem; border: 1px solid var(--border-subtle); }
    .lane { display: grid; gap: 1rem; align-content: start; }
    .lane.side { align-content: center; }
    .node { height: 4.5rem; border-radius: 0.6rem; }
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
    .tab { height: 3.25rem; border-radius: 0.875rem; }
    .panel { padding: 1.25rem; border-radius: 1rem; border: 1px solid var(--border-subtle); }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .stop { display: flex; gap: 1rem; padding: 1rem 0; }
    .code { display: grid; gap: 0.6rem; padding: 1.25rem; border-radius: 0.875rem; border: 1px solid var(--border-subtle); }
    @media (max-width: 40rem) {
      .canvas { grid-template-columns: 1fr; } .zone { grid-template-columns: 1fr; } .lane.side, .n1 { display: none; }
      .tabs, .grid { grid-template-columns: repeat(2, 1fr); }
    }
    @keyframes skeleton-shine { from { background-position: -100vw 0; } to { background-position: 100vw 0; } }
    @media (prefers-reduced-motion: reduce) { .bone, .node { animation: none; background-image: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  readonly shape = input<SkeletonShape>('card');
  /** Lo que anuncia un lector de pantalla mientras carga. */
  readonly label = input('Cargando…');

  readonly cells = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly items = [0, 1, 2];
  readonly rows = [0, 1, 2, 3];
  readonly codeLines = [62, 78, 45, 70, 54, 84, 38];
}
