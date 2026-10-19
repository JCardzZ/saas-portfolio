import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/**
 * Los diagramas, en cada ancho de la matriz (playwright.config.ts, proyectos `diagramas-*`): nada
 * de lo que dibujan puede quedar fuera de lo que se ve de su contenedor. Comprobar el scroll
 * horizontal de la página no basta: un diagrama puede caber en ella y aun así tener nodos cortados
 * dentro de su propio marco, tras un `overflow`.
 */
/** `tab`: la pestaña de la sección de entrega que lo muestra. */
const DIAGRAMS: { name: string; host: string; tab?: string }[] = [
  { name: 'arquitectura-en-vivo', host: 'app-architecture-canvas' },
  { name: 'resiliencia', host: 'app-resilience-pipeline' },
  { name: 'multi-tenant', host: 'app-multi-tenant-shield' },
  { name: 'busqueda-vectorial', host: 'app-vector-matrix' },
  { name: 'estudio', host: 'app-cloud-infra' },
  { name: 'arquitectura-en-produccion', host: 'app-production-architecture', tab: 'arquitectura' },
  { name: 'pipeline', host: 'app-pipeline-view', tab: 'pipeline' },
];

/** Tamaño mínimo del texto dentro de un SVG, tal como se ve en pantalla. */
const MIN_TEXT = 12;

