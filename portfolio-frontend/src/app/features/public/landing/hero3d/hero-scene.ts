import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda): un avatar genérico de desarrollador —no es
 * la cara de nadie— con gafas y cascos, que sigue el cursor con la cabeza y los ojos, parpadea y
 * flota, rodeado de un campo de partículas y anillos con el acento. Decorativa: el h1 dice quién es.
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

/** Colores propios del personaje (piel, pelo, ojos): no dependen del tema. */
const SKIN = 0xe8b08a;
const SKIN_SHADE = 0xd99a73;
const HAIR = 0x2a1d17;
const EYE_WHITE = 0xfafafa;
const IRIS = 0x3a2a20;

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
  head.position.y = 0.55;
  character.add(head);

  const skin = standard(SKIN, 0.6);
  const skinShade = standard(SKIN_SHADE, 0.65);
  const hair = standard(HAIR, 0.8);
  const accentMat = standard(0x7fee64, 0.35, { emissive: 0x7fee64, emissiveIntensity: 0.25 });
  const dark = standard(0x1a1d1b, 0.5);
  const hoodie = standard(0x1e2320, 0.85);

  const sphere = (radius: number, segments = 48) => keep(new three.SphereGeometry(radius, segments, segments));

  // Cabeza, algo más ancha que alta, como un personaje de animación.
  const skull = new three.Mesh(sphere(1.25), skin);
  skull.scale.set(1, 1.05, 0.98);
  head.add(skull);
  const cheekGeometry = sphere(0.32, 24);
  for (const side of [-1, 1]) {
    const cheek = new three.Mesh(cheekGeometry, skinShade);
    cheek.position.set(side * 0.72, -0.38, 0.9);
    cheek.scale.set(1, 0.7, 0.4);
    head.add(cheek);
    const ear = new three.Mesh(sphere(0.26, 24), skin);
    ear.position.set(side * 1.24, -0.05, 0);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
  }
  const nose = new three.Mesh(sphere(0.17, 24), skinShade);
  nose.position.set(0, -0.12, 1.22);
  nose.scale.set(1, 0.9, 0.8);
  head.add(nose);

  // Pelo: casquete con un tupé.
  const cap = new three.Mesh(keep(new three.SphereGeometry(1.3, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.5)), hair);
  cap.position.y = 0.12;
  cap.rotation.x = -0.25;
  cap.scale.set(1.02, 0.9, 1.04);
  head.add(cap);
  for (const [x, y, z, s] of [[0.25, 1.05, 0.65, 0.55], [-0.35, 1.0, 0.55, 0.5], [0.0, 1.18, 0.2, 0.62], [0.6, 0.85, 0.5, 0.42]] as const) {
    const tuft = new three.Mesh(sphere(s, 24), hair);
    tuft.position.set(x, y, z);
    tuft.scale.set(1, 0.6, 0.85);
    head.add(tuft);
  }

  // Ojos que siguen al cursor, y párpados para parpadear.
  const eyes = [-1, 1].map((side) => {
    const socket = new three.Group();
    socket.position.set(side * 0.42, 0.12, 1.02);
    const white = new three.Mesh(sphere(0.24, 32), standard(EYE_WHITE, 0.25));
    white.scale.z = 0.7;
    const iris = new three.Mesh(sphere(0.12, 24), standard(IRIS, 0.3));
    iris.position.z = 0.15;
    const shine = new three.Mesh(sphere(0.035, 12), keep(new three.MeshBasicMaterial({ color: 0xffffff })));
    shine.position.set(0.04, 0.05, 0.25);
    const pupil = new three.Group();
    pupil.add(iris, shine);
    const lid = new three.Mesh(keep(new three.SphereGeometry(0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), skin);
    lid.scale.set(1, 1, 0.75);
    lid.rotation.x = -Math.PI / 2 + 0.35;
    socket.add(white, pupil, lid);
    head.add(socket);
    return { pupil, lid };
  });
  const browGeometry = keep(new three.CapsuleGeometry(0.06, 0.28, 6, 12));
  const brows = [-1, 1].map((side) => {
    const brow = new three.Mesh(browGeometry, hair);
    brow.position.set(side * 0.42, 0.5, 1.08);
    brow.rotation.z = Math.PI / 2 + side * 0.12;
    head.add(brow);
    return brow;
  });

  // Gafas redondas.
  const rimGeometry = keep(new three.TorusGeometry(0.31, 0.035, 12, 48));
  for (const side of [-1, 1]) {
    const lens = new three.Mesh(rimGeometry, dark);
    lens.position.set(side * 0.42, 0.12, 1.2);
    head.add(lens);
  }
  const bridge = new three.Mesh(keep(new three.CylinderGeometry(0.03, 0.03, 0.22, 8)), dark);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.16, 1.24);
  head.add(bridge);

  // Sonrisa.
  const smile = new three.Mesh(keep(new three.TorusGeometry(0.22, 0.035, 10, 32, Math.PI * 0.8)), keep(new three.MeshStandardMaterial({ color: 0x6b2f2a, roughness: 0.6 })));
  smile.position.set(0, -0.48, 1.08);
  smile.rotation.z = Math.PI + Math.PI * 0.1;
  head.add(smile);

  // Cascos con el acento.
  const band = new three.Mesh(keep(new three.TorusGeometry(1.36, 0.07, 12, 64, Math.PI)), dark);
  band.position.y = 0.05;
  head.add(band);
  for (const side of [-1, 1]) {
    const cup = new three.Mesh(keep(new three.CylinderGeometry(0.36, 0.36, 0.26, 32)), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 1.32, 0, 0);
    head.add(cup);
    const glowRing = new three.Mesh(keep(new three.TorusGeometry(0.3, 0.035, 8, 32)), accentMat);
    glowRing.rotation.y = Math.PI / 2;
    glowRing.position.set(side * 1.47, 0, 0);
    head.add(glowRing);
  }

  // Cuello y sudadera.
  const neck = new three.Mesh(keep(new three.CylinderGeometry(0.38, 0.45, 0.6, 24)), skinShade);
  neck.position.y = -0.9;
  character.add(neck);
  const body = new three.Mesh(keep(new three.CapsuleGeometry(1.15, 0.6, 12, 32)), hoodie);
  body.position.y = -2.1;
  body.scale.set(1.35, 1, 0.85);
  character.add(body);
  for (const side of [-1, 1]) {
    const cord = new three.Mesh(keep(new three.CylinderGeometry(0.035, 0.035, 0.6, 8)), accentMat);
    cord.position.set(side * 0.28, -1.45, 0.88);
    character.add(cord);
  }

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
    hoodie.color.set(next.light ? 0x2a302c : 0x1e2320);
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
    for (const eye of eyes) {
      eye.pupil.position.set(lookX * 0.07, -lookY * 0.06, 0);
    }
    // Parpadeo cada ~4 s.
    const blinkPhase = animate ? (t % 4.2) : 1;
    const closed = blinkPhase < 0.14 ? Math.sin((blinkPhase / 0.14) * Math.PI) : 0;
    for (const eye of eyes) {
      eye.lid.rotation.x = -Math.PI / 2 + 0.35 + closed * 1.25;
    }
    for (const brow of brows) {
      brow.position.y = 0.5 + Math.max(0, -lookY) * 0.06;
    }
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
