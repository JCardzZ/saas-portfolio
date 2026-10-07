import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { CloudInfraComponent } from './cloud-infra.component';
import { CLOUD_NODES, CloudNode } from './cloud-topology.data';
import { PARTICLE_BUDGET, TRAFFIC_PROFILES, backupOf, computeVitals, particlesPerWire } from './live-traffic';

const twin = (id: string): CloudNode => ({ ...CLOUD_NODES.find((node) => node.id === 'api')!, id });

describe('live traffic model', () => {
  it('offers three traffic profiles, each busier, denser and faster than the previous', () => {
    expect(TRAFFIC_PROFILES.map((profile) => `${profile.name} (${profile.hint})`)).toEqual(['Bajo (noche)', 'Normal (pico)', 'Extremo (Black Friday / elecciones)']);
    for (const field of ['rps', 'p95', 'density', 'speed'] as const) {
      expect(TRAFFIC_PROFILES.map((profile) => profile[field])).toEqual([...TRAFFIC_PROFILES.map((profile) => profile[field])].sort((a, b) => a - b));
    }
  });

  it('oscillates gently around the profile and derives the hourly cost from the monthly one', () => {
    const samples = Array.from({ length: 40 }, (_, phase) => computeVitals('normal', CLOUD_NODES, {}, 138, phase));

    expect(new Set(samples.map((sample) => sample.rps)).size).toBeGreaterThan(10);
    expect(samples.every((sample) => Math.abs(sample.rps - 1450) <= 1450 * 0.08)).toBeTrue();
    expect(samples.every((sample) => sample.p95 >= 13 && sample.p95 <= 15)).toBeTrue();
    expect(samples.every((sample) => sample.status === 'ok' && sample.costPerMonth === 138 && sample.costPerHour === 0.19)).toBeTrue();
    // El coste es fijo: no cambia con el tráfico.
    expect(computeVitals('extreme', CLOUD_NODES, {}, 138, 0).costPerHour).toBe(0.19);
    expect(computeVitals('low', CLOUD_NODES, {}, 138, 0).rps).toBeLessThan(250);
  });

  it('degrades with injected faults, less when another instance can take over', () => {
    const healthy = computeVitals('normal', CLOUD_NODES, {}, 138, 0);
    const cpu = computeVitals('normal', CLOUD_NODES, { api: 'cpu' }, 138, 0);
    const down = computeVitals('normal', CLOUD_NODES, { api: 'down' }, 138, 0);
    const redundant = computeVitals('normal', [...CLOUD_NODES, twin('api-2')], { api: 'down' }, 138, 0);

    expect(cpu.status).toBe('warn');
    expect(cpu.p95).toBeGreaterThan(healthy.p95 * 2);
    expect(cpu.rps).toBe(healthy.rps);
    expect(down.status).toBe('down');
    expect(down.rps).toBeLessThan(healthy.rps * 0.7);
    expect(down.note).toBe('Servicio caído sin respaldo: se pierden peticiones');
    expect(redundant.status).toBe('warn');
    expect(redundant.rps).toBe(healthy.rps);
    expect(redundant.p95).toBeLessThan(down.p95);
  });

  it('warns about extreme traffic on a single compute instance', () => {
    expect(computeVitals('extreme', CLOUD_NODES, {}, 138, 0).note).toBe('Tráfico extremo con una sola instancia de cómputo');
    expect(computeVitals('extreme', [...CLOUD_NODES, twin('api-2')], {}, 138, 0).status).toBe('ok');
  });

  it('finds a healthy twin as backup and keeps the particle count within a budget', () => {
    const nodes = [...CLOUD_NODES, twin('api-2')];
    expect(backupOf(nodes.find((node) => node.id === 'api')!, nodes, {})!.id).toBe('api-2');
    expect(backupOf(nodes.find((node) => node.id === 'api')!, nodes, { 'api-2': 'down' })).toBeNull();
    expect(backupOf(CLOUD_NODES.find((node) => node.id === 'postgres')!, CLOUD_NODES, {})).toBeNull();

    expect([particlesPerWire('low', 8), particlesPerWire('normal', 8), particlesPerWire('extreme', 8)]).toEqual([1, 2, 3]);
    expect(particlesPerWire('extreme', 40)).toBe(1);
    expect(particlesPerWire('extreme', 200) * 200).toBe(200);
    expect(particlesPerWire('extreme', 20) * 20).toBeLessThanOrEqual(PARTICLE_BUDGET);
  });
});

