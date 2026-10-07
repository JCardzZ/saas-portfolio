/** Propiedades de estilo que hacen falta para que el SVG se vea igual fuera de la página. */
const STYLE_PROPERTIES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'display',
];
const FONT = 'Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export interface DiagramExportOptions {
  /** Color de fondo, o `null` para dejarlo transparente. */
  background: string | null;
}

/**
 * Copia autónoma del diagrama como SVG: con los estilos de la hoja de la página escritos en
 * cada elemento y los iconos incrustados, para que se vea igual abierto en cualquier programa.
 * Quita lo que es de la interfaz y no del diagrama (botones, pulsos animados, estados de caos).
 */
export async function serializeDiagram(svg: SVGSVGElement, options: DiagramExportOptions): Promise<string> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const originals = Array.from(svg.querySelectorAll<SVGElement>('*'));
  const copies = Array.from(copy.querySelectorAll<SVGElement>('*'));
  originals.forEach((original, index) => {
    const style = getComputedStyle(original);
    const inline = STYLE_PROPERTIES.map((property) => `${property}:${style.getPropertyValue(property)}`).join(';');
    copies[index].setAttribute('style', `${inline};font-family:${FONT}`);
  });
  copy.querySelectorAll('.pulse, .remove, .connect, .chaos-badge, .zone-handle, [data-export="skip"]').forEach((element) => element.remove());
  [copy, ...Array.from(copy.querySelectorAll('[tabindex], [role], [aria-label], [aria-pressed], [class]'))].forEach((element) => {
    ['tabindex', 'role', 'aria-label', 'aria-pressed', 'class'].forEach((attribute) => element.removeAttribute(attribute));
  });

  const [, , width, height] = (svg.getAttribute('viewBox') ?? '0 0 1110 716').split(/\s+/).map(Number);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.removeAttribute('style');
  if (options.background) {
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', '100%');
    background.setAttribute('height', '100%');
    background.setAttribute('fill', options.background);
    copy.insertBefore(background, copy.firstChild);
  }

  // Un SVG usado como imagen no puede cargar archivos externos: los iconos van dentro.
  await Promise.all(Array.from(copy.querySelectorAll('image')).map(async (image) => {
    const href = image.getAttribute('href');
    if (href && !href.startsWith('data:')) {
      image.setAttribute('href', await toDataUrl(href));
    }
  }));
  return new XMLSerializer().serializeToString(copy);
}

/** Convierte el SVG en un PNG `scale` veces más grande que el lienzo, para que aguante el zoom. */
export async function rasterize(svgText: string, scale = 3): Promise<Blob> {
  const size = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"[^>]*\sheight="(\d+(?:\.\d+)?)"/.exec(svgText);
  const width = Number(size?.[1] ?? 1110);
  const height = Number(size?.[2] ?? 716);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('El navegador no pudo dibujar el diagrama'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toDataUrl(href: string): Promise<string> {
  try {
    const response = await fetch(href);
    if (!response.ok) {
      return '';
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Sin el icono el diagrama sigue siendo válido: el nombre del servicio va al lado.
    return '';
  }
}

/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
