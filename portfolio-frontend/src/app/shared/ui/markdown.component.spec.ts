import { TestBed } from '@angular/core/testing';

import { MarkdownComponent } from './markdown.component';

describe('MarkdownComponent', () => {
  function render(text: string): HTMLElement {
    const fixture = TestBed.createComponent(MarkdownComponent);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.markdown');
  }

  it('renders emphasis, lists, inline code and fenced code blocks', () => {
    const element = render('Usa **Redis**:\n\n- uno\n- dos\n\n`TTL` de 10 min\n\n```java\nclass Foo {}\n```');

    expect(element.querySelector('strong')?.textContent).toBe('Redis');
    expect(element.querySelectorAll('li').length).toBe(2);
    expect(element.querySelector('p code')?.textContent).toBe('TTL');
    expect(element.querySelector('pre code')?.textContent).toContain('class Foo {}');
  });

  it('opens links in a new tab without leaking the opener', () => {
    const link = render('[docs](https://example.com/docs)').querySelector('a');

    expect(link?.getAttribute('href')).toBe('https://example.com/docs');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('strips scripts, event handlers and javascript: URLs from generated content', () => {
    const element = render(
      'Hola <script>window.pwned = true</script><img src="x" onerror="window.pwned = true"> [clic](javascript:alert(1))',
    );

    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('img')?.hasAttribute('onerror')).toBeFalse();
    // Angular neutraliza la URL anteponiendo "unsafe:", que el navegador no ejecuta.
    expect(element.querySelector('a')?.getAttribute('href')).toMatch(/^unsafe:/);
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
  });
});
