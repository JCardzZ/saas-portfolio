/**
 * Escritor de archivos ZIP mínimo: sin compresión (método "stored"), que es todo lo que hace
 * falta para empaquetar unos pocos archivos de texto sin añadir una dependencia.
 */
export function createZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const local = header(30, name);
    local.view.setUint32(0, 0x04034b50, true);
    common(local.view, 4, crc, data.length, name.length);
    parts.push(local.bytes, data);

    const central = header(46, name);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true); // versión que lo creó
    common(central.view, 6, crc, data.length, name.length);
    central.view.setUint32(42, offset, true);
    directory.push(central.bytes);

    offset += local.bytes.length + data.length;
  }

  const size = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

function header(size: number, name: Uint8Array): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size + name.length);
  bytes.set(name, size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/** Campos que comparten la cabecera local y la del directorio central, a partir de `at`. */
function common(view: DataView, at: number, crc: number, length: number, nameLength: number): void {
  view.setUint16(at, 20, true); // versión necesaria para extraer
  view.setUint16(at + 2, 0x0800, true); // nombres en UTF-8
  view.setUint16(at + 4, 0, true); // sin compresión
  view.setUint16(at + 6, 0, true); // hora
  view.setUint16(at + 8, 0x21, true); // fecha: 1980-01-01
  view.setUint32(at + 10, crc, true);
  view.setUint32(at + 14, length, true);
  view.setUint32(at + 18, length, true);
  view.setUint16(at + 22, nameLength, true);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
