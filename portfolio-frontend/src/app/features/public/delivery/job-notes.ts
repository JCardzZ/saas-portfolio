import { WorkflowKey } from './delivery-data';

/** Qué hace cada job y por qué existe. Un job nuevo en un workflow necesita su nota (hay un test). */
export interface JobNote {
  what: string;
  why: string;
}

export const JOB_NOTES: Record<WorkflowKey, Record<string, JobNote>> = {
  ci: {
    changes: {
      what: 'Mira qué carpetas tocó el cambio: contrato, backend o frontend.',
      why: 'Lo que no cambió no se vuelve a probar, y un job omitido no bloquea el gate.',
    },
    gitleaks: {
      what: 'Busca credenciales en todo el historial del repositorio.',
      why: 'Un secreto borrado en un commit posterior sigue estando en el historial.',
    },
    codeql: {
      what: 'Análisis estático de seguridad de Java y TypeScript.',
      why: 'Encuentra fallos que los tests no buscan. Solo corre con el repositorio público o con Advanced Security.',
    },
    'spec-lint': {
      what: 'Revisa el contrato OpenAPI con Spectral.',
      why: 'El contrato es la fuente de las URL y los DTO: un error ahí se propaga a servidor y cliente.',
    },
    'spec-breaking': {
      what: 'Compara el contrato con el de la rama destino (oasdiff).',
      why: 'Un cambio incompatible rompería a quien ya usa la API; se detecta antes de integrarlo.',
    },
    'spec-codegen': {
      what: 'Regenera el cliente TypeScript y los datos de estas vistas, y comprueba que coinciden con lo subido.',
      why: 'El código generado del repositorio no puede quedarse atrás respecto a su fuente.',
    },
    'backend-unit': {
      what: 'Tests unitarios y de rebanada del backend, con cobertura (JaCoCo).',
      why: 'La red rápida: no necesita Docker y cubre la lógica de aplicación y los controladores.',
    },
    'backend-integration': {
      what: 'La aplicación completa contra PostgreSQL con pgvector y Redis reales (Testcontainers).',
      why: 'Solo así se ve si las migraciones aplican, si el script Lua funciona y si la búsqueda respeta al tenant.',
    },
    'backend-arch': {
      what: 'Reglas de la arquitectura hexagonal sobre el código compilado (ArchUnit).',
      why: 'Un import en la dirección equivocada no rompe ningún test funcional, pero sí el diseño.',
    },
    'frontend-test': {
      what: 'Tests unitarios del frontend, repartidos en tres grupos en paralelo.',
      why: 'Repartirlos acorta la espera sin dejar ninguno fuera.',
    },
    'frontend-build': {
      what: 'Build de producción con presupuesto de tamaño para el bundle inicial.',
      why: 'Es el mismo artefacto que después se despliega: se construye una sola vez.',
    },
    lighthouse: {
      what: 'Mide rendimiento, accesibilidad, buenas prácticas y SEO sobre el build.',
      why: 'Una regresión de rendimiento o de accesibilidad se detiene con un umbral, no a ojo.',
    },
    responsive: {
      what: 'Abre el build en doce tamaños de móvil y tableta con Playwright.',
      why: 'Sin scroll horizontal, controles de 44 px y nada fijo tapando un botón, comprobado en cada cambio.',
    },
    preview: {
      what: 'Publica el build del PR en una URL temporal de Cloudflare Pages.',
      why: 'El cambio se revisa funcionando antes de integrarlo.',
    },
    docker: {
      what: 'Construye la imagen del backend y la escanea con Trivy.',
      why: 'Falla con vulnerabilidades altas o críticas que ya tienen corrección.',
    },
    'publish-image': {
      what: 'Publica en GHCR la misma imagen que pasó Trivy, la firma con cosign y le adjunta el SBOM.',
      why: 'Lo que se despliega es exactamente lo que se verificó, y se puede demostrar.',
    },
    'coverage-badge': {
      what: 'Publica la cobertura para la insignia del README.',
      why: 'El dato sale de la ejecución, no se escribe a mano.',
    },
    gate: {
      what: 'Falla si algún job falló o se canceló; los omitidos no cuentan.',
      why: 'Es el único check que hay que exigir para integrar.',
    },
    'pipeline-status': {
      what: 'Publica el resultado de esta ejecución (estados, duraciones y métricas).',
      why: 'De ahí salen los datos que estás viendo en esta página.',
    },
  },
  cd: {
    source: {
      what: 'Localiza lo que construyó la CI: el build del frontend y la imagen por digest.',
      why: 'El despliegue no construye nada: usa lo que ya se verificó.',
    },
    'frontend-deploy': {
      what: 'Sube el build verificado a Cloudflare Pages y le aplica la configuración del entorno.',
      why: 'La dirección de la API se inyecta al desplegar, así que el mismo build vale para cualquier entorno.',
    },
    deploy: {
      what: 'Copia la imagen verificada a Artifact Registry, con el mismo digest, y crea con ella una revisión de Cloud Run.',
      why: 'Es manual y pide aprobación; la revisión nueva no recibe tráfico hasta responder sana en su propia URL.',
    },
    smoke: {
      what: 'Pruebas de humo contra la API pública, pasando por HTTPS.',
      why: 'Que el contenedor arranque no basta: tiene que responder desde fuera.',
    },
    release: {
      what: 'Etiqueta la versión desplegada (semver, a partir de los commits).',
      why: 'Solo se etiqueta lo que está desplegado y sano.',
    },
    rollback: {
      what: 'Devuelve el tráfico a la revisión anterior de Cloud Run si las pruebas de humo fallan.',
      why: 'La revisión anterior sigue ahí: volver es mover el tráfico, sin desplegar nada ni esperar aprobación.',
    },
    'pipeline-status': {
      what: 'Publica el resultado de este despliegue.',
      why: 'De ahí salen los datos que estás viendo en esta página.',
    },
  },
  nightly: {
    scope: {
      what: 'Comprueba qué análisis están disponibles para el repositorio.',
      why: 'CodeQL y la revisión de dependencias solo existen en repositorios públicos o con Advanced Security.',
    },
    codeql: {
      what: 'CodeQL con las consultas ampliadas de seguridad y calidad.',
      why: 'Más lento que el de cada PR; de noche no estorba.',
    },
    'trivy-image': {
      what: 'Escanea la imagen publicada de main.',
      why: 'Las vulnerabilidades nuevas aparecen en dependencias que ya estaban desplegadas.',
    },
    'trivy-deps': {
      what: 'Escanea las dependencias de npm.',
      why: 'Mismo motivo: el código no cambia, pero lo que se sabe de sus dependencias sí.',
    },
    'dependency-review': {
      what: 'Revisa las dependencias que entraron en la última semana.',
      why: 'Detecta paquetes con vulnerabilidades conocidas al poco de añadirlos.',
    },
    summary: {
      what: 'Reúne el resultado de la revisión nocturna.',
      why: 'Un solo sitio donde ver si hay algo que atender.',
    },
  },
};
