import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input } from '@angular/core';

import { IconPopService } from './icon-pop.service';
import { TechIcon } from './tech-icons';

/**
 * Logo de una tecnología como SVG en línea. Expone el color de marca en `--brand`, que usa
 * el resplandor `.brand-glow`. Al posar el cursor o pulsarlo se desprende y flota en 3D (IconPopService).
 * Es decorativo: el nombre va siempre al lado.
 */
@Component({
  selector: 'app-tech-icon',
  standalone: true,
  host: { class: 'inline-flex shrink-0', '[style.--brand]': 'icon().color' },
  template: `
    @if (icon().image; as image) {
      <img [src]="image" [attr.width]="size()" [attr.height]="size()" alt="" draggable="false" />
    } @else {
      <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
        <path [attr.d]="icon().path" [attr.fill]="icon().color" />
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TechIconComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly iconPop = inject(IconPopService);

  readonly icon = input.required<TechIcon>();
  readonly size = input(20);

  @HostListener('click')
  pop(): void {
    this.iconPop.pop(this.icon(), this.host);
  }

  // Con ratón basta posar el cursor: el logo despega solo y vuelve al salir.
  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.iconPop.hoverEnter(this.icon(), this.host);
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.iconPop.hoverLeave(this.host);
  }
}
