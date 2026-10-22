import type * as THREE from '../../../../shared/three/three-lite';

/**
 * Galaxia espiral de fondo (Three.js): puntos en cuatro brazos, más densos y con el acento en el
 * centro, que giran despacio. El desplazamiento de la página mueve la cámara a través de ella
 * (paralaje). Decorativa y sin interacción.
 */
export interface GalaxyPalette {
  accent: string;
  ink: string;
  light: boolean;
}

export interface GalaxyScene {
  frame(t: number): void;
  resize(width: number, height: number): void;
  scroll(progress: number): void;
  setPalette(palette: GalaxyPalette): void;
  dispose(): void;
}

const STARS = 9000;
const ARMS = 4;
const RADIUS = 9;

export function createGalaxyScene(three: typeof THREE, canvas: HTMLCanvasElement, palette: GalaxyPalette): GalaxyScene {
  const renderer = new three.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(55, 1, 0.1, 100);

  const geometry = new three.BufferGeometry();
  const positions = new Float32Array(STARS * 3);
  const mix = new Float32Array(STARS); // 0 = centro (acento), 1 = borde (tinta)
  for (let i = 0; i < STARS; i++) {
    const r = Math.pow(Math.random(), 1.6) * RADIUS;
    const arm = ((i % ARMS) / ARMS) * Math.PI * 2;
    const swirl = r * 0.55;
    const scatter = (1.4 - r / RADIUS) * 0.15 + 0.35;
    const jitter = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * scatter * (1 + r * 0.25);
    positions[i * 3] = Math.cos(arm + swirl) * r + jitter();
    positions[i * 3 + 1] = jitter() * 0.45;
    positions[i * 3 + 2] = Math.sin(arm + swirl) * r + jitter();
    mix[i] = r / RADIUS;
  }
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  const colors = new Float32Array(STARS * 3);
  geometry.setAttribute('color', new three.BufferAttribute(colors, 3));

  const material = new three.PointsMaterial({ size: 0.038, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false });
  const galaxy = new three.Points(geometry, material);
  galaxy.rotation.x = 0.35;
  scene.add(galaxy);

  let progress = 0;
  let smooth = 0;

  function setPalette(next: GalaxyPalette): void {
    const inner = new three.Color(next.accent);
    const outer = new three.Color(next.ink);
    const color = new three.Color();
    for (let i = 0; i < STARS; i++) {
      color.copy(inner).lerp(outer, Math.min(1, mix[i] * 3));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.getAttribute('color').needsUpdate = true;
    material.blending = next.light ? three.NormalBlending : three.AdditiveBlending;
    material.opacity = next.light ? 0.3 : 0.45;
    material.needsUpdate = true;
  }
  setPalette(palette);

  return {
    frame(t) {
      smooth += (progress - smooth) * 0.06;
      galaxy.rotation.y = t * 0.02 + smooth * 1.2;
      // Al bajar por la página la cámara se acerca y pasa por encima del disco.
      camera.position.set(Math.sin(smooth * 0.8) * 2, 5.5 - smooth * 3.5, 9 - smooth * 4);
      camera.lookAt(0, -0.5, 0);
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
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
