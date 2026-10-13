import type * as THREE from 'three';

/**
 * Escena 3D del hero (Three.js, cargado bajo demanda): un robot genérico de carcasa brillante —
 * casco con visor de cristal negro, ojos de luz con el acento que siguen al cursor y parpadean,
 * antena, auriculares y un núcleo que late en el pecho—, iluminado con un entorno generado en el
 * propio navegador (sin texturas descargadas). Sostiene en las manos un mazo con las tecnologías
 * de la plataforma y de las nubes; al pulsarlo, las fichas salen volando a un globo que ocupa la
 * pantalla (`activate`), con las de detrás más tenues. El globo se gira arrastrando, con inercia
 * (`drag`, `nudge`), y una ficha pulsada pasa al frente, ampliada.
 * Flota rodeado de partículas y anillos.
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
  const mast = new three.Mesh(keep(new three.CylinderGeometry(0.035, 0.05, 0.6, 16)), metal);
  mast.position.set(0.55, 1.3, -0.1);
  mast.rotation.z = -0.25;
  head.add(mast);
  const beacon = new three.Mesh(sphere(0.1, 24), accentMat);
  beacon.position.set(0.63, 1.62, -0.1);
  head.add(beacon);

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
  chest.position.set(0, -1.9, 0.78);
  character.add(chest);
  const core = new three.Mesh(sphere(0.2, 32), accentMat);
  core.position.set(0, -1.9, 0.95);
  character.add(core);
  const coreRing = new three.Mesh(keep(new three.TorusGeometry(0.32, 0.03, 12, 48)), metal);
  coreRing.position.copy(core.position);
  character.add(coreRing);
  for (const side of [-1, 1]) {
    const shoulder = new three.Mesh(sphere(0.55, 40), graphite);
    shoulder.position.set(side * 1.65, -1.7, 0);
    character.add(shoulder);
  }

  // Brazos y manos: sostienen el mazo delante del pecho.
  const HANDS = new three.Vector3(0, -1.5, 1.5);
  for (const side of [-1, 1]) {
    const from = new three.Vector3(side * 1.65, -1.7, 0);
    const to = new three.Vector3(side * 0.62, -1.62, 1.45);
    const arm = new three.Mesh(keep(new three.CapsuleGeometry(0.2, from.distanceTo(to) - 0.2, 8, 24)), shell);
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new three.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    character.add(arm);
    const hand = new three.Mesh(sphere(0.27, 32), graphite);
    hand.position.copy(to);
    hand.scale.set(1, 1.15, 1);
    character.add(hand);
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
    const tile = { tech, art, texture, mesh, index, hover: 0, glow, face, picture: null as HTMLImageElement | null };
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
    const cardScale = Math.max(0.42, Math.min(halfHeight, halfWidth) * 0.15);
    const camY = camera.position.y;
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);
    for (const tile of tiles) {
      const i = tile.index;
      const open = stackOpen && (!animate || clock - openedAt > i * 0.035);
      let scale: number;
      let opacity = 1;
      if (open && tile === focused) {
        target.set(0, camY, 6);
        targetQuat.copy(faceCamera);
        scale = Math.min(halfHeight, halfWidth) * 0.42;
      } else if (open) {
        const y = 1 - ((i + 0.5) / count) * 2;
        const ring = Math.sqrt(1 - y * y);
        const theta = i * GOLDEN_ANGLE;
        const x0 = Math.cos(theta) * ring;
        const z0 = Math.sin(theta) * ring;
        const depth = z0 * cos + x0 * sin; // -1 detrás … 1 delante
        target.set((x0 * cos - z0 * sin) * radius * 1.25, camY + y * radius * 0.82, depth * radius * 0.9);
        targetQuat.copy(faceCamera);
        scale = cardScale * (0.78 + 0.22 * (depth + 1) / 2) * (focused ? 0.8 : 1);
        opacity = 0.28 + 0.72 * Math.max(0, (depth + 1) / 2) ** 1.4;
      } else {
        // En las manos: un mazo abierto en abanico pequeño, como unas cartas.
        const offset = i - (count - 1) / 2;
        const step = Math.min(0.03, 1.2 / count);
        target.set(HANDS.x + offset * step, HANDS.y + 0.42 - Math.abs(offset) * step * 0.25, HANDS.z + 0.08 + i * 0.006);
        character.localToWorld(target);
        tilt.setFromAxisAngle(zAxis, -offset * Math.min(0.05, 1.5 / count));
        targetQuat.copy(character.quaternion).multiply(tilt);
        scale = 0.62 * character.scale.x;
      }
      tile.mesh.position.lerp(target, follow);
      tile.mesh.quaternion.slerp(targetQuat, follow);
      tile.hover += ((tile === hovered && tile !== focused ? 1 : 0) - tile.hover) * follow;
      tile.mesh.scale.setScalar(scale * (1 + tile.hover * 0.28));
      tile.glow.emissiveIntensity = 0.15 + tile.hover * 1.4 + (tile === focused ? 1 : 0);
      const shown = Math.max(opacity, tile.hover);
      tile.face.opacity += (shown - tile.face.opacity) * follow;
      tile.glow.opacity = tile.face.opacity;
    }
  }

  function hit(x: number, y: number): (typeof tiles)[number] | null {
    raycaster.setFromCamera(new three.Vector2(x, y), camera);
    const first = raycaster.intersectObjects(tiles.map((tile) => tile.mesh), false)[0];
    return tiles.find((tile) => tile.mesh === first?.object) ?? null;
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
    current = next;
    const accent = new three.Color(next.accent);
    accentMat.color.copy(accent);
    accentMat.emissive.copy(accent);
    rim.color.copy(accent);
    eyeLight.color.copy(accent);
    rim2.color.copy(accent);
    ringMaterial.color.copy(accent);
    ringMaterial.opacity = next.light ? 0.6 : 0.4;
    dustMaterial.color.set(next.muted);
    dustMaterial.blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    dustMaterial.needsUpdate = true;
    hemi.intensity = next.light ? 1.5 : 1.1;
    for (const tile of tiles) {
      paintTile(tile, next);
      tile.glow.emissive.copy(accent);
    }
  }
  setPalette(palette);

  let last = 0;
  function frame(t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    clock = t;
    const intro = animate ? easeOutBack(Math.min(1, t / 1.2)) : 1;
    character.scale.setScalar((0.6 + 0.4 * intro) * fit);
    character.position.y = (animate ? Math.sin(t * 1.2) * 0.08 : 0) + lift * 1.2;

    lookX += (pointerX - lookX) * 0.08;
    lookY += (pointerY - lookY) * 0.08;
    head.rotation.y = lookX * 0.55;
    head.rotation.x = lookY * 0.3;
    head.rotation.z = -lookX * 0.06;
    character.rotation.y = lookX * 0.15;
    eyeGroup.position.x = lookX * 0.18;
    eyeGroup.position.y = -0.02 - lookY * 0.12;
    const blinkPhase = animate ? t % 4.2 : 1;
    const closed = blinkPhase < 0.16 ? Math.sin((blinkPhase / 0.16) * Math.PI) : 0;
    for (const eye of eyes) eye.scale.y = 1 - closed * 0.85;
    const pulse = animate ? 0.5 + 0.5 * Math.sin(t * 2.4) : 1;
    accentMat.emissiveIntensity = 0.7 + pulse * 0.6;
    core.scale.setScalar(0.92 + pulse * 0.12);
    coreRing.rotation.z = t * 0.8;
    rings[0].rotation.z = t * 0.15;
    rings[1].rotation.z = -t * 0.1;
    field.rotation.y = t * 0.025 + lookX * 0.1;
    placeTiles(dt);
    renderer.render(scene, camera);
  }

  return {
    frame,
    activate(x, y) {
      const tile = stackOpen && x !== null && y !== null ? hit(x, y) : null;
      if (!stackOpen) {
        stackOpen = true;
        openedAt = clock;
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
    nudge(direction) {
      if (!stackOpen) return;
      if (animate) spinVelocity += direction * 1.6;
      else spin += direction * 0.4;
    },
    pick(x, y) {
      hovered = stackOpen ? hit(x, y) : null;
      return hovered?.tech.title ?? null;
    },
    setPalette,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.position.z = 13;
      halfHeight = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - 0.3);
      halfWidth = halfHeight * camera.aspect;
      // El lienzo ocupa toda la pantalla: el robot, a escala de ella, queda en la mitad de abajo, bajo el nombre.
      fit = Math.min(halfHeight * 0.27, halfWidth * 0.36);
      camera.position.y = halfHeight * 0.42;
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
