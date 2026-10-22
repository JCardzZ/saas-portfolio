import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SystemEventsService } from '../data/system-events.service';
import { TelemetryStatus, TelemetryStreamService } from '../data/telemetry-stream.service';
import { EventConsoleComponent } from './event-console.component';

describe('EventConsoleComponent', () => {
  const status = signal<TelemetryStatus>('simulated');
  const telemetry = {
    status: status.asReadonly(),
    acquire: jasmine.createSpy('acquire'),
    release: jasmine.createSpy('release'),
  };

  beforeEach(() => {
    status.set('simulated');
    telemetry.acquire.calls.reset();
    telemetry.release.calls.reset();
    TestBed.configureTestingModule({ providers: [{ provide: TelemetryStreamService, useValue: telemetry }] });
  });

  it('opens the telemetry stream on start and closes it, with its timer, when destroyed', fakeAsync(() => {
    const fixture = TestBed.createComponent(EventConsoleComponent);
    fixture.detectChanges();
    expect(telemetry.acquire).toHaveBeenCalledTimes(1);
    expect(telemetry.release).not.toHaveBeenCalled();

    fixture.destroy();
    expect(telemetry.release).toHaveBeenCalledTimes(1);

    // Sin temporizadores vivos: fakeAsync fallaría si el intervalo siguiera activo.
    const count = TestBed.inject(SystemEventsService).events().length;
    tick(10_000);
    expect(TestBed.inject(SystemEventsService).events().length).toBe(count);
  }));

  it('generates simulated activity only while the real stream is not live', fakeAsync(() => {
    const fixture = TestBed.createComponent(EventConsoleComponent);
    fixture.detectChanges();
    const events = TestBed.inject(SystemEventsService);
    const initial = events.events().length;

    tick(1700);
    expect(events.events().length).toBe(initial + 1);

    status.set('live');
    tick(1700 * 3);
    expect(events.events().length).toBe(initial + 1);

    fixture.destroy();
  }));
});