describe('live command center', () => {
  beforeEach(() => {
    resetMockApi();
    localStorage.removeItem('architecture-studio-project');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });
  afterEach(() => {
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
    localStorage.removeItem('architecture-studio-project');
  });

  function studio() {
    const fixture = TestBed.createComponent(CloudInfraComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent!.includes(text))!;
    const node = (service: string) => Array.from(element.querySelectorAll<SVGGElement>('g.node')).find((candidate) => candidate.textContent!.includes(service))!;
    const select = (service: string) => {
      node(service).dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
    };
    const vitals = () => element.querySelector('app-live-vitals')!.textContent!.replace(/\s+/g, ' ');
    return { fixture, element, component: fixture.componentInstance, button, node, select, vitals };
  }
  const durations = (element: HTMLElement) =>
    Array.from(element.querySelectorAll<SVGPathElement>('path.pulse:not(.pulse-off)')).map((pulse) => parseFloat(pulse.style.animationDuration));

  it('shows live vitals that move with each beat and a cost taken from the canvas', () => {
    const { fixture, element, component, vitals } = studio();
    expect(vitals()).toContain('Métricas en vivo · simulación');
    expect(vitals()).toContain('RPS1,450 req/s');
    expect(vitals()).toContain('Latencia p95 15 ms');
    expect(vitals()).toContain('$0.19/h · $138/mes');

    // El reloj es una animación CSS: cada vuelta es un latido.
    const clock = element.querySelector('.vitals-clock')!;
    const seen = new Set<string>();
    for (let beat = 0; beat < 6; beat++) {
      clock.dispatchEvent(new Event('animationiteration'));
      fixture.detectChanges();
      seen.add(vitals());
    }
    expect(component.phase()).toBe(6);
    expect(seen.size).toBeGreaterThan(3);
    // Cada cinco latidos, una línea en el flujo de eventos con el estado.
    expect(TestBed.inject(SystemEventsService).events().at(-1)!.detail).toMatch(/req\/s · p95 \d+ ms$/);
  });

  it('coordinates particles, vitals and the trace when the traffic profile changes', () => {
    const { fixture, element, button, vitals } = studio();
    const wires = element.querySelectorAll('path.wire').length;
    expect(element.querySelector('[role="radiogroup"][aria-label="Tráfico simulado"] [aria-checked="true"]')!.textContent).toContain('Normal');
    expect(durations(element).length).toBe(wires * 2);
    const normal = Math.min(...durations(element));

    button('Extremo').click();
    fixture.detectChanges();
    expect(durations(element).length).toBe(wires * 3);
    expect(Math.min(...durations(element))).toBeLessThan(normal);
    expect(vitals()).toContain('RPS9,800 req/s');
    expect(vitals()).toContain('Tráfico extremo con una sola instancia de cómputo');
    const events = TestBed.inject(SystemEventsService).events();
    expect(events.at(-2)!.detail).toBe('Extremo (Black Friday / elecciones) · ≈ 9,800 req/s');

    button('Bajo').click();
    fixture.detectChanges();
    expect(durations(element).length).toBe(wires);
    expect(Math.min(...durations(element))).toBeGreaterThan(normal);
    expect(vitals()).toContain('RPS180 req/s');
  });

  it('takes a node down: alert state, no traffic through it, the fault and the recovery in its trace', fakeAsync(() => {
    const { fixture, element, component, button, node, select, vitals } = studio();
    tick(400);
    select('RDS PostgreSQL');
    TestBed.inject(SystemEventsService).events().length = 0;

    button('Tumbar servicio').click();
    fixture.detectChanges();
    expect(node('RDS PostgreSQL').classList).toContain('node-chaos-down');
    expect(node('RDS PostgreSQL').getAttribute('aria-label')).toContain('Estado: DOWN');
    expect(element.querySelectorAll('path.wire-down').length).toBe(1);
    expect(element.querySelectorAll('path.pulse-off').length).toBe(1);
    expect(vitals()).toContain('Servicio caído sin respaldo');
    expect(button('Tumbar servicio')).toBeUndefined();
    const inspector = TestBed.inject(TraceInspectorService);
    expect(inspector.label()).toBe('RDS PostgreSQL');
    expect(inspector.events().map((event) => event.tag)).toEqual(['Service DOWN', 'No Redundancy']);

    tick(9000);
    fixture.detectChanges();
    expect(inspector.events().map((event) => event.tag)).toEqual(['Service DOWN', 'No Redundancy', 'Recovery Test', 'Service UP']);
    expect(node('RDS PostgreSQL').classList).not.toContain('node-chaos-down');
    expect(element.querySelectorAll('path.wire-down').length).toBe(0);
    expect(component.vitals().status).toBe('ok');
    tick(5000);
  }));

  it('diverts the traffic to another instance of the same service when there is one', fakeAsync(() => {
    const { fixture, element, component, button, node, select } = studio();
    tick(400);
    component.loadPreset(component.presets().find((preset) => preset.id === 'electoral')!);
    tick(400);
    fixture.detectChanges();
    select('ECS Fargate');

    button('Tumbar servicio').click();
    fixture.detectChanges();
    // La segunda instancia asume el tráfico: se marca y su conexión lleva partículas de más.
    expect(node('ECS Fargate #2').getAttribute('aria-label')).toContain('Estado: FAILOVER');
    expect(element.querySelectorAll('path.pulse-boost').length).toBe(2);
    expect(component.vitals().status).toBe('warn');
    expect(TestBed.inject(TraceInspectorService).events().map((event) => `${event.tag}: ${event.detail}`))
      .toContain('Failover: el tráfico pasa a ECS Fargate #2');

    // Se puede restaurar a mano sin esperar.
    button('Restaurar').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('path.pulse-boost').length).toBe(0);
    expect(component.faults()).toEqual({});
    const count = TestBed.inject(SystemEventsService).events().length;
    tick(10000);
    expect(TestBed.inject(SystemEventsService).events().length).toBe(count);
  }));

  it('loads a node to 100 % CPU: its incoming traffic turns red and faster, and latency climbs', fakeAsync(() => {
    const { fixture, element, component, button, node, select } = studio();
    tick(400);
    select('ECS Fargate');
    const before = component.vitals().p95;

    button('Cargar 100 % CPU').click();
    fixture.detectChanges();
    expect(node('ECS Fargate').getAttribute('aria-label')).toContain('Estado: CPU 100 %');
    expect(element.querySelectorAll('path.wire-warn').length).toBe(1);
    const hot = Array.from(element.querySelectorAll<SVGPathElement>('path.pulse-warn')).map((pulse) => parseFloat(pulse.style.animationDuration));
    expect(hot.length).toBe(2);
    expect(Math.max(...hot)).toBeLessThan(Math.max(...durations(element)));
    expect(component.vitals().p95).toBeGreaterThan(before * 2);

    tick(9000);
    fixture.detectChanges();
    expect(element.querySelectorAll('path.pulse-warn').length).toBe(0);
    tick(5000);
  }));

  it('offers no fault injection while editing, and forgets the faults when the project changes', fakeAsync(() => {
    const { fixture, component, button, select } = studio();
    tick(400);
    select('ElastiCache');
    button('Tumbar servicio').click();
    fixture.detectChanges();
    expect(component.faults()).toEqual({ redis: 'down' });

    button('Editar arquitectura').click();
    fixture.detectChanges();
    expect(button('Restaurar ElastiCache')).toBeUndefined();
    expect(button('Tumbar servicio')).toBeUndefined();

    component.loadPreset(component.presets().find((preset) => preset.id === 'blank')!);
    tick(400);
    expect(component.faults()).toEqual({});
    tick(10000);
  }));
});
