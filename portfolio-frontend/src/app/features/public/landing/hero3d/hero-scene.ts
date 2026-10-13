import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda). La plataforma real por capas: cliente
 * (Angular), API (Spring Boot) y datos (PostgreSQL, Redis), con Gemini en órbita. Paquetes de
 * luz recorren las conexiones, un campo de partículas lo rodea y el conjunto responde al cursor y
 * al scroll. Es decorativa: el texto del hero dice lo mismo.
 *
 * Todo sale de aquí: el componente solo le da un lienzo, el tema y si puede moverse.
 */
export interface ScenePalette {
  accent: string;
  /** Acento para texto: en claro, un verde oscuro que se lee. */
  accentText: string;
  ink: string;
  muted: string;
  surface: string;
  line: string;
  light: boolean;
}

export interface HeroScene {
  /** Dibuja un fotograma; `t` en segundos desde el inicio. */
  frame(t: number): void;
  resize(width: number, height: number): void;
  /** Posición del cursor normalizada a [-1, 1]. */
  pointer(x: number, y: number): void;
  /** Cuánto se ha hecho scroll sobre el hero, de 0 a 1: las capas se separan. */
  scroll(progress: number): void;
  setPalette(palette: ScenePalette): void;
  dispose(): void;
}

interface Service {
  label: string;
  layer: number;
  x: number;
  z: number;
}

const LAYERS = ['CLIENTE', 'API', 'DATOS'];
const SERVICES: Service[] = [
  { label: 'Angular', layer: 0, x: 0, z: 0 },
  { label: 'Spring Boot', layer: 1, x: 0, z: 0 },
  { label: 'PostgreSQL', layer: 2, x: -0.95, z: 0.35 },
  { label: 'Redis', layer: 2, x: 0.95, z: -0.35 },
];
/** De quién a quién viaja el tráfico (índices de SERVICES; 4 = Gemini, en órbita). */
const ROUTES: [number, number][] = [[0, 1], [1, 2], [1, 3], [1, 4]];
const LAYER_GAP = 1.7;
const PLATE = 3.4;

