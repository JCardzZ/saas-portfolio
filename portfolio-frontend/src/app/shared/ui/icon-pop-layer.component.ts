import { ChangeDetectionStrategy, Component, HostListener, computed, inject } from '@angular/core';

import { IconPopService, POPPED_SIZE } from './icon-pop.service';

/** Profundidades de las copias que dan grosor a la pieza (0 es la cara frontal). */
const DEPTHS = [7, 6, 5, 4, 3, 2, 1, 0];
/** Ángulos de las chispas que salen despedidas al despegar. */
const SPARKS = Array.from({ length: 14 }, (_, index) => (360 / 14) * index);

/**
 * Capa donde flota el logo desprendido de su nodo. Los iconos oficiales de AWS y Azure
 * (imágenes a varios colores) solo se amplían y flotan, porque sus guías de uso no permiten
 * girarlos ni deformarlos; el resto de efectos los rodean sin tocarlos. Para los demás logos,
 * de dentro a fuera:
 * - pieza con grosor (copias del logo a distinta profundidad) que gira en 3D;
 * - brillo holográfico que barre la cara frontal, recortado con la silueta del logo;
 * - estela: dos copias retrasadas en el tiempo que siguen el giro (el "eco" del movimiento);
 * - dos órbitas inclinadas con un punto de luz cada una;
 * - onda expansiva y chispas en el momento del despegue.
 */
