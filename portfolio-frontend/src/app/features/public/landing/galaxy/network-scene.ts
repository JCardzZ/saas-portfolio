import type * as THREE from '../../../../shared/three/three-lite';


/**
 * Fondo de red (Three.js): servidores tenues repartidos en un volumen ancho, cada uno enlazado con
 * sus vecinos más cercanos, y paquetes del acento que viajan por los enlaces y, al llegar a un nodo,
 * siguen por otro (como tráfico entre servicios). Unos pocos nodos son «hubs» del acento. Al bajar
 * por la página la cámara avanza a través de la malla. Decorativo y sin interacción.
 */
export interface BackdropPalette {
  accent: string;
  ink: string;
  light: boolean;
}

export interface BackdropScene {
  frame(t: number): void;
  resize(width: number, height: number): void;
  scroll(progress: number): void;
  setPalette(palette: BackdropPalette): void;
  dispose(): void;
}

const NODES = 150;
const HUBS = 14;
const LINKS_PER_NODE = 3;
const MAX_LINK = 5.2;
const PACKETS = 70;
const SPREAD = { x: 17, y: 10, z: 7 };

interface Packet {
  link: number;
  forward: boolean;
  t: number;
  speed: number;
}

export function createNetworkScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: BackdropPalette): BackdropScene {
  const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(55, 1, 0.1, 100);
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

  const nodeGeometry = new three.BufferGeometry();
  nodeGeometry.setAttribute('position', new three.BufferAttribute(at, 3));
  const nodeMaterial = new three.PointsMaterial({ map: sprite, size: 0.16, sizeAttenuation: true, transparent: true, depthWrite: false });
  mesh.add(new three.Points(nodeGeometry, nodeMaterial));

  // Los primeros HUBS nodos hacen de hubs (el reparto es aleatorio, así que da igual cuáles).
  const hubGeometry = new three.BufferGeometry();
  hubGeometry.setAttribute('position', new three.BufferAttribute(at.subarray(0, HUBS * 3), 3));
  const hubMaterial = new three.PointsMaterial({ map: sprite, size: 0.42, sizeAttenuation: true, transparent: true, depthWrite: false });
  mesh.add(new three.Points(hubGeometry, hubMaterial));

  const linePositions = new Float32Array(pairs.length * 6);
  const lineGeometry = new three.BufferGeometry();
  lineGeometry.setAttribute('position', new three.BufferAttribute(linePositions, 3));
  const lineMaterial = new three.LineBasicMaterial({ transparent: true, depthWrite: false });
  mesh.add(new three.LineSegments(lineGeometry, lineMaterial));

  // Paquetes: recorren un enlace y, al llegar, siguen por otro del nodo de destino.
  const packets: Packet[] = Array.from({ length: Math.min(PACKETS, pairs.length) }, () => ({
    link: Math.floor(Math.random() * pairs.length),
    forward: Math.random() < 0.5,
    t: Math.random(),
    speed: 0.25 + Math.random() * 0.45,
  }));
  const packetPositions = new Float32Array(packets.length * 3);
  const packetGeometry = new three.BufferGeometry();
  packetGeometry.setAttribute('position', new three.BufferAttribute(packetPositions, 3));
  const packetMaterial = new three.PointsMaterial({ map: sprite, size: 0.3, sizeAttenuation: true, transparent: true, depthWrite: false });
  mesh.add(new three.Points(packetGeometry, packetMaterial));

  let progress = 0;
  let smooth = 0;
  let last = 0;

  function setPalette(next: BackdropPalette): void {
    const accent = new three.Color(next.accent);
    const ink = new three.Color(next.ink);
    const blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    nodeMaterial.color.copy(ink);
    nodeMaterial.opacity = next.light ? 0.45 : 0.55;
    hubMaterial.color.copy(accent);
    hubMaterial.opacity = next.light ? 0.6 : 0.8;
    lineMaterial.color.copy(ink);
    lineMaterial.opacity = next.light ? 0.12 : 0.13;
    packetMaterial.color.copy(accent);
    packetMaterial.opacity = next.light ? 0.75 : 0.95;
    for (const material of [nodeMaterial, hubMaterial, lineMaterial, packetMaterial]) {
      material.blending = blending;
      material.needsUpdate = true;
    }
  }
  setPalette(palette);

  function step(t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    for (let i = 0; i < NODES; i++) {
      const p = phase[i];
      at[i * 3] = base[i * 3] + Math.sin(t * 0.15 + p) * 0.25;
      at[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.12 + p) * 0.25;
    }
    nodeGeometry.getAttribute('position').needsUpdate = true;
    hubGeometry.getAttribute('position').needsUpdate = true;
    pairs.forEach(([a, b], k) => {
      linePositions.set(at.subarray(a * 3, a * 3 + 3), k * 6);
      linePositions.set(at.subarray(b * 3, b * 3 + 3), k * 6 + 3);
    });
    lineGeometry.getAttribute('position').needsUpdate = true;

    packets.forEach((packet, k) => {
      const [a, b] = pairs[packet.link];
      const length = Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2]) || 1;
      packet.t += (packet.speed * dt * 2.2) / length;
      if (packet.t >= 1) {
        const arrived = packet.forward ? b : a;
        const options = linksOf[arrived].filter((link) => link !== packet.link);
        const next = options.length ? options[Math.floor(Math.random() * options.length)] : packet.link;
        packet.forward = pairs[next][0] === arrived;
        packet.link = next;
        packet.t = 0;
      }
      const [from, to] = packet.forward ? pairs[packet.link] : [pairs[packet.link][1], pairs[packet.link][0]];
      for (let axis = 0; axis < 3; axis++) {
        packetPositions[k * 3 + axis] = at[from * 3 + axis] + (at[to * 3 + axis] - at[from * 3 + axis]) * packet.t;
      }
    });
    packetGeometry.getAttribute('position').needsUpdate = true;
  }

  return {
    frame(t) {
      step(t);
      smooth += (progress - smooth) * 0.06;
      mesh.rotation.y = Math.sin(t * 0.03) * 0.12 + smooth * 0.5;
      // Al bajar por la página la cámara avanza por la malla y baja un poco.
      camera.position.set(Math.sin(smooth * 1.2) * 2, 1.5 - smooth * 4, 13 - smooth * 8);
      camera.lookAt(0, -smooth * 3, 0);
      renderer.render(scene, camera);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    scroll(next) {
      progress = Math.min(1, Math.max(0, next));
    },
    setPalette,
    dispose() {
      for (const geometry of [nodeGeometry, hubGeometry, lineGeometry, packetGeometry]) geometry.dispose();
      for (const material of [nodeMaterial, hubMaterial, lineMaterial, packetMaterial]) material.dispose();
      sprite.dispose();
      renderer.dispose();
    },
  };
}
