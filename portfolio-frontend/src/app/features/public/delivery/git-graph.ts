/**
 * Disposición del grafo de commits en carriles, como el log de un IDE: cada commit va en su fila y
 * en un carril; las ramas que siguen abiertas corren en paralelo y se unen a main en su merge.
 * Función pura: recibe el historial (del más reciente al más antiguo) y devuelve, por fila, los
 * tramos que hay que dibujar en su mitad superior y en la inferior.
 */
export interface GraphCommit {
  sha: string;
  parents: string[];
}

/** Un tramo de una fila: de un carril a otro (o al mismo, si sigue recto). */
export interface LaneSegment {
  from: number;
  to: number;
  /** Carril que da el color: el de la rama que recorre el tramo. */
  colorLane: number;
}

export interface GraphRow<T extends GraphCommit = GraphCommit> {
  commit: T;
  /** Carril del commit (columna del punto). */
  lane: number;
  /** De arriba al punto (o seguidos hasta la mitad). */
  top: LaneSegment[];
  /** Del punto (o de la mitad) hacia abajo. */
  bottom: LaneSegment[];
  /** Es un merge: tiene dos padres. */
  merge: boolean;
}

export interface GraphLayout<T extends GraphCommit = GraphCommit> {
  rows: GraphRow<T>[];
  /** Carriles que llegan a usarse a la vez (ancho del grafo). */
  width: number;
}

/** Más carriles a la vez no caben con legibilidad: los que sobran se pliegan en el último. */
export const MAX_LANES = 8;

export function layoutGraph<T extends GraphCommit>(commits: readonly T[]): GraphLayout<T> {
  // Qué commit espera cada carril (el siguiente que aparecerá en él); null = libre.
  let lanes: (string | null)[] = [];
  const rows: GraphRow<T>[] = [];
  let width = 1;
  const firstFree = (exclude = -1): number => {
    const index = lanes.findIndex((value, i) => value === null && i !== exclude);
    return index >= 0 ? index : Math.min(lanes.length, MAX_LANES - 1);
  };

  for (const commit of commits) {
    let lane = lanes.indexOf(commit.sha);
    if (lane < 0) {
      // Punta de una rama que no venía de arriba: ocupa un carril libre.
      lane = firstFree();
      lanes[lane] = commit.sha;
    }
    const before = lanes.slice();

    // Mitad superior: lo que llega a este commit converge en su punto; lo demás sigue recto.
    const top: LaneSegment[] = [];
    before.forEach((value, i) => {
      if (value === null) return;
      top.push(value === commit.sha ? { from: i, to: lane, colorLane: i } : { from: i, to: i, colorLane: i });
    });

    // Los carriles que esperaban este commit quedan libres; el suyo pasa a esperar al primer padre.
    before.forEach((value, i) => {
      if (value === commit.sha) lanes[i] = null;
    });
    const bottom: LaneSegment[] = [];
    const [first, ...others] = commit.parents.slice(0, 2);
    if (first) {
      const existing = lanes.indexOf(first);
      if (existing >= 0) {
        // El primer padre ya lo espera otro carril: esta rama se une a ese.
        bottom.push({ from: lane, to: existing, colorLane: lane });
      } else {
        lanes[lane] = first;
        bottom.push({ from: lane, to: lane, colorLane: lane });
      }
    }
    for (const parent of others) {
      let target = lanes.indexOf(parent);
      if (target < 0) {
        target = firstFree(lane);
        lanes[target] = parent;
      }
      bottom.push({ from: lane, to: target, colorLane: target });
    }
    // Los demás carriles abiertos siguen recto por la mitad inferior.
    lanes.forEach((value, i) => {
      if (value !== null && before[i] === value && value !== commit.sha && !bottom.some((segment) => segment.from === i && segment.to === i)) {
        bottom.push({ from: i, to: i, colorLane: i });
      }
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    lanes = lanes.slice(0, MAX_LANES);
    width = Math.max(width, lanes.length, lane + 1);
    rows.push({ commit, lane, top, bottom, merge: commit.parents.length > 1 });
  }
  return { rows, width: Math.min(width, MAX_LANES) };
}

/** «Merge pull request #57 from JCardzZ/feat/merge-history» → { number: 57, branch: 'feat/merge-history' }. */
export function pullRequestOf(subject: string): { number: number; branch: string } | null {
  const match = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject);
  return match ? { number: Number(match[1]), branch: match[2] } : null;
}
