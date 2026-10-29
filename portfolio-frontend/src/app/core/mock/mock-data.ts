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
    technologies: ['Java', 'Spring Boot', 'Spring Security', 'OAuth2', 'JWT', 'Docker', 'Kubernetes', 'CI/CD'],
    summary: 'Microservicios y APIs seguras con Spring Boot para operaciones bancarias críticas. Diseño, desarrollo y pongo en marcha servicios de backend escalables y de alto rendimiento, con APIs REST protegidas con OAuth2 y JWT para resguardar datos financieros sensibles. Optimizo estructuras de datos y consultas en bases de datos SQL y NoSQL que manejan volúmenes altos de transacciones. Participo en la modernización de servicios hacia contenedores y Kubernetes gestionado en la nube, con gestión segura de secretos y pipelines de CI/CD que aceleran las entregas sin perder calidad. Diagnostico y resuelvo incidencias en producción para mantener la disponibilidad de sistemas de misión crítica. Genero reportes dinámicos en Java con exportación a varios formatos y documento las soluciones con estándares de calidad (Javadoc y diagramas de arquitectura). Trabajo en equipos multidisciplinarios con Scrum: planificación, seguimiento diario y revisión de cada sprint.',
  },
  {
    period: 'ago 2025 - oct 2026',
    title: 'Plataforma financiera híbrida fiat y cripto',
    role: 'Tech Lead',
    organization: 'Monetae',
    technologies: ['Java', 'Spring Boot', 'WebFlux', 'OpenAPI', 'AsyncAPI', 'Kafka', 'Docker', 'Kubernetes'],
    summary: 'Liderazgo técnico de una plataforma financiera fiat y cripto. Lideré de punta a punta su desarrollo con Scrum, arquitectura hexagonal y Clean Architecture. Diseñé sistemas distribuidos de alta concurrencia con Spring Boot y WebFlux, con seguridad empresarial basada en OAuth2 y OpenID Connect. Definí y adopté el enfoque contract-first con OpenAPI y AsyncAPI para estandarizar las APIs y la comunicación entre microservicios. Diseñé flujos financieros y transaccionales que garantizan consistencia, trazabilidad y cumplimiento en operaciones críticas. Arquitectura orientada a eventos con mensajería asíncrona, estado distribuido y comunicación en tiempo real, y patrones de resiliencia: idempotencia, reintentos con backoff, colas de mensajes fallidos y consistencia eventual. Despliegue cloud-native con contenedores y Kubernetes, gestión segura de secretos y configuración, observabilidad con logs centralizados, métricas y trazas, y estándares de seguridad OWASP. Integré servicios externos de custodia institucional, identidad y procesamiento de activos digitales. Participé en las decisiones estratégicas junto a negocio y producto, programé a diario, hice revisiones de código y mentoría al equipo, y documenté la arquitectura y las decisiones técnicas.',
  },
  {
    period: 'may 2022 - ene 2024',
    title: 'Integración del core bancario con servicios REST y SOAP',
    role: 'Desarrollador Java Broker',
    organization: 'Banco Agrícola',
    technologies: ['Java', 'Spring Boot', 'Spring Batch', 'REST', 'SOAP', 'JMS'],
    summary: 'Integración del core bancario con servicios REST y SOAP en Java. Diseñé, desarrollé y mantuve soluciones de integración que aseguran una comunicación estable y segura entre sistemas críticos. Implementé microservicios en Spring Boot entre aplicaciones internas y externas, con mejor escalabilidad y resiliencia. Desarrollé procesos batch que transforman y validan los archivos del sistema core para garantizar la integridad de los datos financieros, e integré aplicaciones legadas mediante conectores propios y mensajería con colas. Expuse funcionalidades bancarias a terceros con servicios REST y SOAP bajo estándares estrictos de seguridad y fiabilidad. Optimicé procesos de integración de alto volumen, con mejores tiempos de respuesta y menor consumo de recursos. Participé en la migración de aplicaciones monolíticas a microservicios sin interrumpir el servicio. Aseguré la calidad con pruebas unitarias, integración continua y revisiones de código en equipos Scrum y Kanban, en coordinación con los equipos de infraestructura, redes y QA.',
  },
  {
    period: '2018 - 2022',
    title: 'Ingeniería en Sistemas y Computación',
    organization: 'Universidad Dr. Andrés Bello',
    summary: 'Ingeniería en Sistemas y Computación. Durante la carrera trabajé ya en proyectos bancarios, con Java, bases de datos relacionales y no relacionales e integraciones del backend con el core bancario.',
  },
  {
    period: 'nov 2020 - feb 2021',
    title: 'Sistemas electorales en tiempo real',
    role: 'Facilitador de aprendizaje',
    organization: 'Tribunal Supremo Electoral',
    technologies: ['Java', 'Spring Boot', 'Angular', 'React'],
    summary: 'Coordinación técnica de los sistemas de las elecciones nacionales. Coordiné equipos técnicos para implantar y desplegar sistemas electorales en tiempo real. Preparé material formativo y di capacitación técnica y operativa al personal electoral con sesiones prácticas. Ejecuté pruebas de integración, validación funcional y seguimiento continuo antes y durante las elecciones para asegurar su calidad, estabilidad y disponibilidad. Contribuí al diseño de interfaces accesibles y fáciles de usar para perfiles ciudadanos diversos. Trabajé junto a los equipos de ciberseguridad para reducir riesgos. Desarrollé componentes de backend y frontend para módulos internos de soporte con Java, Spring Boot, Angular y React. Participé en el análisis posterior a la elección con métricas técnicas y operativas para proponer mejoras a futuros procesos.',
  },
  {
    period: 'jun 2019 - dic 2019',
    title: 'Aplicaciones bancarias seguras y orientadas a eventos',
    role: 'Desarrollador Full Stack',
    organization: 'Banco Davivienda',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'Apache Kafka', 'RabbitMQ', 'Docker'],
    summary: 'Aplicaciones bancarias seguras con Java y el ecosistema Spring. Diseñé y desarrollé aplicaciones modulares con Spring Boot, Spring Data y Spring Security, con foco en escalabilidad, mantenibilidad y protección de datos. Microservicios REST con autenticación OAuth2 y JWT para operaciones distribuidas de alto volumen. Servicios orientados a eventos con Kafka y RabbitMQ para flujos de transacciones en tiempo real. Optimicé bases de datos relacionales y NoSQL para acelerar las consultas y soportar operaciones concurrentes. Despliegue en contenedores con pipelines de integración y entrega continuas que incluyen validaciones y pruebas. Integraciones con terceros mediante REST y SOAP, alineadas con la regulación del sector financiero. Participé en reuniones de diseño de arquitectura, hice revisiones de código y acompañé a desarrolladores junior, en equipos Scrum y Kanban.',
  },
];

