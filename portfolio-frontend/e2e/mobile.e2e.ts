import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/** Secciones de la página pública, en el orden en que aparecen. */
const SECTIONS = ['plataforma', 'entrega', 'cloud', 'proyectos', 'tecnologias', 'articulos', 'trayectoria'];
/** Lado mínimo de un control táctil (WCAG 2.5.5 y guías de iOS y Android). */
const MIN_TARGET = 44;

/** Controles con los que se interactúa tocando. */
const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="separator"][tabindex]';

/**
 * Abre la página pública en modo demo. La API del build no existe en los tests: se corta la
 * petición para que el arranque no espere los 3 s de la comprobación de salud.
 */
async function openLanding(page: Page, path = '/'): Promise<void> {
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  // El estado del pipeline se lee de la copia incluida en el build, como pasa con el repositorio privado.
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto(path);
  await expect(page.locator('h1')).toBeVisible();
  // Las transiciones de CSS falsean las medidas: se quitan para medir el estado final.
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
}

/** Recorre la página para que se cargue todo lo que espera a entrar en pantalla, y vuelve arriba. */
async function loadEverything(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await expect(page.locator('#cloud app-cloud-infra')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#entrega [data-delivery-tab]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

/**
 * Imita el ajuste de tamaño de texto del sistema (Android) o del navegador (Safari en iOS) al
 * 200 %: crece el texto y nada más; márgenes, iconos y diagramas se quedan como están.
 */
async function doubleTextSize(page: Page): Promise<void> {
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => !element.closest('svg'));
    const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element, index) => element.style.setProperty('font-size', `${sizes[index] * 2}px`, 'important'));
  });
  await page.waitForTimeout(300);
}

