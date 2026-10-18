import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/** Tamaño máximo de un logo dentro de un nodo: 16 px, 20 px en el activo. */
const MAX_ICON = 24;
const VIEWS = ['app-production-architecture', 'app-pipeline-view'];
const CAPTURED = [...VIEWS, 'app-deploy-timeline'];

async function openDelivery(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => document.getElementById('entrega')?.scrollIntoView({ block: 'start' }));
  await expect(page.locator('app-pipeline-view button.node').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function capture(page: Page, testInfo: TestInfo, selector: string, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  await page.locator(selector).screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('arquitectura real y pipeline en escritorio', () => {
  test('solo marcas con permiso, a 24 px y con su nombre al lado; el resto con un símbolo propio', async ({ page }) => {
    await openDelivery(page);
    const canvas = page.locator('app-production-architecture [data-testid="production-canvas"]');
    await expect(canvas).toBeVisible();

    const sizes = await canvas.locator('[data-node] image, [data-node] g > path').evaluateAll((icons) =>
      icons.map((icon) => { const rect = icon.getBoundingClientRect(); return Math.max(rect.width, rect.height); }));
    for (const size of sizes) {
      expect(size, 'tamaño de un icono de nodo').toBeLessThanOrEqual(MAX_ICON);
    }
    for (const id of ['pages', 'gemini', 'ghcr', 'actions', 'postgres']) {
      await expect(canvas.locator(`[data-node="${id}"] image`)).toHaveCount(0);
    }
    await expect(canvas.locator('[data-node="backend"] image')).toHaveAttribute('href', /cloud-icons\/gcp\/cloud-run\.svg$/);
    await expect(canvas.locator('[data-node="backend"]')).toContainText('Cloud Run');
    // Nada que flote sobre el diagrama.
    await expect(page.locator('app-production-architecture app-tech-icon')).toHaveCount(0);
  });

  test('el lienzo de producción: cada pieza en su zona, nada se solapa y cabe en su tarjeta', async ({ page }) => {
    await openDelivery(page);
    const canvas = page.locator('app-production-architecture [data-testid="production-canvas"]');
    const boxes = await canvas.locator('[data-node] rect.card').evaluateAll((cards) =>
      cards.map((card) => { const r = card.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    for (const a of boxes) {
      for (const b of boxes) {
        if (a !== b) {
          const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
          expect(overlap, 'dos piezas se solapan').toBe(false);
        }
      }
    }
    // Cada pieza con zona queda dentro de su recuadro.
    const outside = await page.evaluate(() => {
      const svg = document.querySelector('app-production-architecture [data-testid="production-canvas"]')!;
      const zones = new Map([...svg.querySelectorAll('[data-zone] rect')].map((rect) => [rect.parentElement!.getAttribute('data-zone'), rect.getBoundingClientRect()]));
      return [...svg.querySelectorAll('[data-node]')].filter((node) => {
        const zone = node.getAttribute('data-node') === 'visitor' ? null : [...zones.entries()].find(([, r]) => {
          const n = node.querySelector('rect')!.getBoundingClientRect();
          return n.left >= r.left && n.right <= r.right && n.top >= r.top && n.bottom <= r.bottom;
        });
        return node.getAttribute('data-node') !== 'visitor' && !zone;
      }).map((node) => node.getAttribute('data-node'));
    });
    expect(outside, 'piezas fuera de su zona').toEqual([]);
    // Cabe en su tarjeta (1 px de margen por el redondeo del subpíxel).
    const overflow = await page.locator('app-production-architecture').evaluate((card) => card.scrollWidth - card.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('el diagrama respira: columnas a 48 px o más, nodos a 24 px o más, y nada se solapa', async ({ page }) => {
    await openDelivery(page);

    for (const view of ['app-pipeline-view']) {
      const boxes = await page.locator(`${view} button.node`).evaluateAll((nodes) =>
        nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }));
      expect(new Set(boxes.map((box) => box.h)), `${view}: alto de los nodos`).toEqual(new Set([view === 'app-pipeline-view' ? 36 : 52]));

      for (const a of boxes) {
        for (const b of boxes) {
          if (a === b) {
            continue;
          }
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(overlapX > 0 && overlapY > 0, `${view}: dos nodos se solapan`).toBe(false);
          // Misma columna: al menos 24 px entre uno y el siguiente.
          if (a.x === b.x && b.y > a.y) {
            expect(b.y - (a.y + a.h), `${view}: separación vertical`).toBeGreaterThanOrEqual(24);
          }
          // Columnas vecinas de la misma franja: al menos 48 px.
          if (b.x > a.x && overlapY > 0) {
            expect(b.x - (a.x + a.w), `${view}: separación entre columnas`).toBeGreaterThanOrEqual(48);
          }
        }
      }
      // Cabe en su tarjeta: el diagrama se reorganiza, no obliga a desplazarse de lado.
      const overflow = await page.locator(`${view} .scroller`).evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
      expect(overflow, `${view}: desborde horizontal`).toBeLessThanOrEqual(0);
    }
  });

  test('zoom y «ajustar a pantalla»: el pipeline pasa de varias franjas a una sola, a escala', async ({ page }, testInfo) => {
    await openDelivery(page);
    const view = page.locator('app-pipeline-view');
    const rows = () => view.locator('button.node', { hasText: /^Cambios|gate/ }).evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top)));

    // A tamaño real no cabe en una franja: la última etapa queda más abajo que la primera.
    const [first, last] = await rows();
    expect(last - first).toBeGreaterThan(100);
    await expect(view.locator('.level')).toHaveText('100 %');

    await view.getByRole('button', { name: 'Ajustar a pantalla' }).click();
    await page.waitForTimeout(300);
    const overflow = await view.locator('.scroller').evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(Number((await view.locator('.level').textContent())!.replace(/\D/g, ''))).toBeLessThan(100);
    await capture(page, testInfo, 'app-pipeline-view', 'pipeline-ajustado-a-pantalla');

    await view.getByRole('button', { name: 'Tamaño real' }).click();
    await view.getByRole('button', { name: 'Alejar' }).click();
    await expect(view.locator('.level')).toHaveText('80 %');
    await view.getByRole('button', { name: 'Acercar' }).click();
    await expect(view.locator('.level')).toHaveText('100 %');
  });

  test('se recorre con el teclado, con el foco visible', async ({ page }) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');
    const actions = graph.locator('[data-node="actions"]');

    await actions.focus();
    await expect(actions).toBeFocused();
    // El foco ilumina su camino, igual que el cursor.
    await expect(graph.locator('.edge.lit')).toHaveCount(3);
    await page.keyboard.press('Enter');
    await expect(graph.locator('div[aria-live="polite"]')).toContainText('GitHub Actions');
    await page.keyboard.press('Tab');
    await expect(graph.locator('[data-node]:focus')).toHaveCount(1);
  });

  test('al señalar una pieza se ilumina su camino y el resto se atenúa', async ({ page }, testInfo) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');

    await graph.locator('[data-node="actions"]').hover();
    await page.waitForTimeout(450);
    const opacity = (id: string) => graph.locator(`[data-node="${id}"]`).evaluate((node) => getComputedStyle(node).opacity);
    // GitHub Actions recibe de GitHub y entrega a GHCR y a Pages: esos cuatro siguen encendidos.
    for (const id of ['actions', 'github', 'ghcr', 'pages']) {
      expect(await opacity(id), id).toBe('1');
    }
    for (const id of ['postgres', 'redis', 'visitor']) {
      expect(await opacity(id), id).toBe('0.35');
    }
    await expect(graph.locator('.edge.lit')).toHaveCount(3);
    await capture(page, testInfo, 'app-production-architecture', 'arquitectura-camino-iluminado');
  });

  test('lo planificado va punteado y sin pulsos; la petición del visitante, con ellos', async ({ page }) => {
    await openDelivery(page);
    const graph = page.locator('app-production-architecture');

    expect(await graph.locator('[data-node].planned rect.card').first().evaluate((rect) => getComputedStyle(rect).strokeDasharray)).not.toBe('none');
    expect(await graph.locator('[data-node]:not(.planned) rect.card').first().evaluate((rect) => getComputedStyle(rect).strokeDasharray)).toBe('none');

    const live = await graph.locator('.edge.request:not(.planned)').count();
    expect(live).toBeGreaterThan(0);
    // Un pulso por conexión viva de la petición, ninguno en la entrega ni en lo planificado.
    await expect(graph.locator('.pulse')).toHaveCount(live);
    await expect(page.locator('app-pipeline-view .spark')).toHaveCount(0);
  });

  test('con movimiento reducido no hay puntos de luz en marcha', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDelivery(page);

    expect(await page.locator('app-production-architecture .pulse').evaluateAll((sparks) =>
      sparks.filter((spark) => getComputedStyle(spark).display !== 'none').length)).toBe(0);
  });

  test('capturas de las dos vistas, con la ficha abierta debajo del diagrama', async ({ page }, testInfo) => {
    await openDelivery(page);
    for (const view of CAPTURED) {
      await capture(page, testInfo, view, `${view.replace('app-', '')}`);
    }

    await page.locator('app-pipeline-view button.node', { hasText: 'Backend unit' }).click();
    const detail = page.locator('app-pipeline-view div[aria-live="polite"]');
    await expect(detail).toContainText('Por qué existe');
    // Las dos medidas en el mismo instante: al abrirse, la ficha se lleva a la vista y la página se mueve.
    const [graphBottom, detailTop] = await page.evaluate(() => {
      const view = document.querySelector('app-pipeline-view')!;
      return [
        view.querySelector('app-stage-graph')!.getBoundingClientRect().bottom,
        view.querySelector('div[aria-live="polite"]')!.getBoundingClientRect().top,
      ];
    });
    expect(detailTop, 'la ficha se abre debajo del grafo, no encima').toBeGreaterThanOrEqual(graphBottom);
    await page.mouse.move(0, 0);
    await capture(page, testInfo, 'app-pipeline-view', 'pipeline-view-con-ficha');

    // Sin scroll horizontal de página en escritorio.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('patrones de datos en el Estudio, en escritorio', () => {
  async function openStudio(page: Page): Promise<void> {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.getElementById('cloud')?.scrollIntoView({ block: 'start' }));
    await expect(page.locator('#cloud app-data-blueprints li[data-blueprint]')).toHaveCount(3, { timeout: 15_000 });
    await page.waitForTimeout(400);
  }

  test('la galería muestra los tres patrones en una fila y los traduce a la nube del lienzo', async ({ page }, testInfo) => {
    await openStudio(page);
    const gallery = page.locator('app-data-blueprints');
    const tops = await gallery.locator('li[data-blueprint]').evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'las tres tarjetas en la misma fila').toBe(1);
    await expect(gallery.locator('li[data-blueprint="cdc-realtime"]')).toContainText('RDS PostgreSQL → Database Migration Service → Redshift');

    await page.locator('app-cloud-infra [role="radio"]', { hasText: 'Azure' }).click();
    await expect(gallery.locator('li[data-blueprint="cdc-realtime"]')).toContainText('Data Factory (CDC)');
    await expect(gallery.locator('li[data-blueprint="multi-region-recovery"]')).toContainText('Azure SQL Database (failover groups)');
    await gallery.scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'app-data-blueprints', 'patrones-de-datos');
  });

  test('cargar un patrón reemplaza el lienzo, sin avisos, y el filtro Grafo enseña el diff', async ({ page }, testInfo) => {
    await openStudio(page);
    const studio = page.locator('app-cloud-infra');
    const card = page.locator('li[data-blueprint="event-analytics"]');
    await card.getByRole('button', { name: 'Cargar en el lienzo' }).click();
    await card.getByRole('button', { name: 'Reemplazar' }).click();

    await expect(studio.locator('svg text.node-service', { hasText: 'Kinesis Data Streams' })).toBeVisible();
    await expect(studio.locator('path.wire[data-kind="EVENT_BUS"]')).toHaveCount(3);
    await expect(studio.locator('path.wire[data-kind="ANALYTICS_SINK"]')).toHaveCount(2);
    await expect(studio.locator('[data-testid="graph-warnings"]')).toHaveCount(0);
    await expect(studio.locator('[data-testid="rule-badge"]')).toHaveCount(0);
    // Los nodos del patrón no se pisan.
    const spots = await studio.locator('g.node').evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; }));
    expect(new Set(spots).size, 'nodos en posiciones distintas').toBe(spots.length);
    await capture(page, testInfo, 'app-cloud-infra', 'estudio-analitica-por-eventos');

    await studio.locator('button[aria-controls="menu-view"]').click();
    await studio.getByRole('button', { name: /^Grafo/ }).click();
    const inspector = page.locator('app-trace-inspector');
    await expect(inspector.locator('h3')).toContainText('Grafo');
    await expect(inspector.locator('[data-testid="graph-entry"]').first()).toContainText('[Graph Diff]');
    await expect(inspector.locator('[data-testid="graph-entry"]').first()).toContainText('+ nodo');
    await inspector.getByRole('button', { name: 'Ver JSON completo' }).click();
    await expect(inspector.locator('[data-testid="graph-json"]')).toContainText('"kind": "EVENT_BUS"');
    await expect(inspector.locator('[data-testid="graph-json"]')).toContainText('"version": 3');
  });

  test('una instancia duplicada y un servicio sin Terraform ni coste se avisan a la vista', async ({ page }, testInfo) => {
    await openStudio(page);
    const studio = page.locator('app-cloud-infra');
    await studio.getByRole('button', { name: 'Editar arquitectura' }).click();
    const add = studio.locator('app-service-catalog button[aria-label^="Añadir Tableau"]');
    await add.click();
    await add.click();

    await expect(studio.locator('[data-testid="graph-warnings"] li')).toHaveText(['Instancia duplicada: Tableau #2. Este lienzo admite una sola.']);
    await expect(studio.locator('[data-testid="rule-badge"]')).toHaveCount(1);
    await expect(studio.locator('app-cost-badge')).toContainText('+2 sin estimación');
    await studio.locator('button[aria-controls="menu-view"]').click();
    await studio.getByRole('button', { name: /^main\.tf/ }).click();
    await expect(studio.locator('[data-testid="terraform-gap"]').first()).toHaveText('Tableau: sin soporte de Terraform todavía');
    await expect(studio.locator('#main-tf-panel pre')).toContainText('# Tableau: sin soporte de Terraform todavía');
    await capture(page, testInfo, 'app-cloud-infra', 'estudio-avisos-de-reglas');
  });
});

