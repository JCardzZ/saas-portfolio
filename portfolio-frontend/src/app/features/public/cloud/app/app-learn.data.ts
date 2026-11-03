import { Protocol } from './app-protocols';

/**
 * Lo que el Estudio de Aplicación enseña (flag `studio.app-canvas`): de cada pieza, qué es,
 * cuándo conviene, qué evitar y en qué piezas de Infraestructura puede correr; de cada protocolo,
 * para qué sirve y cuándo elegirlo. Conocimiento de libro, sin cifras de un proveedor concreto.
 */
export interface PieceLesson {
  what: string;
  when: string;
  avoid: string;
  /** Tipos de nodo de Infraestructura donde se despliega; vacío: no se despliega en la nube. */
  runsOn: string[];
  /** Latencia típica de su salto dentro de una región, en milisegundos. */
  ms: number;
  /** Qué pasa si cae y cómo se mitiga. */
  failure: { impact: string; mitigation: string };
}

const COMPUTE = ['containers', 'kubernetes', 'vm', 'app-platform'];

export const PIECE_LESSONS: Record<string, PieceLesson> = {
  spa: {
    what: 'Una aplicación que se descarga una vez y pinta en el navegador; habla con la API por HTTP.',
    when: 'Paneles e interfaces muy interactivas donde el SEO no es lo primero.',
    avoid: 'Meter secretos o reglas de negocio en el cliente: todo lo que llega al navegador es público.',
    runsOn: ['static', 'bucket', 'edge'], ms: 0,
    failure: { impact: 'Si no se sirven los estáticos, no hay interfaz.', mitigation: 'Servirlos desde una CDN con varias réplicas de borde.' },
  },
  ssr: {
    what: 'El servidor genera el HTML de cada página y el navegador lo hidrata.',
    when: 'Contenido público que debe indexarse y cargar rápido la primera vez.',
    avoid: 'Llamar desde el render a servicios lentos sin caché: cada visita espera por ellos.',
    runsOn: [...COMPUTE, 'functions'], ms: 15,
    failure: { impact: 'Sin servidor de render no hay páginas.', mitigation: 'Varias instancias y caché de páginas en la CDN.' },
  },
  mobile: {
    what: 'Una app instalada en el teléfono que habla con la API.',
    when: 'Cuando hacen falta notificaciones, uso sin conexión o acceso al dispositivo.',
    avoid: 'Romper la API: hay versiones antiguas instaladas que no se actualizan a la vez.',
    runsOn: [], ms: 0,
    failure: { impact: 'Sin conexión no puede pedir nada nuevo.', mitigation: 'Caché local y cola de cambios que se envía al volver la red.' },
  },
  partner: {
    what: 'Un sistema de otra empresa que consume tu API pública.',
    when: 'Integraciones B2B y ecosistemas de terceros.',
    avoid: 'Exponerle tu API interna: dale un contrato versionado y estable.',
    runsOn: [], ms: 0,
    failure: { impact: 'Su error no debe tumbar tu servicio.', mitigation: 'Límites por cliente en el gateway y claves revocables.' },
  },
  dns: {
    what: 'Traduce el dominio a la dirección de la entrada.',
    when: 'Siempre que haya un dominio propio.',
    avoid: 'TTL muy largos si vas a cambiar de entrada: el cambio tardará en propagarse.',
    runsOn: ['dns', 'edge'], ms: 5,
    failure: { impact: 'Sin DNS nadie encuentra el servicio aunque funcione.', mitigation: 'Proveedor gestionado con anycast y registros secundarios.' },
  },
  cdn: {
    what: 'Una red de servidores cerca del usuario que guarda lo cacheable.',
    when: 'Estáticos y respuestas iguales para todos.',
    avoid: 'Cachear respuestas personalizadas: un usuario vería los datos de otro.',
    runsOn: ['edge', 'static'], ms: 15,
    failure: { impact: 'Todo el tráfico cae sobre el origen.', mitigation: 'Origen dimensionado para aguantar sin CDN y cabeceras Cache-Control claras.' },
  },
  waf: {
    what: 'Un cortafuegos de aplicación que filtra ataques conocidos (inyección, bots, abuso).',
    when: 'Cualquier entrada pública, y obligatorio si hay pagos con tarjeta.',
    avoid: 'Reglas tan estrictas que bloqueen a usuarios legítimos sin que nadie lo vea.',
    runsOn: ['waf', 'edge'], ms: 2,
    failure: { impact: 'Abierto, deja pasar ataques; cerrado, bloquea a todos.', mitigation: 'Modo de solo registro antes de bloquear y alertas sobre lo bloqueado.' },
  },
  gateway: {
    what: 'La puerta única de la API: autentica, limita peticiones y enruta.',
    when: 'Varios servicios detrás de una sola API pública, o clientes externos.',
    avoid: 'Poner lógica de negocio en el gateway: se vuelve un monolito difícil de probar.',
    runsOn: ['api-gateway', ...COMPUTE], ms: 8,
    failure: { impact: 'Es la única puerta: si cae, cae todo.', mitigation: 'Servicio gestionado en varias zonas y salud vigilada.' },
  },
  bff: {
    what: 'Un backend a medida de un tipo de cliente que agrega y adapta respuestas.',
    when: 'La web y el móvil necesitan datos muy distintos de los mismos servicios.',
    avoid: 'Un BFF compartido por todos los clientes: deja de ser «para» nadie.',
    runsOn: [...COMPUTE, 'functions'], ms: 12,
    failure: { impact: 'Ese tipo de cliente se queda sin servicio.', mitigation: 'Varias instancias y tiempos de espera cortos hacia los servicios.' },
  },
  lb: {
    what: 'Reparte el tráfico entre las instancias sanas.',
    when: 'Más de una instancia de un servicio.',
    avoid: 'Sesiones pegadas a una instancia: al caer esa instancia se pierden.',
    runsOn: ['lb'], ms: 2,
    failure: { impact: 'Sin balanceador no hay entrada.', mitigation: 'Balanceador gestionado en varias zonas.' },
  },
  monolith: {
    what: 'Una sola aplicación desplegable, dividida en módulos con límites claros.',
    when: 'Equipos pequeños y dominios que aún cambian: lo más rápido de operar.',
    avoid: 'Módulos que se llaman por dentro sin contrato: luego no se pueden separar.',
    runsOn: COMPUTE, ms: 6,
    failure: { impact: 'Las instancias que caen dejan de recibir tráfico; si caen todas, no hay servicio.', mitigation: 'Al menos dos instancias en zonas distintas y autoescalado.' },
  },
  microservice: {
    what: 'Un servicio pequeño con su propio dato y su propio despliegue.',
    when: 'Equipos independientes y partes que escalan de forma distinta.',
    avoid: 'Compartir la base de datos con otro servicio: os acopláis por el esquema.',
    runsOn: [...COMPUTE, 'functions'], ms: 5,
    failure: { impact: 'Lo que depende de él en cadena síncrona falla también.', mitigation: 'Tiempos de espera, reintentos con límite y cortacircuitos.' },
  },
  worker: {
    what: 'Un proceso que consume trabajo de una cola fuera de la petición del usuario.',
    when: 'Tareas lentas: correos, informes, procesado de ficheros.',
    avoid: 'Procesar dos veces el mismo mensaje con efectos: hazlo idempotente.',
    runsOn: [...COMPUTE, 'functions'], ms: 0,
    failure: { impact: 'El trabajo se acumula en la cola; nada se pierde.', mitigation: 'Autoescalado por profundidad de cola y cola de mensajes fallidos.' },
  },
  function: {
    what: 'Código que se ejecuta por evento y escala a cero.',
    when: 'Tráfico irregular y tareas cortas.',
    avoid: 'Conexiones directas a una base relacional desde miles de funciones: agotan las conexiones.',
    runsOn: ['functions'], ms: 10,
    failure: { impact: 'Arranques en frío y límites de concurrencia.', mitigation: 'Concurrencia reservada y un pool de conexiones intermedio.' },
  },
  cron: {
    what: 'Una tarea que se lanza a una hora fija.',
    when: 'Limpiezas, cierres diarios, recordatorios.',
    avoid: 'Dos instancias lanzando la misma tarea a la vez: usa un bloqueo distribuido.',
    runsOn: ['functions', 'workflow', ...COMPUTE], ms: 0,
    failure: { impact: 'Si no se ejecuta, nadie se entera.', mitigation: 'Alerta cuando una ejecución esperada no llega.' },
  },
  sql: {
    what: 'Una base relacional: tablas, transacciones ACID y consultas con uniones.',
    when: 'La opción por defecto para datos de negocio.',
    avoid: 'Consultas sin índice en tablas que crecen y conexiones sin pool.',
    runsOn: ['postgres', 'newsql-pg', 'global-sql', 'global-database'], ms: 5,
    failure: { impact: 'Las escrituras fallan; con réplica, el cambio de primaria tarda del orden de un minuto.', mitigation: 'Multizona con conmutación automática, réplica de lectura y copias probadas.' },
  },
  nosql: {
    what: 'Documentos o clave-valor con esquema flexible.',
    when: 'Accesos por clave conocidos de antemano y escala horizontal.',
    avoid: 'Necesitar uniones y transacciones entre documentos: eso es relacional.',
    runsOn: ['nosql', 'mongodb', 'wide-column'], ms: 4,
    failure: { impact: 'Sin base no se lee ni se escribe.', mitigation: 'Réplicas en varias zonas y copias de seguridad probadas.' },
  },
  cache: {
    what: 'Memoria compartida muy rápida con caducidad por clave.',
    when: 'Lecturas repetidas, sesiones y límites de peticiones.',
    avoid: 'Tratarla como fuente de verdad: lo que solo está en caché se pierde.',
    runsOn: ['redis'], ms: 1,
    failure: { impact: 'Todas las lecturas van a la base: más latencia y riesgo de saturarla.', mitigation: 'Patrón cache-aside y límite de peticiones simultáneas a la base.' },
  },
  search: {
    what: 'Un índice de texto completo con relevancia y facetas.',
    when: 'Búsquedas por texto libre que una base relacional resuelve mal.',
    avoid: 'Escribir en él como fuente de verdad: se reconstruye desde la base.',
    runsOn: ['search'], ms: 10,
    failure: { impact: 'La búsqueda cae pero el resto sigue.', mitigation: 'Reindexado desde la base y degradar a una búsqueda simple.' },
  },
  storage: {
    what: 'Almacén de ficheros y binarios por clave, casi ilimitado.',
    when: 'Imágenes, documentos, copias de seguridad.',
    avoid: 'Guardar binarios en la base relacional.',
    runsOn: ['bucket'], ms: 20,
    failure: { impact: 'No se suben ni descargan ficheros.', mitigation: 'Replicación entre regiones para lo crítico.' },
  },
  warehouse: {
    what: 'Una base analítica por columnas para consultas sobre grandes volúmenes.',
    when: 'Informes y analítica sin cargar la base transaccional.',
    avoid: 'Usarla para la aplicación en línea: está pensada para consultas largas.',
    runsOn: ['warehouse', 'snowflake', 'databricks', 'sql-query'], ms: 0,
    failure: { impact: 'Los informes se retrasan; la aplicación sigue.', mitigation: 'Cargas reintentables e idempotentes.' },
  },
  queue: {
    what: 'Una cola donde cada mensaje lo procesa un solo consumidor.',
    when: 'Trabajo que puede esperar y picos que hay que absorber.',
    avoid: 'Mensajes sin cola de fallidos: un mensaje venenoso bloquea el resto.',
    runsOn: ['queue', 'rabbitmq'], ms: 5,
    failure: { impact: 'No se puede encolar; con outbox, el cambio ya está guardado.', mitigation: 'Patrón outbox y reintentos con cola de fallidos.' },
  },
  stream: {
    what: 'Un registro ordenado y persistente que varios consumidores leen a su ritmo.',
    when: 'Eventos de negocio que alimentan a muchos sistemas y se pueden releer.',
    avoid: 'Usarlo como cola de tareas simples: es más caro y complejo de operar.',
    runsOn: ['streaming', 'event-stream', 'kafka'], ms: 5,
    failure: { impact: 'Los consumidores se retrasan; los eventos no se pierden si hay réplicas.', mitigation: 'Factor de replicación ≥ 3 y alertas de retraso por consumidor.' },
  },
  pubsub: {
    what: 'Difusión: un aviso llega a todos los suscriptores.',
    when: 'Notificar el mismo hecho a varios sistemas.',
    avoid: 'Contar con que el suscriptor estaba conectado: sin historial, lo perdido no vuelve.',
    runsOn: ['pubsub'], ms: 5,
    failure: { impact: 'Los avisos no llegan.', mitigation: 'Suscripciones con cola propia para no perder mensajes.' },
  },
  idp: {
    what: 'Un proveedor de identidad: inicio de sesión, MFA y tokens OIDC.',
    when: 'Siempre que haya usuarios: no reinventes la autenticación.',
    avoid: 'Tokens de larga duración sin forma de revocarlos.',
    runsOn: ['identity'], ms: 1,
    failure: { impact: 'Quien ya tiene token sigue dentro; nadie nuevo puede entrar.', mitigation: 'Tokens cortos y claves públicas cacheadas en los servicios.' },
  },
  secrets: {
    what: 'Guarda credenciales y claves fuera del código, con rotación y auditoría.',
    when: 'Cualquier secreto: contraseñas de base, claves de API.',
    avoid: 'Secretos en variables del repositorio o en imágenes de contenedor.',
    runsOn: ['secrets', 'vault'], ms: 2,
    failure: { impact: 'Los servicios no arrancan si no leen sus secretos.', mitigation: 'Caché local del secreto y arranque con reintentos.' },
  },
  logs: {
    what: 'Registros y métricas centralizados con paneles y alertas.',
    when: 'Desde el primer día en producción.',
    avoid: 'Alertas que nadie atiende: se ignoran todas.',
    runsOn: ['native-monitoring', 'prometheus', 'datadog'], ms: 0,
    failure: { impact: 'Vas a ciegas: los fallos los descubren los usuarios.', mitigation: 'Alertas sobre los propios agentes de observabilidad.' },
  },
  tracing: {
    what: 'Sigue cada petición entre servicios con un mismo identificador de traza.',
    when: 'Más de dos servicios en la cadena de una petición.',
    avoid: 'Muestrear el 100 % en producción con mucho tráfico: cuesta caro.',
    runsOn: ['opentelemetry', 'datadog', 'native-monitoring'], ms: 0,
    failure: { impact: 'Sin trazas no sabes qué salto es el lento.', mitigation: 'Muestreo por cola: guardar siempre las lentas y las fallidas.' },
  },
  payments: {
    what: 'Un proveedor de pagos que procesa tarjetas por ti.',
    when: 'Cobrar sin guardar datos de tarjeta (reduce el alcance PCI).',
    avoid: 'Confirmar un pedido solo por la respuesta del cliente: espera el webhook firmado.',
    runsOn: [], ms: 300,
    failure: { impact: 'No se cobra.', mitigation: 'Reintentos idempotentes y estado del pago guardado.' },
  },
  email: {
    what: 'Envío de correos transaccionales con reputación gestionada.',
    when: 'Confirmaciones, recuperación de contraseña, avisos.',
    avoid: 'Enviar dentro de la petición del usuario: hazlo desde una cola.',
    runsOn: [], ms: 200,
    failure: { impact: 'Los correos se retrasan.', mitigation: 'Cola con reintentos y un proveedor de respaldo.' },
  },
  'third-party': {
    what: 'Un servicio externo del que dependes.',
    when: 'Cuando construirlo no aporta ventaja.',
    avoid: 'Llamarlo sin tiempo de espera: su lentitud se vuelve la tuya.',
    runsOn: [], ms: 150,
    failure: { impact: 'Su caída se propaga a tu petición.', mitigation: 'Tiempo de espera, cortacircuitos y una respuesta degradada.' },
  },
};

