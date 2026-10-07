// Exporta las plantillas del Estudio de arquitectura al backend, que las siembra en la base
// de datos al arrancar. La definición vive en el frontend (studio-project.ts); ejecuta esto
// después de cambiarla:  npm run export:presets
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle = join(tmpdir(), `studio-presets-${process.pid}.mjs`);
await build({
  // Un solo punto de entrada que reexporta lo necesario de los dos módulos.
  stdin: {
    contents: "export * from './src/app/features/public/cloud/studio-project'; export * from './src/app/features/public/cloud/terraform-generator'; export * from './src/app/features/public/cloud/cloud-catalog.data'; export * from './src/app/features/public/cloud/cloud-costs.data'; export { forProvider } from './src/app/features/public/cloud/cloud-topology.data';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
});
const { STUDIO_PRESETS, SERVER_PRESET_IDS, generateMainTf, generateVariablesTf, catalogRows } = await import(pathToFileURL(bundle).href);

const presets = SERVER_PRESET_IDS.map((id) => {
  const preset = STUDIO_PRESETS.find((candidate) => candidate.id === id);
  const project = preset.build();
  return {
    id, title: preset.name, description: preset.description, cloudProvider: project.provider,
    nodes: project.nodes, connections: project.links, zones: project.zones,
  };
});

const target = resolve('../portfolio-backend/src/main/resources/architecture/presets.json');
mkdirSync(resolve(target, '..'), { recursive: true });
writeFileSync(target, JSON.stringify(presets, null, 2) + '\n');
console.log(`${presets.length} plantillas exportadas a ${target}`);

// Catálogo de servicios: una fila por servicio y nube, con su coste mensual orientativo. El
// backend solo crea las filas que falten, así que un precio ajustado en la base de datos se conserva.
const catalog = catalogRows();
writeFileSync(resolve(target, '../catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`${catalog.length} entradas del catálogo exportadas`);

// Casos de referencia para el generador de Terraform del backend (Java): la misma topología
// debe dar exactamente el mismo HCL que el generador del frontend, que es el que los produce.
const golden = resolve('../portfolio-backend/src/test/resources/architecture/golden');
mkdirSync(golden, { recursive: true });
const withProperties = (project) => ({
  ...project,
  nodes: project.nodes.map((node) => (node.id === 'api'
    ? { ...node, name: 'API  de "pagos"', props: { instance: 't3.medium', ports: '8080, 443', env: 'SPRING_PROFILES_ACTIVE=prod\nJWT_SECRET=abc\nRUTA=${HOME} "x"\nno valida=1\nVACIA=' } }
    : node)),
});
const cases = [
  ...STUDIO_PRESETS.filter((preset) => preset.id !== 'blank').map((preset) => [preset.id, preset.build()]),
  ...['aws', 'gcp', 'azure'].map((provider) => [`properties-${provider}`, withProperties({ ...STUDIO_PRESETS[0].build(), provider })]),
  ['blank', STUDIO_PRESETS.find((preset) => preset.id === 'blank').build()],
];
for (const [name, project] of cases) {
  writeFileSync(join(golden, `${name}.json`), JSON.stringify({ cloudProvider: project.provider, nodes: project.nodes, connections: project.links }, null, 2) + '\n');
  writeFileSync(join(golden, `${name}.main.tf`), generateMainTf(project.nodes, project.links, project.provider));
  writeFileSync(join(golden, `${name}.variables.tf`), generateVariablesTf(project.nodes, project.provider));
}
console.log(`${cases.length} casos de referencia de Terraform exportados a ${golden}`);
