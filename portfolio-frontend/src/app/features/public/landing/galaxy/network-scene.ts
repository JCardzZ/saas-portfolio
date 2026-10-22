import type * as THREE from '../../../../shared/three/three-lite';

/**
 * Fondo de red (Three.js): servidores tenues repartidos en un volumen ancho, cada uno enlazado con
 * sus vecinos más cercanos, y paquetes del acento (con estela) que viajan por los enlaces y, al
 * llegar a un nodo, siguen por otro, como tráfico entre servicios. Unos pocos nodos son «hubs».
 *
 * - `burst()`: ráfaga de paquetes desde un hub; la llama el componente con cada evento del sistema
 *   (los reales del SSE o, en modo demo, los simulados).
 * - `wave()`: onda que recorre la malla del centro hacia fuera (al preguntar a la IA).
 * - `pointer()`: los nodos cercanos al cursor se iluminan, como una sonda.
 * - Niebla: lo lejano se desvanece. Al bajar por la página la cámara avanza a través de la malla.
 */
export interface BackdropPalette {
  accent: string;
  ink: string;
  canvas: string;
  light: boolean;
}

export interface BackdropScene {
  frame(t: number): void;
  resize(width: number, height: number): void;
  scroll(progress: number): void;
  setPalette(palette: BackdropPalette): void;
  /** Ráfaga de tráfico desde un hub al azar. */
  burst(): void;
  /** Onda desde el centro de la malla. */
  wave(): void;
  /** Cursor en píxeles de la ventana, o `null` si salió. */
  pointer(x: number | null, y?: number): void;
  dispose(): void;
}

const NODES = 150;
const HUBS = 14;
const LINKS_PER_NODE = 3;
const MAX_LINK = 5.2;
const PACKETS = 70;
/** Huecos para paquetes de ráfaga; si se llenan, la siguiente ráfaga reutiliza los más viejos. */
const BURST_SLOTS = 48;
const BURST_SIZE = 6;
/** Saltos que da un paquete de ráfaga antes de apagarse. */
const BURST_HOPS = 3;
/** Copias de la estela detrás de cada paquete, y separación entre ellas (fracción del enlace). */
const TRAIL = 3;
const TRAIL_GAP = 0.07;
const SPREAD = { x: 17, y: 10, z: 7 };
const PROBE_PX = 140;
const WAVE_SPEED = 14;
const WAVE_WIDTH = 2.2;
const HIDDEN = 1e5;

interface Packet {
  link: number;
  forward: boolean;
  t: number;
  speed: number;
  /** Saltos que le quedan: `Infinity` para el tráfico de fondo, 0 = apagado. */
  hops: number;
}

