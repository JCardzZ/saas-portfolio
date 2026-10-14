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
  /** Nombre de la tecnología (va grande en la carta). */
  name: string;
  /** «Usado en esta plataforma» o «Disponible en el Estudio». */
  status: string;
  /** `true` si la plataforma la usa de verdad (la insignia va en el acento). */
  live: boolean;
  whatLabel: string;
  what: string;
  forLabel: string;
  use: string;
  helpLabel: string;
  help: string;
  /** Pie de la carta (quién la firma). */
  signature: string;
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

  // Casco y visor.
  const helmet = new three.Mesh(rounded(2.5, 2.15, 2.2, 0.85), shell);
  head.add(helmet);
  const visorPlate = new three.Mesh(rounded(2.05, 1.25, 0.5, 0.42), visor);
  visorPlate.position.set(0, -0.05, 0.92);
  head.add(visorPlate);
  const brow = new three.Mesh(keep(new three.TorusGeometry(0.75, 0.04, 12, 64, Math.PI)), metal);
  brow.position.set(0, 0.62, 1.05);
  brow.scale.set(1.25, 0.25, 1);
  head.add(brow);

  // Ojos de luz: se mueven dentro del visor y parpadean aplastándose.
  const eyeGroup = new three.Group();
  eyeGroup.position.set(0, -0.02, 1.19);
  head.add(eyeGroup);
  const eyeGeometry = keep(new three.CapsuleGeometry(0.13, 0.12, 8, 24));
  const eyes = [-1, 1].map((side) => {
    const eye = new three.Mesh(eyeGeometry, accentMat);
    eye.position.x = side * 0.42;
    eye.scale.set(1, 1, 0.4);
    eyeGroup.add(eye);
    return eye;
  });
  // Una sonrisa discreta de luz bajo los ojos: crece al tocar al robot.
  const smile = new three.Mesh(keep(new three.TorusGeometry(0.11, 0.022, 8, 28, Math.PI)), accentMat);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.3, 0);
  smile.scale.set(1, 0.7, 0.4);
  eyeGroup.add(smile);
  // Cejas de luz: la mitad de la expresión (sorpresa, alegría, duda) sale de ellas.
  const browGeometry = keep(new three.CapsuleGeometry(0.022, 0.2, 6, 12));
  const brows = [-1, 1].map((side) => {
    const brow = new three.Mesh(browGeometry, accentMat);
    brow.rotation.z = Math.PI / 2;
    brow.position.set(side * 0.42, 0.27, 0);
    brow.scale.set(1, 1, 0.4);
    eyeGroup.add(brow);
    return brow;
  });
  let talking = false;
  let speaking = false;

  const eyeLight = new three.PointLight(0x7fee64, 2.5, 3, 2);
  eyeLight.position.set(0, 0, 1.6);
  head.add(eyeLight);

  // Auriculares y antena.
  for (const side of [-1, 1]) {
    const pod = new three.Mesh(keep(new three.CylinderGeometry(0.42, 0.42, 0.3, 48)), graphite);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(side * 1.3, 0, 0);
    head.add(pod);
    const ring = new three.Mesh(keep(new three.TorusGeometry(0.3, 0.035, 12, 48)), accentMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 1.46, 0, 0);
    head.add(ring);
  }
  // La antena gira desde su base: así se puede agitar.
  const antenna = new three.Group();
  antenna.position.set(0.47, 1.0, -0.1);
  antenna.rotation.z = -0.25;
  head.add(antenna);
  const mast = new three.Mesh(keep(new three.CylinderGeometry(0.035, 0.05, 0.6, 16)), metal);
  mast.position.set(0, 0.3, 0);
  antenna.add(mast);
  const beacon = new three.Mesh(sphere(0.1, 24), accentMat);
  beacon.position.set(0, 0.64, 0);
  antenna.add(beacon);

  // Cuello articulado, torso y núcleo.
  for (let i = 0; i < 3; i++) {
    const segment = new three.Mesh(keep(new three.CylinderGeometry(0.42 - i * 0.03, 0.42 - i * 0.03, 0.14, 40)), i % 2 ? graphite : metal);
    segment.position.y = -0.82 - i * 0.16;
    character.add(segment);
  }
  const torso = new three.Mesh(rounded(3.1, 2.2, 1.7, 0.75), shell);
  torso.position.y = -2.2;
  character.add(torso);
  const chest = new three.Mesh(rounded(1.6, 1.0, 0.3, 0.22), graphite);
  chest.position.set(0, -1.5, 0.78);
  character.add(chest);
  const core = new three.Mesh(sphere(0.2, 32), accentMat);
  core.position.set(0, -1.5, 0.95);
  character.add(core);
  const coreRing = new three.Mesh(keep(new three.TorusGeometry(0.32, 0.03, 12, 48)), metal);
  coreRing.position.copy(core.position);
  character.add(coreRing);
  for (const side of [-1, 1]) {
    const shoulder = new three.Mesh(sphere(0.55, 40), graphite);
    shoulder.position.set(side * 1.65, -1.7, 0);
    character.add(shoulder);
  }

  // Puesto de trabajo: silla detrás, escritorio delante (su faldón tapa las piernas) y un portátil
  // del que se ve la tapa con una luz del acento. El mazo de fichas descansa sobre la mesa.
  const deskMat = physical(GRAPHITE, 0.45, { metalness: 0.3, clearcoat: 0.4 });
  // Silla gamer genérica de gama alta (sin marca): respaldo esculpido y fino —se estrecha en la
  // cintura y se abre en los hombros—, reposacabezas con dos ranuras, vivos del acento y
  // reposabrazos finos. Enmarca al robot por detrás.
  const chairMat = physical(0x1b1e23, 0.45, { clearcoat: 0.7, clearcoatRoughness: 0.3 });
  const slotMat = keep(new three.MeshBasicMaterial({ color: 0x050607 }));
  const chair = new three.Group();
  chair.position.set(0, 0, -1.2);
  character.add(chair);
  const outline: [number, number][] = [
    [1.05, -3.3], [1.12, -2.5], [0.95, -1.75], [1.48, -0.6], [1.52, 0.35], [1.12, 1.0], [0.8, 1.32], [0.84, 2.15],
  ];
  const back = new three.Shape();
  back.moveTo(-outline[0][0], outline[0][1]);
  for (const [x, y] of outline.slice(1)) back.lineTo(-x, y);
  for (const [x, y] of [...outline].reverse()) back.lineTo(x, y);
  back.closePath();
  const backGeometry = keep(new three.ExtrudeGeometry(back, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 8 }));
  backGeometry.translate(0, 0, -0.09);
  chair.add(new three.Mesh(backGeometry, chairMat));
  for (const side of [-1, 1]) {
    // Ranuras del reposacabezas.
    const slot = new three.Mesh(rounded(0.16, 0.42, 0.02, 0.07), slotMat);
    slot.position.set(side * 0.4, 1.78, 0.16);
    chair.add(slot);
    // Vivos del acento a lo largo del respaldo.
    const piping = new three.Mesh(keep(new three.BoxGeometry(0.045, 2.2, 0.02)), accentMat);
    piping.position.set(side * 1.22, -0.3, 0.16);
    piping.rotation.z = side * 0.04;
    chair.add(piping);
    // Reposabrazos finos.
    const armrest = new three.Mesh(rounded(0.26, 0.1, 1.3, 0.05), chairMat);
    armrest.position.set(side * 1.85, -2.75, 1.05);
    chair.add(armrest);
    const post = new three.Mesh(keep(new three.CylinderGeometry(0.05, 0.05, 0.7, 12)), metal);
    post.position.set(side * 1.85, -3.12, 1.05);
    chair.add(post);
  }
  // Línea del acento en el borde superior del reposacabezas.
  const crest = new three.Mesh(keep(new three.BoxGeometry(1.2, 0.035, 0.02)), accentMat);
  crest.position.set(0, 2.05, 0.16);
  chair.add(crest);

  // Escritorio gamer minimalista: tablero largo y fino negro brillante, tira de luz del acento en el
  // canto delantero y patas de perfil delgado (sin faldón).
  const deskGloss = physical(0x0a0b0d, 0.08, { metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04 });
  const deskTop = new three.Mesh(rounded(9.0, 0.09, 2.2, 0.04), deskGloss);
  deskTop.position.set(0, -2.82, 2.0);
  character.add(deskTop);
  const ledStrip = new three.Mesh(keep(new three.BoxGeometry(8.9, 0.025, 0.02)), accentMat);
  ledStrip.position.set(0, -2.85, 3.11);
  character.add(ledStrip);
  for (const side of [-1, 1]) {
    const leg = new three.Mesh(rounded(0.1, 2.4, 0.16, 0.04), metal);
    leg.position.set(side * 4.0, -4.05, 2.0);
    character.add(leg);
    const footBar = new three.Mesh(rounded(0.12, 0.07, 1.9, 0.03), metal);
    footBar.position.set(side * 4.0, -5.25, 2.0);
    character.add(footBar);
  }
  // Asiento de la silla, columna y base de cinco radios.
  const seat = new three.Mesh(rounded(2.5, 0.32, 2.2, 0.14), chairMat);
  seat.position.set(0, -3.55, 0.15);
  character.add(seat);
  const column = new three.Mesh(keep(new three.CylinderGeometry(0.1, 0.12, 1.35, 20)), metal);
  column.position.set(0, -4.4, 0.15);
  character.add(column);
  for (let spoke = 0; spoke < 5; spoke++) {
    const angle = (spoke / 5) * Math.PI * 2 + 0.3;
    const arm = new three.Mesh(rounded(1.15, 0.08, 0.14, 0.04), chairMat);
    arm.position.set(Math.cos(angle) * 0.55, -5.1, 0.15 + Math.sin(angle) * 0.55);
    arm.rotation.y = -angle;
    character.add(arm);
  }
  // Cadera y piernas del robot, sentado: muslos hacia delante bajo la mesa y pies en el suelo.
  const pelvis = new three.Mesh(rounded(2.1, 0.75, 1.5, 0.35), shell);
  pelvis.position.set(0, -3.25, 0.1);
  character.add(pelvis);
  for (const side of [-1, 1]) {
    const thigh = new three.Mesh(rounded(0.62, 0.55, 1.9, 0.27), shell);
    thigh.position.set(side * 0.55, -3.2, 0.95);
    character.add(thigh);
    const knee = new three.Mesh(sphere(0.3, 24), graphite);
    knee.position.set(side * 0.55, -3.25, 1.9);
    character.add(knee);
    const shin = new three.Mesh(rounded(0.48, 1.8, 0.5, 0.22), shell);
    shin.position.set(side * 0.55, -4.25, 1.95);
    character.add(shin);
    const foot = new three.Mesh(rounded(0.55, 0.28, 0.95, 0.13), graphite);
    foot.position.set(side * 0.55, -5.15, 2.2);
    character.add(foot);
  }

  // Tarjetero minimalista para el mazo: base fina negra con una línea del acento.
  const DOCK = new three.Vector3(2.35, -2.42, 1.9);
  const dock = new three.Mesh(rounded(0.95, 0.07, 0.5, 0.03), deskGloss);
  dock.position.set(DOCK.x, -2.74, DOCK.z - 0.12);
  dock.rotation.y = -0.35;
  character.add(dock);
  const dockLine = new three.Mesh(keep(new three.BoxGeometry(0.85, 0.012, 0.012)), accentMat);
  dockLine.position.set(DOCK.x + 0.08, -2.73, DOCK.z + 0.11);
  dockLine.rotation.y = -0.35;
  character.add(dockLine);

  const laptopBase = new three.Mesh(rounded(1.8, 0.08, 1.2, 0.04), metal);
  laptopBase.position.set(0, -2.74, 1.75);
  character.add(laptopBase);
  const hinge = new three.Group();
  hinge.position.set(0, -2.7, 2.33);
  hinge.rotation.x = 0.22;
  character.add(hinge);
  const lid = new three.Mesh(rounded(1.8, 1.0, 0.05, 0.025), metal);
  lid.position.y = 0.5;
  hinge.add(lid);
  const lidLogo = new three.Mesh(keep(new three.CircleGeometry(0.1, 32)), accentMat);
  lidLogo.position.set(0, 0.55, 0.03);
  hinge.add(lidLogo);

  // Brazos y manos: sostienen el mazo delante del pecho.
  // Cada brazo va del hombro a la mano; la mano sigue a un objetivo según el gesto (sostener el
  // mazo, presentar el globo, enseñar dos cartas, saludar) y el brazo se estira hasta ella.
  const HANDS = new three.Vector3(0, -1.5, 1.5);
  const armGeometry = keep(new three.CylinderGeometry(0.19, 0.2, 1, 24));
  const fingerGeometry = keep(new three.CapsuleGeometry(0.05, 0.1, 6, 12));
  const up = new three.Vector3(0, 1, 0);
  const arms = [-1, 1].map((side) => {
    const shoulder = new three.Vector3(side * 1.65, -1.7, 0);
    const rest = new three.Vector3(side * 0.45, -2.58, 1.55); // sobre el teclado
    const arm = new three.Mesh(armGeometry, shell);
    character.add(arm);
    // Mano: palma, cuatro dedos con dos falanges y un pulgar, para que agarre y gesticule.
    const hand = new three.Group();
    hand.position.copy(rest);
    character.add(hand);
    const palm = new three.Mesh(sphere(0.24, 32), graphite);
    palm.scale.set(1.05, 0.9, 0.7);
    hand.add(palm);
    const fingers = [-1.5, -0.5, 0.5, 1.5].map((slot) => {
      const knuckle = new three.Group();
      knuckle.position.set(slot * 0.1, 0.17, 0.02);
      knuckle.rotation.z = -slot * 0.08;
      const base = new three.Mesh(fingerGeometry, graphite);
      base.position.y = 0.09;
      const joint = new three.Group();
      joint.position.y = 0.17;
      const tip = new three.Mesh(fingerGeometry, graphite);
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
    const thumbMesh = new three.Mesh(fingerGeometry, graphite);
    thumbMesh.position.y = 0.09;
    thumb.add(thumbMesh);
    hand.add(thumb);
    return { side, shoulder, rest, arm, hand, fingers, thumb, target: rest.clone() };
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

  const segment = new three.Vector3();
  function placeArms(follow: number): void {
    for (const limb of arms) {
      limb.hand.position.lerp(limb.target, follow);
      segment.copy(limb.hand.position).sub(limb.shoulder);
      const length = Math.max(0.01, segment.length());
      limb.arm.position.copy(limb.shoulder).addScaledVector(segment, 0.5);
      limb.arm.scale.set(1, length, 1);
      limb.arm.quaternion.setFromUnitVectors(up, segment.normalize());
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
  infoArt.width = 720;
  infoArt.height = 1080;
  const infoTexture = keep(new three.CanvasTexture(infoArt));
  infoTexture.colorSpace = three.SRGBColorSpace;
  infoTexture.anisotropy = 4;
  const infoFace = keep(new three.MeshPhysicalMaterial({ map: infoTexture, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true }));
  const infoGlow = keep(new three.MeshStandardMaterial({ color: GRAPHITE, emissive: 0x7fee64, emissiveIntensity: 1, roughness: 0.4, metalness: 0.5, transparent: true }));
  // Plano (no caja): la silueta de carta de colección la dibuja el canvas con transparencia.
  infoFace.side = three.DoubleSide;
  const infoMesh = new three.Mesh(keep(new three.PlaneGeometry(1.36, 2.04)), infoFace);
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

  /**
   * Carta estilo «carta de colección» (FIFA), moderna y minimalista: silueta de escudo con esquinas
   * cortadas y punta abajo, canto con degradado del acento, logo grande, nombre, insignia (en la
   * plataforma / en el Estudio) y tres bloques: qué es, para qué sirve, cómo ayudo. Sin cifras ni
   * «valoraciones» inventadas.
   */
  function paintInfo(colors: ScenePalette): void {
    const ctx = infoArt.getContext('2d');
    if (!ctx || !info) return;
    const W = infoArt.width;
    const H = infoArt.height;
    const cut = 70;
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(cut, 6);
      ctx.lineTo(W - cut, 6);
      ctx.lineTo(W - 6, cut);
      ctx.lineTo(W - 6, H - 150);
      ctx.quadraticCurveTo(W - 6, H - 110, W - 46, H - 90);
      ctx.lineTo(W / 2 + 30, H - 14);
      ctx.quadraticCurveTo(W / 2, H - 2, W / 2 - 30, H - 14);
      ctx.lineTo(46, H - 90);
      ctx.quadraticCurveTo(6, H - 110, 6, H - 150);
      ctx.lineTo(6, cut);
      ctx.closePath();
    };
    ctx.clearRect(0, 0, W, H);
    // Fondo: superficie con un brillo diagonal suave.
    shield();
    const ground = ctx.createLinearGradient(0, 0, W, H);
    ground.addColorStop(0, colors.surface);
    ground.addColorStop(1, colors.light ? colors.surface : 'black');
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.save();
    shield();
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, 0, W, H * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    // Halo del acento detrás del logo.
    const halo = ctx.createRadialGradient(W - 170, 170, 10, W - 170, 170, 230);
    halo.addColorStop(0, colors.accent);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.restore();
    // Canto: degradado del acento.
    shield();
    const rim = ctx.createLinearGradient(0, 0, W, H);
    rim.addColorStop(0, colors.accent);
    rim.addColorStop(0.5, colors.line);
    rim.addColorStop(1, colors.accent);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 8;
    ctx.stroke();

    const pad = 58;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    // Arriba a la izquierda: área (como la «posición» de una carta).
    ctx.fillStyle = colors.accentText;
    ctx.font = '800 40px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(info.category.toUpperCase(), pad, 70);
    // Insignia de estado.
    ctx.font = '700 26px "JetBrains Mono", ui-monospace, monospace';
    const badge = info.status.toUpperCase();
    const bw = ctx.measureText(badge).width + 32;
    ctx.beginPath();
    ctx.roundRect(pad, 126, bw, 40, 20);
    ctx.fillStyle = info.live ? colors.accent : 'rgba(127,127,127,0.18)';
    ctx.fill();
    ctx.fillStyle = info.live ? 'black' : colors.muted;
    ctx.fillText(badge, pad + 16, 134);
    // Arriba a la derecha: el logo grande (el de la ficha al frente).
    const logo = focused;
    if (logo?.picture) {
      const box = 190;
      const ratio = Math.min(box / logo.picture.naturalWidth, box / logo.picture.naturalHeight) || 1;
      const w = logo.picture.naturalWidth * ratio;
      const h = logo.picture.naturalHeight * ratio;
      ctx.drawImage(logo.picture, W - pad - box + (box - w) / 2, 66 + (box - h) / 2, w, h);
    } else if (logo?.tech.path) {
      const brand = new three.Color(logo.tech.color);
      const luminance = brand.r * 0.2126 + brand.g * 0.7152 + brand.b * 0.0722;
      ctx.save();
      ctx.translate(W - pad - 190, 66);
      ctx.scale(190 / 24, 190 / 24);
      ctx.fillStyle = (colors.light ? luminance > 0.8 : luminance < 0.12) ? colors.ink : logo.tech.color;
      ctx.fill(new Path2D(logo.tech.path));
      ctx.restore();
    }
    // Nombre, grande.
    ctx.fillStyle = colors.ink;
    let size = 84;
    do {
      ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
      size -= 4;
    } while (ctx.measureText(info.name.toUpperCase()).width > W - pad * 2 && size > 40);
    ctx.fillText(info.name.toUpperCase(), pad, 290);
    // Separador con un punto del acento, como el de las cartas.
    let y = 290 + size + 34;
    ctx.fillStyle = colors.line;
    ctx.fillRect(pad, y, W - pad * 2, 2);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(W / 2, y + 1, 7, 0, Math.PI * 2);
    ctx.fill();
    y += 34;
    const block = (label: string, text: string) => {
      ctx.fillStyle = colors.accentText;
      ctx.font = '700 26px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(label.toUpperCase(), pad, y);
      ctx.fillStyle = colors.ink;
      ctx.font = '600 38px Inter, system-ui, sans-serif';
      y = wrap(ctx, text, pad, y + 38, W - pad * 2, 47, 3) + 24;
    };
    block(info.whatLabel, info.what);
    block(info.forLabel, info.use);
    block(info.helpLabel, info.help);
    // Firma, sobre la punta.
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.muted;
    ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(info.signature.toUpperCase(), W / 2, H - 132);
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
      let inDock = false;
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
        // En su soporte del escritorio: de pie, alineadas una tras otra y algo inclinadas hacia
        // atrás, como un tarjetero. Solo se ve la de delante; las demás asoman por arriba.
        const depthInDock = count - 1 - i;
        target.set(DOCK.x, DOCK.y + depthInDock * 0.004, DOCK.z - depthInDock * 0.007);
        character.localToWorld(target);
        tilt.setFromEuler(new three.Euler(-0.22, -0.35, 0));
        targetQuat.copy(character.quaternion).multiply(tilt);
        scale = 0.78 * character.scale.x;
        inDock = true;
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
      // En el soporte, sin brillo en los cantos: un bloque limpio, no un fajo verde.
      tile.glow.emissiveIntensity = inDock ? 0 : 0.15 + tile.hover * 1.4 + (tile === focused ? 1 : 0);
      const alpha = Math.max(opacity, tile.hover);
      tile.face.opacity += (alpha - tile.face.opacity) * follow;
      tile.glow.opacity = tile.face.opacity;
    }
  }

  const HOLD_LEFT = new three.Vector3(-2.75, 0.55, 2.0);
  const HOLD_RIGHT = new three.Vector3(3.55, 1.15, 2.6);
  function placeInfo(follow: number): void {
    const shown = !!(focused && info && stackOpen);
    target.copy(HOLD_RIGHT);
    character.localToWorld(target);
    infoMesh.position.lerp(target, follow);
    infoMesh.quaternion.slerp(faceCamera, follow);
    const goal = shown ? character.scale.x * 2.75 : 0.001;
    infoMesh.scale.setScalar(infoMesh.scale.x + (goal - infoMesh.scale.x) * follow);
    infoFace.opacity = infoGlow.opacity = Math.min(1, infoMesh.scale.x / Math.max(0.01, character.scale.x * 2.75));
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
  let browLift = 0;
  const HEAD_Y = head.position.y;
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
    head.rotation.x = lookY * 0.3;
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
    // Expresión: cejas arriba al ver una carta bajo el cursor (curiosidad) o al tocarlo (alegría);
    // una sola arriba cuando mira alrededor (duda); se mueven al hablar.
    const curious = hovered && !focused ? 1 : 0;
    const doubt = idle && !stackOpen ? Math.max(0, Math.sin(t * 0.45)) : 0;
    browLift += ((Math.max(curious, happy) * 0.09 + voice * 0.03) - browLift) * 0.2;
    brows.forEach((brow, index) => {
      const side = index === 0 ? -1 : 1;
      brow.position.y = 0.27 + browLift + (side === 1 ? doubt * 0.06 : 0);
      brow.rotation.z = Math.PI / 2 + side * (happy * 0.25 - doubt * 0.18 * (side === 1 ? 1 : -0.4));
    });
    // Respira (el torso sube y baja), asiente al hablar y ladea la cabeza al mirar una carta.
    const breath = animate ? Math.sin(t * 1.6) : 0;
    torso.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1 + breath * 0.012);
    head.position.y = HEAD_Y + breath * 0.025;
    if (speaking && animate) head.rotation.x += Math.sin(t * 7) * 0.05;
    head.rotation.z += curious * 0.12 * Math.sin(t * 2) ;
    const pulse = animate ? 0.5 + 0.5 * Math.sin(t * 2.4) : 1;
    accentMat.emissiveIntensity = 0.7 + pulse * 0.6;
    core.scale.setScalar(0.92 + pulse * 0.12);
    coreRing.rotation.z = t * 0.8;
    // Gestos de los brazos.
    const follow = animate ? 1 - Math.exp(-dt * 7) : 1;
    const waving = animate && t - waveAt < 1.6;
    for (const limb of arms) {
      if (focused && stackOpen) {
        // Sostiene las dos cartas: la izquierda, el logo; la derecha, la carta de colección (más alta).
        if (limb.side < 0) limb.target.set(-2.7, -0.55, 1.85);
        else limb.target.set(3.2, -0.3, 2.35);
      } else if (stackOpen) {
        limb.target.set(limb.side * 2.0, -1.05, 0.9); // presenta el globo, brazos abiertos
      } else {
        // Teclea mientras el bocadillo escribe: las manos golpean por turnos.
        limb.target.copy(limb.rest);
        if (talking && animate) limb.target.y += Math.max(0, Math.sin(t * 19 + (limb.side > 0 ? Math.PI : 0))) * 0.07;
      }
      if (waving && limb.side === 1) {
        limb.target.set(1.95, 0.55 + Math.sin((t - waveAt) * 14) * 0.18, 0.7 + Math.cos((t - waveAt) * 14) * 0.2);
      }
    }
    placeArms(follow);
    for (const limb of arms) {
      const holding = !!(focused && stackOpen); // sostiene las dos cartas
      const typingHands = !stackOpen;
      const wave = waving && limb.side === 1;
      const pressed = reacting ? Math.max(0, 1 - r * 2.5) : 0; // al tocarlo, aprieta un instante
      poseFingers(limb, wave ? 0 : Math.min(1, (holding ? 0.75 : typingHands ? 0.45 + (talking ? Math.max(0, Math.sin(t * 23 + limb.side)) * 0.35 : 0) : 0.15) + pressed * 0.4), wave ? 1 : stackOpen && !focused ? 0.6 : 0, t);
      // La mano mira al frente, con la palma un poco inclinada según el gesto.
      limb.hand.rotation.set(holding ? -0.35 : typingHands ? -1.3 : -0.1, 0, wave ? -limb.side * 0.3 + Math.sin((t - waveAt) * 14) * 0.35 : -limb.side * 0.15);
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
      // Estrecho: sobre el faldón del escritorio, bajo el robot (encima no cabe: está el rol).
      const point = narrow ? new three.Vector3(0, -3.55, 3.1) : new three.Vector3(1.55, 0.1, 0);
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
      fit = Math.min(halfHeight * 0.165, halfWidth * 0.29);
      camera.position.y = -1.3 * fit + halfHeight * (camera.aspect < 0.8 ? 0.16 : 0.34);
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
