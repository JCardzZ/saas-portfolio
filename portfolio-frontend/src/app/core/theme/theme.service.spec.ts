import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('follows the system by default and sets nothing on the page', () => {
    const theme = TestBed.inject(ThemeService);

    expect(theme.choice()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
  });

  it('cycles system → light → dark → system, remembering a fixed choice', () => {
    const theme = TestBed.inject(ThemeService);

    theme.next();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(theme.effective()).toBe('light');

    theme.next();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(theme.effective()).toBe('dark');

    theme.next();
    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('restores a stored choice and ignores anything else', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(TestBed.inject(ThemeService).choice()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    TestBed.resetTestingModule();
    localStorage.setItem(THEME_STORAGE_KEY, 'rosa');
    expect(TestBed.inject(ThemeService).choice()).toBe('system');
  });
});
