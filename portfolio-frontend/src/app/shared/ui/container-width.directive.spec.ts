import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ContainerWidthDirective } from './container-width.directive';

@Component({
  standalone: true,
  imports: [ContainerWidthDirective],
  template: `<div appContainerWidth style="width: 300px; padding: 0"></div>`,
})
class HostComponent {
  readonly box = viewChild.required(ContainerWidthDirective);
}

describe('ContainerWidthDirective', () => {
  function create() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }

  it('measures its own element, not the window', () => {
    ContainerWidthDirective.fixedWidth = null;
    const fixture = create();

    expect(fixture.componentInstance.box().width()).toBe(300);
    expect(fixture.componentInstance.box().narrowerThan(600)).toBeTrue();
    expect(fixture.componentInstance.box().narrowerThan(300)).toBeFalse();
    fixture.nativeElement.remove();
  });

  it('uses the fixed width when a test sets one', () => {
    ContainerWidthDirective.fixedWidth = 1280;
    const fixture = create();

    expect(fixture.componentInstance.box().width()).toBe(1280);
    expect(fixture.componentInstance.box().narrowerThan(720)).toBeFalse();
    fixture.nativeElement.remove();
  });
});
