import { CloudNode } from './cloud-topology.data';

export type TrafficMode = 'low' | 'normal' | 'extreme';
export type FaultKind = 'down' | 'cpu';
export type Faults = Record<string, FaultKind>;

export interface TrafficProfile {
  id: TrafficMode;
  name: string;
  hint: string;
  /** Peticiones por segundo alrededor de las que oscila el contador. */
  rps: number;
  /** Latencia p95 en ms con el sistema sano. */
  p95: number;
  /** Partículas por conexión y velocidad a la que la recorren (1 = la normal). */
  density: number;
  speed: number;
}

/**
 * Perfiles de tráfico del simulador. Las cifras son de ejemplo, para que el lienzo reaccione de
 * forma coherente: no son mediciones de ninguna plataforma.
 */
export const TRAFFIC_PROFILES: TrafficProfile[] = [
  { id: 'low', name: 'Bajo', hint: 'noche', rps: 180, p95: 9, density: 1, speed: 0.6 },
  { id: 'normal', name: 'Normal', hint: 'pico', rps: 1450, p95: 14, density: 2, speed: 1 },
  { id: 'extreme', name: 'Extremo', hint: 'Black Friday / elecciones', rps: 9800, p95: 38, density: 3, speed: 1.9 },
];

/** Como mucho estas partículas en todo el lienzo: por encima, se baja la densidad para no cargar el navegador. */
export const PARTICLE_BUDGET = 60;
/** Tiempo que tarda en recuperarse solo un servicio al que se le ha inyectado un fallo. */
export const FAULT_RECOVERY_MS = 9000;
const HOURS_PER_MONTH = 730;
const COMPUTE_TYPES = ['containers', 'kubernetes', 'vm', 'app-platform'];

export interface Vitals {
  rps: number;
  p95: number;
  costPerHour: number;
  costPerMonth: number;
  status: 'ok' | 'warn' | 'down';
  /** Qué explica el estado, en una frase. */
  note: string;
}

export function profileOf(mode: TrafficMode): TrafficProfile {
  return TRAFFIC_PROFILES.find((profile) => profile.id === mode)!;
}

/** Otra instancia sana del mismo servicio, que puede asumir el tráfico de la que ha caído. */
export function backupOf(node: CloudNode, nodes: CloudNode[], faults: Faults): CloudNode | null {
  return nodes.find((candidate) => candidate.id !== node.id && candidate.type === node.type && faults[candidate.id] !== 'down') ?? null;
}

/** Partículas por conexión con este perfil, sin pasarse del presupuesto del lienzo. */
export function particlesPerWire(mode: TrafficMode, wires: number): number {
  const density = profileOf(mode).density;
  return wires === 0 ? density : Math.max(1, Math.min(density, Math.floor(PARTICLE_BUDGET / wires)));
}

/**
 * Constantes vitales SIMULADAS del sistema: oscilan suavemente alrededor del perfil de tráfico y
 * empeoran con los fallos inyectados. El coste sí sale del lienzo: es el mensual orientativo de
 * FinOps, y por hora, ese mismo repartido en 730 horas. Es coste fijo: no cambia con el tráfico.
 *
 * @param phase avanza una unidad en cada latido del reloj del widget
 */
export function computeVitals(mode: TrafficMode, nodes: CloudNode[], faults: Faults, monthlyCost: number, phase: number): Vitals {
  const profile = profileOf(mode);
  const wobble = 0.05 * Math.sin(phase * 0.9) + 0.02 * Math.sin(phase * 2.3);
  let latency = profile.p95 * (1 + 0.06 * Math.sin(phase * 0.7 + 1));
  let served = 1;
  let status: Vitals['status'] = 'ok';
  let note = 'Sistema estable';

  const affected = nodes.filter((node) => faults[node.id]);
  for (const node of affected) {
    if (faults[node.id] === 'cpu') {
      latency *= 2.6;
      status = status === 'down' ? status : 'warn';
      note = 'Un servicio al 100 % de CPU: sube la latencia';
    } else if (backupOf(node, nodes, faults)) {
      latency *= 1.25;
      status = status === 'down' ? status : 'warn';
      note = 'Servicio caído: su réplica asume el tráfico';
    } else {
      latency *= 3.5;
      served = Math.min(served, 0.62);
      status = 'down';
      note = 'Servicio caído sin respaldo: se pierden peticiones';
    }
  }
  const replicas = nodes.filter((node) => COMPUTE_TYPES.includes(node.type) && faults[node.id] !== 'down').length;
  if (mode === 'extreme' && replicas < 2) {
    latency *= 1.8;
    if (status === 'ok') {
      status = 'warn';
      note = 'Tráfico extremo con una sola instancia de cómputo';
    }
  }
  return {
    rps: Math.max(0, Math.round(profile.rps * (1 + wobble) * served)),
    p95: Math.max(1, Math.round(latency)),
    costPerHour: Math.round((monthlyCost / HOURS_PER_MONTH) * 100) / 100,
    costPerMonth: monthlyCost,
    status,
    note,
  };
}
