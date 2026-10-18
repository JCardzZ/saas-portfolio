import { layoutGraph, pullRequestOf } from './git-graph';

describe('git graph layout', () => {
  // m3 = merge(m2, b2); b2 → b1 → m1; m2 → m1. Del más reciente al más antiguo.
  const history = [
    { sha: 'm3', parents: ['m2', 'b2'] },
    { sha: 'b2', parents: ['b1'] },
    { sha: 'm2', parents: ['m1'] },
    { sha: 'b1', parents: ['m1'] },
    { sha: 'm1', parents: [] },
  ];

  it('puts main in the first lane and the merged branch in a lane of its own', () => {
    const { rows, width } = layoutGraph(history);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 1, 0]);
    expect(width).toBe(2);
    expect(rows[0].merge).toBeTrue();
    // El merge abre la rama hacia su carril por abajo.
    expect(rows[0].bottom).toContain(jasmine.objectContaining({ from: 0, to: 1 }));
  });

  it('runs the open branch straight past main commits and joins it back at the fork point', () => {
    const { rows } = layoutGraph(history);
    // En la fila de m2 la rama (carril 1) sigue recta arriba y abajo.
    expect(rows[2].top).toContain(jasmine.objectContaining({ from: 1, to: 1 }));
    expect(rows[2].bottom).toContain(jasmine.objectContaining({ from: 1, to: 1 }));
    // b1 vuelve a main: su primer padre (m1) ya lo espera el carril 0.
    expect(rows[3].bottom).toEqual([jasmine.objectContaining({ from: 1, to: 0 }), jasmine.objectContaining({ from: 0, to: 0 })]);
    // m1 recibe los dos carriles.
    expect(rows[4].top.map((segment) => segment.to)).toEqual([0]);
  });

  it('reads the PR number and branch from a GitHub merge message', () => {
    expect(pullRequestOf('Merge pull request #57 from JCardzZ/feat/merge-history')).toEqual({ number: 57, branch: 'feat/merge-history' });
    expect(pullRequestOf('feat: algo')).toBeNull();
  });
});
