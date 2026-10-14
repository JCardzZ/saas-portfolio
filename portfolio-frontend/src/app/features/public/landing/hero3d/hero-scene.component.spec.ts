import { TestBed } from '@angular/core/testing';

import { HeroSceneComponent } from './hero-scene.component';

describe('HeroSceneComponent', () => {
  it('draws nothing when 3D is off, so the giant name stands alone', async () => {
    const fixture = TestBed.createComponent(HeroSceneComponent);
    fixture.componentRef.setInput('enabled', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.failed()).toBeTrue();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });
});