export function createHeroScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: ScenePalette, animate: boolean): HeroScene {
  const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(5.4, 3.9, 6.4);
  camera.lookAt(0, -0.2, 0);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T): T => (disposables.push(item), item);

  const glowTexture = keep(radialTexture(three));
  const rig = new three.Group();
  scene.add(rig);

  // ---------- Materiales (se recolorean al cambiar de tema) ----------
  const plateFill = keep(new three.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));
  const plateEdge = keep(new three.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
  const gridLine = keep(new three.LineBasicMaterial({ transparent: true, opacity: 0.18 }));
  const blockFill = keep(new three.MeshBasicMaterial({ transparent: true, opacity: 0.9 }));
  const blockEdge = keep(new three.LineBasicMaterial({ transparent: true }));
  const beam = keep(new three.LineBasicMaterial({ transparent: true, opacity: 0.35 }));
  const ring = keep(new three.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }));
  const dust = keep(new three.PointsMaterial({ size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true }));
  const glow = keep(new three.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false }));

  // ---------- Capas ----------
  const plateGeometry = keep(new three.BoxGeometry(PLATE, 0.08, PLATE));
  const plateEdges = keep(new three.EdgesGeometry(plateGeometry));
  const gridGeometry = keep(gridLines(three, PLATE, 8));
  const layers: THREE.Group[] = LAYERS.map((name, index) => {
    const layer = new three.Group();
    layer.add(new three.Mesh(plateGeometry, plateFill));
    layer.add(new three.LineSegments(plateEdges, plateEdge));
    const grid = new three.LineSegments(gridGeometry, gridLine);
    grid.position.y = 0.045;
    layer.add(grid);
    const tag = keep(labelSprite(three, name, palette.accentText, 0.34, true));
    tag.position.set(-PLATE / 2 + 0.55, 0.12, PLATE / 2 - 0.25);
    layer.add(tag);
    layer.userData['index'] = index;
    rig.add(layer);
    return layer;
  });

  // ---------- Servicios ----------
  const blockGeometry = keep(new three.BoxGeometry(0.62, 0.42, 0.62));
  const blockEdges = keep(new three.EdgesGeometry(blockGeometry));
  const anchors: THREE.Object3D[] = SERVICES.map((service) => {
    const block = new three.Group();
    block.add(new three.Mesh(blockGeometry, blockFill));
    block.add(new three.LineSegments(blockEdges, blockEdge));
    const halo = new three.Sprite(glow);
    halo.scale.setScalar(2.6);
    block.add(halo);
    const label = keep(labelSprite(three, service.label, palette.ink, 0.3));
    label.position.set(0, 0.62, 0);
    block.add(label);
    block.position.set(service.x, 0.27, service.z);
    layers[service.layer].add(block);
    return block;
  });

  // Gemini: un satélite que orbita la capa de la API.
  const satellite = new three.Group();
  const satelliteCore = new three.Mesh(keep(new three.OctahedronGeometry(0.26)), blockFill);
  satellite.add(satelliteCore, new three.LineSegments(keep(new three.EdgesGeometry(new three.OctahedronGeometry(0.26))), blockEdge));
  const satelliteHalo = new three.Sprite(glow);
  satelliteHalo.scale.setScalar(1.5);
  satellite.add(satelliteHalo);
  const satelliteLabel = keep(labelSprite(three, 'Gemini', palette.ink, 0.28));
  satelliteLabel.position.y = 0.45;
  satellite.add(satelliteLabel);
  rig.add(satellite);
  anchors.push(satellite);

  // Anillos que giran alrededor del conjunto.
  const rings = [0, 1].map((index) => {
    const mesh = new three.Mesh(keep(new three.TorusGeometry(3.3 + index * 0.55, 0.008, 6, 160)), ring);
    mesh.rotation.x = Math.PI / 2 + (index ? 0.35 : -0.18);
    rig.add(mesh);
    return mesh;
  });

  // Campo de partículas.
  const dustGeometry = keep(new three.BufferGeometry());
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 4.5 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.6, radius * Math.sin(phi) * Math.sin(theta)], i * 3);
  }
  dustGeometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  const field = new three.Points(dustGeometry, dust);
  scene.add(field);

  // Conexiones y paquetes de luz que las recorren.
  const beams: { line: THREE.Line; from: THREE.Object3D; to: THREE.Object3D }[] = ROUTES.map(([from, to]) => {
    const geometry = keep(new three.BufferGeometry().setFromPoints([new three.Vector3(), new three.Vector3()]));
    const line = new three.Line(geometry, beam);
    rig.add(line);
    return { line, from: anchors[from], to: anchors[to] };
  });
  const packets = beams.flatMap((route, index) => [0, 0.5].map((offset) => {
    const sprite = new three.Sprite(glow);
    sprite.scale.setScalar(0.55);
    rig.add(sprite);
    return { sprite, route, offset: offset + index * 0.17 };
  }));

  let pointerX = 0;
  let pointerY = 0;
  let spread = 0;
  const target = { x: 0, y: 0 };
  const from = new three.Vector3();
  const to = new three.Vector3();

  function setPalette(next: ScenePalette): void {
    const accent = new three.Color(next.accent);
    plateFill.color.set(next.surface);
    plateFill.opacity = next.light ? 0.85 : 0.55;
    plateEdge.color.copy(accent);
    gridLine.color.set(next.line);
    gridLine.opacity = next.light ? 0.5 : 0.18;
    // Cubos de cristal teñidos del acento: brillan sobre negro y se leen sobre claro.
    blockFill.color.copy(accent);
    blockFill.opacity = next.light ? 0.35 : 0.22;
    blockEdge.color.copy(accent);
    beam.color.copy(accent);
    ring.color.copy(accent);
    dust.color.set(next.muted);
    dust.opacity = next.light ? 0.5 : 0.7;
    glow.color.copy(accent);
    // Sobre fondo claro la suma de luz se pierde: allí se mezcla normal y más tenue.
    const blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    glow.blending = blending;
    glow.opacity = next.light ? 0.55 : 0.9;
    dust.blending = blending;
    for (const material of [glow, dust]) material.needsUpdate = true;
    for (const layer of layers) recolorLabels(layer, next);
    recolorLabels(satellite, next);
  }

  function recolorLabels(root: THREE.Object3D, next: ScenePalette): void {
    root.traverse((child) => {
      const update = child.userData['recolor'] as ((color: string) => void) | undefined;
      if (update) update(child.userData['accent'] ? next.accentText : next.ink);
    });
  }
  setPalette(palette);

  function frame(t: number): void {
    // Entrada: las capas caen desde arriba, una tras otra.
    layers.forEach((layer, index) => {
      const intro = animate ? easeOut(Math.min(1, Math.max(0, (t - index * 0.18) / 1.1))) : 1;
      const y = (1 - index) * (LAYER_GAP + spread * 0.9);
      layer.position.y = y + (1 - intro) * 4;
      layer.rotation.y = (1 - intro) * 0.6;
      layer.position.y += animate ? Math.sin(t * 0.8 + index) * 0.04 : 0;
    });
    const orbit = animate ? t * 0.5 : 0.8;
    satellite.position.set(Math.cos(orbit) * 2.6, LAYER_GAP * 0.1 + Math.sin(t * 0.9) * 0.15, Math.sin(orbit) * 2.6);
    satelliteCore.rotation.y = t;
    rings[0].rotation.z = t * 0.12;
    rings[1].rotation.z = -t * 0.08;
    field.rotation.y = t * 0.02;

    for (const route of beams) {
      route.from.getWorldPosition(from);
      route.to.getWorldPosition(to);
      rig.worldToLocal(from);
      rig.worldToLocal(to);
      const points = route.line.geometry.attributes['position'] as THREE.BufferAttribute;
      points.setXYZ(0, from.x, from.y, from.z);
      points.setXYZ(1, to.x, to.y, to.z);
      points.needsUpdate = true;
    }
    for (const packet of packets) {
      packet.route.from.getWorldPosition(from);
      packet.route.to.getWorldPosition(to);
      rig.worldToLocal(from);
      rig.worldToLocal(to);
      const k = ((animate ? t * 0.45 : 0) + packet.offset) % 1;
      packet.sprite.position.lerpVectors(from, to, k);
      packet.sprite.material.opacity = Math.sin(k * Math.PI);
    }

    // El conjunto gira despacio y se inclina hacia el cursor.
    target.x += (pointerY * 0.18 - target.x) * 0.05;
    target.y += (pointerX * 0.35 - target.y) * 0.05;
    rig.rotation.x = target.x;
    rig.rotation.y = (animate ? t * 0.08 : 0) + target.y;
    renderer.render(scene, camera);
  }

  return {
    frame,
    setPalette,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      // En pantallas estrechas se aleja la cámara para que quepa todo.
      const distance = camera.aspect < 1 ? 1.45 : 1;
      camera.position.set(5.4 * distance, 3.9 * distance, 6.4 * distance);
      camera.lookAt(0, -0.2, 0);
      camera.updateProjectionMatrix();
    },
    pointer(x, y) {
      pointerX = x;
      pointerY = y;
    },
    scroll(progress) {
      spread = Math.min(1, Math.max(0, progress));
    },
    dispose() {
      for (const item of disposables) item.dispose();
      renderer.dispose();
    },
  };
}

