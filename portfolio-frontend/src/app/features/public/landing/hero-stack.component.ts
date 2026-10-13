import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Una capa de la plataforma: lo que corre en ella, de arriba (lo que ve el visitante) abajo. */
export interface HeroLayer {
  id: string;
  label: string;
  pieces: string[];
}

/** La arquitectura real de este sitio, no una ilustración genérica (docs/DESIGN.md: nada inventado). */
export const HERO_LAYERS: readonly HeroLayer[] = [
  { id: 'client', label: 'Cliente', pieces: ['Angular'] },
  { id: 'api', label: 'API', pieces: ['Spring Boot'] },
  { id: 'data', label: 'Datos', pieces: ['PostgreSQL', 'Redis'] },
];

/**
 * Hero en 3D: las capas de la plataforma como losas isométricas que giran despacio, con pulsos que
 * bajan de una a otra y un cubo luminoso encima. Es CSS 3D puro (sin WebGL ni librerías), así que no
 * pesa en el arranque y sigue al tema. Es decorativo: lo mismo se lee en texto debajo. Con
 * `prefers-reduced-motion` queda quieto (regla global de styles.css).
 */
@Component({
  selector: 'app-hero-stack',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="flex flex-col items-center" data-testid="hero-stack">
      <div class="stage" aria-hidden="true">
        <div class="scene">
          @for (layer of layers; track layer.id; let index = $index) {
            <div class="slab" [style.--z]="index">
              <div class="face top">
                <span class="tag">{{ layer.label }}</span>
                <span class="pieces">
                  @for (piece of layer.pieces; track piece) {
                    <span class="piece">{{ piece }}</span>
                  }
                </span>
              </div>
              <div class="face front"></div>
              <div class="face side"></div>
            </div>
          }
          <!-- Tráfico: un pulso baja por el eje, de capa en capa. -->
          <span class="pulse"></span>
          <span class="pulse pulse-late"></span>
          <div class="cube">
            <span class="cf c1"></span><span class="cf c2"></span><span class="cf c3"></span>
            <span class="cf c4"></span><span class="cf c5"></span><span class="cf c6"></span>
          </div>
        </div>
      </div>
      <figcaption class="mt-2 font-mono text-mono-sm text-ink-3">
        @for (layer of layers; track layer.id; let last = $last) {
          {{ layer.pieces.join(' · ') }}@if (!last) { <span aria-hidden="true"> → </span> }
        }
      </figcaption>
    </figure>
  `,
  styles: `
    /* Medidas en una unidad: más pequeña en móvil para que el conjunto girado quepa a 320 px. */
    .stage {
      --u: 0.72rem;
      --w: calc(var(--u) * 15);
      --gap: calc(var(--u) * 6.4);
      --thick: calc(var(--u) * 0.9);
      position: relative;
      width: calc(var(--w) * 1.62);
      height: calc(var(--w) * 2.05);
      max-width: 100%;
      perspective: 1400px;
      overflow: hidden;
    }
    @media (min-width: 640px) {
      .stage { --u: 0.9rem; }
    }
    .scene {
      position: absolute;
      left: 50%;
      top: 63%;
      width: var(--w);
      height: var(--w);
      margin: calc(var(--w) / -2) 0 0 calc(var(--w) / -2);
      transform-style: preserve-3d;
      transform: rotateX(58deg) rotateZ(-38deg);
      animation: spin 36s linear infinite;
    }
    .slab {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      /* La primera capa (el cliente) arriba del todo. */
      transform: translateZ(calc((2 - var(--z)) * var(--gap)));
    }
    .face { position: absolute; }
    .top {
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: calc(var(--u) * 1.1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-panel);
      background:
        linear-gradient(var(--border-subtle) 1px, transparent 1px) 0 0 / calc(var(--u) * 1.6) calc(var(--u) * 1.6),
        linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px) 0 0 / calc(var(--u) * 1.6) calc(var(--u) * 1.6),
        var(--bg-surface-2);
      transform: translateZ(var(--thick));
      box-shadow: 0 0 0 1px rgb(var(--c-accent-text) / 0.06);
    }
    .front, .side { background: var(--bg-surface-3); border: 1px solid var(--border-strong); }
    .front {
      left: 0; right: 0; bottom: 0;
      height: var(--thick);
      transform-origin: bottom;
      transform: rotateX(-90deg) translateY(var(--thick));
    }
    .side {
      top: 0; bottom: 0; right: 0;
      width: var(--thick);
      transform-origin: right;
      transform: rotateY(90deg) translateX(var(--thick));
    }
    .tag {
      font: 600 12px/16px var(--font-mono);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent-text);
    }
    .pieces { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 0.5); }
    .piece {
      padding: 2px 8px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-mark);
      background: var(--bg-surface-1);
      font: 500 12px/18px var(--font-sans);
      color: var(--text-1);
    }
    .pulse {
      position: absolute;
      left: 50%; top: 50%;
      width: calc(var(--u) * 0.7); height: calc(var(--u) * 0.7);
      margin: calc(var(--u) * -0.35);
      border-radius: 9999px;
      background: var(--accent-solid);
      box-shadow: 0 0 calc(var(--u) * 1.4) var(--accent-solid);
      animation: fall 3.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }
    .pulse-late { animation-delay: -1.6s; }
    .cube {
      --s: calc(var(--u) * 2.6);
      position: absolute;
      left: 50%; top: 50%;
      width: var(--s); height: var(--s);
      margin: calc(var(--s) / -2);
      transform-style: preserve-3d;
      animation: hover 6s ease-in-out infinite;
    }
    .cf {
      position: absolute; inset: 0;
      border: 1px solid var(--accent-solid);
      background: rgb(var(--c-accent-solid) / 0.18);
      box-shadow: 0 0 calc(var(--u) * 1.6) rgb(var(--c-accent-solid) / 0.45);
    }
    .c1 { transform: translateZ(calc(var(--s) / 2)); }
    .c2 { transform: rotateY(180deg) translateZ(calc(var(--s) / 2)); }
    .c3 { transform: rotateY(90deg) translateZ(calc(var(--s) / 2)); }
    .c4 { transform: rotateY(-90deg) translateZ(calc(var(--s) / 2)); }
    .c5 { transform: rotateX(90deg) translateZ(calc(var(--s) / 2)); }
    .c6 { transform: rotateX(-90deg) translateZ(calc(var(--s) / 2)); }
    @keyframes spin {
      from { transform: rotateX(58deg) rotateZ(-38deg); }
      to { transform: rotateX(58deg) rotateZ(322deg); }
    }
    @keyframes fall {
      0% { transform: translateZ(calc(var(--gap) * 2 + var(--thick) * 3)); opacity: 0; }
      12% { opacity: 1; }
      88% { opacity: 1; }
      100% { transform: translateZ(var(--thick)); opacity: 0; }
    }
    @keyframes hover {
      0%, 100% { transform: translateZ(calc(var(--gap) * 2.75)) rotateX(20deg) rotateY(0deg); }
      50% { transform: translateZ(calc(var(--gap) * 2.95)) rotateX(20deg) rotateY(180deg); }
    }
  `,
})
export class HeroStackComponent {
  readonly layers = HERO_LAYERS;
}