@Component({
  selector: 'app-icon-pop-layer',
  standalone: true,
  template: `
    @if (pop.current(); as popped) {
      @for (current of [popped]; track current.id) {
        <div
          class="anchor"
          aria-hidden="true"
          [style.left.px]="current.x"
          [style.top.px]="current.y"
          [style.--brand]="current.icon.color"
          [style.--from]="current.fromScale"
          [style.--dx.px]="current.dx"
          [style.--dy.px]="current.dy"
          [style.--size.px]="size"
          [style.--mask]="mask()"
        >
          <div class="lift" [class.leaving]="current.leaving">
            <div class="burst"></div>
            <div class="sparks">
              @for (angle of sparks; track angle) {
                <i [style.--angle.deg]="angle" [style.animation-delay.ms]="120 + ($index % 3) * 40"></i>
              }
            </div>
            <div class="halo"></div>

            <div class="bob">
              <div class="orbit orbit-a"><span></span></div>
              <div class="orbit orbit-b"><span></span></div>

              @if (current.icon.image; as image) {
                <!-- Icono oficial a varios colores: se amplía y flota, pero no gira ni se deforma. -->
                <img class="flat" [src]="image" alt="" />
              } @else {
                @for (echo of [2, 1]; track echo) {
                  <div class="spin echo" [style.animation-delay]="'-' + echo * 0.16 + 's, ' + (1.25 - echo * 0.16) + 's'" [style.opacity]="0.34 / echo">
                    <svg class="layer" viewBox="0 0 24 24"><path [attr.d]="current.icon.path" [attr.fill]="current.icon.color" /></svg>
                  </div>
                }

                <div class="spin">
                  @for (depth of depths; track depth) {
                    <svg class="layer" [class.edge]="depth > 0" viewBox="0 0 24 24" [style.transform]="'translateZ(' + -depth * 2.5 + 'px)'">
                      <path [attr.d]="current.icon.path" [attr.fill]="current.icon.color" />
                    </svg>
                  }
                  <div class="sheen"></div>
                </div>
              }
            </div>

            <div class="shadow"></div>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .anchor {
      position: fixed;
      z-index: 48; /* sobre el modo teatro (45) y el inspector (46), bajo el chat (50) */
      width: 0;
      height: 0;
      pointer-events: none;
      perspective: 620px;
    }
    .lift {
      position: absolute;
      left: calc(var(--size) / -2);
      top: calc(var(--size) / -2);
      width: var(--size);
      height: var(--size);
      transform-style: preserve-3d;
      /* Despega desde el logo original y vuela hasta quedar centrado sobre su nodo. */
      animation: lift 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .lift.leaving {
      animation: land 0.42s cubic-bezier(0.5, 0, 0.75, 0) both;
    }
    @keyframes lift {
      from { transform: translate(0, 0) scale(var(--from)); }
      to { transform: translate(var(--dx), var(--dy)) scale(1); }
    }
    @keyframes land {
      from { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 1; }
      to { transform: translate(0, 0) scale(var(--from)); opacity: 0.3; }
    }

    /* Flotación: sube y baja suavemente mientras está en el aire. */
    .bob {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      animation: bob 3s ease-in-out 0.8s infinite;
    }
    @keyframes bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(calc(var(--size) * -0.06)); }
    }

    /* Giro: una vuelta y media al despegar y después un vaivén continuo. */
    .spin {
      position: absolute;
      inset: 0;
      transform-style: preserve-3d;
      animation: spin 1.25s cubic-bezier(0.16, 1, 0.3, 1) both, sway 3.6s ease-in-out 1.25s infinite;
    }
    @keyframes spin {
      from { transform: rotateY(-520deg) rotateX(28deg) rotateZ(-12deg); }
      to { transform: rotateY(-30deg) rotateX(10deg) rotateZ(0deg); }
    }
    @keyframes sway {
      0%, 100% { transform: rotateY(-30deg) rotateX(10deg); }
      50% { transform: rotateY(30deg) rotateX(-10deg); }
    }
    .flat {
      position: absolute;
      inset: 8%;
      width: 84%;
      filter: drop-shadow(0 14px 22px rgb(0 0 0 / 0.6));
    }
    .layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    /* Las copias traseras, oscurecidas, forman el canto de la pieza. */
    .layer.edge path {
      fill: color-mix(in srgb, var(--brand) 38%, #000);
    }
    /* Estela: copias que repiten el giro con retraso, cada vez más tenues. */
    .echo {
      filter: blur(1.5px);
    }

    /* Brillo holográfico que barre la cara, recortado con la silueta del logo. */
    .sheen {
      position: absolute;
      inset: 0;
      transform: translateZ(0.6px);
      background: linear-gradient(
        115deg,
        transparent 32%,
        rgb(var(--c-ink-1) / 0.9) 46%,
        color-mix(in srgb, var(--brand) 40%, #fff) 52%,
        transparent 66%
      );
      background-size: 280% 100%;
      -webkit-mask: var(--mask) center / contain no-repeat;
      mask: var(--mask) center / contain no-repeat;
      mix-blend-mode: screen;
      animation: sheen 2.4s ease-in-out 0.9s infinite;
    }
    @keyframes sheen {
      0% { background-position: 120% 0; }
      60%, 100% { background-position: -60% 0; }
    }

    /* Órbitas inclinadas con un punto de luz que las recorre. */
    .orbit {
      position: absolute;
      inset: -26%;
      border: 1px solid color-mix(in srgb, var(--brand) 55%, transparent);
      border-radius: 9999px;
      transform-style: preserve-3d;
      animation: orbit-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both;
    }
    .orbit span {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      animation: orbit-turn 2.6s linear infinite;
    }
    .orbit span::after {
      content: '';
      position: absolute;
      left: 50%;
      top: -4px;
      width: 8px;
      height: 8px;
      margin-left: -4px;
      border-radius: 9999px;
      background: #fff;
      box-shadow: 0 0 10px 3px var(--brand);
    }
    .orbit-a { transform: rotateX(72deg) rotateY(-14deg); }
    .orbit-b { transform: rotateX(66deg) rotateY(58deg); inset: -38%; }
    .orbit-b span { animation-duration: 3.8s; animation-direction: reverse; }
    @keyframes orbit-in {
      from { opacity: 0; scale: 0.4; }
      to { opacity: 1; scale: 1; }
    }
    @keyframes orbit-turn {
      to { transform: rotate(360deg); }
    }

    .halo {
      position: absolute;
      inset: -60%;
      border-radius: 9999px;
      background: radial-gradient(circle, color-mix(in srgb, var(--brand) 50%, transparent) 0%, transparent 62%);
      animation: halo 2.6s ease-in-out infinite;
    }
    @keyframes halo {
      0%, 100% { opacity: 0.5; transform: scale(0.9); }
      50% { opacity: 0.95; transform: scale(1.1); }
    }

    /* Onda expansiva del despegue. */
    .burst {
      position: absolute;
      inset: 0;
      border: 2px solid var(--brand);
      border-radius: 9999px;
      animation: burst 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
    }
    @keyframes burst {
      from { transform: scale(0.2); opacity: 1; }
      to { transform: scale(2.7); opacity: 0; }
    }
    .sparks {
      position: absolute;
      left: 50%;
      top: 50%;
    }
    .sparks i {
      position: absolute;
      width: 4px;
      height: 4px;
      margin: -2px;
      border-radius: 9999px;
      background: #fff;
      box-shadow: 0 0 8px 2px var(--brand);
      animation: spark 0.85s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes spark {
      from { transform: rotate(var(--angle)) translateX(calc(var(--size) * 0.2)) scale(1); opacity: 1; }
      to { transform: rotate(var(--angle)) translateX(calc(var(--size) * 1.25)) scale(0.2); opacity: 0; }
    }

    .shadow {
      position: absolute;
      left: 14%;
      right: 14%;
      top: 122%;
      height: 12%;
      border-radius: 9999px;
      background: radial-gradient(ellipse, rgb(0 0 0 / 0.8) 0%, transparent 70%);
      filter: blur(3px);
      animation: shadow 3s ease-in-out 0.8s infinite;
    }
    @keyframes shadow {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(0.86); opacity: 0.6; }
    }

    .leaving .halo,
    .leaving .shadow,
    .leaving .orbit,
    .leaving .echo,
    .leaving .sheen {
      opacity: 0 !important;
      transition: opacity 0.25s;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconPopLayerComponent {
  readonly pop = inject(IconPopService);
  readonly depths = DEPTHS;
  readonly sparks = SPARKS;
  readonly size = POPPED_SIZE;

  /** Silueta del logo como máscara CSS, para recortar con ella el brillo holográfico. */
  readonly mask = computed(() => {
    const path = this.pop.current()?.icon.path;
    if (!path) {
      return 'none';
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  });

  // El logo vuelve a su sitio al hacer clic en cualquier parte o pulsar Esc...
  @HostListener('document:click')
  onDocumentClick(): void {
    // ...salvo el mismo clic que lo hizo despegar, que llega aquí justo después.
    if (Date.now() - this.pop.lastPopAt > 60) {
      this.pop.dismiss();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.pop.dismiss();
  }

  // ...y se retira sin más si la página se mueve: flota en coordenadas de ventana y quedaría descolocado.
  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    this.pop.release();
  }
}
