import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda): un busto esculpido, como una pieza de
 * porcelana —cara modelada deformando una esfera, tupé negro brillante, esmoquin de satén, camisa
 * y corbata—, inspirado en el aspecto de Manuel pero sin rasgos de caricatura ni su foto. Gira la
 * cabeza hacia el cursor y flota, rodeado de partículas y anillos con el acento. Decorativa: el h1
 * dice quién es.
 */
export interface ScenePalette {
  accent: string;
  accentText: string;
  ink: string;
  muted: string;
  surface: string;
  line: string;
  light: boolean;
}

export interface HeroScene {
  frame(t: number): void;
  resize(width: number, height: number): void;
  pointer(x: number, y: number): void;
  scroll(progress: number): void;
  setPalette(palette: ScenePalette): void;
  dispose(): void;
}

/** Colores propios del busto: no dependen del tema. */
const PORCELAIN = 0x3a3836; // grafito cálido: busto de bronce oscuro
const HAIR = 0x060607;
const SUIT = 0x111113;
const SATIN = 0x26262b;
const TIE = 0x2f3036;

export function createHeroScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: ScenePalette, animate: boolean): HeroScene {
  const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.toneMapping = three.ACESFilmicToneMapping;

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.25, 9);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T): T => (disposables.push(item), item);
  const standard = (color: number, roughness = 0.55, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    keep(new three.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra }));

  // ---------- Luces: cálida de frente, fría de relleno y un contraluz con el acento ----------
  const hemi = new three.HemisphereLight(0xffffff, 0x223322, 1.1);
  const key = new three.DirectionalLight(0xfff1e6, 2.4);
  key.position.set(3, 4, 6);
  const rim = new three.DirectionalLight(0x7fee64, 3.2);
  rim.position.set(-4, 2, -4);
  const rim2 = new three.DirectionalLight(0x7fee64, 1.6);
  rim2.position.set(4, -1, -3);
  scene.add(hemi, key, rim, rim2);

  const character = new three.Group();
  scene.add(character);
  const head = new three.Group();
  head.position.y = 0.45;
  character.add(head);

  const physical = (color: number, roughness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    keep(new three.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35, ...extra }));
  const porcelain = physical(PORCELAIN, 0.32, { metalness: 0.55, clearcoat: 0.8 });
  const shirt = physical(0xe9e6e0, 0.5, { clearcoat: 0.2 });
  const hair = physical(HAIR, 0.35, { clearcoat: 1, clearcoatRoughness: 0.2 });
  const accentMat = standard(0x7fee64, 0.35, { emissive: 0x7fee64, emissiveIntensity: 0.4 });
  const suit = physical(SUIT, 0.7, { clearcoat: 0 });
  const satin = physical(SATIN, 0.25, { clearcoat: 1, clearcoatRoughness: 0.15 });
  const tie = physical(TIE, 0.3, { clearcoat: 1 });

  const sphere = (radius: number, segments = 48) => keep(new three.SphereGeometry(radius, segments, segments));

  // Cara: una esfera densa deformada (pómulos, cuencas, cejas, nariz, labios, mentón y mandíbula).
  const headGeometry = keep(new three.SphereGeometry(1, 160, 120));
  const position = headGeometry.getAttribute('position');
  const v = new three.Vector3();
  const bump = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-(dx * dx) / sx - (dy * dy) / sy);
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const { x, y, z } = v;
    const front = Math.max(0, z);
    const ax = Math.abs(x);
    const relief =
      0.26 * bump(x, y + 0.1, 0.008, 0.05) * front ** 3 + // nariz
      0.05 * bump(x, y + 0.3, 0.02, 0.004) * front ** 3 + // punta y aletas
      0.07 * bump(0, y - 0.3, 1, 0.006) * front ** 2 * (ax < 0.62 ? 1 : 0.3) - // cejas
      0.11 * bump(ax - 0.34, y - 0.14, 0.016, 0.01) * front ** 2 + // cuencas
      0.045 * bump(ax - 0.52, y + 0.02, 0.02, 0.02) * front + // pómulos
      0.035 * bump(x, y + 0.5, 0.03, 0.003) * front ** 2 + // labio superior
      0.045 * bump(x, y + 0.6, 0.025, 0.003) * front ** 2 + // labio inferior
      0.09 * bump(x, y + 0.88, 0.04, 0.012) * front ** 2; // mentón
    v.multiplyScalar(1 + relief);
    // Proporciones: más alta, mandíbula marcada que se estrecha hacia el mentón.
    const taper = y < 0 ? 1 - 0.26 * (-y) ** 1.4 : 1 - 0.05 * y * y;
    v.set(v.x * taper * 0.95, v.y * 1.24, v.z * (y < -0.2 ? 0.96 : 1));
    position.setXYZ(i, v.x, v.y, v.z);
  }
  headGeometry.computeVertexNormals();
  const face = new three.Mesh(headGeometry, porcelain);
  face.scale.setScalar(1.08);
  head.add(face);
  for (const side of [-1, 1]) {
    const ear = new three.Mesh(sphere(0.24, 24), porcelain);
    ear.position.set(side * 1.0, 0.0, -0.05);
    ear.scale.set(0.4, 1, 0.7);
    head.add(ear);
  }

  // Pelo: laterales cortos pegados al cráneo y un tupé alto peinado hacia arriba y atrás.
  const sides = new three.Mesh(keep(new three.SphereGeometry(1.06, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.36)), hair);
  sides.position.set(0, 0.2, -0.06);
  sides.rotation.x = -0.35;
  sides.scale.set(0.98, 1.15, 1.02);
  head.add(sides);
  const quiffGeometry = keep(new three.SphereGeometry(0.6, 64, 48));
  const quiffPosition = quiffGeometry.getAttribute('position');
  for (let i = 0; i < quiffPosition.count; i++) {
    v.fromBufferAttribute(quiffPosition, i);
    const lift = Math.max(0, v.y) * (0.35 + 0.45 * Math.max(0, v.z / 0.6)); // sube más por delante
    const wave = 0.05 * Math.sin(v.x * 18) * Math.max(0, v.y / 0.6); // mechones
    quiffPosition.setXYZ(i, v.x * 1.15, v.y * 0.55 + lift + wave, v.z * 1.55);
  }
  quiffGeometry.computeVertexNormals();
  const quiff = new three.Mesh(quiffGeometry, hair);
  quiff.position.set(0, 1.05, 0.1);
  quiff.rotation.set(-0.12, 0, -0.08);
  head.add(quiff);

  // Cuello, hombros, camisa, corbata y esmoquin con solapas de satén.
  const neck = new three.Mesh(keep(new three.CylinderGeometry(0.38, 0.46, 0.8, 32)), porcelain);
  neck.position.y = -1.25;
  character.add(neck);
  const body = new three.Mesh(keep(new three.CapsuleGeometry(1.05, 0.7, 16, 48)), suit);
  body.position.y = -2.55;
  body.scale.set(1.6, 1, 0.78);
  character.add(body);
  const shirtFront = new three.Mesh(keep(new three.ConeGeometry(0.5, 1.2, 3)), shirt);
  shirtFront.rotation.set(Math.PI, Math.PI, 0);
  shirtFront.position.set(0, -1.95, 0.86);
  shirtFront.scale.set(1, 1, 0.4);
  character.add(shirtFront);
  for (const side of [-1, 1]) {
    const collar = new three.Mesh(keep(new three.BoxGeometry(0.36, 0.22, 0.06)), shirt);
    collar.position.set(side * 0.2, -1.55, 0.6);
    collar.rotation.set(0.3, side * -0.45, side * 0.6);
    character.add(collar);
    const lapel = new three.Mesh(keep(new three.BoxGeometry(0.3, 1.5, 0.06)), satin);
    lapel.position.set(side * 0.46, -2.05, 0.92);
    lapel.rotation.set(0.12, side * -0.35, side * 0.3);
    character.add(lapel);
  }
  const knot = new three.Mesh(sphere(0.12, 24), tie);
  knot.position.set(0, -1.6, 0.74);
  knot.scale.set(1, 1.1, 0.7);
  character.add(knot);
  const blade = new three.Mesh(keep(new three.CylinderGeometry(0.17, 0.08, 1.0, 4)), tie);
  blade.position.set(0, -2.15, 0.95);
  blade.rotation.set(-0.1, Math.PI / 4, 0);
  blade.scale.set(1, 1, 0.35);
  character.add(blade);
  // Insignia de solapa con el acento.
  const pin = new three.Mesh(sphere(0.06, 16), accentMat);
  pin.position.set(-0.6, -1.95, 1.06);
  character.add(pin);

  // Partículas y anillos alrededor.
  const dustMaterial = keep(new three.PointsMaterial({ size: 0.04, transparent: true, opacity: 0.7, depthWrite: false }));
  const dustGeometry = keep(new three.BufferGeometry());
  const count = 1600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 3.6 + Math.random() * 7;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.7, radius * Math.sin(phi) * Math.sin(theta) - 2], i * 3);
  }
  dustGeometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  const field = new three.Points(dustGeometry, dustMaterial);
  scene.add(field);
  const ringMaterial = keep(new three.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }));
  const rings = [0, 1].map((index) => {
    const ring = new three.Mesh(keep(new three.TorusGeometry(2.4 + index * 0.5, 0.01, 6, 160)), ringMaterial);
    ring.rotation.x = Math.PI / 2 + (index ? 0.4 : -0.25);
    ring.position.y = -0.4;
    scene.add(ring);
    return ring;
  });

  let pointerX = 0;
  let pointerY = 0;
  let lookX = 0;
  let lookY = 0;
  let lift = 0;

  function setPalette(next: ScenePalette): void {
    const accent = new three.Color(next.accent);
    accentMat.color.copy(accent);
    accentMat.emissive.copy(accent);
    rim.color.copy(accent);
    rim2.color.copy(accent);
    ringMaterial.color.copy(accent);
    ringMaterial.opacity = next.light ? 0.6 : 0.4;
    dustMaterial.color.set(next.muted);
    dustMaterial.blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    dustMaterial.needsUpdate = true;
    hemi.intensity = next.light ? 1.5 : 1.1;
  }
  setPalette(palette);

  function frame(t: number): void {
    const intro = animate ? easeOutBack(Math.min(1, t / 1.2)) : 1;
    character.scale.setScalar(0.6 + 0.4 * intro);
    character.position.y = (animate ? Math.sin(t * 1.2) * 0.08 : 0) + lift * 1.2;

    lookX += (pointerX - lookX) * 0.08;
    lookY += (pointerY - lookY) * 0.08;
    head.rotation.y = lookX * 0.55;
    head.rotation.x = lookY * 0.3;
    head.rotation.z = -lookX * 0.06;
    character.rotation.y = lookX * 0.15;
    rings[0].rotation.z = t * 0.15;
    rings[1].rotation.z = -t * 0.1;
    field.rotation.y = t * 0.025 + lookX * 0.1;
    renderer.render(scene, camera);
  }

  return {
    frame,
    setPalette,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.position.z = camera.aspect < 0.8 ? 11.5 : 9;
      camera.updateProjectionMatrix();
    },
    pointer(x, y) {
      pointerX = Math.max(-1, Math.min(1, x));
      pointerY = Math.max(-1, Math.min(1, y));
    },
    scroll(progress) {
      lift = Math.min(1, Math.max(0, progress));
    },
    dispose() {
      for (const item of disposables) item.dispose();
      renderer.dispose();
    },
  };
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