export function createNetworkScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: BackdropPalette): BackdropScene {
  const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(55, 1, 0.1, 100);
  const fog = new three.Fog(0x000000, 9, 30);
  scene.fog = fog;
  const mesh = new three.Group();
  scene.add(mesh);

  // Punto redondo con borde difuso: sin textura, PointsMaterial dibuja cuadrados.
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const ctx = dot.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
  }
  const sprite = new three.CanvasTexture(dot);
  const pointsMaterial = (size: number, vertexColors = false) =>
    new three.PointsMaterial({ map: sprite, size, sizeAttenuation: true, transparent: true, depthWrite: false, vertexColors });

  // Nodos: posiciones fijas con una deriva lenta que se calcula en cada fotograma.
  const base = new Float32Array(NODES * 3);
  const phase = new Float32Array(NODES);
  for (let i = 0; i < NODES; i++) {
    base[i * 3] = (Math.random() * 2 - 1) * SPREAD.x;
    base[i * 3 + 1] = (Math.random() * 2 - 1) * SPREAD.y;
    base[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD.z;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const at = new Float32Array(base);
  /** Cuánto se ilumina cada nodo (onda o sonda), de 0 a 1, suavizado entre fotogramas. */
  const lit = new Float32Array(NODES);

  // Enlaces: cada nodo con sus vecinos más cercanos, sin repetir pares.
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < NODES; i++) {
    const near: { j: number; d: number }[] = [];
    for (let j = 0; j < NODES; j++) {
      if (i === j) continue;
      const d = Math.hypot(base[i * 3] - base[j * 3], base[i * 3 + 1] - base[j * 3 + 1], base[i * 3 + 2] - base[j * 3 + 2]);
      if (d < MAX_LINK) near.push({ j, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { j } of near.slice(0, LINKS_PER_NODE)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([i, j]);
      }
    }
  }
  const linksOf: number[][] = Array.from({ length: NODES }, () => []);
  pairs.forEach(([a, b], k) => {
    linksOf[a].push(k);
    linksOf[b].push(k);
  });
  // Solo son hubs los que tienen enlaces: una ráfaga tiene que poder salir de ellos.
  const hubs = Array.from({ length: NODES }, (_, i) => i).filter((i) => linksOf[i].length).slice(0, HUBS);

  const nodeColors = new Float32Array(NODES * 3);
  const nodeGeometry = new three.BufferGeometry();
  nodeGeometry.setAttribute('position', new three.BufferAttribute(at, 3));
  nodeGeometry.setAttribute('color', new three.BufferAttribute(nodeColors, 3));
  const nodeMaterial = pointsMaterial(0.16, true);
  mesh.add(new three.Points(nodeGeometry, nodeMaterial));

  const hubPositions = new Float32Array(hubs.length * 3);
  const hubGeometry = new three.BufferGeometry();
  hubGeometry.setAttribute('position', new three.BufferAttribute(hubPositions, 3));
  const hubMaterial = pointsMaterial(0.42);
  mesh.add(new three.Points(hubGeometry, hubMaterial));

  const linePositions = new Float32Array(pairs.length * 6);
  const lineColors = new Float32Array(pairs.length * 6);
  const lineGeometry = new three.BufferGeometry();
  lineGeometry.setAttribute('position', new three.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('color', new three.BufferAttribute(lineColors, 3));
  const lineMaterial = new three.LineBasicMaterial({ transparent: true, depthWrite: false, vertexColors: true });
  mesh.add(new three.LineSegments(lineGeometry, lineMaterial));

  // Paquetes: los de fondo no se apagan nunca; los de ráfaga dan BURST_HOPS saltos y se apagan.
  const packets: Packet[] = [
    ...Array.from({ length: Math.min(PACKETS, pairs.length) }, () => ({
      link: Math.floor(Math.random() * pairs.length),
      forward: Math.random() < 0.5,
      t: Math.random(),
      speed: 0.25 + Math.random() * 0.45,
      hops: Infinity,
    })),
    ...Array.from({ length: pairs.length ? BURST_SLOTS : 0 }, () => ({ link: 0, forward: true, t: 0, speed: 0, hops: 0 })),
  ];
  let nextSlot = packets.length - BURST_SLOTS;
  // La cabeza y cada copia de la estela son una nube de puntos con su tamaño y su opacidad.
  const layers = Array.from({ length: TRAIL + 1 }, (_, layer) => {
    const positions = new Float32Array(packets.length * 3);
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
    const material = pointsMaterial(0.3 * (1 - layer * 0.22));
    mesh.add(new three.Points(geometry, material));
    return { positions, geometry, material, fade: 1 - layer * 0.28 };
  });

  const ink = new three.Color();
  const accent = new three.Color();
  let progress = 0;
  let smooth = 0;
  let last = 0;
  let width = 1;
  let height = 1;
  let probe: { x: number; y: number } | null = null;
  let waveStart = -1;
  let now = 0;
  const projected = new three.Vector3();

  function setPalette(next: BackdropPalette): void {
    accent.set(next.accent);
    ink.set(next.ink);
    fog.color.set(next.canvas);
    const blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    nodeMaterial.opacity = next.light ? 0.5 : 0.6;
    hubMaterial.color.copy(accent);
    hubMaterial.opacity = next.light ? 0.6 : 0.8;
    lineMaterial.opacity = next.light ? 0.14 : 0.15;
    for (const layer of layers) {
      layer.material.color.copy(accent);
      layer.material.opacity = (next.light ? 0.75 : 0.95) * layer.fade;
    }
    for (const material of [nodeMaterial, hubMaterial, lineMaterial, ...layers.map((layer) => layer.material)]) {
      material.blending = blending;
      material.needsUpdate = true;
    }
  }
  setPalette(palette);

  function launch(packet: Packet, from: number, hops: number, speed: number): void {
    const options = linksOf[from];
    const link = options[Math.floor(Math.random() * options.length)];
    packet.link = link;
    packet.forward = pairs[link][0] === from;
    packet.t = 0;
    packet.speed = speed;
    packet.hops = hops;
  }

  function moveNodes(t: number): void {
    for (let i = 0; i < NODES; i++) {
      const p = phase[i];
      at[i * 3] = base[i * 3] + Math.sin(t * 0.15 + p) * 0.25;
      at[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.12 + p) * 0.25;
    }
    hubs.forEach((node, k) => hubPositions.set(at.subarray(node * 3, node * 3 + 3), k * 3));
    nodeGeometry.getAttribute('position').needsUpdate = true;
    hubGeometry.getAttribute('position').needsUpdate = true;
  }

  /** Onda y sonda: cuánto se ilumina cada nodo; con eso se tiñen nodos y enlaces. */
  function lightNodes(): void {
    const radius = waveStart < 0 ? -1 : (now - waveStart) * WAVE_SPEED;
    if (radius > SPREAD.x * 1.6) waveStart = -1;
    mesh.updateMatrixWorld();
    for (let i = 0; i < NODES; i++) {
      let target = 0;
      if (radius >= 0) {
        const d = Math.hypot(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]);
        target = Math.max(0, 1 - Math.abs(d - radius) / WAVE_WIDTH);
      }
      if (probe) {
        projected.set(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]).applyMatrix4(mesh.matrixWorld).project(camera);
        if (projected.z < 1) {
          const px = Math.hypot(((projected.x + 1) / 2) * width - probe.x, ((1 - projected.y) / 2) * height - probe.y);
          target = Math.max(target, 1 - px / PROBE_PX);
        }
      }
      // Sube deprisa y baja despacio, para que la onda deje rastro.
      lit[i] += (target - lit[i]) * (target > lit[i] ? 0.5 : 0.08);
      const h = lit[i];
      nodeColors[i * 3] = ink.r + (accent.r - ink.r) * h;
      nodeColors[i * 3 + 1] = ink.g + (accent.g - ink.g) * h;
      nodeColors[i * 3 + 2] = ink.b + (accent.b - ink.b) * h;
    }
    nodeGeometry.getAttribute('color').needsUpdate = true;
    pairs.forEach(([a, b], k) => {
      linePositions.set(at.subarray(a * 3, a * 3 + 3), k * 6);
      linePositions.set(at.subarray(b * 3, b * 3 + 3), k * 6 + 3);
      // Un enlace iluminado brilla más que su nodo: con la opacidad baja de las líneas, hace falta.
      for (const [node, offset] of [[a, 0], [b, 3]] as const) {
        const boost = 1 + lit[node] * 4;
        lineColors[k * 6 + offset] = nodeColors[node * 3] * boost;
        lineColors[k * 6 + offset + 1] = nodeColors[node * 3 + 1] * boost;
        lineColors[k * 6 + offset + 2] = nodeColors[node * 3 + 2] * boost;
      }
    });
    lineGeometry.getAttribute('position').needsUpdate = true;
    lineGeometry.getAttribute('color').needsUpdate = true;
  }

  function movePackets(dt: number): void {
    packets.forEach((packet, k) => {
      if (packet.hops <= 0) {
        for (const layer of layers) layer.positions[k * 3 + 1] = HIDDEN;
        return;
      }
      const [a, b] = pairs[packet.link];
      const length = Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2]) || 1;
      packet.t += (packet.speed * dt * 2.2) / length;
      if (packet.t >= 1) {
        packet.hops -= 1;
        const arrived = packet.forward ? b : a;
        const options = linksOf[arrived].filter((link) => link !== packet.link);
        const next = options.length ? options[Math.floor(Math.random() * options.length)] : packet.link;
        packet.forward = pairs[next][0] === arrived;
        packet.link = next;
        packet.t = 0;
      }
      const [from, to] = packet.forward ? pairs[packet.link] : [pairs[packet.link][1], pairs[packet.link][0]];
      layers.forEach((layer, n) => {
        // La estela se queda en el enlace actual: al saltar, la cola se acorta en vez de cortar esquinas.
        const t = Math.max(0, packet.t - n * TRAIL_GAP);
        for (let axis = 0; axis < 3; axis++) {
          layer.positions[k * 3 + axis] = at[from * 3 + axis] + (at[to * 3 + axis] - at[from * 3 + axis]) * t;
        }
      });
    });
    for (const layer of layers) layer.geometry.getAttribute('position').needsUpdate = true;
  }

  return {
    frame(t) {
      now = t;
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      moveNodes(t);
      smooth += (progress - smooth) * 0.06;
      mesh.rotation.y = Math.sin(t * 0.03) * 0.12 + smooth * 0.5;
      // Al bajar por la página la cámara avanza por la malla y baja un poco.
      camera.position.set(Math.sin(smooth * 1.2) * 2, 1.5 - smooth * 4, 13 - smooth * 8);
      camera.lookAt(0, -smooth * 3, 0);
      lightNodes();
      movePackets(dt);
      renderer.render(scene, camera);
    },
    resize(w, h) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    scroll(next) {
      progress = Math.min(1, Math.max(0, next));
    },
    setPalette,
    burst() {
      if (!hubs.length) return;
      const hub = hubs[Math.floor(Math.random() * hubs.length)];
      lit[hub] = 1;
      for (let n = 0; n < BURST_SIZE; n++) {
        launch(packets[nextSlot], hub, BURST_HOPS, 0.9 + Math.random() * 0.6);
        nextSlot = nextSlot + 1 < packets.length ? nextSlot + 1 : packets.length - BURST_SLOTS;
      }
    },
    wave() {
      waveStart = now;
    },
    pointer(x, y) {
      probe = x === null || y === undefined ? null : { x, y };
    },
    dispose() {
      for (const geometry of [nodeGeometry, hubGeometry, lineGeometry, ...layers.map((layer) => layer.geometry)]) geometry.dispose();
      for (const material of [nodeMaterial, hubMaterial, lineMaterial, ...layers.map((layer) => layer.material)]) material.dispose();
      sprite.dispose();
      renderer.dispose();
    },
  };
}
