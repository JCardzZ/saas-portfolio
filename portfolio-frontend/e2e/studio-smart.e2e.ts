import { expect, Page, test, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Proyecto guardado antes de las reglas inteligentes (formato v2): la base de datos, en la subred
 * pública y conectada con los visitantes. Lo escribe `tools/export-e2e-fixtures.mjs`.
 */
const OLD_PROJECT: { nodes: unknown[] } = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'studio-project-v2-exposed-database.json'), 'utf8'));

/**
 * Lo que enciende la flag `studio.smart-rules` en el Estudio. Se prueba el build de producción
 * en modo demo (sin backend), donde las flags se encienden en el navegador (`demo-feature-flags`).
 * En móviles y tabletas solo se comprueba la lectura; la edición, en escritorio.
 */
const CANVAS = 'app-cloud-infra svg[data-work-canvas]';
/** En estrecho el Estudio no muestra el lienzo de trabajo sino su vista vertical de solo lectura. */
const MOBILE = 'app-cloud-infra app-studio-mobile-canvas';

async function openStudio(page: Page, flags: Record<string, boolean>): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('demo-feature-flags', value), JSON.stringify(flags));
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator(`${CANVAS}, ${MOBILE}`).first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('app-cloud-infra')).toBeVisible();
  await page.waitForTimeout(400);
}

/** La vista del proyecto que se ve: el lienzo de trabajo o, en estrecho, su versión vertical. */
async function shownView(page: Page): Promise<string> {
  return (await page.locator(MOBILE).count()) > 0 ? MOBILE : CANVAS;
}

/**
 * Nodos con ese nombre en la vista que se ve. La vertical puede abreviar el rótulo para que quepa,
 * así que ahí se mira el nombre accesible del nodo, que va entero (y lleva también su coste).
 */
async function nodesNamed(page: Page, text: string) {
  return (await shownView(page)) === MOBILE
    ? page.locator(`${MOBILE} [data-node-id][aria-label*="${text}"]`)
    : page.locator(`${CANVAS} text.node-service`, { hasText: text });
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  // El lienzo con lo que flota sobre él (o, con la vista ajustada, debajo).
  await page.locator('app-cloud-infra .theater-stage').locator('..').screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function viewMenuItem(page: Page, text: string) {
  await page.locator('app-cloud-infra [aria-controls="menu-view"]').click();
  return page.locator('#menu-view button', { hasText: text });
}

const isDesktop = (testInfo: TestInfo) => testInfo.project.name.startsWith('desktop-');

test.describe('lienzo responsivo del Estudio (studio.smart-rules)', () => {
  test('«Ajustar a pantalla» muestra el diagrama entero, sin desplazar el marco ni la página', async ({ page }, testInfo) => {
    await openStudio(page, { 'studio.smart-rules': true });
    test.skip((await page.locator(MOBILE).count()) > 0, 'en estrecho el lienzo de trabajo no se muestra: lo cubre diagrams.e2e.ts');
    await capture(page, testInfo, 'hito-1-ajustar-antes');

    await (await viewMenuItem(page, 'Ajustar a pantalla')).click();
    await expect(page.locator(CANVAS)).toHaveClass(/canvas-fitted/);

    const frame = await page.locator('app-cloud-infra .theater-stage').evaluate((stage) => ({
      scroll: stage.scrollWidth, client: stage.clientWidth,
    }));
    expect(frame.scroll, 'el marco del lienzo no se desplaza en horizontal').toBeLessThanOrEqual(frame.client + 1);
    const page_ = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(page_.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(page_.client + 1);
    // El diagrama cabe además a lo alto de la ventana.
    const box = (await page.locator(CANVAS).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await capture(page, testInfo, 'hito-1-ajustar-despues');

    await (await viewMenuItem(page, 'Ver el lienzo completo')).click();
    await expect(page.locator(CANVAS)).not.toHaveClass(/canvas-fitted/);
    await expect(page.locator(CANVAS)).toHaveAttribute('viewBox', '0 0 1110 716');
  });

  test('con la flag apagada el menú Ver no ofrece nada nuevo', async ({ page }) => {
    await openStudio(page, {});

    await page.locator('app-cloud-infra [aria-controls="menu-view"]').click();
    await expect(page.locator('#menu-view')).toContainText('Auto-ordenar');
    await expect(page.locator('#menu-view')).not.toContainText('Ajustar a pantalla');
  });

  test('al encoger una subred, sus nodos se reacomodan dentro y no se solapan', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'la edición se prueba en escritorio');
    await openStudio(page, { 'studio.smart-rules': true });
    await page.getByRole('button', { name: 'Editar arquitectura' }).click();
    await capture(page, testInfo, 'hito-1-redimensionar-antes');

    const grip = page.locator('app-cloud-infra rect.zone-grip[aria-label*="Subred privada · datos"]');
    await grip.focus();
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press('Shift+ArrowUp');
    }

    const layout = await page.locator(CANVAS).evaluate((svg) => {
      const rect = svg.querySelector('rect.zone[data-zone-id="subnet-data"]')!.getBoundingClientRect();
      const nodes = Array.from(svg.querySelectorAll('g.node'))
        .filter((node) => /PostgreSQL|ElastiCache/.test(node.textContent ?? ''))
        .map((node) => node.querySelector('rect')!.getBoundingClientRect());
      return {
        zone: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        nodes: nodes.map((node) => ({ left: node.left, top: node.top, right: node.right, bottom: node.bottom })),
      };
    });
    expect(layout.nodes.length).toBe(2);
    for (const node of layout.nodes) {
      expect(node.left, 'dentro por la izquierda').toBeGreaterThanOrEqual(layout.zone.left - 1);
      expect(node.right, 'dentro por la derecha').toBeLessThanOrEqual(layout.zone.right + 1);
      expect(node.top, 'dentro por arriba').toBeGreaterThanOrEqual(layout.zone.top - 1);
      expect(node.bottom, 'dentro por abajo').toBeLessThanOrEqual(layout.zone.bottom + 1);
    }
    const [first, second] = layout.nodes;
    const apart = first.right <= second.left + 1 || second.right <= first.left + 1 || first.bottom <= second.top + 1 || second.bottom <= first.top + 1;
    expect(apart, 'los dos nodos no se pisan').toBe(true);
    await capture(page, testInfo, 'hito-1-redimensionar-despues');
  });
});

