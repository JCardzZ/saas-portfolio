import { expect, Page, test, TestInfo } from '@playwright/test';
import { join } from 'node:path';

/** Secciones de la página pública, en el orden en que aparecen. */
const SECTIONS = ['plataforma', 'cloud', 'proyectos', 'tecnologias', 'articulos', 'trayectoria'];
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
        return (position === 'fixed' || position === 'sticky') && visible(element);
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

    // Estudio en modo edición: aparece el catálogo de servicios.
    const edit = page.getByRole('button', { name: 'Editar arquitectura' });
    await edit.scrollIntoViewIfNeeded();
    await edit.tap();
    await expect(page.locator('app-service-catalog')).toBeVisible();
    await check('estudio-en-edicion', 'app-cloud-infra');
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
        let background = 'rgb(255, 255, 255)';
        for (let element: Element | null = heading; element; element = element.parentElement) {
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
