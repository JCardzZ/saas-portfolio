import { AIQueryResponse, Article, CareerMilestone, Project, Technology } from '../api';

/** Datos del modo demo. Nada de esto sale de la base de datos ni del motor de IA. */
export const MOCK_TECHNOLOGIES: Technology[] = [
  { id: 'tech-java', name: 'Java 21', category: 'Backend', proficiencyLevel: 'Experto', iconUrl: '', isFeatured: true },
  { id: 'tech-spring', name: 'Spring Boot 3', category: 'Backend', proficiencyLevel: 'Experto', iconUrl: '', isFeatured: false },
  { id: 'tech-jwt', name: 'JWT (JJWT)', category: 'Backend', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: false },
  { id: 'tech-hexagonal', name: 'Hexagonal Architecture', category: 'Backend', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: false },
  { id: 'tech-angular', name: 'Angular 18', category: 'Frontend', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: true },
  { id: 'tech-tailwind', name: 'Tailwind CSS', category: 'Frontend', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: false },
  { id: 'tech-gemini', name: 'Gemini AI', category: 'AI/ML', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: true },
  { id: 'tech-pgvector', name: 'pgvector (RAG)', category: 'AI/ML', proficiencyLevel: 'Intermedio', iconUrl: '', isFeatured: false },
  { id: 'tech-postgres', name: 'PostgreSQL (Neon)', category: 'Cloud', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: false },
  { id: 'tech-redis', name: 'Redis (Upstash)', category: 'Cloud', proficiencyLevel: 'Avanzado', iconUrl: '', isFeatured: false },
  { id: 'tech-terraform', name: 'Terraform', category: 'Cloud', proficiencyLevel: 'Intermedio', iconUrl: '', isFeatured: false },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'prj-platform',
    title: 'SaaS Portfolio Platform',
    summary:
      'Plataforma contract-first con arquitectura hexagonal, caché cache-aside resiliente y un asistente RAG que responde citando el código fuente.',
    githubRepoUrl: 'https://github.com/example/saas-portfolio',
    demoVideoUrl: 'https://example.com/demo',
    metricsImpact: 'Dominio y aplicación sin dependencias de framework',
    technologiesUsed: ['tech-java', 'tech-hexagonal', 'tech-gemini', 'tech-tailwind', 'tech-angular'],
  },
  {
    id: 'prj-rag',
    title: 'Motor RAG con pgvector',
    summary: 'Ingesta del CMS y del código, búsqueda por similitud coseno y respuestas con fuentes.',
    githubRepoUrl: 'https://github.com/example/rag-engine',
    metricsImpact: 'Circuit breaker y límite de consumo',
    technologiesUsed: ['tech-gemini', 'tech-pgvector', 'tech-postgres'],
  },
  {
    id: 'prj-ratelimit',
    title: 'Rate limiter distribuido',
    summary: 'Ventana fija atómica entre instancias con un script Lua en Redis.',
    githubRepoUrl: 'https://github.com/example/rate-limiter',
    technologiesUsed: ['tech-redis', 'tech-spring'],
  },
];