test.describe('conexiones inteligentes del Estudio (studio.smart-rules)', () => {
  test('al trazar una conexión resalta los destinos válidos, y una inválida no se crea y dice qué hacer', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'la edición se prueba en escritorio');
    await openStudio(page, { 'studio.smart-rules': true });
    await page.getByRole('button', { name: 'Editar arquitectura' }).click();
    const wires = await page.locator(`${CANVAS} path.wire`).count();
    await capture(page, testInfo, 'hito-2-conectar-antes');

    await page.locator(`${CANVAS} g.node[data-node-id="users"]`).click();
    await page.locator(`${CANVAS} g.connect`).press('Enter');
    await expect(page.locator(`${CANVAS} g.node[data-node-id="api"]`)).toHaveClass(/node-target-ok/);
    await expect(page.locator(`${CANVAS} g.node[data-node-id="postgres"]`)).toHaveClass(/node-target-no/);
    await capture(page, testInfo, 'hito-2-conectar-destinos');

    await page.locator(`${CANVAS} g.node[data-node-id="postgres"]`).click({ force: true });
    const refusal = page.getByTestId('connection-refusal');
    await expect(refusal).toContainText('Conexión no creada.');
    await expect(refusal).toContainText('Pon una API en medio');
    await expect(page.locator(`${CANVAS} path.wire`)).toHaveCount(wires);
    await capture(page, testInfo, 'hito-2-conectar-despues');
  });

  test('con la flag apagada no se resalta ni se rechaza nada', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'la edición se prueba en escritorio');
    await openStudio(page, {});
    await page.getByRole('button', { name: 'Editar arquitectura' }).click();
    const wires = await page.locator(`${CANVAS} path.wire`).count();

    await page.locator(`${CANVAS} g.node[data-node-id="users"]`).click();
    await page.locator(`${CANVAS} g.connect`).press('Enter');
    await expect(page.locator(`${CANVAS} .node-target-ok, ${CANVAS} .node-target-no`)).toHaveCount(0);
    await page.locator(`${CANVAS} g.node[data-node-id="postgres"]`).click({ force: true });
    await expect(page.locator(`${CANVAS} path.wire`)).toHaveCount(wires + 1);
    await expect(page.getByTestId('connection-refusal')).toHaveCount(0);
  });

  test('un proyecto antiguo con una base de datos expuesta abre igual y solo avisa, también en móvil', async ({ page }, testInfo) => {
    await page.addInitScript((project) => localStorage.setItem('architecture-studio-project', project), JSON.stringify(OLD_PROJECT));
    await openStudio(page, { 'studio.smart-rules': true });

    const nodes = (await page.locator(MOBILE).count()) ? `${MOBILE} [data-node-id]` : `${CANVAS} g.node`;
    await expect(page.locator(nodes)).toHaveCount(OLD_PROJECT.nodes.length);
    const warnings = page.getByTestId('graph-warnings');
    await expect(warnings).toContainText('Riesgo de seguridad');
    await expect(warnings).toContainText('Pon una API en medio');
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);
    await warnings.scrollIntoViewIfNeeded();
    await warnings.screenshot({ path: join('e2e-screens', testInfo.project.name, 'hito-2-avisos.png') });
  });
});