/** Los mismos hitos en inglés, de `docs/career/CAREER_STORY.en.md` (`?lang=en`). */
export const MOCK_CAREER_EN: CareerMilestone[] = [
  {
    period: 'Jan 2024 - present',
    title: 'Microservices and APIs for central banking',
    role: 'Senior Software Engineer',
    organization: 'PBS Consulting (project for BCR)',
    technologies: ['Java', 'Spring Boot', 'Spring Security', 'OAuth2', 'JWT', 'Docker', 'Kubernetes', 'CI/CD'],
    summary: 'Secure microservices and APIs for critical banking operations. I design, build and roll out scalable, high-performance backend services with Spring Boot, with REST APIs secured with OAuth2 and JWT to protect sensitive financial data. I tune data structures and queries on SQL and NoSQL databases that handle high transaction volumes. I take part in modernising services towards containers and managed Kubernetes in the cloud, with secure secret management and CI/CD pipelines that speed up delivery without losing quality. I diagnose and fix production incidents to keep mission-critical systems available. I build dynamic reports in Java with multi-format export and document solutions to quality standards (Javadoc and architecture diagrams). I work in cross-functional Scrum teams: sprint planning, daily stand-ups and reviews.',
  },
  {
    period: 'Aug 2025 - Oct 2026',
    title: 'Hybrid fiat and crypto financial platform',
    role: 'Tech Lead',
    organization: 'Monetae',
    technologies: ['Java', 'Spring Boot', 'WebFlux', 'OpenAPI', 'AsyncAPI', 'Kafka', 'Docker', 'Kubernetes'],
    summary: 'Technical leadership of a fiat and crypto financial platform. I led its development end to end with Scrum, hexagonal architecture and Clean Architecture. I designed high-concurrency distributed systems with Spring Boot and WebFlux, with enterprise security based on OAuth2 and OpenID Connect. I defined and adopted a contract-first approach with OpenAPI and AsyncAPI to standardise the APIs and the communication between microservices. I designed financial and transactional flows that ensure consistency, traceability and compliance in critical operations. Event-driven architecture with asynchronous messaging, distributed state and real-time communication, and resilience patterns: idempotency, retries with backoff, dead-letter queues and eventual consistency. Cloud-native deployment with containers and Kubernetes, secure secret and configuration management, observability with centralised logs, metrics and tracing, and OWASP security standards. I integrated external services for institutional custody, identity and digital asset processing. I took part in strategic decisions with business and product, coded hands-on every day, reviewed code, mentored the team and documented the architecture and technical decisions.',
  },
  {
    period: 'May 2022 - Jan 2024',
    title: 'Core banking integration with REST and SOAP services',
    role: 'Java Broker Developer',
    organization: 'Banco Agrícola',
    technologies: ['Java', 'Spring Boot', 'Spring Batch', 'REST', 'SOAP', 'JMS'],
    summary: 'Core banking integration in Java through REST and SOAP. I designed, built and maintained integration solutions that keep communication between critical systems stable and secure. I implemented Spring Boot microservices between internal and external applications, improving scalability and resilience. I developed batch processes that transform and validate the core system\'s files to protect the integrity of financial data, and integrated legacy applications through custom connectors and queue-based messaging. I exposed banking features to third parties with REST and SOAP services under strict security and reliability standards. I optimised high-volume integration processes, improving response times and resource usage. I took part in migrating monolithic applications to microservices without service disruption. I ensured quality with unit tests, continuous integration and code reviews in Scrum and Kanban teams, working with the infrastructure, networking and QA teams.',
  },
  {
    period: '2018 - 2022',
    title: 'Systems and Computer Engineering degree',
    organization: 'Universidad Dr. Andrés Bello',
    summary: 'Degree in Systems and Computer Engineering. During my studies I already worked on banking projects, with Java, relational and non-relational databases and backend integrations with the core banking system.',
  },
  {
    period: 'Nov 2020 - Feb 2021',
    title: 'Real-time electoral systems',
    role: 'Learning Facilitator',
    organization: 'Supreme Electoral Tribunal of El Salvador',
    technologies: ['Java', 'Spring Boot', 'Angular', 'React'],
    summary: 'Technical coordination of the national elections\' systems. I coordinated technical teams to roll out and deploy real-time electoral systems. I prepared training material and gave technical and operational training to electoral staff in hands-on sessions. I ran integration testing, functional validation and continuous monitoring before and during the elections to keep the systems reliable, stable and available. I contributed to the design of accessible, easy-to-use interfaces for diverse citizen profiles. I worked alongside the cybersecurity teams to reduce risk. I developed backend and frontend components for internal support modules with Java, Spring Boot, Angular and React. I took part in the post-election analysis, using technical and operational metrics to propose improvements for future processes.',
  },
  {
    period: 'Jun 2019 - Dec 2019',
    title: 'Secure, event-driven banking applications',
    role: 'Full Stack Developer',
    organization: 'Banco Davivienda',
    technologies: ['Java', 'Spring Boot', 'OAuth2', 'Apache Kafka', 'RabbitMQ', 'Docker'],
    summary: 'Secure banking applications with Java and the Spring ecosystem. I designed and built modular applications with Spring Boot, Spring Data and Spring Security, focused on scalability, maintainability and data protection. REST microservices with OAuth2 and JWT authentication for high-volume distributed operations. Event-driven services with Kafka and RabbitMQ for real-time transaction flows. I optimised relational and NoSQL databases to speed up queries and support concurrent operations. Container deployment with continuous integration and delivery pipelines that include validation and testing. Third-party integrations through REST and SOAP, aligned with financial industry regulation. I took part in architecture design meetings, reviewed code and mentored junior developers, in Scrum and Kanban teams.',
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
  'site.release-version': 'Versión desplegada y novedades en el pie de página',
  'site.refresh': 'Rediseño de la portada: hero con pruebas en vivo, fondo limpio y menos cajas',
};
