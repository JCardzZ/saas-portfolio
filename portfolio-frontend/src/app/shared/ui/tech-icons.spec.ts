import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { IconPopLayerComponent } from './icon-pop-layer.component';
import { HOVER_POP_DELAY_MS, IconPopService, POPPED_SIZE } from './icon-pop.service';
import { TechIconComponent } from './tech-icon.component';
import { TECH_ICONS, techIconFor } from './tech-icons';

describe('tech icons', () => {
  it('provides a vector logo and a colour visible on black for every technology', () => {
    for (const key of ['java', 'spring', 'angular', 'postgresql', 'redis', 'gemini', 'docker', 'cloudflare', 'jwt'] as const) {
      const icon = TECH_ICONS[key];
      expect(icon.path.length).withContext(key).toBeGreaterThan(50);
      expect(icon.color).withContext(key).toMatch(/^#[0-9A-F]{6}$/i);
      expect(icon.color.toLowerCase()).withContext(key).not.toBe('#000000');
    }
  });

  it('keeps official brand colours and switches near-black brands to white', () => {
    expect(TECH_ICONS.spring.color).toBe('#6DB33F');
    expect(TECH_ICONS.redis.color).toBe('#FF4438');
    expect(TECH_ICONS.postgresql.color).toBe('#4169E1');
    expect(TECH_ICONS.jwt.color).toBe('#FFFFFF');
    expect(TECH_ICONS.angular.color).toBe('#FFFFFF');
  });

  it('uses the official artwork of each brand: a one-colour path, or the unmodified image for AWS and Azure', () => {
    expect([TECH_ICONS.gcp, TECH_ICONS.kubernetes, TECH_ICONS.terraform].every((icon) => icon.official && icon.path && !icon.image)).toBeTrue();

    expect(TECH_ICONS.aws.color).toBe('#FF9900');
    expect(TECH_ICONS.azure.color).toBe('#0089D6');
    expect(TECH_ICONS.aws.image).toBe('cloud-icons/aws/aws-cloud.svg');
    expect(TECH_ICONS.awsLambda).toEqual({
      title: 'AWS Lambda', official: true, path: '', image: 'cloud-icons/aws/lambda.svg', color: '#ED7100', family: 'aws',
    });
    expect(TECH_ICONS.azCosmosDb.image).toBe('cloud-icons/azure/cosmos-db.svg');
    expect(TECH_ICONS.azCosmosDb.family).toBe('azure');
    expect(TECH_ICONS.gcpApigee).toEqual({
      title: 'Apigee', official: true, path: '', image: 'cloud-icons/gcp/apigee.svg', color: '#4285F4', family: 'gcp',
    });

    // Todo icono es un trazado o una imagen, nunca ambos ni ninguno.
    for (const icon of Object.values(TECH_ICONS)) {
      expect(Boolean(icon.path) !== Boolean(icon.image)).withContext(icon.title).toBeTrue();
    }
  });

  it('recognises technology names as written in the CMS', () => {
    expect(techIconFor('Java 21')).toBe(TECH_ICONS.java);
    expect(techIconFor('Spring Boot 3')).toBe(TECH_ICONS.spring);
    expect(techIconFor('pgvector (RAG)')).toBe(TECH_ICONS.postgresql);
    expect(techIconFor('PostgreSQL (Neon)')).toBe(TECH_ICONS.postgresql);
    expect(techIconFor('Redis (Upstash)')).toBe(TECH_ICONS.redis);
    expect(techIconFor('Gemini AI')).toBe(TECH_ICONS.gemini);
    expect(techIconFor('JWT (JJWT)')).toBe(TECH_ICONS.jwt);
    // "JavaScript" no es Java.
    expect(techIconFor('JavaScript')).toBeNull();
    expect(techIconFor('Hexagonal Architecture')).toBeNull();
    expect(techIconFor(undefined)).toBeNull();
  });
});

describe('icon pop-out', () => {
  function setup() {
    const icon = TestBed.createComponent(TechIconComponent);
    icon.componentRef.setInput('icon', TECH_ICONS.redis);
    icon.componentRef.setInput('size', 24);
    const layer = TestBed.createComponent(IconPopLayerComponent);
    // Al crear un componente de prueba, Angular retira del documento los anteriores:
    // se añaden los dos a mano una vez creados ambos.
    document.body.append(icon.nativeElement, layer.nativeElement);
    icon.detectChanges();
    layer.detectChanges();
    return { icon, layer, host: icon.nativeElement as HTMLElement, pop: TestBed.inject(IconPopService) };
  }

  function cleanup(fixtures: { nativeElement: HTMLElement; destroy(): void }[]): void {
    TestBed.inject(IconPopService).release();
    fixtures.forEach((fixture) => {
      fixture.destroy();
      fixture.nativeElement.remove();
    });
  }

  it('draws the logo inline in its brand colour', () => {
    const { icon, layer, host } = setup();

    expect(host.querySelector('svg path')?.getAttribute('fill')).toBe('#FF4438');
    expect(host.style.getPropertyValue('--brand')).toBe('#FF4438');
    cleanup([icon, layer]);
  });

  it('detaches the clicked logo and floats a large layered copy starting from its position', () => {
    const { icon, layer, host, pop } = setup();
    const rect = host.getBoundingClientRect();

    host.click();
    layer.detectChanges();

    const popped = pop.current()!;
    expect(popped.icon).toBe(TECH_ICONS.redis);
    expect(popped.x).toBeCloseTo(rect.left + rect.width / 2, 0);
    expect(popped.fromScale).toBeCloseTo(24 / POPPED_SIZE, 2);
    expect(host.classList).toContain('icon-detached');

    const floating = layer.nativeElement.querySelector('.anchor') as HTMLElement;
    expect(floating.style.getPropertyValue('--size')).toBe(POPPED_SIZE + 'px');
    // Varias copias a distinta profundidad le dan grosor al girar.
    expect(floating.querySelectorAll('svg.layer').length).toBeGreaterThan(4);
    expect(floating.querySelectorAll('.spin:not(.echo) svg.layer:not(.edge)').length).toBe(1);
    // Estela, órbitas, brillo y chispas acompañan a la pieza.
    expect(floating.querySelectorAll('.spin.echo').length).toBe(2);
    expect(floating.querySelectorAll('.orbit').length).toBe(2);
    expect(floating.querySelector('.sheen')).not.toBeNull();
    expect(floating.style.getPropertyValue('--mask')).toContain('data:image/svg+xml');
    expect(floating.querySelectorAll('.sparks i').length).toBe(14);
    cleanup([icon, layer]);
  });

  it('flies to the centre of its node when one is given, instead of staying beside the label', () => {
    const { icon, layer, host, pop } = setup();
    const node = document.createElement('div');
    node.style.cssText = 'position:fixed;left:300px;top:400px;width:200px;height:60px';
    document.body.appendChild(node);
    const logo = host.getBoundingClientRect();

    pop.pop(TECH_ICONS.redis, host, true, node);

    const popped = pop.current()!;
    // Centro horizontal del nodo (300 + 200 / 2) y por encima de su borde superior (400).
    expect(popped.x + popped.dx).toBeCloseTo(400, 0);
    expect(popped.y + popped.dy).toBeLessThan(400);
    expect(popped.x).toBeCloseTo(logo.left + logo.width / 2, 0);
    node.remove();
    cleanup([icon, layer]);
  });

  it('pops out by itself when the cursor rests on the logo and returns when it leaves', fakeAsync(() => {
    const { icon, layer, host, pop } = setup();

    host.dispatchEvent(new MouseEvent('mouseenter'));
    tick(HOVER_POP_DELAY_MS - 1);
    expect(pop.current()).toBeNull();
    tick(1);
    expect(pop.current()?.icon).toBe(TECH_ICONS.redis);

    // Mientras el cursor siga encima no vuelve solo, por mucho que pase el tiempo.
    tick(10_000);
    expect(pop.current()?.leaving).toBeFalse();

    host.dispatchEvent(new MouseEvent('mouseleave'));
    expect(pop.current()?.leaving).toBeTrue();
    tick(420);
    expect(pop.current()).toBeNull();
    expect(host.classList).not.toContain('icon-detached');
    cleanup([icon, layer]);
  }));

  it('does not pop logos the cursor merely crosses', fakeAsync(() => {
    const { icon, layer, host, pop } = setup();

    host.dispatchEvent(new MouseEvent('mouseenter'));
    tick(HOVER_POP_DELAY_MS - 30);
    host.dispatchEvent(new MouseEvent('mouseleave'));
    tick(500);

    expect(pop.current()).toBeNull();
    cleanup([icon, layer]);
  }));

  it('returns the logo to its place on a later click or Escape, but not on the click that popped it', fakeAsync(() => {
    const { icon, layer, host, pop } = setup();

    host.click();
    expect(pop.current()?.leaving).toBeFalse();

    tick(100);
    document.body.click();
    expect(pop.current()?.leaving).toBeTrue();
    tick(420);
    expect(pop.current()).toBeNull();
    expect(host.classList).not.toContain('icon-detached');

    host.click();
    tick(100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick(420);
    expect(pop.current()).toBeNull();
    cleanup([icon, layer]);
  }));

  it('lands by itself after a few seconds and lets another logo take over at once', fakeAsync(() => {
    const { icon, layer, host, pop } = setup();
    const other = document.createElement('span');
    other.style.cssText = 'display:inline-block;width:20px;height:20px';
    document.body.appendChild(other);

    host.click();
    pop.pop(TECH_ICONS.spring, other);
    expect(pop.current()?.icon).toBe(TECH_ICONS.spring);
    expect(host.classList).not.toContain('icon-detached');
    expect(other.classList).toContain('icon-detached');

    tick(4500 + 420);
    expect(pop.current()).toBeNull();
    expect(other.classList).not.toContain('icon-detached');
    other.remove();
    cleanup([icon, layer]);
  }));
});
