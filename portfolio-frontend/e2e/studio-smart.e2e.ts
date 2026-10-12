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
const CANVAS = 'app-cloud-infra svg[role="group"]';

async function openStudio(page: Page, flags: Record<string, boolean>): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('demo-feature-flags', value), JSON.stringify(flags));
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
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

    await expect(page.locator(`${CANVAS} g.node`)).toHaveCount(OLD_PROJECT.nodes.length);
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

    await expect(page.locator(`${CANVAS} text.node-service`, { hasText: 'OCI Database with PostgreSQL' })).toBeVisible();
    await expect(page.locator(`${CANVAS} text.node-service`, { hasText: 'RDS PostgreSQL' })).toHaveCount(0);
    const foreign = await page.locator(`${CANVAS} image.node-icon`).evaluateAll((images) =>
      images.map((image) => image.getAttribute('href') ?? '').filter((href) => /cloud-icons\/(aws|gcp|azure)\//.test(href)));
    expect(foreign, 'ningún icono de arquitectura de otra nube').toEqual([]);
    await expect(page.locator(`${CANVAS} [data-testid="node-cost"]`, { hasText: 'sin estimación' }).first()).toBeVisible();
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
    await expect(page.locator(CANVAS)).toBeVisible();
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