/** Elementos que se salen por la derecha sin estar dentro de un contenedor con scroll propio. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = (element: Element): boolean => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
          return true;
        }
      }
      return false;
    };
    const found: string[] = [];
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.right <= width + 1 || clipped(element)) {
        continue;
      }
      const style = getComputedStyle(element);
      if (style.position === 'fixed' && style.visibility === 'hidden') {
        continue;
      }
      found.push(`<${element.tagName.toLowerCase()} class="${String(element.getAttribute('class') ?? '').slice(0, 60)}"> llega a ${Math.round(rect.right)} px`);
      if (found.length >= 8) {
        break;
      }
    }
    return found;
  });
}

async function expectNoHorizontalScroll(page: Page, context: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const culprits = scrollWidth > clientWidth ? await overflowing(page) : [];
  expect(scrollWidth, `${context}: la página mide ${scrollWidth} px en una pantalla de ${clientWidth} px. ${culprits.join(' · ')}`)
    .toBeLessThanOrEqual(clientWidth);
}

/** Controles visibles que miden menos de 44 × 44 px, en toda la página o dentro de `scope`. */
async function smallTargets(page: Page, scope: string | null = null): Promise<string[]> {
  return page.evaluate(({ selector, min, scope }) => {
      const problems: string[] = [];
      const root = scope ? document.querySelector(scope) : document;
      for (const control of root?.querySelectorAll<HTMLElement | SVGElement>(selector) ?? []) {
        const style = getComputedStyle(control);
        // Una casilla, un interruptor o un selector de archivo se tocan por su etiqueta: cuenta ella.
        const target = control instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(control.type)
          ? control.closest('label') ?? control
          : control;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') {
          continue;
        }
        // Lo que mide 1 px está oculto a la vista a propósito (solo lo usa el lector de pantalla).
        if (target === control && rect.width <= 2 && rect.height <= 2) {
          continue;
        }
        // Un enlace dentro de una frase es la excepción que admite WCAG: su tamaño es el del texto.
        if (control.tagName === 'A' && style.display === 'inline' && (control.parentElement?.textContent ?? '').trim().length
          > (control.textContent ?? '').trim().length + 8) {
          continue;
        }
        if (rect.width < min - 0.5 || rect.height < min - 0.5) {
          const text = (control.getAttribute('aria-label') ?? control.getAttribute('placeholder') ?? control.textContent ?? '')
            .trim().replace(/\s+/g, ' ').slice(0, 36);
          problems.push(`<${control.tagName.toLowerCase()}${control.getAttribute('type') ? ` type=${control.getAttribute('type')}` : ''}> "${text}" mide ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
      return [...new Set(problems)];
  }, { selector: INTERACTIVE, min: MIN_TARGET, scope });
}

/**
 * Captura de lo que se ve en pantalla. Queda en e2e-screens/<perfil>/<nombre>.png (el artefacto que
 * se revisa a mano) y adjunta al informe del test.
 */
async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = false): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `${name}.png`);
  // La página entera, a escala 1: a 2× una sola captura pesa varios megas.
  await page.screenshot({ path, animations: 'disabled', fullPage, scale: fullPage ? 'css' : 'device' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('página pública en móviles y tabletas', () => {
  test('cada sección se ve entera y la página no tiene scroll horizontal', async ({ page }, testInfo) => {
    await openLanding(page);
    await loadEverything(page);

    await capture(page, testInfo, '00-inicio');
    for (const [index, id] of SECTIONS.entries()) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ block: 'start' }), id);
      await page.waitForTimeout(250);
      await capture(page, testInfo, `${String(index + 1).padStart(2, '0')}-${id}`);
      await expectNoHorizontalScroll(page, `sección ${id}`);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    await capture(page, testInfo, `${String(SECTIONS.length + 1).padStart(2, '0')}-pie`);
    await expectNoHorizontalScroll(page, 'pie');

    // La página entera, para revisarla de un vistazo.
    await capture(page, testInfo, 'pagina-completa', true);
  });

  test('ningún elemento fijo tapa un control', async ({ page }) => {
    await openLanding(page);
    await loadEverything(page);

    const covered = await page.evaluate((selector) => {
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          && Number(style.opacity) > 0.05;
      };
      const pinned = [...document.querySelectorAll('body *')].filter((element) => {
        const position = getComputedStyle(element).position;
        // Un fondo decorativo fijo con z-index negativo (la galaxia) queda detrás de todo y no recibe
        // clics: no tapa nada.
        const behind = Number(getComputedStyle(element).zIndex) < 0;
        return (position === 'fixed' || position === 'sticky') && visible(element) && !behind;
      });
      const label = (element: Element): string =>
        `<${element.tagName.toLowerCase()}> "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;

      const overlap = (first: Element, second: Element): [number, number] => {
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        return [Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)];
      };

      const problems: string[] = [];
      for (const control of document.querySelectorAll(selector)) {
        if (!visible(control) || pinned.some((element) => element.contains(control))) {
          continue;
        }
        // Al centro de la pantalla si se puede; los del principio y el final de la página se quedan
        // junto a un borde, que es donde están la barra superior y lo que va fijo abajo.
        control.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = control.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          continue;
        }
        for (const element of pinned) {
          if (control.contains(element)) {
            continue;
          }
          let [overlapX, overlapY] = overlap(control, element);
          if (overlapX <= 4 || overlapY <= 4) {
            continue;
          }
          // Un control más alto que el hueco libre no cabe centrado. Lo que importa es si, desplazando
          // la página, se puede dejar a la vista: se aparta del elemento fijo y se vuelve a medir.
          const fromTop = element.getBoundingClientRect().top < window.innerHeight / 2;
          window.scrollBy(0, fromTop ? -(overlapY + 8) : overlapY + 8);
          [overlapX, overlapY] = overlap(control, element);
          if (overlapX > 4 && overlapY > 4) {
            problems.push(`${label(element)} tapa ${label(control)} (${Math.round(overlapX)}×${Math.round(overlapY)} px)`);
          }
        }
      }
      return [...new Set(problems)].slice(0, 12);
    }, INTERACTIVE);

    expect(covered, covered.join('\n')).toEqual([]);
  });

  test('todos los controles táctiles miden al menos 44 × 44 px', async ({ page }) => {
    await openLanding(page);
    await loadEverything(page);

    const small = await smallTargets(page);

    expect(small, `${small.length} controles pequeños:\n${small.slice(0, 40).join('\n')}`).toEqual([]);
  });

  test('con el texto al 200 % no se rompe ni aparece scroll horizontal', async ({ page }, testInfo) => {
    await openLanding(page);
    await loadEverything(page);
    await doubleTextSize(page);

    await capture(page, testInfo, 'texto-200-inicio');
    await expectNoHorizontalScroll(page, 'inicio con texto al 200 %');
    for (const id of SECTIONS) {
      await page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ block: 'start' }), id);
      await page.waitForTimeout(150);
      await expectNoHorizontalScroll(page, `sección ${id} con texto al 200 %`);
    }
    await page.evaluate(() => document.getElementById('proyectos')?.scrollIntoView({ block: 'start' }));
    await capture(page, testInfo, 'texto-200-proyectos');
  });

  test('con movimiento reducido no queda ninguna animación en marcha', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLanding(page);
    await loadEverything(page);

    const running = await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        const name = (animation as CSSAnimation).animationName ?? 'transición';
        return `${name} en <${target?.tagName.toLowerCase()} class="${String(target?.getAttribute('class') ?? '').slice(0, 50)}">`;
      }));
    await capture(page, testInfo, 'movimiento-reducido');

    expect([...new Set(running)].slice(0, 15), `${running.length} animaciones en marcha`).toEqual([]);
  });

  test('los diálogos y paneles caben en la pantalla y se manejan con el dedo', async ({ page }, testInfo) => {
    await openLanding(page);
    await loadEverything(page);

    const check = async (name: string, scope: string): Promise<void> => {
      await page.waitForTimeout(450);
      await capture(page, testInfo, name);
      await expectNoHorizontalScroll(page, name);
      const box = await page.locator(scope).first().boundingBox();
      const viewport = page.viewportSize()!;
      expect(box, `${name}: no se ve`).not.toBeNull();
      expect(box!.x, `${name}: se sale por la izquierda`).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, `${name}: se sale por la derecha`).toBeLessThanOrEqual(viewport.width + 1);
      const small = await smallTargets(page, scope);
      expect(small, `${name}: ${small.length} controles pequeños:\n${small.join('\n')}`).toEqual([]);
    };

    // Asistente.
    await page.getByRole('button', { name: 'Preguntar a la IA' }).first().tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check('dialogo-asistente', '[role="dialog"]');
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).tap();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Selector de CV.
    await page.getByRole('button', { name: /Descargar CV/ }).first().tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check('dialogo-cv', '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Inspector de traza: se abre al tocar un nodo del diagrama.
    const node = page.locator('#plataforma svg [role="button"]').first();
    await node.scrollIntoViewIfNeeded();
    await node.tap();
    const inspector = page.locator('app-trace-inspector section, app-trace-inspector [data-pill]').first();
    await expect(inspector).toBeVisible();
    await check('inspector-de-traza', 'app-trace-inspector');
    await page.getByRole('button', { name: 'Cerrar el inspector de traza' }).first().tap();
    await expect(inspector).toBeHidden();

    // Estudio: con sitio para el lienzo de trabajo, en modo edición aparece el catálogo de servicios;
    // en estrecho es de solo lectura y no hay botón de editar.
    const edit = page.getByRole('button', { name: 'Editar arquitectura' });
    if (await edit.count()) {
      await edit.scrollIntoViewIfNeeded();
      await edit.tap();
      await expect(page.locator('app-service-catalog')).toBeVisible();
      await check('estudio-en-edicion', 'app-cloud-infra');
    } else {
      const studio = page.locator('app-cloud-infra');
      await studio.scrollIntoViewIfNeeded();
      await expect(studio.locator('app-studio-mobile-canvas')).toBeVisible();
      await check('estudio-solo-lectura', 'app-cloud-infra');
    }
  });

  test('la paleta de comandos baja desde arriba, busca y lleva la pregunta al asistente', async ({ page }, testInfo) => {
    await openLanding(page);
    await page.getByRole('button', { name: 'Preguntar a la IA' }).first().tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(450);

    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    if (viewport.width < 640) {
      // Hoja pegada al borde superior y de lado a lado.
      expect(box.y, 'la hoja empieza arriba').toBeLessThanOrEqual(1);
      expect(box.width, 'la hoja ocupa el ancho').toBeGreaterThanOrEqual(viewport.width - 1);
    }
    expect(box.y + box.height, 'la paleta cabe en la pantalla').toBeLessThanOrEqual(viewport.height + 1);
    const actions = dialog.locator('[data-action]');
    await expect(actions).toHaveCount(4);
    for (const action of await actions.all()) {
      const size = (await action.boundingBox())!;
      expect(Math.min(size.width, size.height), 'acceso rápido de 44 px').toBeGreaterThanOrEqual(44);
    }
    await capture(page, testInfo, 'paleta-sugerencias');

    const field = dialog.getByRole('combobox');
    await field.fill('tecnologias');
    await expect(dialog.getByRole('option', { name: /Tecnologías/ }).first()).toBeVisible();
    await capture(page, testInfo, 'paleta-resultados');
    await expectNoHorizontalScroll(page, 'paleta-resultados');
    for (const option of await dialog.getByRole('option').all()) {
      expect((await option.boundingBox())!.height, 'resultado de 44 px de alto').toBeGreaterThanOrEqual(44);
    }
    const small = await smallTargets(page, '[role="dialog"]');
    expect(small, `paleta: ${small.length} controles pequeños:\n${small.join('\n')}`).toEqual([]);

    await field.fill('¿Qué arquitectura usa el backend?');
    await dialog.getByTestId('palette-ask').tap();
    await expect(dialog.locator('app-markdown').first()).toBeVisible({ timeout: 10_000 });
    await capture(page, testInfo, 'paleta-respuesta');

    await dialog.getByRole('button', { name: 'Cerrar' }).tap();
    await expect(dialog).toBeHidden();
  });

  test('la galería de patrones de datos cabe en la pantalla y carga un patrón preguntando antes', async ({ page }, testInfo) => {
    await openLanding(page);
    await loadEverything(page);
    const gallery = page.locator('#cloud app-data-blueprints');
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery.locator('li[data-blueprint]')).toHaveCount(3);

    // Cada tarjeta, con su miniatura, cabe en el ancho de la pantalla.
    const width = page.viewportSize()!.width;
    const cards = await gallery.locator('li[data-blueprint], li[data-blueprint] svg').evaluateAll((elements) =>
      elements.map((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }));
    for (const card of cards) {
      expect(card.left, 'borde izquierdo de una tarjeta').toBeGreaterThanOrEqual(0);
      expect(card.right, 'borde derecho de una tarjeta').toBeLessThanOrEqual(width + 1);
    }
    expect(await overflowing(page), 'elementos que se salen de la pantalla').toEqual([]);
    await capture(page, testInfo, 'patrones-de-datos');

    // El lienzo ya tiene la arquitectura de referencia: antes de cargar, pregunta.
    const card = gallery.locator('li[data-blueprint="cdc-realtime"]');
    await card.getByRole('button', { name: 'Cargar en el lienzo' }).click();
    await expect(card.getByText('El lienzo ya tiene contenido')).toBeVisible();
    for (const name of ['Reemplazar', 'Agregar al lienzo', 'Cancelar']) {
      const box = (await card.getByRole('button', { name }).boundingBox())!;
      expect(box.x + box.width, `${name} dentro de la pantalla`).toBeLessThanOrEqual(width + 1);
    }
    expect(await overflowing(page), 'con la pregunta abierta').toEqual([]);

    await card.getByRole('button', { name: 'Agregar al lienzo' }).click();
    const studio = page.locator('#cloud app-cloud-infra');
    // El diagrama que se ve: el lienzo de trabajo o, en estrecho, su vista vertical.
    const canvas = (await studio.locator('app-studio-mobile-canvas').count())
      ? studio.locator('app-studio-mobile-canvas') : studio.locator('svg[data-work-canvas]');
    await expect(canvas.getByRole('button', { name: /^Database Migration Service/ })).toBeVisible();
    await expect(studio.locator('path.wire[data-kind="CDC_STREAM"]')).toHaveCount(2);
    // Lo que ya estaba no se duplica y nada arranca con avisos.
    await expect(canvas.getByRole('button', { name: /^Application LB/ })).toHaveCount(1);
    await expect(studio.locator('[data-testid="graph-warnings"]')).toHaveCount(0);
    expect(await overflowing(page), 'tras cargar el patrón').toEqual([]);
  });

  test('los grafos de arquitectura y de pipeline pasan a vertical en el móvil y se manejan con el dedo', async ({ page }, testInfo) => {
    await openLanding(page);
    await loadEverything(page);
    const narrow = page.viewportSize()!.width < 640;

    for (const [view, tab] of [['app-production-architecture', 'arquitectura'], ['app-pipeline-view', 'pipeline']]) {
      await page.locator(`[data-delivery-tab="${tab}"]`).tap();
      // La arquitectura marca sus piezas con data-node (lienzo SVG o tarjetas por zona); el pipeline usa botones.
      const nodes = view === 'app-production-architecture' ? `${view} [data-node]` : `${view} button.node`;
      const columns = await page.locator(nodes).evaluateAll((nodes) =>
        new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().left))).size);
      // En el móvil, una sola columna con las etapas apiladas; con más ancho, tantas columnas como
      // quepan (al menos dos), y el resto en otra franja.
      if (narrow) {
        expect(columns, `${view}: columnas en el móvil`).toBe(1);
      } else {
        expect(columns, `${view}: columnas en pantalla ancha`).toBeGreaterThanOrEqual(2);
      }
      const frame = view === 'app-production-architecture' ? page.locator(view) : page.locator(`${view} .scroller`);
      const overflow = await frame.evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
      expect(overflow, `${view}: el diagrama se reorganiza, no desborda`).toBeLessThanOrEqual(1);
    }

    // Tocar un job abre su ficha a la vista, con datos de la ejecución real.
    const job = page.locator('app-pipeline-view button.node', { hasText: 'Backend unit' });
    await job.scrollIntoViewIfNeeded();
    await job.tap();
    const detail = page.locator('app-pipeline-view div[aria-live="polite"]');
    await expect(detail).toContainText('Por qué existe');
    await expect(detail).toBeInViewport();
    await capture(page, testInfo, 'pipeline-job');

    // La reproducción se anuncia como tal y vuelve a los datos de la ejecución.
    const replay = page.getByRole('button', { name: 'Reproducir última ejecución' });
    await replay.scrollIntoViewIfNeeded();
    await replay.tap();
    await expect(page.locator('app-pipeline-view')).toContainText('Reproducción animada');
    await expect(page.locator('app-pipeline-view')).toContainText('Datos de la ejecución del', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Cerrar el inspector de traza' }).first().tap();

    // Línea de tiempo de despliegues: el rollback simulado se anuncia y no cambia nada de verdad.
    await page.locator('[data-delivery-tab="despliegues"]').scrollIntoViewIfNeeded();
    await page.locator('[data-delivery-tab="despliegues"]').tap();
    const timeline = page.locator('app-deploy-timeline');
    await timeline.scrollIntoViewIfNeeded();
    await expect(timeline.locator('.entry').first()).toContainText('en producción');
    await expect(timeline.getByLabel('Despliegues de Backend')).toContainText('Cloud Run');
    const requests: string[] = [];
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    await timeline.getByRole('button', { name: 'Simular rollback' }).tap();
    await expect(timeline).toContainText('Producción no ha cambiado');
    await expect(timeline.locator('.entry').nth(1)).toContainText('simulación');
    await capture(page, testInfo, 'despliegues-rollback-simulado');
    expect(requests.filter((request) => !request.startsWith('GET ')), 'la simulación no envía nada').toEqual([]);
    await timeline.getByRole('button', { name: 'Deshacer la simulación' }).tap();

    // Una pieza planificada lo dice y no enseña datos de despliegue.
    await page.locator('[data-delivery-tab="arquitectura"]').scrollIntoViewIfNeeded();
    await page.locator('[data-delivery-tab="arquitectura"]').tap();
    const planned = page.locator('app-production-architecture [data-node].planned').first();
    await planned.scrollIntoViewIfNeeded();
    await planned.tap();
    await expect(page.locator('app-production-architecture div[aria-live="polite"]')).toContainText('planificado');
    await capture(page, testInfo, 'arquitectura-pieza-planificada');
    await expectNoHorizontalScroll(page, 'arquitectura real y entrega');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`con el sistema en modo ${scheme === 'light' ? 'claro' : 'oscuro'} el texto se lee`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openLanding(page);
      await loadEverything(page);
      await capture(page, testInfo, `esquema-${scheme}`);

      // Luminosidad del fondo real de la página frente a la del titular: tienen que contrastar.
      const contrast = await page.evaluate(() => {
        const luminance = (color: string): number => {
          const [r, g, b] = (color.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((value) => {
            const channel = Number(value) / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const heading = document.querySelector('h1')!;
        // Sin fondo propio en el camino, el que se ve es el de la capa fija de detrás (la galaxia).
        const backdrop = document.querySelector('app-galaxy-backdrop');
        let background = backdrop ? getComputedStyle(backdrop).backgroundColor : 'rgb(255, 255, 255)';
        for (let element: Element | null = heading; element && element !== document.body; element = element.parentElement) {
          const color = getComputedStyle(element).backgroundColor;
          if (color && !/rgba\(.*,\s*0\)|transparent/.test(color)) {
            background = color;
            break;
          }
        }
        const a = luminance(getComputedStyle(heading).color);
        const b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(contrast, 'contraste del titular con su fondo').toBeGreaterThanOrEqual(7);
    });
  }
});
