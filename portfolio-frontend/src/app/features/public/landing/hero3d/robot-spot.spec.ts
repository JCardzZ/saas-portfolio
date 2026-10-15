import { parseSpot } from './hero-scene.component';

describe('parseSpot (where the visitor left the robot)', () => {
  it('accepts two fractions between 0 and 1', () => {
    expect(parseSpot('{"fx":0.34,"fy":0.52}')).toEqual({ fx: 0.34, fy: 0.52 });
    expect(parseSpot('{"fx":0,"fy":1}')).toEqual({ fx: 0, fy: 1 });
  });

  it('ignores anything else, so a tampered value never moves the robot off screen', () => {
    for (const raw of [null, '', 'nope', '[]', '{"fx":2,"fy":0.5}', '{"fx":-0.1,"fy":0.5}', '{"fx":"0.5","fy":0.5}', '{"fx":0.5}', '{"fx":null,"fy":0.2}']) {
      expect(parseSpot(raw)).withContext(String(raw)).toBeNull();
    }
  });
});