test.describe('paleta de comandos en escritorio', () => {
  async function openPalette(page: Page): Promise<void> {
    await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
    await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
  }

  test('se abre con el atajo: píldora de búsqueda con los cuatro accesos a su derecha y las sugerencias debajo', async ({ page }, testInfo) => {
    await openPalette(page);
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('combobox');
    await expect(field).toBeFocused();
    await expect(dialog).toContainText('Sugerencias');
    await page.waitForTimeout(450);

    const pill = (await dialog.getByTestId('palette-search').boundingBox())!;
    const actions = await dialog.locator('[data-action]').all();
    expect(actions.length).toBe(4);
    let previous = pill.x + pill.width;
    for (const action of actions) {
      const box = (await action.boundingBox())!;
      expect(box.x, 'cada acceso va a la derecha del anterior').toBeGreaterThanOrEqual(previous);
      expect(Math.abs(box.y + box.height / 2 - (pill.y + pill.height / 2)), 'alineado con la píldora').toBeLessThanOrEqual(2);
      expect(Math.abs(box.width - box.height), 'circular').toBeLessThanOrEqual(1);
      previous = box.x + box.width;
    }
    const path = join('e2e-screens', testInfo.project.name, 'paleta-sugerencias.png');
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach('paleta-sugerencias', { path, contentType: 'image/png' });
  });

  test('se recorre con las flechas y Enter lleva a la sección elegida', async ({ page }, testInfo) => {
    await openPalette(page);
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('combobox');

    await field.fill('pipeline');
    const options = dialog.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toContainText('Entrega');
    await expect(field).toHaveAttribute('aria-activedescendant', (await options.first().getAttribute('id'))!);
    const path = join('e2e-screens', testInfo.project.name, 'paleta-resultados.png');
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach('paleta-resultados', { path, contentType: 'image/png' });

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(field).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await page.locator('#entrega').boundingBox())!.y, { message: 'la sección queda arriba' })
      .toBeLessThan(200);
  });

  test('un acceso rápido limita la búsqueda y lo escrito se puede llevar al asistente', async ({ page }) => {
    await openPalette(page);
    const dialog = page.getByRole('dialog');

    await page.keyboard.press('Control+2');
    await expect(dialog.getByRole('button', { name: 'Proyectos', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('listbox')).toContainText('Proyectos');

    await dialog.getByRole('combobox').fill('¿Qué arquitectura usa el backend?');
    const ask = dialog.getByTestId('palette-ask');
    await expect(ask).toContainText('Preguntar a la IA: «¿Qué arquitectura usa el backend?»');
    await ask.click();
    await expect(dialog.locator('app-markdown').first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: 'IA', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('con movimiento reducido los accesos aparecen sin animación', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPalette(page);
    await page.waitForTimeout(100);

    const running = await page.getByRole('dialog').evaluate((dialog) =>
      dialog.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length);
    expect(running).toBe(0);
  });
});

test.describe('comprobar ahora', () => {
  test('el inspector se acopla abajo y la tarjeta se recoloca sola por encima de él', async ({ page }) => {
    await openDelivery(page);
    const card = page.locator('app-production-architecture');
    // Con la API simulada no hay comprobación real: se responde la salud como lo haría la API.
    await page.evaluate(() => document.querySelector('app-production-architecture')!.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    const button = card.locator('[data-testid="check-now"]');
    test.skip(!(await button.count()), 'sin API real (modo demo) no hay botón de comprobación');
    await button.click();
    await page.waitForTimeout(1500);
    const { legendBottom, visibleBottom } = await page.evaluate(() => {
      const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-bottom')) || 0;
      return {
        legendBottom: document.querySelector('app-production-architecture ul[aria-label="Leyenda"]')!.getBoundingClientRect().bottom,
        visibleBottom: innerHeight - dock,
      };
    });
    expect(legendBottom, 'la leyenda queda por encima del inspector').toBeLessThanOrEqual(visibleBottom);
  });
});