/** Los mismos hitos que publica `docs/career/CAREER_STORY.md`, para que el modo demo muestre la trayectoria real. */
export const MOCK_CAREER: CareerMilestone[] = [
  {
    period: '2024 - actualidad',
    title: 'Modernización de servicios del BCR',
    role: 'Desarrollador Backend',
    organization: 'PBS Consulting (proyecto para el BCR)',
    technologies: ['Java', 'Spring Boot', 'PostgreSQL', 'AWS', 'Azure AKS', 'OAuth2', 'JWT'],
    summary: 'Microservicios y backend de proyectos estratégicos del BCR: modernización de servicios, despliegue en Azure AKS y seguridad de las APIs con OAuth2 y JWT.',
  },
  {
    period: '2023',
    title: 'Ingeniería en Sistemas y Computación',
    organization: 'Universidad Dr. Andrés Bello, Chalatenango',
    technologies: [],
    summary: 'Título de Ingeniero en Sistemas y Computación, con proyectos bancarios ya durante la carrera.',
  },
  {
    period: '2022',
    title: 'Integración del core bancario AS400 con servicios REST y SOAP',
    role: 'Desarrollador Java Broker',
    organization: 'Banco Agrícola',
    technologies: ['Java', 'Spring Boot', 'IBM AS400', 'COBOL', 'IBM MQ Series', 'Spring Batch', 'Azure Functions', 'AWS Lambda', 'AWS SQS', 'Prometheus', 'ELK'],
    summary: 'Servicios REST y SOAP integrados con el broker y con el core en IBM AS400, mensajería con colas MQ y componentes serverless en la nube.',
  },
  {
    period: '2020',
    title: 'Desconexión del motor de decisiones de Colombia a El Salvador',
    role: 'Desarrollador Backend',
    organization: 'Banco Davivienda',
    technologies: ['Java', 'Spring Boot', 'Oracle', 'Apache Kafka', 'RabbitMQ', 'Docker', 'Kubernetes'],
    summary: 'Desarrollo backend del proyecto, con servicios en Spring Boot sobre Oracle, mensajería con Kafka y RabbitMQ y despliegue en contenedores.',
  },
  {
    period: '2019',
    title: 'Integración del sistema de votación',
    role: 'Facilitador Técnico',
    organization: 'Tribunal Supremo Electoral',
    technologies: ['Java', 'AWS', 'Azure', 'Angular', 'React'],
    summary: 'Integración del sistema para la votación y capacitación técnica a sus usuarios, con atención a la ciberseguridad y la protección anti-DDoS.',
  },
];

/**
 * Artículos de ejemplo del modo demo. Describen cosas que este proyecto hace de verdad,
 * para que el hub se vea con contenido creíble; los reales se publican desde el panel admin.
 */
export const MOCK_ARTICLES: Article[] = [
  {
    id: 'art-demo-1',
    title: 'Cache-aside que no tumba la API',
    slug: 'cache-aside-que-no-tumba-la-api',
    publishedAt: '2026-10-02T09:00:00Z',
    contentMarkdown: [
      'La caché de esta plataforma es **best-effort**: si Redis no responde en 2 segundos, la petición se sirve desde PostgreSQL y se registra un aviso.',
      '',
      '## La regla',
      '',
      '- **Lectura**: primero Redis; si no está, PostgreSQL y se guarda con TTL de 10 minutos.',
      '- **Escritura**: se persiste y después se invalida la clave.',
      '- **Fallo de Redis**: nunca se propaga al usuario.',
      '',
      '```java',
      'return cache.getList(KEY, TechnologyDomain.class)',
      '        .orElseGet(() -> repository.findAll());',
      '```',
      '',
      '> Artículo de ejemplo del modo demo.',
    ].join('\n'),
  },
  {
    id: 'art-demo-2',
    title: 'Por qué el dominio no importa Spring',
    slug: 'por-que-el-dominio-no-importa-spring',
    publishedAt: '2026-09-24T09:00:00Z',
    contentMarkdown: [
      'En una arquitectura hexagonal las dependencias apuntan hacia dentro. Aquí `domain` y `application` son Java puro, y los servicios se registran a mano en `UseCaseConfig`.',
      '',
      'El resultado práctico: los casos de uso se prueban sin levantar el framework.',
      '',
      '> Artículo de ejemplo del modo demo.',
    ].join('\n'),
  },
];

