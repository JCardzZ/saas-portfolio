import { TestBed } from '@angular/core/testing';

import { BackToTopComponent } from './back-to-top.component';

describe('BackToTopComponent', () => {
  it('stays hidden and out of the tab order until the page is scrolled, and goes back to the top', () => {
    const fixture = TestBed.createComponent(BackToTopComponent);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="back-to-top"]');

    expect(button.classList).not.toContain('shown');
    expect(button.getAttribute('tabindex')).toBe('-1');
    expect(button.getAttribute('aria-label')).toBeTruthy();

    fixture.componentInstance.shown.set(true);
    fixture.componentInstance.progress.set(0.5);
    fixture.detectChanges();
    expect(button.classList).toContain('shown');
    expect(button.getAttribute('tabindex')).toBe('0');
    const bar = button.querySelector<SVGCircleElement>('.bar')!;
    expect(Number(bar.getAttribute('stroke-dashoffset'))).toBeCloseTo(fixture.componentInstance.ringLength / 2, 1);

    const scroll = spyOn(window, 'scrollTo');
    button.click();
    expect(scroll).toHaveBeenCalled();
  });
});
