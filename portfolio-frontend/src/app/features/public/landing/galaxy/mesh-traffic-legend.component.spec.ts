import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeshTrafficService } from '../../data/mesh-traffic.service';
import { SystemEventsService } from '../../data/system-events.service';
import { TraceInspectorService } from '../../data/trace-inspector.service';
import { MeshTrafficLegendComponent } from './mesh-traffic-legend.component';

describe('MeshTrafficLegendComponent', () => {
  let fixture: ComponentFixture<MeshTrafficLegendComponent>;
  let traffic: MeshTrafficService;
  const legend = () => fixture.nativeElement.querySelector('[data-testid="mesh-traffic-legend"]') as HTMLElement | null;

  beforeEach(() => {
    fixture = TestBed.createComponent(MeshTrafficLegendComponent);
    traffic = TestBed.inject(MeshTrafficService);
    fixture.detectChanges();
  });

  it('only shows while the mesh is being drawn', () => {
    expect(legend()).toBeNull();
    traffic.rendering.set(true);
    fixture.detectChanges();
    expect(legend()).not.toBeNull();
  });

  it('says simulated until a real event arrives, and then counts only the real ones', () => {
    traffic.rendering.set(true);
    traffic.count(false);
    traffic.count(false);
    fixture.detectChanges();
    expect(legend()!.textContent).toContain('Tráfico simulado · 2 eventos');
    expect(legend()!.textContent).toContain('simulados en tu navegador');

    traffic.count(true);
    fixture.detectChanges();
    expect(legend()!.textContent).toContain('Tráfico real · 1 evento');
    expect(legend()!.textContent).toContain('evento real del backend');
  });

  it('opens the inspector on every event, the same ones that move the mesh', () => {
    const events = TestBed.inject(SystemEventsService);
    const inspector = TestBed.inject(TraceInspectorService);
    events.emit('cache', 'CACHE_HIT', 'portfolio:projects:all');
    events.emit('auth', 'JWT_VERIFIED', 'ROLE_ADMIN');
    traffic.rendering.set(true);
    fixture.detectChanges();

    legend()!.querySelector('button')!.click();
    expect(inspector.selected()).toBe('traffic');
    expect(inspector.events().map((event) => event.tag)).toEqual(['CACHE_HIT', 'JWT_VERIFIED']);
  });
});
