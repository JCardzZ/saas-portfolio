import { defineConfig, devices } from '@playwright/test';

/**
 * Matriz de móviles y tabletas × motores. Cada perfil se prueba con Chromium (Chrome en Android)
 * y con WebKit (Safari en iOS). Se prueba el build de producción, servido como en el hosting.
 *
 *   npm run build && npx playwright test                      todo
 *   npx playwright test --project='*-webkit'                  un motor
 *   npx playwright test --project=pixel-7-chromium            un perfil
 */
type Engine = 'chromium' | 'webkit';

interface Profile {
  name: string;
  /** Perfil de dispositivo de Playwright del que salen tamaño, densidad y agente de usuario. */
  device?: keyof typeof devices;
  /** Para los anchos que no tienen perfil propio. */
  viewport?: { width: number; height: number };
}

const PROFILES: Profile[] = [
  { name: 'iphone-se', device: 'iPhone SE' },             // 320 de ancho
  { name: 'galaxy-s9-plus', device: 'Galaxy S9+' },       // 320 de ancho, Android
  { name: 'android-360', viewport: { width: 360, height: 800 } },
  { name: 'iphone-375', viewport: { width: 375, height: 667 } },
  { name: 'iphone-390', viewport: { width: 390, height: 844 } },
  { name: 'iphone-15', device: 'iPhone 15' },             // 393 de ancho
  { name: 'pixel-7', device: 'Pixel 7' },                 // 412 de ancho
  { name: 'iphone-pro-max-430', viewport: { width: 430, height: 932 } },
  { name: 'ipad-mini', device: 'iPad Mini' },             // 768 de ancho
  { name: 'tablet-820', viewport: { width: 820, height: 1180 } },
  { name: 'landscape-667', viewport: { width: 667, height: 375 } },
  { name: 'landscape-915', viewport: { width: 915, height: 412 } },
];

/**
 * Anchos en los que se comprueban los diagramas (diagrams.e2e.ts): móviles de 320 a 440 px
 * (incluye los iPhone Pro Max actuales y los Android grandes) y tabletas de 744 a 1024, cada uno
 * en vertical y en horizontal.
 */
const DIAGRAM_SIZES: [width: number, height: number][] = [
  [320, 568], [360, 800], [375, 667], [390, 844], [393, 852], [402, 874], [412, 915], [430, 932], [440, 956],
  [744, 1133], [768, 1024], [820, 1180], [834, 1194], [1024, 1366],
];
const DIAGRAM_VIEWPORTS = DIAGRAM_SIZES.flatMap(([width, height]) => [{ width, height }, { width: height, height: width }]);

/** Dispositivo base de cada motor para los anchos sin perfil propio. */
const BASE: Record<Engine, keyof typeof devices> = { chromium: 'Pixel 7', webkit: 'iPhone 15' };

function project(profile: Profile, engine: Engine) {
  const descriptor = devices[profile.device ?? BASE[engine]];
  return {
    name: `${profile.name}-${engine}`,
    use: {
      ...descriptor,
      ...(profile.viewport ? { viewport: profile.viewport } : {}),
      browserName: engine,
      defaultBrowserType: engine,
      isMobile: true,
      hasTouch: true,
      // Capturas legibles sin que pesen como a 3×.
      deviceScaleFactor: Math.min(descriptor.deviceScaleFactor ?? 2, 2),
    },
  };
}

/** Lo nuevo que vive detrás de una feature flag: se prueba en todos los perfiles, con la flag encendida. */
const FLAGGED = ['**/studio-smart.e2e.ts', '**/mcp-section.e2e.ts'];
/** Lo que cambia de forma entre el ratón y el dedo: se prueba en todos los perfiles. */
const EVERYWHERE = ['**/service-card.e2e.ts', '**/hero-globe.e2e.ts'];

/** Puerto del servidor de pruebas; `E2E_PORT` lo cambia para probar dos copias del repositorio a la vez. */
const PORT = Number(process.env['E2E_PORT'] ?? 4310);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e-results',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // Los runners tienen pocos núcleos y Playwright usaría uno solo.
  workers: process.env['CI'] ? 2 : undefined,
  timeout: 90_000,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }], ['json', { outputFile: 'e2e-results/results.json' }]]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-ES',
    // El sitio arranca en inglés; las pruebas están escritas contra los textos en español.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'site-lang', value: 'es' }] }] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tools/serve-dist.mjs dist/portfolio-frontend/browser ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
  },
  projects: [
    // Móviles y tabletas: toda la batería de mobile.e2e.ts.
    ...PROFILES.flatMap((profile) => (['chromium', 'webkit'] as Engine[]).map((engine) => ({
      ...project(profile, engine), testMatch: ['**/mobile.e2e.ts', ...FLAGGED, ...EVERYWHERE],
    }))),
    // Los diagramas, en cada ancho y orientación: nada recortado, texto legible, nada fijo encima.
    ...DIAGRAM_VIEWPORTS.flatMap((viewport) => (['chromium', 'webkit'] as Engine[]).map((engine) => ({
      ...project({ name: `diagramas-${viewport.width}x${viewport.height}`, viewport }, engine), testMatch: '**/diagrams.e2e.ts',
    }))),
    // Escritorio, con ratón: los diagramas en su disposición de columnas (desktop.e2e.ts).
    ...(['chromium', 'webkit'] as Engine[]).map((engine) => ({
      name: `desktop-1440-${engine}`,
      testMatch: ['**/desktop.e2e.ts', ...FLAGGED, ...EVERYWHERE],
      use: { browserName: engine, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    })),
  ],
});