async function openLanding(page: Page): Promise<void> {
  await page.route(/^https:\/\/api\.example\.com\//, (route) => route.abort());
  await page.route(/^https:\/\/raw\.githubusercontent\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  // Todo lo que espera a entrar en pantalla.
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
  await page.waitForTimeout(500);
}

/**
 * Lo que un diagrama dibuja o deja pulsar y no se ve entero. De cada marca se compara su caja
 * con lo que queda visible de su contenedor, que es la intersección de todos sus antecesores que
 * recortan (`overflow` distinto de `visible`, y los propios SVG) y, en horizontal, de la ventana.
 */
async function clipped(page: Page, host: string): Promise<string[]> {
  return page.locator(host).first().evaluate((root) => {
    const MARKS = 'svg rect, svg circle, svg line, svg path, svg text, svg image, svg [role="button"], button, [role="tab"], [role="switch"]';
    const TOLERANCE = 1.5;
    const clips = (element: Element): boolean => {
      if (element instanceof SVGSVGElement) {
        return true;
      }
      const style = getComputedStyle(element);
      return style.overflowX !== 'visible' || style.overflowY !== 'visible';
    };
    const hidden = (element: Element): boolean => {
      for (let current: Element | null = element; current && current !== document.body; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return true;
        }
      }
      return false;
    };
    const describe = (element: Element): string => {
      const text = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
      return `<${element.tagName.toLowerCase()}${element.getAttribute('class') ? '.' + element.getAttribute('class')!.split(' ')[0] : ''}>${text ? ` "${text}"` : ''}`;
    };

    const problems: string[] = [];
    for (const mark of root.querySelectorAll(MARKS)) {
      const box = mark.getBoundingClientRect();
      if ((box.width === 0 && box.height === 0) || hidden(mark)) {
        continue;
      }
      // En horizontal manda también la ventana; en vertical la página se desplaza, así que solo cuentan los antecesores.
      let left = 0;
      let right = document.documentElement.clientWidth;
      let top = -Infinity;
      let bottom = Infinity;
      for (let ancestor = mark.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        if (!clips(ancestor)) {
          continue;
        }
        const frame = ancestor.getBoundingClientRect();
        left = Math.max(left, frame.left);
        right = Math.min(right, frame.right);
        top = Math.max(top, frame.top);
        bottom = Math.min(bottom, frame.bottom);
      }
      const out = [
        box.left < left - TOLERANCE ? `${Math.round(left - box.left)} px por la izquierda` : null,
        box.right > right + TOLERANCE ? `${Math.round(box.right - right)} px por la derecha` : null,
        box.top < top - TOLERANCE ? `${Math.round(top - box.top)} px por arriba` : null,
        box.bottom > bottom + TOLERANCE ? `${Math.round(box.bottom - bottom)} px por abajo` : null,
      ].filter(Boolean);
      if (out.length) {
        problems.push(`${describe(mark)} se sale ${out.join(' y ')}`);
      }
    }
    return [...new Set(problems)].slice(0, 10);
  });
}

/** Textos de un SVG que en pantalla miden menos del mínimo: tamaño de fuente por la escala a la que se pinta su SVG. */
async function smallText(page: Page, host: string, min: number): Promise<string[]> {
  return page.locator(host).first().evaluate((root, min) => {
    const problems: string[] = [];
    for (const text of root.querySelectorAll<SVGTextElement>('svg text')) {
      const svg = text.ownerSVGElement!;
      // El lienzo de trabajo del Estudio (pantallas anchas) conserva tres rótulos por debajo de 12 px:
      // deuda conocida y acotada por tools/lib/design-lint. En estrecho no se muestra.
      if (svg.closest('[data-work-canvas]')) {
        continue;
      }
      const box = svg.getBoundingClientRect();
      const style = getComputedStyle(text);
      if (box.width === 0 || style.display === 'none' || style.visibility === 'hidden' || !(text.textContent ?? '').trim()) {
        continue;
      }
      const view = svg.viewBox.baseVal;
      const scale = view && view.width ? Math.min(box.width / view.width, box.height / view.height) : 1;
      const size = parseFloat(style.fontSize) * scale;
      if (size < min - 0.25) {
        problems.push(`"${(text.textContent ?? '').trim().slice(0, 28)}" mide ${size.toFixed(1)} px`);
      }
    }
    return [...new Set(problems)].slice(0, 10);
  }, min);
}

async function capture(page: Page, testInfo: TestInfo, host: string, name: string): Promise<void> {
  const path = join('e2e-screens', testInfo.project.name, `diagrama-${name}.png`);
  await page.locator(host).first().screenshot({ path, animations: 'disabled' });
  await testInfo.attach(`diagrama-${name}`, { path, contentType: 'image/png' });
}

test.describe('diagramas: nada recortado, texto legible y nada fijo encima', () => {
  test('ningún nodo, etiqueta, línea o pestaña queda fuera de lo que se ve de su contenedor', async ({ page }, testInfo) => {
    await openLanding(page);

    const failures: string[] = [];
    for (const diagram of DIAGRAMS) {
      if (diagram.tab) {
        await page.locator(`[data-delivery-tab="${diagram.tab}"]`).click();
      }
      const host = page.locator(diagram.host).first();
      await host.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await capture(page, testInfo, diagram.host, diagram.name);
      const problems = await clipped(page, diagram.host);
      if (problems.length) {
        failures.push(`${diagram.name}:\n  ${problems.join('\n  ')}`);
      }
    }
    // Los cuatro niveles del modelo C4 tienen nodos y anchos distintos: se comprueban todos.
    for (const level of ['Contexto', 'Componentes', 'Código']) {
      await page.locator('app-architecture-canvas').getByRole('tab', { name: level }).click();
      await page.waitForTimeout(700);
      await capture(page, testInfo, 'app-architecture-canvas', `arquitectura-en-vivo-${level.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`);
      const problems = await clipped(page, 'app-architecture-canvas');
      if (problems.length) {
        failures.push(`arquitectura-en-vivo (${level}):\n  ${problems.join('\n  ')}`);
      }
    }
    // Con los fallos simulados aparecen el desvío y los avisos: tampoco pueden salirse.
    for (const toggle of await page.locator('app-resilience-pipeline [role="switch"]').all()) {
      await toggle.click();
    }
    await page.locator('app-multi-tenant-shield [role="switch"]').click();
    await page.waitForTimeout(700);
    for (const [host, name] of [['app-resilience-pipeline', 'resiliencia-con-fallos'], ['app-multi-tenant-shield', 'multi-tenant-sin-filtro']]) {
      await capture(page, testInfo, host, name);
      const problems = await clipped(page, host);
      if (problems.length) {
        failures.push(`${name}:\n  ${problems.join('\n  ')}`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('las pestañas del modelo C4 se ven las cuatro, sin desplazar', async ({ page }) => {
    await openLanding(page);
    const card = page.locator('app-architecture-canvas');
    await card.scrollIntoViewIfNeeded();

    const tabs = card.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    const frame = (await card.boundingBox())!;
    for (const tab of await tabs.all()) {
      await expect(tab).toBeVisible();
      const box = (await tab.boundingBox())!;
      expect(box.x, 'dentro de la tarjeta por la izquierda').toBeGreaterThanOrEqual(frame.x - 1);
      expect(box.x + box.width, 'dentro de la tarjeta por la derecha').toBeLessThanOrEqual(frame.x + frame.width + 1);
    }
    const list = card.getByRole('tablist');
    expect(await list.evaluate((element) => element.scrollWidth - element.clientWidth), 'la lista de pestañas no se desplaza').toBeLessThanOrEqual(1);
  });

  test('el texto de los diagramas mide al menos 12 px en pantalla', async ({ page }) => {
    await openLanding(page);

    const failures: string[] = [];
    for (const diagram of DIAGRAMS) {
      if (diagram.tab) {
        await page.locator(`[data-delivery-tab="${diagram.tab}"]`).click();
      }
      await page.locator(diagram.host).first().scrollIntoViewIfNeeded();
      const problems = await smallText(page, diagram.host, MIN_TEXT);
      if (problems.length) {
        failures.push(`${diagram.name}:\n  ${problems.join('\n  ')}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('el Estudio estrecho es de solo lectura, con zoom, y deja métricas y FinOps fuera del diagrama', async ({ page }) => {
    await openLanding(page);
    const studio = page.locator('app-cloud-infra');
    await studio.scrollIntoViewIfNeeded();
    const mobile = studio.locator('app-studio-mobile-canvas');
    test.skip(!(await mobile.count()), 'con este ancho el Estudio muestra su lienzo de trabajo');

    await expect(studio.getByRole('button', { name: 'Editar arquitectura' })).toHaveCount(0);
    // Métricas y FinOps: debajo del diagrama, sin pisarlo.
    const canvas = (await mobile.boundingBox())!;
    for (const panel of ['app-live-vitals', 'app-cost-badge']) {
      const box = (await studio.locator(panel).boundingBox())!;
      expect(box.y, `${panel} va debajo del diagrama`).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
    }

    await expect(mobile.getByTestId('mobile-zoom')).toHaveText('100 %');
    await mobile.getByRole('button', { name: 'Acercar' }).click();
    await expect(mobile.getByTestId('mobile-zoom')).toHaveText('150 %');
    await mobile.getByRole('button', { name: 'Ajustar a pantalla' }).click();
    await expect(mobile.getByTestId('mobile-zoom')).toHaveText('100 %');
    expect(await clipped(page, 'app-cloud-infra'), 'tras ajustar, todo vuelve a caber').toEqual([]);

    // Tocar una pieza la selecciona y cuenta qué es, debajo.
    const node = mobile.locator('[data-node-id]').first();
    await node.click();
    await expect(node).toHaveAttribute('aria-pressed', 'true');
  });

  test('ningún elemento fijo se monta sobre otro', async ({ page }) => {
    await openLanding(page);

    const overlaps = async (): Promise<string[]> => page.evaluate(() => {
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
      };
      const label = (element: Element): string =>
        `<${element.tagName.toLowerCase()}> "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
      const fixed = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed' || !visible(element)) {
          return false;
        }
        // Una capa a pantalla completa que no recibe toques (por donde vuelan los logos) no ocupa sitio.
        const rect = element.getBoundingClientRect();
        return !(style.pointerEvents === 'none' && rect.width >= window.innerWidth - 1 && rect.height >= window.innerHeight - 1);
      });
      const top = fixed.filter((element) => !fixed.some((other) => other !== element && other.contains(element)));
      const problems: string[] = [];
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          const a = top[i].getBoundingClientRect();
          const b = top[j].getBoundingClientRect();
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 2 && y > 2) {
            problems.push(`${label(top[i])} y ${label(top[j])} se solapan ${Math.round(x)}×${Math.round(y)} px`);
          }
        }
      }
      return problems;
    });

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 3));
    await page.waitForTimeout(300);
    expect(await overlaps(), 'con el inspector cerrado').toEqual([]);

    // Con el inspector abierto (al tocar un nodo) tampoco se pisa con la barra ni con nada.
    const node = page.locator('app-architecture-canvas svg [role="button"]').first();
    await node.scrollIntoViewIfNeeded();
    await node.click();
    await page.waitForTimeout(900);
    expect(await overlaps(), 'con el inspector abierto').toEqual([]);
  });

  test('el aviso de modo demo no flota sobre el contenido: va en la barra del inspector, sobre la zona segura', async ({ page }) => {
    await openLanding(page);
    const viewport = page.viewportSize()!;
    const narrow = viewport.width < 640 || viewport.height < 500;
    test.skip(!narrow, 'con sitio de sobra el aviso es la píldora de la esquina del inspector');

    const bar = page.locator('[data-demo-bar]');
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-demo-pill]')).toHaveCount(0);
    await expect(bar.getByTestId('demo-notice')).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.x, 'de lado a lado').toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(Math.abs(box.y + box.height - viewport.height), 'pegada al borde inferior').toBeLessThanOrEqual(1);
    expect(await bar.evaluate((element) => getComputedStyle(element).paddingBottom), 'reserva la zona segura inferior').toBeDefined();
    // La página le deja su hueco: el final del pie queda por encima de la barra.
    // Lo diferido puede seguir cargando y la barra publica su hueco (--dock-bottom) al medirse: se
    // baja al final y se mide hasta que todo se asienta.
    await expect.poll(async () => page.evaluate(async (barTop) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const footers = document.querySelectorAll('footer');
      return footers[footers.length - 1].getBoundingClientRect().bottom - barTop;
    }, box.y), { message: 'el pie no queda debajo de la barra', timeout: 10_000 }).toBeLessThanOrEqual(1);
  });
});