function easeOut(x: number): number {
  return 1 - (1 - x) ** 3;
}

function gridLines(three: typeof THREE, size: number, divisions: number): THREE.BufferGeometry {
  const half = size / 2;
  const points: THREE.Vector3[] = [];
  for (let i = 1; i < divisions; i++) {
    const p = -half + (size / divisions) * i;
    points.push(new three.Vector3(p, 0, -half), new three.Vector3(p, 0, half), new three.Vector3(-half, 0, p), new three.Vector3(half, 0, p));
  }
  return new three.BufferGeometry().setFromPoints(points);
}

function radialTexture(three: typeof THREE): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new three.CanvasTexture(canvas);
}

/** Rótulo de texto como sprite: siempre mira a la cámara. Se vuelve a pintar al cambiar de tema. */
function labelSprite(three: typeof THREE, text: string, color: string, height: number, accent = false): THREE.Sprite & { dispose(): void } {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = `${accent ? 700 : 600} 64px Inter, system-ui, sans-serif`;
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width + 24);
  canvas.height = 88;
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  // Los rótulos siempre encima: que una losa no tape el nombre de lo que hay en ella.
  const material = new three.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new three.Sprite(material) as THREE.Sprite & { dispose(): void };
  const paint = (fill: string) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.fillStyle = fill;
    context.textBaseline = 'middle';
    context.fillText(text, 12, 46);
    texture.needsUpdate = true;
  };
  paint(color);
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.renderOrder = 10;
  sprite.userData['recolor'] = paint;
  sprite.userData['accent'] = accent;
  sprite.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}
