import { AIQueryResponse, Article, CareerMilestone, Project, Technology } from '../api';
import { FeatureFlagKey } from '../flags/feature-flags';

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
    coverImageUrl: '/projects/saas-portfolio.jpg',
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
    period: 'ene 2024 - actualidad',
    title: 'Microservicios y APIs para la banca central',
    role: 'Senior Software Engineer',
    organization: 'PBS Consulting (proyecto para el BCR)',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'JWT', 'SQL Server', 'MongoDB', 'Azure AKS', 'Azure DevOps'],
    summary: 'Diseño y desarrollo microservicios de backend con Spring Boot para operaciones bancarias críticas, con APIs REST protegidas con OAuth2 y JWT. Lideré la migración de servicios a Kubernetes gestionado en Azure (AKS), con contenedores Docker, Azure Key Vault, Blob Storage y Redis, y pipelines de CI/CD en Azure DevOps. También optimizo consultas en SQL Server y MongoDB para volúmenes altos de transacciones y resuelvo incidencias en producción.',
  },
  {
    period: 'ago 2025 - oct 2026',
    title: 'Plataforma financiera híbrida fiat y cripto',
    role: 'Tech Lead',
    organization: 'Monetae',
    technologies: ['Java', 'Spring Boot', 'WebFlux', 'OpenAPI', 'Kafka', 'Redis', 'AWS', 'Kubernetes'],
    summary: 'Liderazgo técnico de punta a punta de una plataforma financiera híbrida (fiat y cripto) con arquitectura hexagonal y Clean Architecture. Sistemas distribuidos de alta concurrencia con Spring Boot y WebFlux, enfoque contract-first con OpenAPI y AsyncAPI, arquitectura orientada a eventos con Kafka, Redis y WebSockets, y patrones de resiliencia (idempotencia, reintentos con backoff, colas de mensajes fallidos). En AWS: ECS, EKS, Lambda, API Gateway, Secrets Manager y CloudWatch. Integración con servicios de custodia como Fireblocks, revisiones de código y mentoría del equipo.',
  },
  {
    period: 'may 2022 - ene 2024',
    title: 'Integración del core bancario AS400 con servicios REST y SOAP',
    role: 'Desarrollador Java Broker',
    organization: 'Banco Agrícola',
    technologies: ['Java', 'Spring Boot', 'Spring Batch', 'IBM AS400', 'IBM MQ Series', 'AWS Lambda', 'Prometheus', 'ELK'],
    summary: 'Integración del core bancario AS400 con servicios REST y SOAP en Java. Microservicios en Spring Boot entre aplicaciones internas y externas, procesos batch que transforman y validan archivos planos del AS400 y COBOL, conectores con IBM MQ Series y servicios REST y SOAP para terceros. Participé en la migración de aplicaciones monolíticas a microservicios sin interrumpir el servicio, con tareas asíncronas en AWS y observabilidad con Prometheus, Grafana y ELK.',
  },
  {
    period: '2018 - 2022',
    title: 'Ingeniería en Sistemas y Computación',
    organization: 'Universidad Dr. Andrés Bello',
    summary: 'Ingeniería en Sistemas y Computación. Durante la carrera trabajé ya en proyectos bancarios, con Java, bases de datos relacionales y no relacionales e integraciones del backend con el core bancario en IBM AS400.',
  },
  {
    period: 'nov 2020 - feb 2021',
    title: 'Sistemas electorales en tiempo real',
    role: 'Facilitador de aprendizaje',
    organization: 'Tribunal Supremo Electoral',
    technologies: ['Java', 'Spring Boot', 'Angular', 'React', 'AWS', 'Azure'],
    summary: 'Coordinación de equipos técnicos para implantar los sistemas electorales en tiempo real de las elecciones nacionales y capacitación técnica al personal. Pruebas de integración y monitorización antes y durante las elecciones, y trabajo con los equipos de ciberseguridad (cifrado, SSL/TLS y protección anti-DDoS).',
  },
  {
    period: 'jun 2019 - dic 2019',
    title: 'Aplicaciones bancarias seguras y orientadas a eventos',
    role: 'Desarrollador Full Stack',
    organization: 'Banco Davivienda',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'Apache Kafka', 'RabbitMQ', 'Docker', 'Kubernetes', 'AWS'],
    summary: 'Aplicaciones bancarias seguras con Java y el ecosistema Spring. Microservicios REST con OAuth2 y JWT detrás de un API Gateway, y servicios distribuidos con Kafka, RabbitMQ y MQ Series para flujos de transacciones en tiempo real. Despliegue en contenedores con Docker y Kubernetes, y pipelines de CI/CD con Jenkins y Azure DevOps.',
  },
];