test.describe('Oracle Cloud en el Estudio (cloud.oracle)', () => {
  const CLOUDS = 'app-cloud-infra [role="radiogroup"][aria-label="Proveedor de nube"] [role="radio"]';

  test('con la flag apagada solo se ofrecen las tres nubes de siempre', async ({ page }) => {
    await openStudio(page, {});

    await expect(page.locator(CLOUDS)).toHaveText(['AWS', 'GCP', 'Azure']);
  });

  test('con la flag encendida el diagrama se traduce a OCI, sin logos de otra nube y sin cifras inventadas', async ({ page }, testInfo) => {
    await openStudio(page, { 'cloud.oracle': true });
    await capture(page, testInfo, 'hito-3-oci-antes');

    await page.locator(CLOUDS, { hasText: 'OCI' }).click();

    // En estrecho el lienzo de trabajo está oculto y se ve su vista vertical: se comprueba lo que se ve.
    const view = await shownView(page);
    await expect((await nodesNamed(page, 'OCI Database with PostgreSQL')).first()).toBeVisible();
    await expect(await nodesNamed(page, 'RDS PostgreSQL')).toHaveCount(0);
    const foreign = await page.locator(`${view} :is(image, img)`).evaluateAll((images) =>
      images.map((image) => image.getAttribute('href') ?? image.getAttribute('src') ?? '').filter((href) => /cloud-icons\/(aws|gcp|azure)\//.test(href)));
    expect(foreign, 'ningún icono de arquitectura de otra nube').toEqual([]);
    const unpriced = view === MOBILE
      ? page.locator(`${MOBILE} [data-node-id][aria-label*="sin estimación"]`)
      : page.locator(`${CANVAS} [data-testid="node-cost"]`, { hasText: 'sin estimación' });
    await expect(unpriced.first()).toBeVisible();
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);
    await capture(page, testInfo, 'hito-3-oci-despues');
  });
});

test.describe('diseño de sistemas en el Estudio (studio.system-design)', () => {
  const VIEWS = 'app-cloud-infra [role="tablist"][aria-label="Vista del proyecto"] [role="tab"]';
  const APP = 'app-cloud-infra app-system-design';

  async function capturePanel(page: Page, testInfo: TestInfo, name: string): Promise<void> {
    const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
    await page.locator(APP).screenshot({ path, animations: 'disabled' });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }

  test('con la flag apagada el Estudio tiene una sola vista', async ({ page }) => {
    await openStudio(page, {});

    await expect(page.locator(VIEWS)).toHaveCount(0);
    await expect(page.locator(APP)).toHaveCount(0);
  });

  test('la vista de Aplicación muestra el sistema entero sin desbordar la página; en el móvil, de solo lectura', async ({ page }, testInfo) => {
    await openStudio(page, { 'studio.system-design': true });
    await capture(page, testInfo, 'hito-4-vista-antes');

    await page.locator(VIEWS, { hasText: 'Aplicación' }).click();

    await expect(page.locator(`${APP} fieldset[data-category]`)).toHaveCount(9);
    await expect(page.locator(`${APP} [data-testid="system-flow"]`)).toContainText('Java · Spring Boot');
    await expect(page.locator(`${APP} [data-testid="system-findings"]`)).toContainText('3 avisos');
    await expect(page.locator('app-cloud-infra [data-testid="infra-view"]')).toBeHidden();
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);

    const narrow = page.viewportSize()!.width < 640;
    await expect(page.locator(`${APP} [data-testid="system-readonly"]`)).toHaveCount(narrow ? 1 : 0);
    // El recuadro entero se desactiva: se comprueba en uno de sus controles.
    const option = page.locator(`${APP} fieldset[data-category="backend"] input[value="go"]`);
    if (narrow) {
      await expect(option).toBeDisabled();
    } else {
      await expect(option).toBeEnabled();
    }
    await capturePanel(page, testInfo, 'hito-4-vista-despues');

    await page.locator(VIEWS, { hasText: 'Infraestructura' }).click();
    await expect(page.locator(await shownView(page))).toBeVisible();
  });

  test('el sistema se dibuja al elegir cada pieza y el asistente dice si escala y qué cambiar', async ({ page }, testInfo) => {
    await openStudio(page, { 'studio.system-design': true });
    await page.locator(VIEWS, { hasText: 'Aplicación' }).click();
    const diagram = page.locator(`${APP} [data-testid="system-diagram"]`);
    await expect(diagram).toBeVisible();
    await expect(diagram.locator('g.piece')).toHaveCount(4);

    // El dibujo cabe en su marco sin encogerse: a lo ancho si hay sitio, apilado si no.
    const frame = (await page.locator(`${APP} app-system-diagram`).boundingBox())!;
    const drawn = (await diagram.boundingBox())!;
    expect(drawn.width, 'el diagrama no desborda su marco').toBeLessThanOrEqual(frame.width + 1);
    const title = await diagram.locator('.piece-title').first().evaluate((text) => Number.parseFloat(getComputedStyle(text).fontSize));
    expect(title, 'el texto no se encoge').toBeGreaterThanOrEqual(14);
    const page_ = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(page_.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(page_.client + 1);
    // Cada tecnología lleva su logo con el nombre al lado, y el aviso de marcas va junto al dibujo.
    await expect(diagram.locator('g.piece[data-piece="backend"] svg.logo')).toHaveAttribute('data-logo', 'Spring Boot');
    await expect(diagram.locator('g.piece[data-piece="backend"] .piece-title')).toHaveText('Spring Boot');
    await expect(page.locator(`${APP} [data-testid="trademark-notice"]`)).toContainText('marcas de sus respectivos dueños');

    await expect(page.locator(`${APP} [data-testid="advisor-verdict"]`)).toHaveText('Escala, pero con límites');
    if (isDesktop(testInfo)) {
      await page.locator(`${APP} fieldset[data-category="cache"] input[value="redis"]`).check();
      await expect(diagram.locator('g.piece')).toHaveCount(5);
      await expect(diagram.locator('g.edge[data-edge="backend-cache"]')).toHaveCount(1);
    }
    await capturePanel(page, testInfo, 'sistema-diagrama');

    await page.locator(`${APP} [data-testid="advisor-open"]`).click();
    const dialog = page.locator('[data-testid="advisor-layer"] [role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-dimension]')).toHaveCount(5);
    await expect(dialog.getByTestId('advisor-basis')).toContainText('No es un modelo de IA');
    await page.waitForTimeout(400);
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.x, 'la ventana del asistente cabe a lo ancho').toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y, 'y a lo alto').toBeGreaterThanOrEqual(-0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    const path = join('e2e-screens', testInfo.project.name, 'sistema-asistente.png');
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach('sistema-asistente', { path, contentType: 'image/png' });

    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('desplegar una pieza, pedir requisitos y generar: las comprobaciones salen al momento', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'la edición se prueba en escritorio');
    await openStudio(page, { 'studio.system-design': true });
    await page.locator(VIEWS, { hasText: 'Aplicación' }).click();

    await page.locator(`${APP} #deploy-backend`).selectOption({ label: 'ECS Fargate' });
    await page.locator(`${APP} #deploy-database`).selectOption({ label: 'RDS PostgreSQL' });
    await page.locator(`${APP} #deploy-client`).selectOption({ label: 'S3 + CloudFront' });
    await expect(page.locator(`${APP} [data-testid="system-findings"]`)).toContainText('Sin avisos');
    await expect(page.locator(`${APP} [data-testid="system-flow"]`)).toContainText('en ECS Fargate');

    await page.locator(`${APP} [data-nfr="rps"]`).fill('800');
    await page.locator(`${APP} [data-nfr="rps"]`).blur();
    await expect(page.locator(`${APP} [data-rule="rps-cache"]`)).toContainText('Elige una caché');
    await page.locator(`${APP} [data-compliance="pci"]`).check();
    await expect(page.locator(`${APP} [data-rule="pci-waf"]`)).toBeVisible();

    // Elegir la caché resuelve el aviso de carga; queda pendiente desplegarla.
    await page.locator(`${APP} fieldset[data-category="cache"] input[value="redis"]`).check();
    await expect(page.locator(`${APP} [data-rule="rps-cache"]`)).toHaveCount(0);
    await page.locator(`${APP} #deploy-cache`).selectOption({ label: 'ElastiCache' });
    await capturePanel(page, testInfo, 'hito-4-requisitos');

    // En modo demo no hay servidor que genere los archivos: se dice, no se inventan.
    await page.locator(`${APP} [data-testid="system-output"] .ui-btn-primary`).click();
    await expect(page.locator(`${APP} [data-testid="system-output-error"]`)).toContainText('en modo demo no se simula');

    // El diseño va con el proyecto: sigue ahí al recargar.
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
    await page.locator(VIEWS, { hasText: 'Aplicación' }).click();
    await expect(page.locator(`${APP} [data-testid="system-flow"]`)).toContainText('en ECS Fargate');
    await expect(page.locator(`${APP} [data-nfr="rps"]`)).toHaveValue('800');
  });

  test('un proyecto guardado antes del diseño de sistemas (v2) abre igual y parte del diseño por defecto', async ({ page }) => {
    await page.addInitScript((project) => localStorage.setItem('architecture-studio-project', project), JSON.stringify(OLD_PROJECT));
    await openStudio(page, { 'studio.system-design': true });

    await expect(page.locator(`${CANVAS} g.node`)).toHaveCount(OLD_PROJECT.nodes.length);
    await page.locator(VIEWS, { hasText: 'Aplicación' }).click();
    await expect(page.locator(`${APP} fieldset[data-category="backend"] input[value="spring-boot"]`)).toBeChecked();
  });
});

