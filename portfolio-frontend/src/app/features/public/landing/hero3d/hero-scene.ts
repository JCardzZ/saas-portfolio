import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda): avatar estilizado de Manuel hecho con
 * primitivas —tupé negro de punta con laterales rebajados, cejas rectas y gruesas, gesto serio,
 * esmoquin negro con solapas de satén, camisa blanca y corbata gris—. No usa su foto: no hay
 * ninguna imagen suya en el bundle. Sigue el cursor con la cabeza y los ojos, parpadea y flota,
 * rodeado de un campo de partículas y anillos con el acento. Decorativa: el h1 dice quién es.
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

/** Colores propios del personaje (piel, pelo, ojos, traje): no dependen del tema. */
const SKIN = 0xd9a07c;
const SKIN_SHADE = 0xc4855f;
const HAIR = 0x141110;
const EYE_WHITE = 0xf2efea;
const IRIS = 0x2b1d14;
const LIPS = 0xc0786a;
const SUIT = 0x16171a;
const SATIN = 0x2a2b30;
const SHIRT = 0xf4f4f2;
const TIE = 0x3b3d42;

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
  const hair = standard(HAIR, 0.7);
  const fade = standard(HAIR, 0.95, { transparent: true, opacity: 0.55 });
  const accentMat = standard(0x7fee64, 0.35, { emissive: 0x7fee64, emissiveIntensity: 0.25 });
  const suit = standard(SUIT, 0.75);
  const satin = standard(SATIN, 0.25, { metalness: 0.2 });
  const shirt = standard(SHIRT, 0.5);
  const tie = standard(TIE, 0.3, { metalness: 0.25 });

  const sphere = (radius: number, segments = 48) => keep(new three.SphereGeometry(radius, segments, segments));

  // Cabeza algo más alta que ancha, mandíbula marcada.
  const skull = new three.Mesh(sphere(1.2), skin);
  skull.scale.set(0.96, 1.16, 0.98);
  head.add(skull);
  const chin = new three.Mesh(sphere(0.3, 24), skin);
  chin.position.set(0, -1.02, 0.7);
  chin.scale.set(1.2, 0.65, 0.6);
  head.add(chin);
  for (const side of [-1, 1]) {
    const ear = new three.Mesh(sphere(0.26, 24), skin);
    ear.position.set(side * 1.16, -0.05, 0);
    ear.scale.set(0.45, 1, 0.75);
    head.add(ear);
    const nostril = new three.Mesh(sphere(0.085, 16), skinShade);
    nostril.position.set(side * 0.11, -0.28, 1.1);
    head.add(nostril);
  }
  const nose = new three.Mesh(keep(new three.CapsuleGeometry(0.1, 0.2, 8, 16)), skinShade);
  nose.position.set(0, -0.12, 1.17);
  nose.rotation.x = 0.45;
  head.add(nose);

  // Boca seria, labios carnosos.
  const lipMat = standard(LIPS, 0.5);
  const upperLip = new three.Mesh(keep(new three.CapsuleGeometry(0.07, 0.34, 8, 16)), lipMat);
  upperLip.rotation.z = Math.PI / 2;
  upperLip.position.set(0, -0.6, 1.02);
  const lowerLip = new three.Mesh(keep(new three.CapsuleGeometry(0.09, 0.3, 8, 16)), lipMat);
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.position.set(0, -0.74, 0.98);
  head.add(upperLip, lowerLip);

  // Pelo: laterales rebajados (casquete bajo y opaco) y tupé alto peinado hacia arriba.
  const sides = new three.Mesh(keep(new three.SphereGeometry(1.215, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.34)), standard(0x2a2320, 0.95));
  sides.position.y = 0.05;
  sides.rotation.x = -0.32;
  sides.scale.set(0.99, 1.1, 1.0);
  head.add(sides);
  const quiff = new three.Group();
  quiff.position.set(0, 1.0, 0.2);
  quiff.rotation.x = 0.18;
  head.add(quiff);
  const mass = new three.Mesh(sphere(0.6, 32), hair);
  mass.scale.set(1.0, 0.9, 1.45);
  mass.position.y = 0.2;
  quiff.add(mass);
  const spikeGeometry = keep(new three.ConeGeometry(0.27, 1, 16));
  const spikes: [number, number, number, number, number, number][] = [
    // x, y, z, alto, inclinación adelante, inclinación lateral
    [-0.32, 0.55, 0.55, 0.85, 0.32, 0.38],
    [0.0, 0.55, 0.55, 1.00, 0.32, -0.15],
    [0.32, 0.55, 0.55, 0.85, 0.32, -0.45],
    [-0.32, 0.55, 0.25, 0.95, 0.15, 0.38],
    [0.0, 0.55, 0.25, 1.12, 0.15, -0.15],
    [0.32, 0.55, 0.25, 0.95, 0.15, -0.45],
    [-0.32, 0.55, -0.1, 0.89, 0.0, 0.38],
    [0.0, 0.55, -0.1, 1.05, 0.0, -0.15],
    [0.32, 0.55, -0.1, 0.89, 0.0, -0.45],
    [-0.32, 0.55, -0.45, 0.72, -0.2, 0.38],
    [0.0, 0.55, -0.45, 0.85, -0.2, -0.15],
    [0.32, 0.55, -0.45, 0.72, -0.2, -0.45],
  ];
  for (const [x, y, z, h, tiltX, tiltZ] of spikes) {
    const spike = new three.Mesh(spikeGeometry, hair);
    spike.position.set(x, y + h * 0.15, z);
    spike.scale.set(1, h, 0.8);
    spike.rotation.set(tiltX, 0, tiltZ);
    quiff.add(spike);
  }

  // Ojos oscuros, algo entornados (párpado medio caído), que siguen al cursor y parpadean.
  const eyes = [-1, 1].map((side) => {
    const socket = new three.Group();
    socket.position.set(side * 0.4, 0.12, 0.98);
    const white = new three.Mesh(sphere(0.2, 32), standard(EYE_WHITE, 0.25));
    white.scale.set(1.15, 0.8, 0.7);
    const iris = new three.Mesh(sphere(0.11, 24), standard(IRIS, 0.3));
    iris.position.z = 0.12;
    const shine = new three.Mesh(sphere(0.03, 12), keep(new three.MeshBasicMaterial({ color: 0xffffff })));
    shine.position.set(0.04, 0.04, 0.21);
    const pupil = new three.Group();
    pupil.add(iris, shine);
    const lid = new three.Mesh(keep(new three.SphereGeometry(0.235, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), skin);
    lid.scale.set(1.15, 1, 0.75);
    socket.add(white, pupil, lid);
    head.add(socket);
    return { pupil, lid };
  });
  const LID_OPEN = -Math.PI / 2 + 0.75;
  const browGeometry = keep(new three.BoxGeometry(0.46, 0.1, 0.12));
  const brows = [-1, 1].map((side) => {
    const brow = new three.Mesh(browGeometry, hair);
    brow.position.set(side * 0.42, 0.4, 1.06);
    brow.rotation.z = side * -0.1;
    brow.rotation.y = side * 0.25;
    head.add(brow);
    return brow;
  });

  // Cuello, camisa, corbata y esmoquin con solapas de satén.
  const neck = new three.Mesh(keep(new three.CylinderGeometry(0.42, 0.48, 0.7, 24)), skinShade);
  neck.position.y = -1.0;
  character.add(neck);
  const body = new three.Mesh(keep(new three.CapsuleGeometry(1.15, 0.6, 12, 32)), suit);
  body.position.y = -2.25;
  body.scale.set(1.45, 1, 0.85);
  character.add(body);
  const shirtFront = new three.Mesh(keep(new three.ConeGeometry(0.55, 1.1, 3, 1, false)), shirt);
  shirtFront.rotation.set(Math.PI, Math.PI, 0);
  shirtFront.position.set(0, -1.6, 0.98);
  shirtFront.scale.set(1, 1, 0.45);
  character.add(shirtFront);
  for (const side of [-1, 1]) {
    const collar = new three.Mesh(keep(new three.BoxGeometry(0.42, 0.26, 0.08)), shirt);
    collar.position.set(side * 0.22, -1.2, 0.72);
    collar.rotation.set(0.25, side * -0.4, side * 0.55);
    character.add(collar);
    const lapel = new three.Mesh(keep(new three.BoxGeometry(0.34, 1.5, 0.08)), satin);
    lapel.position.set(side * 0.5, -1.75, 1.08);
    lapel.rotation.set(0.15, side * -0.35, side * 0.32);
    character.add(lapel);
  }
  const knot = new three.Mesh(sphere(0.15, 20), tie);
  knot.position.set(0, -1.3, 0.86);
  knot.scale.set(1, 1.05, 0.7);
  character.add(knot);
  const blade = new three.Mesh(keep(new three.CylinderGeometry(0.2, 0.09, 1.05, 4)), tie);
  blade.position.set(0, -1.88, 1.12);
  blade.rotation.set(-0.12, Math.PI / 4, 0);
  blade.scale.set(1, 1, 0.35);
  character.add(blade);
  // Insignia de solapa con el acento: el único guiño de color del personaje.
  const pin = new three.Mesh(sphere(0.07, 16), accentMat);
  pin.position.set(-0.62, -1.75, 1.18);
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
    for (const eye of eyes) {
      eye.pupil.position.set(lookX * 0.07, -lookY * 0.06, 0);
    }
    // Parpadeo cada ~4 s.
    const blinkPhase = animate ? (t % 4.2) : 1;
    const closed = blinkPhase < 0.14 ? Math.sin((blinkPhase / 0.14) * Math.PI) : 0;
    for (const eye of eyes) {
      eye.lid.rotation.x = LID_OPEN + closed * 0.85;
    }
    for (const brow of brows) {
      brow.position.y = 0.4 + Math.max(0, -lookY) * 0.06;
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