/** Los mismos hitos en inglés, de `docs/career/CAREER_STORY.en.md` (`?lang=en`). */
export const MOCK_CAREER_EN: CareerMilestone[] = [
  {
    period: 'Jan 2024 - present',
    title: 'Microservices and APIs for central banking',
    role: 'Senior Software Engineer',
    organization: 'PBS Consulting (project for BCR, the Central Reserve Bank)',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'JWT', 'SQL Server', 'MongoDB', 'Azure AKS', 'Azure DevOps'],
    summary: 'I design and build backend microservices with Spring Boot for critical banking operations, with REST APIs secured with OAuth2 and JWT. I led the migration of services to managed Kubernetes on Azure (AKS), with Docker containers, Azure Key Vault, Blob Storage and Redis, and CI/CD pipelines in Azure DevOps. I also tune queries on SQL Server and MongoDB for high transaction volumes and resolve production incidents.',
  },
  {
    period: 'Aug 2025 - Oct 2026',
    title: 'Hybrid fiat and crypto financial platform',
    role: 'Tech Lead',
    organization: 'Monetae',
    technologies: ['Java', 'Spring Boot', 'WebFlux', 'OpenAPI', 'Kafka', 'Redis', 'AWS', 'Kubernetes'],
    summary: 'End-to-end technical leadership of a hybrid (fiat and crypto) financial platform built on hexagonal architecture and Clean Architecture. High-concurrency distributed systems with Spring Boot and WebFlux, a contract-first approach with OpenAPI and AsyncAPI, event-driven architecture with Kafka, Redis and WebSockets, and resilience patterns (idempotency, retries with backoff, dead-letter queues). On AWS: ECS, EKS, Lambda, API Gateway, Secrets Manager and CloudWatch. Integration with custody services such as Fireblocks, code reviews and mentoring of the team.',
  },
  {
    period: 'May 2022 - Jan 2024',
    title: 'Integrating the AS400 core banking system with REST and SOAP services',
    role: 'Java Broker Developer',
    organization: 'Banco Agrícola',
    technologies: ['Java', 'Spring Boot', 'Spring Batch', 'IBM AS400', 'IBM MQ Series', 'AWS Lambda', 'Prometheus', 'ELK'],
    summary: 'Integration of the AS400 core banking system through REST and SOAP services in Java. Spring Boot microservices between internal and external applications, batch processes that transform and validate flat files from AS400 and COBOL, connectors to IBM MQ Series, and REST and SOAP services for third parties. I took part in migrating monolithic applications to microservices without service disruption, with asynchronous tasks on AWS and observability with Prometheus, Grafana and ELK.',
  },
  {
    period: '2018 - 2022',
    title: 'Systems and Computer Engineering degree',
    organization: 'Universidad Dr. Andrés Bello',
    summary: 'Degree in Systems and Computer Engineering. During my studies I already worked on banking projects, with Java, relational and non-relational databases and backend integrations with the core banking system on IBM AS400.',
  },
  {
    period: 'Nov 2020 - Feb 2021',
    title: 'Real-time electoral systems',
    role: 'Learning Facilitator',
    organization: 'Supreme Electoral Tribunal of El Salvador',
    technologies: ['Java', 'Spring Boot', 'Angular', 'React', 'AWS', 'Azure'],
    summary: 'Coordinating technical teams to roll out the real-time electoral systems for the national elections and training the electoral staff. Integration testing and monitoring before and during the elections, and work with the cybersecurity teams (encryption, SSL/TLS and anti-DDoS protection).',
  },
  {
    period: 'Jun 2019 - Dec 2019',
    title: 'Secure, event-driven banking applications',
    role: 'Full Stack Developer',
    organization: 'Banco Davivienda',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'Apache Kafka', 'RabbitMQ', 'Docker', 'Kubernetes', 'AWS'],
    summary: 'Secure banking applications with Java and the Spring ecosystem. REST microservices with OAuth2 and JWT behind an API Gateway, and distributed services with Kafka, RabbitMQ and MQ Series for real-time transaction flows. Container deployments with Docker and Kubernetes, and CI/CD pipelines with Jenkins and Azure DevOps.',
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

/** Descripción de cada flag, como la da el backend (`FeatureFlagDomain`). */
export const MOCK_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  'studio.smart-rules': 'Lienzo responsivo y conexiones inteligentes en el Estudio de arquitectura',
  'cloud.oracle': 'Oracle Cloud como cuarta nube del Estudio',
  'studio.system-design': 'Diseño de sistemas completos: vistas de aplicación e infraestructura',
  'studio.system-templates': 'Plantillas de sistemas completos',
  'mcp.section': 'Servidor MCP y la sección «Usa mi plataforma desde tu IA»',
};