const ARCHITECTURE_ANSWER: AIQueryResponse = {
  answer: [
    'El backend sigue una **arquitectura hexagonal** (Ports & Adapters) con tres capas:',
    '',
    '1. **Dominio**: `records` de Java 21 sin dependencias de Spring ni JPA.',
    '2. **Aplicación**: casos de uso que solo conocen *puertos*.',
    '3. **Infraestructura**: adaptadores web, de persistencia, de caché y de IA.',
    '',
    'Los servicios se registran a mano en `UseCaseConfig`, así el núcleo no sabe que existe un framework:',
    '',
    '```java',
    '@Bean',
    'public TechnologyUseCase technologyUseCase(TechnologyRepositoryPort repository, CachePort cache) {',
    '    return new TechnologyService(repository, cache);',
    '}',
    '```',
    '',
    '> Respuesta simulada del modo demo.',
  ].join('\n'),
  citations: [
    {
      filePath: 'CLAUDE.md',
      lineNumberRange: '15-30',
      codeSnippet:
        '* **Patrón Backend**: Arquitectura Hexagonal Pura (Ports & Adapters) con estrategia Cache-Aside.\n* **Seguridad & Normas**: Spring Security 6.x Stateless, JJWT 0.12.5, RFC 7807.',
    },
    {
      filePath: 'portfolio-backend/src/main/java/dev/portfolio/Architecture.java',
      lineNumberRange: '45-80',
      codeSnippet:
        '@Bean\npublic TechnologyUseCase technologyUseCase(TechnologyRepositoryPort repository, CachePort cache) {\n    return new TechnologyService(repository, cache);\n}',
    },
    {
      filePath: 'cms/projects/prj-platform',
      codeSnippet: 'Proyecto: SaaS Portfolio Platform\nResumen: Plataforma contract-first con arquitectura hexagonal…',
    },
  ],
};

const CACHE_ANSWER: AIQueryResponse = {
  answer: [
    'La caché usa la estrategia **cache-aside** sobre Redis:',
    '',
    '- **Lectura**: primero Redis; si no está, PostgreSQL y se guarda con TTL de 10 minutos.',
    '- **Escritura y borrado**: se persiste en PostgreSQL y después se invalida la clave.',
    '- **Si Redis cae**: se registra un aviso y la petición se sirve desde PostgreSQL.',
    '',
    '> Respuesta simulada del modo demo.',
  ].join('\n'),
  citations: [
    {
      filePath: 'portfolio-backend/src/main/java/dev/portfolio/application/service/TechnologyService.java',
      lineNumberRange: '22-31',
      codeSnippet:
        'return cache.getList(CacheKeys.TECHNOLOGIES_ALL, TechnologyDomain.class)\n        .orElseGet(() -> {\n            List<TechnologyDomain> technologies = repository.findAll();\n            cache.put(CacheKeys.TECHNOLOGIES_ALL, technologies, CacheKeys.TTL);\n            return technologies;\n        });',
    },
    { filePath: 'CLAUDE.md', lineNumberRange: '15-30', codeSnippet: 'Redis Best-Effort con TTLs convencionales, sin Lua.' },
  ],
};

const PROJECTS_ANSWER: AIQueryResponse = {
  answer: [
    'El portafolio incluye tres proyectos:',
    '',
    '- **SaaS Portfolio Platform**: la plataforma que estás viendo.',
    '- **Motor RAG con pgvector**: el asistente que responde citando fuentes.',
    '- **Rate limiter distribuido**: ventana fija atómica con Lua en Redis.',
    '',
    '> Respuesta simulada del modo demo.',
  ].join('\n'),
  citations: [
    { filePath: 'cms/projects/prj-platform', codeSnippet: 'Proyecto: SaaS Portfolio Platform' },
    { filePath: 'cms/projects/prj-rag', codeSnippet: 'Proyecto: Motor RAG con pgvector' },
  ],
};

export function mockRagAnswer(prompt: string): AIQueryResponse {
  const text = prompt.toLowerCase();
  if (text.includes('cach') || text.includes('redis')) {
    return CACHE_ANSWER;
  }
  if (text.includes('proyecto')) {
    return PROJECTS_ANSWER;
  }
  return ARCHITECTURE_ANSWER;
}
