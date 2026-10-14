import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda): un robot genérico de carcasa brillante —
 * casco con visor de cristal negro, ojos de luz con el acento que siguen al cursor y parpadean,
 * antena, auriculares y un núcleo que late en el pecho—, iluminado con un entorno generado en el
 * propio navegador (sin texturas descargadas). Sostiene en las manos un mazo con las tecnologías
 * de la plataforma y de las nubes; al pulsarlo, las fichas salen volando a un globo que ocupa la
 * pantalla (`activate`), con las de detrás más tenues. El globo se gira arrastrando, con inercia
 * (`drag`, `nudge`). Una ficha pulsada la sostiene el robot con la mano izquierda y, con la derecha,
 * una carta con qué es y cómo ayudo con ella (`showInfo`). Se comporta como un personaje: salta y
 * entorna los ojos al tocarlo, saluda al abrir el mazo, mueve la antena y mira alrededor si nadie
 * lo mueve.
 * Decorativa: el h1 dice quién es.
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

/** Una tecnología del mazo: trazado de Simple Icons (viewBox 24 × 24) y color de marca. */
export interface SceneTech {
  title: string;
  path: string;
  color: string;
  /** Icono oficial de nube (SVG): se dibuja tal cual, sin recolorear ni deformar, con su nombre debajo. */
  image?: string;
}

/** Carta de información que el robot sostiene en la mano derecha, junto a la del logo. */
export interface SceneInfo {
  category: string;
  title: string;
  whatLabel: string;
  what: string;
  helpLabel: string;
  help: string;
}

