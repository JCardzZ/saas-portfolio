import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PortalDirective } from './portal.directive';

@Component({
  standalone: true,
  imports: [PortalDirective],
  template: `<section>@if (open()) { <div appPortal data-testid="sheet">{{ text() }}</div> }</section>`,
})
class HostComponent {
  readonly open = signal(true);
  readonly text = signal('uno');
}

describe('PortalDirective', () => {
  it('moves its element to the end of the body, keeps it bound and removes it when destroyed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const sheet = document.querySelector<HTMLElement>('[data-testid="sheet"]')!;

    expect(sheet.parentElement).toBe(document.body);
    expect(fixture.nativeElement.querySelector('[data-testid="sheet"]')).toBeNull();

    fixture.componentInstance.text.set('dos');
    fixture.detectChanges();
    expect(sheet.textContent).toBe('dos');

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(document.querySelector('[data-testid="sheet"]')).toBeNull();
  });
});