export interface ProtocolLesson {
  what: string;
  when: string;
  /** Coste extra del protocolo sobre el salto, en milisegundos. */
  ms: number;
}

export const PROTOCOL_LESSONS: Record<Protocol, ProtocolLesson> = {
  HTTPS: { what: 'HTTP cifrado con TLS.', when: 'Cualquier tráfico que cruce una red no confiable.', ms: 0 },
  REST: { what: 'Recursos sobre HTTP con un contrato OpenAPI.', when: 'APIs públicas y la mayoría de clientes: lo que todo el mundo entiende.', ms: 1 },
  GraphQL: { what: 'El cliente pide justo los campos que necesita en una sola petición.', when: 'Pantallas que juntan datos de muchas fuentes.', ms: 2 },
  gRPC: { what: 'Llamadas binarias sobre HTTP/2 con un contrato .proto.', when: 'Entre servicios internos: eficiente y tipado. El navegador necesita un proxy.', ms: 0 },
  WebSocket: { what: 'Una conexión abierta en los dos sentidos.', when: 'Chat, colaboración y tableros en vivo.', ms: 0 },
  SQL: { what: 'Consultas a una base relacional por su protocolo de red.', when: 'Del servicio a su base, con un pool de conexiones.', ms: 0 },
  Driver: { what: 'El cliente nativo de la base (MongoDB, DynamoDB…).', when: 'Del servicio a una base no relacional.', ms: 0 },
  RESP: { what: 'El protocolo de Redis: comandos simples sobre TCP.', when: 'Del servicio a la caché.', ms: 0 },
  Eventos: { what: 'Mensajes asíncronos: quien publica no espera respuesta.', when: 'Trabajo que puede esperar y avisos entre servicios desacoplados.', ms: 0 },
  OIDC: { what: 'Inicio de sesión estándar sobre OAuth 2: el cliente obtiene un token firmado.', when: 'Autenticar usuarios con un proveedor de identidad.', ms: 0 },
  SDK: { what: 'La librería oficial del proveedor.', when: 'Servicios gestionados y terceros con SDK propio.', ms: 0 },
  OTLP: { what: 'El protocolo de OpenTelemetry para trazas, métricas y logs.', when: 'Enviar telemetría sin atarse a un proveedor.', ms: 0 },
  DNS: { what: 'Resolución de nombres.', when: 'Del cliente a la entrada pública.', ms: 0 },
};