test.describe('sistemas de ejemplo en el Estudio (studio.system-templates)', () => {
  const TEMPLATES = 'app-cloud-infra #menu-presets [data-testid="system-template"]';
  // Las plantillas están dentro del menú Proyecto.
  async function openTemplates(page: Page): Promise<void> {
    await page.locator('app-cloud-infra [aria-controls="menu-project"]').click();
    await page.locator('app-cloud-infra [aria-controls="menu-presets"]').click();
  }

  test('con la flag apagada el menú de plantillas es el de siempre', async ({ page }) => {
    await openStudio(page, {});
    await openTemplates(page);

    await expect(page.locator('app-cloud-infra #menu-presets')).toBeVisible();
    await expect(page.locator(TEMPLATES)).toHaveCount(0);
  });

  test('los seis sistemas se ofrecen con la etiqueta «Ejemplo ficticio» y uno se carga con sus dos vistas', async ({ page }, testInfo) => {
    await openStudio(page, { 'studio.system-templates': true, 'studio.system-design': true });
    await openTemplates(page);

    await expect(page.locator(TEMPLATES)).toHaveCount(6);
    await expect(page.locator(`${TEMPLATES} .ui-badge`)).toHaveText(Array(6).fill('Ejemplo ficticio'));
    const scroll = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll.scroll, 'la página no se desplaza en horizontal').toBeLessThanOrEqual(scroll.client + 1);
    const menuPath = join('e2e-screens', testInfo.project.name, 'hito-5-plantillas.png');
    await page.locator('app-cloud-infra #menu-presets').screenshot({ path: menuPath, animations: 'disabled' });
    await testInfo.attach('hito-5-plantillas', { path: menuPath, contentType: 'image/png' });

    await page.locator(TEMPLATES, { hasText: 'Consulta médica en línea' }).click();

    // Se abre por la vista de Aplicación, con todo desplegado y sin nada que corregir.
    const app = page.locator('app-cloud-infra app-system-design');
    await expect(app.locator('[data-testid="system-flow"]')).toContainText('Java · Spring Boot');
    await expect(app.locator('[data-testid="system-findings"]')).toContainText('Sin avisos');
    await expect(app.locator('[data-compliance="health"]')).toBeChecked();
    const appPath = join('e2e-screens', testInfo.project.name, 'hito-5-sistema-aplicacion.png');
    await app.screenshot({ path: appPath, animations: 'disabled' });
    await testInfo.attach('hito-5-sistema-aplicacion', { path: appPath, contentType: 'image/png' });

    // Y la misma plantilla trae su infraestructura, en Azure.
    await page.locator('app-cloud-infra [role="tablist"][aria-label="Vista del proyecto"] [role="tab"]', { hasText: 'Infraestructura' }).click();
    await expect((await nodesNamed(page, 'PostgreSQL Flexible')).first()).toBeVisible();
    await capture(page, testInfo, 'hito-5-sistema-infraestructura');
  });
});