export interface HeroScene {
  /**
   * Pulsación en (x, y) normalizadas del lienzo: abre el mazo, trae al frente la ficha pulsada,
   * la devuelve a su sitio o recoge el mazo. `null` = teclado (alterna abrir y recoger).
   */
  activate(x: number | null, y: number | null): { open: boolean; focused: string | null };
  /** Recoge el mazo (Esc). */
  close(): void;
  /** Gira los anillos: `dx` es el desplazamiento horizontal normalizado del arrastre. */
  drag(dx: number): void;
  /** Empujón de teclado a izquierda (-1) o derecha (1). */
  nudge(direction: number): void;
  /** Fichas que salen al globo (índices); `null` = todas. Las demás se quedan en las manos. */
  show(indices: ReadonlySet<number> | null): void;
  /** Contenido de la carta de la mano derecha (qué es y cómo ayudo); `null` la guarda. */
  showInfo(info: SceneInfo | null): void;
  /** Mientras `true`, la sonrisa se mueve como una boca (lo marca la voz del robot). */
  speak(speaking: boolean): void;
  /** Agarra la ficha bajo (x, y), si la hay; devuelve su nombre. Se mueve con `fling` y se suelta con `release`. */
  grab(x: number, y: number): string | null;
  /** Avisa cada vez que una ficha lanzada rebota (para el sonido). */
  onBounce(callback: () => void): void;
  /** Lleva la ficha agarrada al punto (x, y) del lienzo. */
  fling(x: number, y: number): void;
  /** Suelta la ficha: sale con la velocidad del gesto, cae con gravedad, rebota y vuelve al globo. */
  release(): void;
  /** Mientras `true`, teclea en el portátil (lo marca el texto que escribe el bocadillo). */
  talk(talking: boolean): void;
  /** Punto de la pantalla (px del lienzo) junto a la cabeza, de donde sale el bocadillo. */
  anchor(narrow: boolean): { x: number; y: number };
  /** Señala la ficha bajo el cursor (coordenadas normalizadas del lienzo, -1…1); devuelve su nombre. */
  pick(x: number, y: number): string | null;
  frame(t: number): void;
  resize(width: number, height: number): void;
  pointer(x: number, y: number): void;
  scroll(progress: number): void;
  setPalette(palette: ScenePalette): void;
  dispose(): void;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Colores propios del robot: no dependen del tema. */
const SHELL = 0xf2f3f5;
const GRAPHITE = 0x1c1d21;
const VISOR = 0x050607;
const METAL = 0x9aa0a8;

export function createHeroScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: ScenePalette, animate: boolean, techs: readonly SceneTech[] = []): HeroScene {
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
  head.position.y = 0.35;
  character.add(head);

  // Entorno para los reflejos: una sala generada con cajas luminosas, sin descargar nada.
  const pmrem = keep(new three.PMREMGenerator(renderer));
  const room = new three.Scene();
  const roomBox = new three.Mesh(keep(new three.BoxGeometry(20, 12, 20)), keep(new three.MeshBasicMaterial({ color: 0x15171a, side: three.BackSide })));
  room.add(roomBox);
  for (const [x, y, z, w, h, c] of [[0, 5.9, 0, 10, 0.2, 0xffffff], [-9.9, 1, 0, 0.2, 6, 0xdfe6ff], [9.9, 2, -2, 0.2, 4, 0x7fee64], [0, 0, -9.9, 8, 3, 0x9aa4b5]] as const) {
    const panel = new three.Mesh(keep(new three.BoxGeometry(w || 0.2, h, x === 0 ? (y > 5 ? 10 : 0.2) : 8)), keep(new three.MeshBasicMaterial({ color: c })));
    panel.position.set(x, y, z);
    room.add(panel);
  }
  const envMap = keep(pmrem.fromScene(room, 0.04).texture);
  scene.environment = envMap;

  const physical = (color: number, roughness: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    keep(new three.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, ...extra }));
  const shell = physical(SHELL, 0.25);
  const graphite = physical(GRAPHITE, 0.35, { metalness: 0.4 });
  const visor = physical(VISOR, 0.05, { metalness: 0.9, clearcoatRoughness: 0.02 });
  const metal = physical(METAL, 0.2, { metalness: 1, clearcoat: 0 });
  const accentMat = keep(new three.MeshStandardMaterial({ color: 0x7fee64, emissive: 0x7fee64, emissiveIntensity: 1, roughness: 0.3 }));

  const sphere = (radius: number, segments = 48) => keep(new three.SphereGeometry(radius, segments, segments));
  const rounded = (w: number, h: number, d: number, r: number) => {
    // Caja redondeada a partir de una esfera estirada por octantes: superficie continua, sin aristas.
    const geometry = keep(new three.SphereGeometry(1, 96, 64));
    const pos = geometry.getAttribute('position');
    const p = new three.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const sx = Math.sign(p.x) * (w / 2 - r) + p.x * r;
      const sy = Math.sign(p.y) * (h / 2 - r) + p.y * r;
      const sz = Math.sign(p.z) * (d / 2 - r) + p.z * r;
      pos.setXYZ(i, sx, sy, sz);
    }
    geometry.computeVertexNormals();
    return geometry;
  };

  // Androide de pie (diseño propio, en el estilo de la referencia): cuerpo de tejido técnico gris
  // mate, casco negro brillante con una franja de luz, articulaciones negras (hombros, codos, cadera,
  // rodillas, tobillos), torso en V y piernas segmentadas. Sin rostro: expresa con la cabeza y las
  // manos.
  const fabric = physical(0x6c6f74, 0.88, { clearcoat: 0, sheen: 1, sheenColor: 0xb9bdc3, sheenRoughness: 0.6 });
  const gloss = physical(0x07080a, 0.07, { metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lightMat = keep(new three.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.8 }));

  /** Segmento de miembro con algo de músculo (torno): de `r0` arriba a `r1` abajo, de largo 1 (se escala). */
  const limbGeometry = (r0: number, r1: number, bulge: number) => {
    const points: THREE.Vector2[] = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cap = Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 12))); // extremos redondeados
      const radius = (r0 + (r1 - r0) * t + bulge * Math.sin(Math.PI * Math.min(1, t * 1.4))) * cap;
      points.push(new three.Vector2(Math.max(0.001, radius), 0.5 - t));
    }
    return keep(new three.LatheGeometry(points, 40));
  };
  const down = new three.Vector3(0, -1, 0);
  const between = new three.Vector3();
  /** Coloca un segmento (largo 1, a lo largo de −y) entre `from` y `to`. */
  const span = (mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {
    between.copy(to).sub(from);
    const length = Math.max(0.001, between.length());
    mesh.position.copy(from).addScaledVector(between, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(down, between.normalize());
  };
  const v = (x: number, y: number, z: number) => new three.Vector3(x, y, z);

  // Cabeza: casco ovalado, franja de luz en el visor y un disco en la sien.
  head.position.y = 0.45;
  head.scale.setScalar(0.74);
  const helmet = new three.Mesh(sphere(1, 64), gloss);
  helmet.scale.set(0.8, 1.02, 0.88);
  helmet.rotation.x = -0.1;
  head.add(helmet);
  const eyeGroup = new three.Group();
  eyeGroup.position.set(0.1, 0.02, 0.86);
  head.add(eyeGroup);
  // La franja hace de «ojos»: parpadea aplastándose.
  const slitGroup = new three.Group();
  eyeGroup.add(slitGroup);
  const slit = new three.Mesh(keep(new three.CapsuleGeometry(0.035, 0.5, 6, 16)), lightMat);
  slit.rotation.set(0, 0.35, Math.PI / 2 + 0.06);
  slitGroup.add(slit);
  const eyes = [slitGroup];
  const smile = new three.Group();
  eyeGroup.add(smile);
  const temple = new three.Mesh(keep(new three.CylinderGeometry(0.22, 0.22, 0.1, 40)), gloss);
  temple.rotation.z = Math.PI / 2;
  temple.position.set(0.8, 0.05, 0.05);
  head.add(temple);
  const templeRing = new three.Mesh(keep(new three.TorusGeometry(0.17, 0.018, 8, 40)), metal);
  templeRing.rotation.y = Math.PI / 2;
  templeRing.position.set(0.86, 0.05, 0.05);
  head.add(templeRing);
  let talking = false;
  let speaking = false;
  const eyeLight = new three.PointLight(0xffffff, 0, 1, 2);
  head.add(eyeLight);
  const antenna = new three.Group();
  head.add(antenna);

  // Cuello largo.
  const neck = new three.Mesh(limbGeometry(0.2, 0.29, 0.02), fabric);
  span(neck, v(0, -0.2, 0), v(0, -1.05, 0.04));
  character.add(neck);
  const collar = new three.Mesh(keep(new three.TorusGeometry(0.36, 0.025, 8, 48)), gloss);
  collar.rotation.x = Math.PI / 2 - 0.15;
  collar.position.set(0, -1.02, 0.03);
  collar.scale.set(1.15, 1, 0.75);
  character.add(collar);

  // Torso esculpido en V (esfera deformada): pecho, surco central y cintura estrecha.
  const torsoGeometry = keep(new three.SphereGeometry(1, 128, 96));
  const tp = torsoGeometry.getAttribute('position');
  const tv = new three.Vector3();
  const lump = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-(dx * dx) / sx - (dy * dy) / sy);
  for (let i = 0; i < tp.count; i++) {
    tv.fromBufferAttribute(tp, i);
    const { x, y, z } = tv;
    const front = Math.max(0, z);
    const relief = 0.09 * lump(Math.abs(x) - 0.42, y - 0.36, 0.08, 0.04) * front - 0.035 * lump(x, y - 0.25, 0.003, 0.3) * front;
    tv.multiplyScalar(1 + relief);
    const taper = y > 0.25 ? 1.12 : 1.12 - (0.25 - y) * 0.42;
    tp.setXYZ(i, tv.x * taper, tv.y * 1.2, tv.z * (z > 0 ? 0.6 : 0.66));
  }
  torsoGeometry.computeVertexNormals();
  const torso = new three.Mesh(torsoGeometry, fabric);
  torso.position.y = -2.15;
  character.add(torso);
  const core = new three.Mesh(keep(new three.CapsuleGeometry(0.03, 0.2, 6, 12)), lightMat);
  core.position.set(0.12, -1.65, 0.66);
  character.add(core);
  const coreRing = new three.Group();
  character.add(coreRing);
  const chest = core;
  for (const side of [-1, 1]) {
    const deltoid = new three.Mesh(sphere(0.36, 40), fabric);
    deltoid.scale.set(1, 1.12, 0.95);
    deltoid.position.set(side * 1.12, -1.38, 0);
    character.add(deltoid);
    const shoulderCap = new three.Mesh(sphere(0.3, 40), gloss);
    shoulderCap.scale.set(1.05, 0.7, 1);
    shoulderCap.position.set(side * 1.08, -1.12, 0);
    character.add(shoulderCap);
  }

  // Cadera negra con la «braga» de tejido y piernas segmentadas.
  const pelvis = new three.Mesh(sphere(1, 48), gloss);
  pelvis.scale.set(0.72, 0.42, 0.5);
  pelvis.position.set(0, -3.38, 0);
  character.add(pelvis);
  const briefs = new three.Mesh(sphere(1, 48), fabric);
  briefs.scale.set(0.62, 0.55, 0.47);
  briefs.position.set(0, -3.68, 0.03);
  character.add(briefs);
  for (const side of [-1, 1]) {
    const hip = new three.Mesh(sphere(0.3, 32), gloss);
    hip.position.set(side * 0.5, -3.72, 0);
    character.add(hip);
    const thigh = new three.Mesh(limbGeometry(0.36, 0.25, 0.06), fabric);
    span(thigh, v(side * 0.46, -3.75, 0), v(side * 0.5, -5.8, 0.06));
    character.add(thigh);
    const knee = new three.Mesh(sphere(0.24, 32), gloss);
    knee.position.set(side * 0.5, -5.88, 0.08);
    character.add(knee);
    const shin = new three.Mesh(limbGeometry(0.26, 0.15, 0.07), fabric);
    span(shin, v(side * 0.5, -5.95, 0.06), v(side * 0.52, -7.8, 0));
    character.add(shin);
    const ankle = new three.Mesh(sphere(0.15, 24), gloss);
    ankle.position.set(side * 0.52, -7.88, 0);
    character.add(ankle);
    const foot = new three.Mesh(rounded(0.36, 0.24, 1.0, 0.11), fabric);
    foot.position.set(side * 0.54, -8.04, 0.3);
    character.add(foot);
    const toe = new three.Mesh(rounded(0.37, 0.1, 0.32, 0.05), gloss);
    toe.position.set(side * 0.54, -8.13, 0.66);
    character.add(toe);
  }

  // Escritorio elevable, fino y minimalista: tablero negro brillante con una tira de luz del acento
  // en el canto, patas de perfil delgado y un portátil fino. Sin faldón: se ven las piernas.
  const DESK_Y = -3.25;
  const deskTop = new three.Mesh(rounded(5.4, 0.09, 1.7, 0.04), gloss);
  deskTop.position.set(0, DESK_Y, 1.35);
  character.add(deskTop);
  const ledStrip = new three.Mesh(keep(new three.BoxGeometry(5.3, 0.025, 0.02)), accentMat);
  ledStrip.position.set(0, DESK_Y - 0.02, 2.21);
  character.add(ledStrip);
  for (const side of [-1, 1]) {
    const leg = new three.Mesh(rounded(0.09, 4.8, 0.14, 0.04), metal);
    leg.position.set(side * 2.35, DESK_Y - 2.45, 1.35);
    character.add(leg);
    const footBar = new three.Mesh(rounded(0.1, 0.07, 1.5, 0.03), metal);
    footBar.position.set(side * 2.35, DESK_Y - 4.85, 1.35);
    character.add(footBar);
  }
  const laptopBase = new three.Mesh(rounded(1.55, 0.05, 1.0, 0.03), metal);
  laptopBase.position.set(0, DESK_Y + 0.07, 1.25);
  character.add(laptopBase);
  const hinge = new three.Group();
  hinge.position.set(0, DESK_Y + 0.09, 1.74);
  hinge.rotation.x = 0.2;
  character.add(hinge);
  const lid = new three.Mesh(rounded(1.55, 0.95, 0.035, 0.02), metal);
  lid.position.y = 0.47;
  hinge.add(lid);
  const lidLogo = new three.Mesh(keep(new three.CircleGeometry(0.08, 32)), accentMat);
  lidLogo.position.set(0, 0.5, 0.025);
  hinge.add(lidLogo);

  // Brazos y manos: sostienen el mazo delante del pecho.
  // Cada brazo va del hombro a la mano; la mano sigue a un objetivo según el gesto (sostener el
  // mazo, presentar el globo, enseñar dos cartas, saludar) y el brazo se estira hasta ella.
  const HANDS = new three.Vector3(0, -1.5, 1.5);
  const armGeometry = keep(new three.CylinderGeometry(0.19, 0.2, 1, 24));
  const fingerGeometry = keep(new three.CapsuleGeometry(0.05, 0.1, 6, 12));
  const up = new three.Vector3(0, 1, 0);
  const upperGeometry = limbGeometry(0.2, 0.15, 0.05);
  const foreGeometry = limbGeometry(0.16, 0.11, 0.04);
  const arms = [-1, 1].map((side) => {
    const shoulder = new three.Vector3(side * 1.18, -1.32, 0);
    const rest = new three.Vector3(side * 0.45, -3.08, 1.05); // sobre el teclado del portátil
    const arm = new three.Mesh(upperGeometry, fabric);
    character.add(arm);
    const forearm = new three.Mesh(foreGeometry, fabric);
    character.add(forearm);
    const elbow = new three.Mesh(sphere(0.16, 24), gloss);
    character.add(elbow);
    const wrist = new three.Mesh(sphere(0.1, 20), gloss);
    character.add(wrist);
    // Mano: palma, cuatro dedos con dos falanges y un pulgar, para que agarre y gesticule.
    const hand = new three.Group();
    hand.position.copy(rest);
    character.add(hand);
    const palm = new three.Mesh(sphere(0.2, 32), gloss);
    palm.scale.set(1.05, 0.9, 0.7);
    hand.add(palm);
    const fingers = [-1.5, -0.5, 0.5, 1.5].map((slot) => {
      const knuckle = new three.Group();
      knuckle.position.set(slot * 0.1, 0.17, 0.02);
      knuckle.rotation.z = -slot * 0.08;
      const base = new three.Mesh(fingerGeometry, gloss);
      base.position.y = 0.09;
      const joint = new three.Group();
      joint.position.y = 0.17;
      const tip = new three.Mesh(fingerGeometry, gloss);
      tip.position.y = 0.08;
      tip.scale.y = 0.85;
      joint.add(tip);
      knuckle.add(base, joint);
      hand.add(knuckle);
      return { knuckle, joint };
    });
    const thumb = new three.Group();
    thumb.position.set(-side * 0.2, 0.0, 0.08);
    thumb.rotation.z = side * 0.9;
    const thumbMesh = new three.Mesh(fingerGeometry, gloss);
    thumbMesh.position.y = 0.09;
    thumb.add(thumbMesh);
    hand.add(thumb);
    return { side, shoulder, rest, arm, forearm, elbow, wrist, hand, fingers, thumb, target: rest.clone() };
  });
  /**
   * Dedos: `grip` 0 = abiertos y estirados, 1 = cerrados (agarrar). `spread` los abre en abanico
   * (saludo). `t` mueve un poco cada dedo por su cuenta, para que la mano no parezca de plástico.
   */
  function poseFingers(limb: (typeof arms)[number], grip: number, spread: number, t: number): void {
    limb.fingers.forEach((finger, index) => {
      const life = animate ? Math.sin(t * 2.3 + index * 1.3 + limb.side) * 0.08 : 0;
      finger.knuckle.rotation.x = grip * 1.1 + life;
      finger.joint.rotation.x = grip * 1.2 + life * 0.5;
      finger.knuckle.rotation.z = -(index - 1.5) * (0.08 + spread * 0.18);
    });
    limb.thumb.rotation.x = grip * 0.9;
  }

  // Brazo de dos segmentos con cinemática inversa: dado el hombro y la mano, el codo sale de la ley
  // de los cosenos, doblado hacia fuera y atrás, como un brazo humano.
  const UPPER = 1.35;
  const FORE = 1.3;
  const toHand = new three.Vector3();
  const pole = new three.Vector3();
  const bend = new three.Vector3();
  const elbowAt = new three.Vector3();
  function placeArms(follow: number): void {
    for (const limb of arms) {
      limb.hand.position.lerp(limb.target, follow);
      toHand.copy(limb.hand.position).sub(limb.shoulder);
      const reach = Math.min(UPPER + FORE - 0.01, Math.max(0.2, toHand.length()));
      toHand.normalize();
      const along = (UPPER * UPPER - FORE * FORE + reach * reach) / (2 * reach);
      const out = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
      pole.set(limb.side * 0.35, 0, -1);
      bend.copy(pole).addScaledVector(toHand, -pole.dot(toHand)).normalize();
      elbowAt.copy(limb.shoulder).addScaledVector(toHand, along).addScaledVector(bend, out);
      span(limb.arm, limb.shoulder, elbowAt);
      span(limb.forearm, elbowAt, limb.hand.position);
      limb.elbow.position.copy(elbowAt);
      limb.wrist.position.copy(limb.hand.position);
    }
  }

  // Fichas de tecnologías: caja fina con el logo en la cara delantera, pintado en un canvas 2D.
  const TILE_W = 0.78;
  const TILE_H = 0.96;
  const tileGeometry = keep(new three.BoxGeometry(TILE_W, TILE_H, 0.05));
  const edge = physical(GRAPHITE, 0.3, { metalness: 0.6 });
  let current = palette;
  const tiles = techs.map((tech, index) => {
    const art = document.createElement('canvas');
    art.width = 256;
    art.height = 316;
    const texture = keep(new three.CanvasTexture(art));
    texture.colorSpace = three.SRGBColorSpace;
    texture.anisotropy = 4;
    const face = keep(new three.MeshPhysicalMaterial({ map: texture, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true }));
    // Canto propio con el acento: brilla al señalarla o al traerla al frente.
    const glow = keep(new three.MeshStandardMaterial({ color: GRAPHITE, emissive: 0x7fee64, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.5, transparent: true }));
    const mesh = new three.Mesh(tileGeometry, [glow, glow, glow, glow, face, glow]);
    scene.add(mesh);
    const tile = {
      tech, art, texture, mesh, index, hover: 0, glow, face, picture: null as HTMLImageElement | null,
      /** Vuelo libre tras lanzarla: velocidad y hasta cuándo dura (luego vuelve a su sitio). */
      flight: null as { velocity: THREE.Vector3; spin: number; until: number } | null,
    };
    if (tech.image) {
      const picture = new Image();
      picture.decoding = 'async';
      picture.onload = () => {
        tile.picture = picture;
        paintTile(tile, current);
      };
      picture.src = tech.image;
    }
    return tile;
  });

  // Carta de información (mano derecha): el mismo formato que las fichas, más alta.
  const infoArt = document.createElement('canvas');
  infoArt.width = 512;
  infoArt.height = 680;
  const infoTexture = keep(new three.CanvasTexture(infoArt));
  infoTexture.colorSpace = three.SRGBColorSpace;
  infoTexture.anisotropy = 4;
  const infoFace = keep(new three.MeshPhysicalMaterial({ map: infoTexture, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true }));
  const infoGlow = keep(new three.MeshStandardMaterial({ color: GRAPHITE, emissive: 0x7fee64, emissiveIntensity: 1, roughness: 0.4, metalness: 0.5, transparent: true }));
  const infoMesh = new three.Mesh(keep(new three.BoxGeometry(1.2, 1.6, 0.05)), [infoGlow, infoGlow, infoGlow, infoGlow, infoFace, infoGlow]);
  infoMesh.scale.setScalar(0.001);
  scene.add(infoMesh);
  let info: SceneInfo | null = null;

  function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number): number {
    const words = text.split(/\s+/);
    let line = '';
    let lines = 0;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        line = word;
        if (++lines >= maxLines) return y + lines * lineHeight;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, y + lines++ * lineHeight);
    return y + lines * lineHeight;
  }

  function paintInfo(colors: ScenePalette): void {
    const ctx = infoArt.getContext('2d');
    if (!ctx || !info) return;
    const { width, height } = infoArt;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 36);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const pad = 40;
    ctx.fillStyle = colors.accentText;
    ctx.font = '600 26px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(info.category.toUpperCase(), pad, pad);
    ctx.fillStyle = colors.ink;
    ctx.font = '800 38px Inter, system-ui, sans-serif';
    let y = wrap(ctx, info.title, pad, pad + 48, width - pad * 2, 44, 3) + 20;
    const block = (label: string, text: string) => {
      ctx.fillStyle = colors.muted;
      ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(label.toUpperCase(), pad, y);
      ctx.fillStyle = colors.ink;
      ctx.font = '500 30px Inter, system-ui, sans-serif';
      y = wrap(ctx, text, pad, y + 34, width - pad * 2, 40, 4) + 26;
    };
    block(info.whatLabel, info.what);
    block(info.helpLabel, info.help);
    infoTexture.needsUpdate = true;
  }

  function paintTile(tile: { art: HTMLCanvasElement; texture: THREE.CanvasTexture; tech: SceneTech; picture: HTMLImageElement | null }, colors: ScenePalette): void {
    const ctx = tile.art.getContext('2d');
    if (!ctx) return;
    const { width, height } = tile.art;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 28);
    ctx.fill();
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 4;
    ctx.stroke();
    const brand = new three.Color(tile.tech.color);
    // Marcas casi negras en oscuro, o casi blancas en claro: con el color del texto, para que se vean.
    const luminance = brand.r * 0.2126 + brand.g * 0.7152 + brand.b * 0.0722;
    const dark = colors.light ? luminance > 0.8 : luminance < 0.12;
    if (tile.picture) {
      // Icono de nube: tal cual, encajado en 140 px sin deformarlo.
      const ratio = Math.min(140 / tile.picture.naturalWidth, 140 / tile.picture.naturalHeight) || 1;
      const w = tile.picture.naturalWidth * ratio;
      const h = tile.picture.naturalHeight * ratio;
      ctx.drawImage(tile.picture, (width - w) / 2, 48 + (140 - h) / 2, w, h);
    } else if (tile.tech.path) {
      ctx.save();
      ctx.translate(width / 2 - 70, 48);
      ctx.scale(140 / 24, 140 / 24);
      ctx.fillStyle = dark ? colors.ink : tile.tech.color;
      ctx.fill(new Path2D(tile.tech.path));
      ctx.restore();
    }
    ctx.fillStyle = colors.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 30;
    do {
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
      size -= 2;
    } while (ctx.measureText(tile.tech.title).width > width - 32 && size > 14);
    ctx.fillText(tile.tech.title, width / 2, 254);
    tile.texture.needsUpdate = true;
  }

  let stackOpen = false;
  let openedAt = 0;
  let clock = 0;
  let spin = 0;
  let spinVelocity = 0;
  let halfWidth = 4.3;
  let halfHeight = 2.7;
  let fit = 1;
  let hovered: (typeof tiles)[number] | null = null;
  let focused: (typeof tiles)[number] | null = null;
  const raycaster = new three.Raycaster();
  const target = new three.Vector3();
  const targetQuat = new three.Quaternion();
  const faceCamera = new three.Quaternion();
  const tilt = new three.Quaternion();
  const zAxis = new three.Vector3(0, 0, 1);

  function placeTiles(dt: number): void {
    const count = tiles.length;
    const shown = tiles.filter((tile) => isShown(tile));
    const shownCount = Math.max(1, shown.length);
    const follow = animate ? 1 - Math.exp(-dt * 6) : 1;
    // Giro: deriva lenta, más el impulso del arrastre que se apaga con fricción.
    if (animate) {
      spinVelocity *= Math.exp(-dt * 2.2);
      spin += ((hovered || focused ? 0 : 0.08) + spinVelocity) * dt;
    }
    faceCamera.copy(camera.quaternion);
    character.updateMatrixWorld();
    // Globo: las fichas repartidas por una esfera de Fibonacci (sin huecos ni montones), tan grande
    // como la pantalla, que gira sobre su eje vertical.
    const radius = Math.max(1.6, Math.min(halfHeight * 0.92, halfWidth * 0.9));
    // Con pocas fichas a la vista, más grandes (hasta un 35 %).
    const cardScale = Math.max(0.62, Math.min(halfHeight, halfWidth) * 0.23) * Math.min(1.35, Math.max(1, Math.sqrt(40 / shownCount)));
    const camY = camera.position.y;
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);
    for (const tile of tiles) {
      const i = tile.index;
      const rank = shown.indexOf(tile);
      const open = stackOpen && rank >= 0 && (!animate || clock - openedAt > rank * 0.035);
      let scale: number;
      let opacity = 1;
      if (open && tile === focused) {
        // En la mano izquierda, a la altura de la cara.
        target.copy(HOLD_LEFT);
        character.localToWorld(target);
        targetQuat.copy(faceCamera);
        scale = 2.1 * character.scale.x;
      } else if (open) {
        const y = 1 - ((rank + 0.5) / shownCount) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = rank * GOLDEN_ANGLE;
        const x0 = Math.cos(theta) * ring;
        const z0 = Math.sin(theta) * ring;
        const depth = z0 * cos + x0 * sin; // -1 detrás … 1 delante
        target.set((x0 * cos - z0 * sin) * radius * 1.25, camY + y * radius * 0.82, depth * radius * 0.9);
        targetQuat.copy(faceCamera);
        scale = cardScale * (0.78 + 0.22 * (depth + 1) / 2) * (focused ? 0.8 : 1);
        // Mientras enseña una, las demás se apartan a un segundo plano.
        opacity = (0.28 + 0.72 * Math.max(0, (depth + 1) / 2) ** 1.4) * (focused ? 0.18 : 1);
      } else {
        // Sobre el escritorio, a la derecha del portátil: un mazo tumbado, algo desordenado.
        target.set(1.75 + Math.sin(i * 2.1) * 0.04, DESK_Y + 0.07 + i * 0.012, 1.3 + Math.cos(i * 1.7) * 0.04);
        character.localToWorld(target);
        tilt.setFromEuler(new three.Euler(-Math.PI / 2, 0, Math.sin(i * 1.3) * 0.08 - 0.2));
        targetQuat.copy(character.quaternion).multiply(tilt);
        scale = 0.85 * character.scale.x;
      }
      if (tile === grabbed) {
        // Sigue al dedo o al cursor, con un poco de retraso para que se note el peso.
        tile.mesh.position.lerp(grabPoint, 0.35);
        tile.mesh.quaternion.slerp(targetQuat, follow);
        tile.mesh.scale.setScalar(cardScale * 1.25);
        tile.face.opacity = tile.glow.opacity = 1;
        tile.glow.emissiveIntensity = 2;
        continue;
      }
      if (tile.flight) {
        // Física simple: gravedad, rebote contra el suelo de la pantalla (y un poco contra los
        // lados) con pérdida de energía, y giro; al acabar el tiempo vuelve a su sitio.
        const { velocity } = tile.flight;
        velocity.y -= 18 * dt;
        tile.mesh.position.addScaledVector(velocity, dt);
        const floor = camY - halfHeight * 0.92;
        if (tile.mesh.position.y < floor) {
          tile.mesh.position.y = floor;
          velocity.y = Math.abs(velocity.y) * 0.55;
          velocity.x *= 0.8;
          onBounce?.();
        }
        const wall = halfWidth * 0.95;
        if (Math.abs(tile.mesh.position.x) > wall) {
          tile.mesh.position.x = Math.sign(tile.mesh.position.x) * wall;
          velocity.x *= -0.6;
        }
        tile.mesh.rotateZ(tile.flight.spin * dt);
        tile.flight.spin *= 0.98;
        tile.face.opacity = tile.glow.opacity = 1;
        if (clock > tile.flight.until) tile.flight = null;
        continue;
      }
      tile.mesh.position.lerp(target, follow);
      tile.mesh.quaternion.slerp(targetQuat, follow);
      tile.hover += ((tile === hovered && tile !== focused ? 1 : 0) - tile.hover) * follow;
      tile.mesh.scale.setScalar(scale * (1 + tile.hover * 0.28));
      tile.glow.emissiveIntensity = 0.15 + tile.hover * 1.4 + (tile === focused ? 1 : 0);
      const alpha = Math.max(opacity, tile.hover);
      tile.face.opacity += (alpha - tile.face.opacity) * follow;
      tile.glow.opacity = tile.face.opacity;
    }
  }

  const HOLD_LEFT = new three.Vector3(-2.2, -0.45, 1.6);
  const HOLD_RIGHT = new three.Vector3(2.3, -0.35, 1.6);
  function placeInfo(follow: number): void {
    const shown = !!(focused && info && stackOpen);
    target.copy(HOLD_RIGHT);
    character.localToWorld(target);
    infoMesh.position.lerp(target, follow);
    infoMesh.quaternion.slerp(faceCamera, follow);
    const goal = shown ? character.scale.x * 1.6 : 0.001;
    infoMesh.scale.setScalar(infoMesh.scale.x + (goal - infoMesh.scale.x) * follow);
    infoFace.opacity = infoGlow.opacity = Math.min(1, infoMesh.scale.x / Math.max(0.01, character.scale.x * 1.6));
  }

  let visible: ReadonlySet<number> | null = null;
  function isShown(tile: (typeof tiles)[number]): boolean {
    return visible === null || visible.has(tile.index);
  }

  let grabbed: (typeof tiles)[number] | null = null;
  const grabPoint = new three.Vector3();
  const lastGrab = new three.Vector3();
  const grabVelocity = new three.Vector3();
  let lastGrabAt = 0;
  let onBounce: (() => void) | null = null;
  /** Punto del plano z = 2 (delante del robot) bajo (x, y) normalizadas del lienzo. */
  function planePoint(x: number, y: number, out: THREE.Vector3): void {
    raycaster.setFromCamera(new three.Vector2(x, y), camera);
    const ray = raycaster.ray;
    const t = (2 - ray.origin.z) / ray.direction.z;
    out.copy(ray.origin).addScaledVector(ray.direction, t);
  }

  function hit(x: number, y: number): (typeof tiles)[number] | null {
    raycaster.setFromCamera(new three.Vector2(x, y), camera);
    const first = raycaster.intersectObjects(tiles.filter((tile) => isShown(tile)).map((tile) => tile.mesh), false)[0];
    return tiles.find((tile) => tile.mesh === first?.object) ?? null;
  }

  // Sin partículas ni anillos propios: el fondo (galaxia y marca de agua) ya da la profundidad.

  let pointerX = 0;
  let pointerY = 0;
  let lookX = 0;
  let lookY = 0;
  let lift = 0;

  function setPalette(next: ScenePalette): void {
    current = next;
    const accent = new three.Color(next.accent);
    accentMat.color.copy(accent);
    accentMat.emissive.copy(accent);
    rim.color.copy(accent);
    eyeLight.color.copy(accent);
    rim2.color.copy(accent);
    hemi.intensity = next.light ? 1.5 : 1.1;
    for (const tile of tiles) {
      paintTile(tile, next);
      tile.glow.emissive.copy(accent);
    }
    infoGlow.emissive.copy(accent);
    paintInfo(next);
  }
  setPalette(palette);

  let viewWidth = 1;
  let viewHeight = 1;
  let last = 0;
  let reactAt = -99;
  let waveAt = -99;
  let pointerAt = 0;
  function frame(t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    clock = t;
    const intro = animate ? easeOutBack(Math.min(1, t / 1.2)) : 1;
    character.scale.setScalar((0.6 + 0.4 * intro) * fit);
    // Reacción al toque: salto con rebote, cabeza ladeada, ojos entornados y antena que vibra.
    const r = animate ? t - reactAt : 99;
    const reacting = r < 1.3;
    const decay = reacting ? Math.exp(-r * 3) : 0;
    const hop = r < 0.55 ? Math.sin((r / 0.55) * Math.PI) : 0;
    character.position.y = (animate ? Math.sin(t * 1.2) * 0.08 : 0) + lift * 1.2 + hop * 0.35 * fit;
    antenna.rotation.z = -0.25 + Math.sin(r * 22) * 0.5 * decay + (animate ? Math.sin(t * 1.7) * 0.05 : 0);

    // Si nadie mueve el cursor, mira alrededor por su cuenta.
    const idle = animate && t - pointerAt > 4;
    const wantX = idle ? Math.sin(t * 0.45) * 0.55 : pointerX;
    const wantY = idle ? (talking && !stackOpen ? 0.55 : Math.sin(t * 0.31 + 1) * 0.25) : pointerY;
    lookX += (wantX - lookX) * 0.08;
    lookY += (wantY - lookY) * 0.08;
    head.rotation.y = lookX * 0.55;
    head.rotation.x = lookY * 0.3 + (talking && animate ? Math.sin(t * 6) * 0.04 : 0);
    head.rotation.z = -lookX * 0.06 + Math.sin(r * 9) * 0.22 * decay;
    character.rotation.y = lookX * 0.15;
    eyeGroup.position.x = lookX * 0.18;
    eyeGroup.position.y = -0.02 - lookY * 0.12;
    const blinkPhase = animate ? t % 4.2 : 1;
    const closed = blinkPhase < 0.16 ? Math.sin((blinkPhase / 0.16) * Math.PI) : 0;
    // Contento tras el toque: ojos entornados (como una sonrisa), y luego vuelve a parpadear.
    const happy = reacting ? Math.min(1, r * 6) * Math.min(1, (1.3 - r) * 4) : 0;
    for (const eye of eyes) eye.scale.y = Math.min(1 - closed * 0.85, 1 - happy * 0.65);
    // Con voz, la sonrisa se abre y cierra como una boca que habla.
    const voice = speaking && animate ? Math.abs(Math.sin(t * 15)) * (0.6 + 0.4 * Math.sin(t * 4.1)) : 0;
    smile.scale.set(1 + happy * 0.6 + voice * 0.3, 0.7 + happy * 0.6 + voice * 1.4, 0.4);
    const pulse = animate ? 0.5 + 0.5 * Math.sin(t * 2.4) : 1;
    accentMat.emissiveIntensity = 0.7 + pulse * 0.6;
    core.scale.setScalar(0.92 + pulse * 0.12);
    coreRing.rotation.z = t * 0.8;
    // Gestos de los brazos.
    const follow = animate ? 1 - Math.exp(-dt * 7) : 1;
    const waving = animate && t - waveAt < 1.6;
    for (const limb of arms) {
      if (focused && stackOpen) {
        limb.target.set(limb.side * 2.05, -1.35, 1.35); // sostiene las dos cartas
      } else if (stackOpen) {
        limb.target.set(limb.side * 2.35, -2.45, 0.9); // presenta el globo, brazos abiertos
      } else {
        // En reposo teclea en el portátil; mientras el bocadillo escribe, las manos golpean por turnos.
        limb.target.copy(limb.rest);
        if (talking && animate) limb.target.y += Math.max(0, Math.sin(t * 19 + (limb.side > 0 ? Math.PI : 0))) * 0.06;
      }
      if (waving && limb.side === 1) {
        limb.target.set(1.75, -0.2 + Math.sin((t - waveAt) * 14) * 0.15, 0.6 + Math.cos((t - waveAt) * 14) * 0.18);
      }
    }
    placeArms(follow);
    const wavingNow = (limb: (typeof arms)[number]) => waving && limb.side === 1;
    for (const limb of arms) {
      const holding = !!(focused && stackOpen); // sostiene las dos cartas
      const typingHands = !stackOpen;
      const resting = !stackOpen && !wavingNow(limb);
      const wave = waving && limb.side === 1;
      const pressed = reacting ? Math.max(0, 1 - r * 2.5) : 0; // al tocarlo, aprieta un instante
      poseFingers(limb, wave ? 0 : Math.min(1, (holding ? 0.75 : typingHands ? 0.45 + (talking ? Math.max(0, Math.sin(t * 23 + limb.side)) * 0.35 : 0) : 0.15) + pressed * 0.4), wave ? 1 : stackOpen && !focused ? 0.6 : 0, t);
      // La mano mira al frente, con la palma un poco inclinada según el gesto.
      // Sobre el teclado la palma mira abajo; al sostener o saludar, los dedos hacia arriba.
      if (resting) limb.hand.rotation.set(-1.3, 0, -limb.side * 0.15);
      else limb.hand.rotation.set(holding ? -0.35 : -0.1, 0, wave ? -limb.side * 0.3 + Math.sin((t - waveAt) * 14) * 0.35 : -limb.side * 0.15);
    }
    placeTiles(dt);
    placeInfo(follow);
    renderer.render(scene, camera);
  }

  return {
    frame,
    activate(x, y) {
      const tile = stackOpen && x !== null && y !== null ? hit(x, y) : null;
      reactAt = clock;
      if (!stackOpen) {
        stackOpen = true;
        openedAt = clock;
        waveAt = clock;
      } else if (tile) {
        focused = focused === tile ? null : tile;
      } else if (focused) {
        focused = null;
      } else {
        stackOpen = false;
        hovered = null;
      }
      return { open: stackOpen, focused: focused?.tech.title ?? null };
    },
    close() {
      stackOpen = false;
      focused = null;
      hovered = null;
    },
    drag(dx) {
      if (stackOpen) spinVelocity += dx * 9;
    },
    talk(next) {
      talking = next;
    },
    anchor(narrow) {
      // Ancho: a la derecha de la cabeza, centrado a la altura de los ojos.
      // Estrecho: a la altura de las piernas (encima no cabe: está el rol).
      const point = narrow ? new three.Vector3(0, -6.6, 1.2) : new three.Vector3(1.6, 0.1, 0);
      (narrow ? character : head).localToWorld(point);
      point.project(camera);
      return { x: ((point.x + 1) / 2) * viewWidth, y: ((1 - point.y) / 2) * viewHeight };
    },
    showInfo(next) {
      info = next;
      paintInfo(current);
    },
    show(indices) {
      visible = indices;
      if (focused && !isShown(focused)) focused = null;
      if (hovered && !isShown(hovered)) hovered = null;
      openedAt = clock;
    },
    nudge(direction) {
      if (!stackOpen) return;
      if (animate) spinVelocity += direction * 1.6;
      else spin += direction * 0.4;
    },
    speak(next) {
      speaking = next;
    },
    grab(x, y) {
      const tile = stackOpen ? hit(x, y) : null;
      if (!tile || tile === focused) return null;
      grabbed = tile;
      tile.flight = null;
      planePoint(x, y, grabPoint);
      lastGrab.copy(grabPoint);
      lastGrabAt = clock;
      grabVelocity.set(0, 0, 0);
      return tile.tech.title;
    },
    fling(x, y) {
      if (!grabbed) return;
      planePoint(x, y, grabPoint);
      const elapsed = Math.max(0.016, clock - lastGrabAt);
      grabVelocity.copy(grabPoint).sub(lastGrab).divideScalar(elapsed).clampLength(0, 30);
      lastGrab.copy(grabPoint);
      lastGrabAt = clock;
    },
    release() {
      if (!grabbed) return;
      grabbed.flight = { velocity: grabVelocity.clone().setZ(0), spin: grabVelocity.x * -0.6, until: clock + 3 };
      grabbed = null;
    },
    onBounce(callback: () => void) {
      onBounce = callback;
    },
    pick(x, y) {
      hovered = stackOpen ? hit(x, y) : null;
      return hovered?.tech.title ?? null;
    },
    setPalette,
    resize(width, height) {
      viewWidth = width;
      viewHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.position.z = 13;
      halfHeight = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - 0.3);
      halfWidth = halfHeight * camera.aspect;
      // El lienzo ocupa toda la pantalla: el robot, a escala de ella, queda en la mitad de abajo, bajo el nombre.
      // Robot entero con su escritorio (~6,2 de alto y de ancho) en la mitad baja, bajo el nombre.
      // De pie, de la cabeza (~1,3) a los pies (~−8,2): en la mitad baja, bajo el nombre.
      fit = Math.min(halfHeight * 0.12, halfWidth * 0.34);
      camera.position.y = -3.45 * fit + halfHeight * (camera.aspect < 0.8 ? 0.26 : 0.36);
      camera.updateProjectionMatrix();
    },
    pointer(x, y) {
      pointerAt = clock;
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
