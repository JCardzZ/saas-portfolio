import { TestBed } from '@angular/core/testing';

import { versionBump } from '../../core/release/release';
import { VersionMarkComponent } from './version-mark.component';

describe('versionBump', () => {
  it('finds which SemVer part went up', () => {
    expect(versionBump('v1.0.0', 'v0.3.0').bump).toBe('major');
    expect(versionBump('v0.4.0', 'v0.3.0').bump).toBe('minor');
    expect(versionBump('v0.3.1', 'v0.3.0').bump).toBe('patch');
    expect(versionBump('v0.1.0', null).bump).toBeNull();
    expect(versionBump('v0.3.0', 'v0.3.0').bump).toBeNull();
  });
});

describe('VersionMarkComponent', () => {
  function render(version: string, previous: string | null): HTMLElement {
    const fixture = TestBed.createComponent(VersionMarkComponent);
    fixture.componentRef.setInput('version', version);
    fixture.componentRef.setInput('previous', previous);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('highlights the part that went up and names the bump', () => {
    const element = render('v1.0.0', 'v0.3.0');
    expect(element.textContent!.replace(/\s/g, '')).toBe('v1.0.0MAJOR');
    expect(element.querySelector('[data-bumped]')!.textContent).toBe('1');
    expect(element.getAttribute('aria-label')).toBe('v1.0.0, MAJOR');
  });

  it('shows a first version without a bump', () => {
    const element = render('v0.1.0', null);
    expect(element.querySelector('[data-testid="version-bump"]')).toBeNull();
    expect(element.querySelector('[data-bumped]')).toBeNull();
  });
});
