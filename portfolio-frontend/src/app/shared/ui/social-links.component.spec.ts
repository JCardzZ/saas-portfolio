import { TestBed } from '@angular/core/testing';

import { PROFILE_LINKS, SocialLinksComponent } from './social-links.component';

describe('SocialLinksComponent', () => {
  it('links to the GitHub and LinkedIn profiles in a new tab, with an accessible name', () => {
    const fixture = TestBed.createComponent(SocialLinksComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const github = element.querySelector<HTMLAnchorElement>('[data-testid="social-github"]')!;
    const linkedin = element.querySelector<HTMLAnchorElement>('[data-testid="social-linkedin"]')!;

    expect(github.href).toBe(PROFILE_LINKS.github);
    expect(linkedin.href).toBe(PROFILE_LINKS.linkedin);
    for (const link of [github, linkedin]) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
      expect(link.getAttribute('aria-label')).toBeTruthy();
    }
    // Sin el archivo oficial de LinkedIn no se pinta su logo: símbolo propio y el nombre en texto.
    expect(linkedin.querySelector('img')).toBeNull();
    expect(linkedin.textContent).toContain('LinkedIn');
  });
});
