import { By } from '@angular/platform-browser';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { of, throwError } from 'rxjs';

import { ArchitectureStudioService as ArchitectureStudioApi, provideApi } from '../../../core/api';
import { mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';

import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { ArchitectureStudioService as ArchitectureStudio } from './architecture-studio.service';
import { PriceQuote, PricingRequest } from '../../../core/api';
import { resetRuntimeConfig, runtimeConfig } from '../../../core/config/runtime-config';
import { OpenFeature } from '@openfeature/web-sdk';
import { PlatformFlagsProvider } from '../../../core/flags/feature-flags';
import { CloudInfraComponent, GRAPH_DIFF_DEBOUNCE_MS } from './cloud-infra.component';
import { directNodes, fits, settled } from './zone-layout';
import { DATA_BLUEPRINTS } from './data-blueprints';
import { CLOUD_NODES } from './cloud-topology.data';
import { referenceProject, serializeProject } from './studio-project';

describe('CloudInfraComponent', () => {
  beforeEach(() => {
    localStorage.removeItem('architecture-studio-project');
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(CloudInfraComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  afterEach(() => {
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
    localStorage.removeItem('architecture-studio-project');
  });

  const button = (element: HTMLElement, text: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent?.trim().includes(text))!;
  const provider = (element: HTMLElement, name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((candidate) => candidate.textContent?.includes(name))!;
  const services = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('svg text.node-service')).map((item) => item.textContent?.trim());
  const node = (element: HTMLElement, service: string) =>
    Array.from(element.querySelectorAll<SVGGElement>('g.node')).find((candidate) => candidate.textContent?.includes(service))!;
  const diagram = (element: HTMLElement) => element.querySelector('svg[role="group"]')!;
  const tags = () => TestBed.inject(SystemEventsService).events().map((event) => event.tag);
  const catalogEntry = (element: HTMLElement, text: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('app-service-catalog button[aria-label^="Añadir"]'))
      .find((entry) => entry.getAttribute('aria-label')!.includes(text))!;

  function edit() {
    const created = create();
    button(created.element, 'Editar arquitectura').click();
    created.fixture.detectChanges();
    return created;
  }

  describe('reference architecture', () => {
    it('draws the zones and services, opening on AWS', () => {
      const { element } = create();

      expect(provider(element, 'AWS').getAttribute('aria-checked')).toBe('true');
      expect(diagram(element).textContent).toContain('AWS Cloud · región');
      expect(diagram(element).textContent).toContain('VPC · red privada');
      expect(element.querySelectorAll('rect.zone').length).toBe(5);
      expect(services(element)).toEqual([
        'Visitantes', 'Cloudflare', 'S3 + CloudFront', 'Application LB', 'ECS Fargate', 'RDS PostgreSQL',
        'ElastiCache', 'Secrets Manager', 'CloudWatch', 'ECR', 'Gemini API', 'Terraform + Docker',
      ]);
      expect(element.querySelectorAll('path.wire').length).toBe(8);
    });

    it('translates every node in place when the cloud changes, and validates the result', () => {
      const { fixture, element } = create();

      provider(element, 'Azure').click();
      fixture.detectChanges();

      expect(diagram(element).textContent).toContain('Azure · región');
      expect(diagram(element).textContent).toContain('VNet · red privada');
      expect(services(element)).toContain('Container Apps');
      expect(services(element)).toContain('Key Vault');
      expect(services(element)).not.toContain('ECS Fargate');
      expect(services(element)).toContain('Cloudflare');
      expect(element.querySelectorAll('g.node').length).toBe(12);

      expect(TestBed.inject(TraceInspectorService).selected()).toBe('azure');
      expect(tags()).toContain('Azure Container Apps Ready');
      expect(tags().slice(-5)).toEqual([
        'Check: VPC Isolation OK', 'Check: Public Access to DB Disabled', 'Check: Single Entry Point OK',
        'Check: Secrets Managed OK', 'Terraform Plan Ready',
      ]);
      expect(TestBed.inject(SystemEventsService).events().every((event) => event.origin === 'simulated')).toBeTrue();
    });

    it('explains a node and highlights its connections when hovered', () => {
      const { fixture, element } = create();

      node(element, 'RDS PostgreSQL').dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      expect(element.querySelector('[aria-live]')!.textContent).toContain('sin acceso desde Internet');
      expect(element.querySelectorAll('path.wire-active').length).toBe(1);
      // El inspector pasa a esa pieza, con su icono y su nombre en la nube activa.
      expect(TestBed.inject(TraceInspectorService).selected()).toBe('awsRds');
      expect(TestBed.inject(TraceInspectorService).label()).toBe('RDS PostgreSQL');
    });

    describe('component telemetry', () => {
      const inspector = () => TestBed.inject(TraceInspectorService);
      const shown = () => inspector().events().map((event) => event.tag);
      function click(element: HTMLElement, service: string) {
        node(element, service).dispatchEvent(new MouseEvent('click'));
      }

      it('injects the telemetry of the clicked node and filters the console to that piece', () => {
        const { fixture, element } = create();
        const events = TestBed.inject(SystemEventsService);
        events.emit('cache', 'CacheHit Redis', 'ruido de otra pieza');

        click(element, 'RDS PostgreSQL');
        fixture.detectChanges();
        expect(shown()).toEqual(['pgvector CosineDistance: 0.12', 'HNSW Index Scan', 'Transaction Committed']);
        expect(inspector().events().every((event) => event.origin === 'simulated' && event.component === 'postgres')).toBeTrue();

        click(element, 'ElastiCache');
        expect(inspector().label()).toBe('ElastiCache');
        // Lo suyo y lo que la plataforma ya emitía sobre Redis; nada de PostgreSQL.
        expect(shown()).toEqual(['CacheHit Redis', 'CacheHit key: portfolio:projects:all', 'TTL 600s', 'RateLimit Lua']);

        click(element, 'ECS Fargate');
        expect(shown()).toEqual(['HikariPool-1 Active', 'Spring Security Auth OK', 'RFC 7807 Exception Handler Ready', '200 OK']);

        click(element, 'Gemini API');
        expect(shown()).toEqual(['Embedding Vector Generation', 'RAG Prompt Context Injected', 'GeminiFlash 120 tokens/s', 'CircuitBreaker aiEngine']);

        click(element, 'Cloudflare');
        expect(shown()).toContain('Cloudflare WAF Rule Evaluated');
      });

      it('only inspects on hover; the sample is injected on click or tap', () => {
        const { element } = create();
        node(element, 'Secrets Manager').dispatchEvent(new MouseEvent('mouseenter'));
        expect(inspector().label()).toBe('Secrets Manager');
        expect(shown()).toEqual([]);

        click(element, 'Secrets Manager');
        expect(shown()).toEqual(['Secret Read', 'Access Policy', 'Audit Log']);
        expect(inspector().events()[0].detail).toBe('Secrets Manager · JWT_SECRET, versión vigente');
      });

      it('covers nodes without a logo and services added by the visitor, each with its own trace', () => {
        const { fixture, element } = edit();
        catalogEntry(element, 'Broker AMQP').click();
        catalogEntry(element, 'Almacenamiento de objetos').click();
        button(element, 'Listo').click();
        fixture.detectChanges();
        TestBed.inject(SystemEventsService).events().length = 0;

        click(element, 'RabbitMQ');
        expect(inspector().selected()).toBe('rabbitmq');
        expect(shown()).toEqual(['Message Published', 'Message Acked', 'Queue Depth']);

        // Sin muestra propia: una genérica con su nombre.
        click(element, 'Almacenamiento de objetos');
        expect(inspector().label()).toBe('S3');
        expect(inspector().events().map((event) => event.detail)).toEqual(['S3 · Almacenamiento de objetos', 'S3']);

        click(element, 'Visitantes');
        expect(inspector().selected()).toBe('angular');
        expect(inspector().label()).toBe('Visitantes');
        expect(shown()).toContain('POST /ai/rag/query');
      });

      it('names the piece as the selected cloud does, and editing never injects telemetry', () => {
        const { fixture, element } = create();
        provider(element, 'Azure').click();
        fixture.detectChanges();
        click(element, 'Key Vault');
        expect(inspector().label()).toBe('Key Vault');
        expect(inspector().selected()).toBe('azKeyVault');
        expect(inspector().events()[0].detail).toBe('Key Vault · JWT_SECRET, versión vigente');

        button(element, 'Editar arquitectura').click();
        fixture.detectChanges();
        const count = TestBed.inject(SystemEventsService).events().length;
        click(element, 'Container Apps');
        expect(TestBed.inject(SystemEventsService).events().length).toBe(count);
      });

      it('lights the wires through the selected node with the accent, not with a brand colour', () => {
        const { fixture, element } = create();
        click(element, 'ECS Fargate');
        fixture.detectChanges();

        // La API tiene cuatro conexiones: balanceador, PostgreSQL, Redis y Gemini.
        const active = Array.from(element.querySelectorAll<SVGPathElement>('path.wire-active'));
        expect(active.length).toBe(4);
        expect(active.every((wire) => getComputedStyle(wire).stroke === 'rgb(111, 168, 255)')).toBeTrue();
        expect(getComputedStyle(active[0]).filter).toBe('none');
        // Dos partículas por conexión con el tráfico normal.
        expect(element.querySelectorAll('path.pulse-active').length).toBe(8);
        expect(getComputedStyle(element.querySelector<SVGPathElement>('path.wire:not(.wire-active)')!).stroke).toBe('rgb(58, 63, 74)');

        click(element, 'ElastiCache');
        fixture.detectChanges();
        expect(element.querySelectorAll('path.wire-active').length).toBe(1);
        expect(getComputedStyle(element.querySelector<SVGPathElement>('path.wire-active')!).stroke).toBe('rgb(111, 168, 255)');
      });
    });

    it('draws AWS and Azure services with their official icon, unmodified, and the rest as brand paths', () => {
      const { fixture, element } = create();
      const imageOf = (service: string) => node(element, service).querySelector('image.node-icon')?.getAttribute('href');

      expect(imageOf('ECS Fargate')).toBe('cloud-icons/aws/fargate.svg');
      expect(imageOf('RDS PostgreSQL')).toBe('cloud-icons/aws/rds.svg');
      expect(imageOf('S3 + CloudFront')).toBe('cloud-icons/aws/cloudfront.svg');
      expect(imageOf('Cloudflare')).toBeUndefined();
      expect(node(element, 'Cloudflare').querySelector('svg.node-icon path')).not.toBeNull();
      expect(element.querySelectorAll('image.node-icon').length).toBe(8);

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(imageOf('Key Vault')).toBe('cloud-icons/azure/key-vault.svg');
      expect(imageOf('Container Apps')).toBe('cloud-icons/azure/container-apps.svg');
      expect(element.querySelector('image.node-icon[transform]')).toBeNull();

      // Google Cloud: icono oficial de producto donde existe (Cloud Run, Cloud SQL) y logos de Simple Icons en el resto.
      provider(element, 'GCP').click();
      fixture.detectChanges();
      expect(imageOf('Cloud Run')).toBe('cloud-icons/gcp/cloud-run.svg');
      expect(imageOf('Cloud SQL')).toBe('cloud-icons/gcp/cloud-sql.svg');
      expect(element.querySelectorAll('image.node-icon').length).toBe(2);
    });

    it('uses a service-specific logo where one exists and the provider logo otherwise', () => {
      const { fixture, element } = create();
      provider(element, 'GCP').click();
      fixture.detectChanges();

      expect(node(element, 'Secret Manager').style.getPropertyValue('--brand')).toBe('#4285F4');
      expect(node(element, 'Cloud Storage + CDN').style.getPropertyValue('--brand')).toBe('#AECBFA');
      expect(node(element, 'Memorystore').style.getPropertyValue('--brand')).toBe('#FF4438');
    });
  });

  describe('main.tf', () => {
    it('shows the generated code with the security checks, following the selected cloud', () => {
      const { fixture, element } = create();
      expect(element.querySelector('#main-tf-panel')).toBeNull();

      button(element, 'main.tf').click();
      fixture.detectChanges();

      const panel = element.querySelector('#main-tf-panel')!;
      expect(panel.querySelector('pre')!.textContent).toContain('resource "aws_ecs_service" "api" {');
      expect(Array.from(panel.querySelectorAll('header li')).map((item) => item.textContent?.trim())).toContain('Check: VPC Isolation OK');
      expect(panel.querySelector('[role="status"]')).toBeNull();

      provider(element, 'GCP').click();
      fixture.detectChanges();
      expect(panel.querySelector('pre')!.textContent).toContain('resource "google_cloud_run_v2_service" "api" {');
      expect(panel.querySelector('pre')!.textContent).not.toContain('aws_');
    });

    it('regenerates as the topology changes and surfaces the warnings it causes', () => {
      const { fixture, element } = edit();
      button(element, 'main.tf').click();
      fixture.detectChanges();
      const code = () => element.querySelector('#main-tf-panel pre')!.textContent!;

      catalogEntry(element, 'Streaming de eventos').click();
      fixture.detectChanges();
      expect(code()).toContain('resource "aws_msk_cluster" "streaming_1" {');

      node(element, 'Secrets Manager').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      expect(code()).not.toContain('aws_secretsmanager_secret');
      expect(element.querySelector('#main-tf-panel [role="status"]')!.textContent).toContain('Warning: No Secrets Manager');
    });
  });

  describe('edit mode', () => {
    it('docks the catalog beside the canvas only while editing, and lets it be hidden', () => {
      const { fixture, element } = create();
      expect(element.querySelector('app-service-catalog')).toBeNull();

      button(element, 'Editar arquitectura').click();
      fixture.detectChanges();
      const catalog = element.querySelector('app-service-catalog')!;
      expect(Array.from(catalog.querySelectorAll('h4')).map((heading) => heading.textContent)).toEqual([
        'Cómputo', 'Serverless', 'Bases de datos', 'Mensajería', 'Datos y analítica', 'Observabilidad', 'API Management e integración', 'Redes y seguridad',
      ]);
      expect(catalog.querySelectorAll('button[aria-label^="Añadir"]').length).toBe(44);
      expect(catalog.textContent).toContain('DynamoDB');

      button(element, 'Ocultar catálogo').click();
      fixture.detectChanges();
      expect(element.querySelector('app-service-catalog')).toBeNull();
      expect(button(element, 'Mostrar catálogo')).toBeDefined();
    });

    it('translates the catalog with the cloud and filters it', () => {
      const { fixture, element } = edit();
      provider(element, 'Azure').click();
      fixture.detectChanges();
      const catalog = element.querySelector('app-service-catalog')!;
      expect(catalog.textContent).toContain('Cosmos DB');
      expect(catalog.textContent).toContain('AKS');
      expect(catalog.textContent).not.toContain('DynamoDB');
      expect(catalog.textContent).toContain('MongoDB Atlas');

      const search = catalog.querySelector<HTMLInputElement>('#catalog-search')!;
      const count = () => catalog.querySelectorAll('button[aria-label^="Añadir"]').length;
      for (const [term, expected] of [['kafka', 3], ['rabbitmq', 1], ['azurerm_key_vault', 1], ['secretos', 2], ['no-existe', 0]] as const) {
        search.value = term;
        search.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(count()).withContext(term).toBe(expected);
      }
      expect(catalog.textContent).toContain('Ningún servicio coincide');
    });

    it('shows each service with its own official logo where one exists', () => {
      const { fixture, element } = edit();
      provider(element, 'GCP').click();
      fixture.detectChanges();
      const brandOf = (text: string) =>
        catalogEntry(element, text).querySelector<HTMLElement>('app-tech-icon')!.style.getPropertyValue('--brand');

      expect(brandOf('Cola de mensajes')).toBe('#AECBFA');
      expect(brandOf('Almacén de datos analítico')).toBe('#669DF6');
      expect(brandOf('NoSQL clave-valor')).toBe('#DD2C00');
      expect(brandOf('Funciones serverless')).toBe('#4285F4');
      expect(brandOf('Broker AMQP')).toBe('#FF6600');

      provider(element, 'AWS').click();
      fixture.detectChanges();
      const imageOf = (text: string) => catalogEntry(element, text).querySelector('img')?.getAttribute('src');
      expect(imageOf('Funciones serverless')).toBe('cloud-icons/aws/lambda.svg');
      expect(imageOf('NoSQL clave-valor')).toBe('cloud-icons/aws/dynamodb.svg');
      expect(imageOf('Cola de mensajes')).toBe('cloud-icons/aws/sqs.svg');
      expect(imageOf('Broker AMQP')).toBeUndefined();

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(imageOf('NoSQL clave-valor')).toBe('cloud-icons/azure/cosmos-db.svg');
      expect(imageOf('Streaming de eventos')).toBe('cloud-icons/azure/event-hubs.svg');
    });

    it('places a service in its subnet, wired from where its traffic comes, and logs Terraform and security', () => {
      const { fixture, element, component } = edit();

      catalogEntry(element, 'NoSQL clave-valor').click();
      fixture.detectChanges();

      const added = component.nodes().find((candidate) => candidate.id === 'nosql-1')!;
      // Tercera fila de la subred de datos: las dos primeras son PostgreSQL y Redis.
      expect([added.x, added.y, added.zone]).toEqual([710, 430, 'data']);
      expect(component.wires().some((wire) => wire.from === 'api' && wire.to === 'nosql-1')).toBeTrue();
      expect(element.querySelectorAll('path.wire-glow').length).toBe(1);
      expect(services(element)).toContain('DynamoDB');
      expect(tags()).toEqual([
        'Terraform Plan +1 to add', 'Terraform Apply: resource "aws_dynamodb_table"', 'Deploying Node: DynamoDB', 'Route Table Updated',
        'Check: VPC Isolation OK', 'Check: Public Access to DB Disabled', 'Check: Single Entry Point OK', 'Check: Secrets Managed OK',
        'Terraform Plan Ready',
      ]);
      expect(TestBed.inject(TraceInspectorService).selected()).toBe('terraform');
      expect(TestBed.inject(TraceInspectorService).events().length).toBe(9);
    });

    it('routes each kind of service from the right source', () => {
      const { fixture, element, component } = edit();
      const sourceOf = (id: string) => component.wires().find((wire) => wire.to === id)!.from;

      catalogEntry(element, 'Kubernetes gestionado').click();
      catalogEntry(element, 'Cortafuegos de aplicación').click();
      catalogEntry(element, 'Monitorización como servicio').click();
      fixture.detectChanges();

      // El tráfico llega al cómputo desde el balanceador y al cortafuegos desde el borde.
      expect(sourceOf('kubernetes-1')).toBe('lb');
      expect(sourceOf('waf-2')).toBe('edge');
      expect(sourceOf('datadog-3')).toBe('api');
      expect(component.nodes().find((candidate) => candidate.id === 'kubernetes-1')!.zone).toBe('compute');
      expect(component.nodes().find((candidate) => candidate.id === 'waf-2')!.zone).toBe('public');
      expect(component.nodes().find((candidate) => candidate.id === 'datadog-3')!.zone).toBe('external');
    });

    it('translates API management across clouds: Apigee, Amazon API Gateway and Azure API Management', () => {
      const { fixture, element, component } = edit();
      provider(element, 'GCP').click();
      fixture.detectChanges();
      const section = Array.from(element.querySelectorAll('app-service-catalog section'))
        .find((candidate) => candidate.querySelector('h4')!.textContent === 'API Management e integración')!;
      expect(Array.from(section.querySelectorAll('button')).map((entry) => entry.querySelector('span span')!.textContent!.replace(/\s+/g, ' ').trim()))
        .toEqual(['Apigee Enterprise', 'Workflows']);
      expect(section.querySelector('img')!.getAttribute('src')).toBe('cloud-icons/gcp/apigee.svg');

      catalogEntry(element, 'Gestión de APIs').click();
      fixture.detectChanges();
      const imageOf = (service: string) => node(element, service).querySelector('image.node-icon')!.getAttribute('href');
      const placed = component.nodes().find((candidate) => candidate.id === 'api-gateway-1')!;
      expect(placed.zone).toBe('public');
      expect(component.wires().find((wire) => wire.to === 'api-gateway-1')!.from).toBe('edge');
      expect(imageOf('Apigee')).toBe('cloud-icons/gcp/apigee.svg');
      expect(tags()).toContain('Terraform Apply: resource "google_apigee_organization"');

      provider(element, 'AWS').click();
      fixture.detectChanges();
      expect(imageOf('Amazon API Gateway')).toBe('cloud-icons/aws/api-gateway.svg');
      expect(component.mainTf()).toContain('resource "aws_apigatewayv2_api" "api_gateway_1" {');

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(imageOf('API Management')).toBe('cloud-icons/azure/api-management.svg');
      expect(services(element)).not.toContain('Apigee');
    });

    it('offers the enterprise services of each cloud with their official icon', () => {
      const { fixture, element } = edit();
      const imageOf = (text: string) => catalogEntry(element, text).querySelector('img')?.getAttribute('src');
      const expected: Record<string, [capability: string, name: string, icon: string][]> = {
        GCP: [
          ['PostgreSQL de alto rendimiento', 'AlloyDB', 'gcp/alloydb'], ['SQL distribuido multirregión', 'Cloud Spanner', 'gcp/spanner'],
          ['Procesamiento de streams', 'Dataflow', 'gcp/dataflow'], ['Cortafuegos de aplicación', 'Cloud Armor', 'gcp/cloud-armor'],
          ['Plataforma de IA gestionada', 'Vertex AI', 'gcp/vertex-ai'],
        ],
        AWS: [
          ['PaaS de aplicaciones web', 'App Runner', 'aws/app-runner'], ['Consultas SQL serverless', 'Athena', 'aws/athena'],
          ['Base de datos de grafos', 'Neptune', 'aws/neptune'], ['NoSQL clave-valor', 'DynamoDB', 'aws/dynamodb'],
        ],
        Azure: [
          ['Almacén de datos analítico', 'Synapse Analytics', 'azure/synapse'], ['Cola de mensajes', 'Service Bus', 'azure/service-bus'],
          ['NoSQL clave-valor', 'Cosmos DB', 'azure/cosmos-db'],
        ],
      };
      for (const [cloud, entries] of Object.entries(expected)) {
        provider(element, cloud).click();
        fixture.detectChanges();
        for (const [capability, name, icon] of entries) {
          expect(catalogEntry(element, capability).textContent).withContext(name).toContain(name);
          expect(imageOf(capability)).withContext(name).toBe(`cloud-icons/${icon}.svg`);
        }
      }
      // BigQuery conserva su logo vectorial de Simple Icons.
      provider(element, 'GCP').click();
      fixture.detectChanges();
      expect(catalogEntry(element, 'Almacén de datos analítico').querySelector('app-tech-icon svg path')).not.toBeNull();
    });

    it('renames a placed service when the cloud changes', () => {
      const { fixture, element } = edit();
      provider(element, 'GCP').click();
      catalogEntry(element, 'NoSQL clave-valor').click();
      fixture.detectChanges();
      expect(services(element)).toContain('Firestore (Datastore)');
      expect(tags()).toContain('Terraform Apply: resource "google_firestore_database"');

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(services(element)).toContain('Cosmos DB');
      expect(services(element)).not.toContain('Firestore (Datastore)');
    });

    it('drops a dragged service where it is released', () => {
      const { fixture, element, component } = edit();
      const transfer = new DataTransfer();
      transfer.setData('application/x-cloud-service', 'vault');
      const bounds = diagram(element).getBoundingClientRect();

      diagram(element).dispatchEvent(new DragEvent('drop', {
        dataTransfer: transfer, clientX: bounds.left + bounds.width * 0.5, clientY: bounds.top + bounds.height * 0.5, cancelable: true,
      }));
      fixture.detectChanges();

      const vault = component.nodes().find((candidate) => candidate.id === 'vault-1')!;
      expect(vault.x).toBeCloseTo(555, -1);
      expect(vault.y).toBeCloseTo(358, -1);
    });

    it('removes a node with its connections, reporting the destroy and the security impact', () => {
      const { fixture, element } = edit();
      node(element, 'Application LB').dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();

      element.querySelector<SVGGElement>('g.remove')!.dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();

      expect(services(element)).not.toContain('Application LB');
      expect(element.querySelectorAll('path.wire').length).toBe(6);
      expect(tags().slice(0, 3)).toEqual(['Terraform Plan -1 to destroy', 'Destroying Node: Application LB', 'Route Table Updated']);
      expect(tags()).toContain('Warning: No Load Balancer');
    });

    it('moves a node with the arrow keys keeping its wires attached, and deletes it with the keyboard', () => {
      const { fixture, element, component } = edit();
      const before = component.wires().find((wire) => wire.to === 'postgres')!.path;
      const postgres = node(element, 'RDS PostgreSQL');

      postgres.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      postgres.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      fixture.detectChanges();

      const moved = component.nodes().find((candidate) => candidate.id === 'postgres')!;
      expect([moved.x, moved.y]).toEqual([722, 262]);
      expect(component.wires().find((wire) => wire.to === 'postgres')!.path).not.toBe(before);

      node(element, 'RDS PostgreSQL').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      expect(services(element)).not.toContain('RDS PostgreSQL');
    });

    it('changes nothing outside edit mode and restores the original on reset', () => {
      const { fixture, element } = create();
      node(element, 'ElastiCache').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      expect(services(element)).toContain('ElastiCache');

      button(element, 'Editar arquitectura').click();
      fixture.detectChanges();
      catalogEntry(element, 'Broker AMQP').click();
      node(element, 'ElastiCache').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      expect(element.querySelectorAll('g.node').length).toBe(12);

      button(element, 'Restablecer').click();
      fixture.detectChanges();
      expect(services(element)).toContain('ElastiCache');
      expect(services(element)).not.toContain('RabbitMQ');
      expect(element.querySelectorAll('path.wire').length).toBe(8);
      expect(button(element, 'Restablecer')).toBeUndefined();
    });
  });
  describe('FinOps', () => {
    const total = (element: HTMLElement) => element.querySelector('app-cost-badge button')!.textContent!.replace(/\s+/g, ' ').trim();

    it('shows the estimated monthly cost and recalculates it with the cloud and the topology', () => {
      const { fixture, element } = edit();
      expect(total(element)).toBe('FinOps≈ $138/mes');

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(total(element)).toBe('FinOps≈ $159/mes');

      catalogEntry(element, 'Streaming de eventos').click();
      fixture.detectChanges();
      expect(total(element)).toBe('FinOps≈ $181/mes');

      node(element, 'Container Apps').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      expect(total(element)).toBe('FinOps≈ $141/mes');
    });

    it('opens the breakdown by category on hover or click', () => {
      const { fixture, element } = create();
      const badge = element.querySelector<HTMLElement>('app-cost-badge')!;
      expect(badge.querySelector('#cost-breakdown')).toBeNull();

      badge.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      const breakdown = badge.querySelector('#cost-breakdown')!.textContent!.replace(/\s+/g, ' ');
      expect(breakdown).toContain('Cómputo$36');
      expect(breakdown).toContain('Datos$43');
      expect(breakdown).toContain('Borde, CDN y red$47');
      expect(breakdown).toContain('RDS PostgreSQL $30 · ElastiCache $13');
      expect(breakdown).toContain('Estimación orientativa');

      badge.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(badge.querySelector('#cost-breakdown')).toBeNull();

      badge.querySelector('button')!.click();
      fixture.detectChanges();
      expect(badge.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
      expect(badge.querySelector('#cost-breakdown')).not.toBeNull();
    });
  });

  describe('chaos', () => {
    function openChaos() {
      const created = create();
      button(created.element, 'Simular caos').click();
      created.fixture.detectChanges();
      return created;
    }
    const badges = (element: HTMLElement) => Array.from(element.querySelectorAll('g.chaos-badge text')).map((item) => item.textContent?.trim());
    const wireClass = (element: HTMLElement, state: string) => element.querySelectorAll(`path.wire-${state}`).length;

    it('plays the Gemini scenario through the circuit breaker states and back to normal', fakeAsync(() => {
      const { fixture, element } = openChaos();
      expect(element.querySelectorAll('#chaos-panel button').length).toBe(4);

      button(element, 'Pico de latencia RAG').click();
      fixture.detectChanges();
      expect(badges(element)).toEqual(['CB CLOSED', 'LATENCIA 8 s']);
      expect(wireClass(element, 'warn')).toBe(1);
      expect(TestBed.inject(TraceInspectorService).selected()).toBe('gemini');

      tick(2200);
      fixture.detectChanges();
      expect(badges(element)).toEqual(['CB OPEN', 'AISLADO']);
      expect(wireClass(element, 'down')).toBe(1);
      expect(element.querySelectorAll('path.pulse-off').length).toBe(1);
      expect(node(element, 'ECS Fargate').getAttribute('aria-label')).toContain('Estado: CB OPEN');
      expect(element.querySelector('#chaos-panel [aria-current="step"]')!.textContent!.trim()).toBe('Fallback');
      expect(element.querySelector('#chaos-panel [role="status"]')!.textContent).toContain('El circuito se abre');

      tick(2200);
      fixture.detectChanges();
      expect(badges(element)).toEqual(['CB HALF-OPEN', 'PRUEBA']);

      tick(2200);
      fixture.detectChanges();
      expect(badges(element)).toEqual(['CB CLOSED']);
      expect(wireClass(element, 'warn') + wireClass(element, 'down')).toBe(0);

      tick(2600);
      fixture.detectChanges();
      expect(badges(element)).toEqual([]);
      expect(element.querySelector('#chaos-panel [aria-current]')).toBeNull();

      expect(tags()).toEqual([
        'Gemini generateContent', 'CircuitBreaker aiEngine', 'CircuitBreaker OPEN', 'Fallback Active', 'Recovery Test', 'CircuitBreaker CLOSED',
      ]);
      // Todo es simulado y toda la secuencia cae en la traza de Gemini.
      const events = TestBed.inject(SystemEventsService).events();
      expect(events.every((event) => event.origin === 'simulated' && event.techs.includes('gemini'))).toBeTrue();
    }));

    it('names the affected services as the selected cloud calls them', fakeAsync(() => {
      const { fixture, element } = openChaos();
      provider(element, 'Azure').click();
      fixture.detectChanges();
      TestBed.inject(SystemEventsService).events().length = 0;

      button(element, 'Caída de caché Redis').click();
      fixture.detectChanges();
      expect(element.querySelector('#chaos-panel [role="status"]')!.textContent).toContain('Cache for Redis no responde');
      expect(TestBed.inject(SystemEventsService).events().at(-2)!.detail).toBe('Cache for Redis · sin respuesta en 2 s');

      tick(2200);
      fixture.detectChanges();
      expect(badges(element)).toEqual(['FAIL-OPEN', 'DOWN']);
      expect(element.querySelector('#chaos-panel [role="status"]')!.textContent).toContain('lee directamente de PostgreSQL Flexible');
      expect(TestBed.inject(TraceInspectorService).selected()).toBe('redis');

      button(element, 'Detener').click();
      fixture.detectChanges();
      expect(badges(element)).toEqual([]);
      const count = TestBed.inject(SystemEventsService).events().length;
      tick(10000);
      expect(TestBed.inject(SystemEventsService).events().length).toBe(count);
    }));

    it('covers the four failure scenarios, each ending recovered', fakeAsync(() => {
      const { fixture, element, component } = openChaos();
      for (const scenario of component.scenarios) {
        component.runChaos(scenario);
        tick(2200 * 3);
        fixture.detectChanges();
        expect(element.querySelector('g.chaos-badge')!.getAttribute('data-level')).withContext(scenario.id).toBe('ok');
        expect(scenario.phases.flatMap((phase) => phase.events.map((event) => event[1]))).withContext(scenario.id)
          .toEqual(jasmine.arrayContaining(['Fallback Active', 'Recovery Test']));
        tick(2600);
      }
      expect(component.chaos()).toBeNull();
      expect(component.scenarios.map((scenario) => scenario.name)).toEqual([
        'Caída de caché Redis', 'Pico de latencia RAG (Gemini)', 'Saturación de API Spring Boot', 'Failover de base de datos',
      ]);
    }));

    it('disables a scenario whose nodes are no longer on the canvas', () => {
      const { fixture, element } = edit();
      node(element, 'ElastiCache').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      button(element, 'Simular caos').click();
      fixture.detectChanges();

      expect(button(element, 'Caída de caché Redis').disabled).toBeTrue();
      expect(button(element, 'Pico de latencia RAG').disabled).toBeFalse();
    });
  });

  describe('AI audit', () => {
    it('opens a floating card with the recommendations and the answer of the RAG assistant', fakeAsync(() => {
      const { fixture, element } = create();
      expect(element.querySelector('app-audit-card')).toBeNull();

      button(element, 'Auditar topología con IA').click();
      fixture.detectChanges();
      const card = element.querySelector('app-audit-card')!;
      expect(card.querySelector('[role="dialog"]')).not.toBeNull();
      expect(Array.from(card.querySelectorAll('h5')).map((heading) => heading.textContent?.trim()).slice(0, 3))
        .toEqual(['Alta disponibilidad', 'Seguridad', 'Optimización de costes']);
      expect(card.textContent).toContain('Activa Multi-AZ en RDS PostgreSQL');
      expect(card.textContent).toContain('AWS · 7 recomendaciones · 4 ya cubiertas');
      expect(card.textContent).toContain('Consultando el código y la documentación indexados');
      expect(TestBed.inject(TraceInspectorService).selected()).toBe('gemini');

      tick(400);
      fixture.detectChanges();
      expect(card.textContent).not.toContain('Consultando');
      expect(card.querySelector('app-markdown')!.textContent!.length).toBeGreaterThan(40);
      expect(card.textContent).toContain('respuesta simulada');
      expect(tags()).toEqual(['Topology Audit', 'Audit Rules Complete', 'Gemini generateContent']);

      card.querySelector<HTMLButtonElement>('button[aria-label="Cerrar la auditoría"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('app-audit-card')).toBeNull();
    }));

    it('audits the canvas as the visitor left it, in the vocabulary of the selected cloud', fakeAsync(() => {
      const { fixture, element } = edit();
      provider(element, 'Azure').click();
      fixture.detectChanges();
      node(element, 'Application Gateway').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      fixture.detectChanges();
      button(element, 'Auditar topología con IA').click();
      fixture.detectChanges();
      tick(400);
      fixture.detectChanges();

      const card = element.querySelector('app-audit-card')!;
      expect(card.textContent).toContain('Sin balanceador no hay reparto entre zonas');
      expect(card.textContent).toContain('Activa redundancia de zona en PostgreSQL Flexible');
      expect(card.textContent).toContain('Esta topología sale más barata en');
    }));
  });
  describe('editor', () => {
    const project = () => JSON.parse(localStorage.getItem('architecture-studio-project') ?? 'null');
    const menuItem = (element: HTMLElement, text: string) =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('.project-menu:not([hidden]) button')).find((item) => item.textContent?.includes(text))!;
    function openMenu(fixture: { detectChanges(): void }, element: HTMLElement, name: string) {
      button(element, name).click();
      fixture.detectChanges();
    }
    /** Captura lo que el componente manda a descargar, sin que el navegador navegue. */
    function captureDownloads() {
      const downloads: { name: string; blob: Blob }[] = [];
      let last: Blob | null = null;
      const create = URL.createObjectURL.bind(URL);
      spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
        last = blob as Blob;
        return create(blob);
      });
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
        downloads.push({ name: this.download, blob: last! });
      });
      return downloads;
    }

    describe('instances and properties', () => {
      it('accepts several instances of the same service, numbering them', () => {
        const { fixture, element, component } = edit();
        catalogEntry(element, 'Gestión de APIs').click();
        catalogEntry(element, 'Gestión de APIs').click();
        catalogEntry(element, 'Contenedores serverless').click();
        fixture.detectChanges();

        expect(services(element).filter((name) => name?.includes('API Gateway'))).toEqual(['Amazon API Gateway', 'Amazon API Gateway #2']);
        // La API de la arquitectura base ya era un ECS Fargate: el añadido es el segundo.
        expect(services(element)).toContain('ECS Fargate #2');
        expect(new Set(component.nodes().map((candidate) => candidate.id)).size).toBe(component.nodes().length);
        expect(component.mainTf()).toContain('resource "aws_apigatewayv2_api" "api_gateway_2" {');
      });

      it('opens the properties panel on double click or Enter, only while editing', () => {
        const { fixture, element } = create();
        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        expect(element.querySelector('app-node-properties')).toBeNull();

        button(element, 'Editar arquitectura').click();
        fixture.detectChanges();
        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const panel = element.querySelector('app-node-properties')!;
        expect(panel.querySelector('h4')!.textContent).toBe('Propiedades · ElastiCache');
        expect(panel.querySelector('footer')!.textContent).toContain('aws_elasticache_replication_group');
        expect(panel.querySelector<HTMLSelectElement>('select')!.value).toBe('data');

        panel.querySelector<HTMLButtonElement>('button[aria-label="Cerrar las propiedades"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('app-node-properties')).toBeNull();

        node(element, 'RDS PostgreSQL').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();
        expect(element.querySelector('app-node-properties h4')!.textContent).toBe('Propiedades · RDS PostgreSQL');
      });

      it('edits name, capacity, ports and environment, reflecting them in the canvas and in Terraform', () => {
        const { fixture, element, component } = edit();
        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const panel = element.querySelector('app-node-properties')!;
        const type = (selector: string, value: string) => {
          const field = panel.querySelector<HTMLInputElement>(selector)!;
          field.value = value;
          field.dispatchEvent(new Event('input'));
          fixture.detectChanges();
        };

        type('input[type="text"]', 'Redis réplica 1');
        type('input[list]', 'cache.t3.micro');
        type('input[placeholder="8080, 443"]', '6379');
        type('textarea', 'MAXMEMORY_POLICY=allkeys-lru');

        expect(services(element)).toContain('Redis réplica 1');
        expect(services(element)).not.toContain('ElastiCache');
        expect(component.nodes().find((candidate) => candidate.id === 'redis')!.props)
          .toEqual({ instance: 'cache.t3.micro', ports: '6379', env: 'MAXMEMORY_POLICY=allkeys-lru' });
        expect(component.mainTf()).toContain('  # nombre: Redis réplica 1\n  # capacidad: var.redis_instance\n  # puertos: 6379');
        expect(panel.querySelector('[role="status"]')).toBeNull();

        // Borrar el nombre devuelve el del servicio.
        type('input[type="text"]', '');
        expect(services(element)).toContain('ElastiCache');
      });

      it('warns about credentials typed as environment variables, in the panel and in the security checks', () => {
        const { fixture, element, component } = edit();
        node(element, 'ECS Fargate').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const area = element.querySelector<HTMLTextAreaElement>('app-node-properties textarea')!;
        area.value = 'JWT_SECRET=abc123';
        area.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        expect(element.querySelector('app-node-properties [role="status"]')!.textContent).toContain('JWT_SECRET parece una credencial');
        expect(component.findings().map((finding) => finding.check)).toContain('Warning: Secret in Env');
      });

      it('moves a node to another subnet from the panel, into a free slot of that zone', () => {
        const { fixture, element, component } = edit();
        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const select = element.querySelector<HTMLSelectElement>('app-node-properties select')!;
        select.value = 'public';
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        const redis = component.nodes().find((candidate) => candidate.id === 'redis')!;
        // El primer hueco de la subred pública lo ocupa el balanceador.
        expect([redis.x, redis.y, redis.zone]).toEqual([402, 340, 'public']);
        expect(component.findings().map((finding) => finding.check)).toContain('Check: Public Access to DB Disabled');
      });
    });

    describe('zones', () => {
      const zone = (element: HTMLElement, id: string) => element.querySelector<SVGRectElement>(`rect.zone[data-zone-id="${id}"]`)!;
      const grip = (element: HTMLElement, label: string) =>
        Array.from(element.querySelectorAll<SVGRectElement>('rect.zone-grip')).find((candidate) => candidate.getAttribute('aria-label')!.includes(label))!;
      const box = (rect: SVGRectElement) => ['x', 'y', 'width', 'height'].map((attribute) => Number(rect.getAttribute(attribute)));

      it('shows the edit handles only while editing', () => {
        const { fixture, element } = create();
        expect(element.querySelectorAll('rect.zone-grip').length).toBe(0);
        button(element, 'Editar arquitectura').click();
        fixture.detectChanges();
        expect(element.querySelectorAll('rect.zone-grip').length).toBe(5);
        // Una asa por esquina de cada zona.
        expect(element.querySelectorAll('rect.zone-corner').length).toBe(20);
      });

      it('adds a zone of the chosen kind, which can be renamed and removed', () => {
        const { fixture, element, component } = edit();
        openMenu(fixture, element, 'Añadir zona');
        menuItem(element, 'Región adicional').click();
        fixture.detectChanges();

        expect(element.querySelectorAll('rect.zone').length).toBe(6);
        expect(diagram(element).textContent).toContain('Región adicional');
        const label = element.querySelector<HTMLInputElement>('#zone-label')!;
        label.value = 'Región de respaldo';
        label.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(diagram(element).textContent).toContain('Región de respaldo');
        expect(component.zones().at(-1)).toEqual({ id: 'zone-1', kind: 'region', role: null, x: 24, y: 392, w: 240, h: 170, label: 'Región de respaldo' });

        button(element, 'Quitar zona').click();
        fixture.detectChanges();
        expect(element.querySelectorAll('rect.zone').length).toBe(5);
        expect(element.querySelector('#zone-label')).toBeNull();
      });

      it('moves a zone with everything inside it and resizes it from the keyboard', () => {
        const { fixture, element, component } = edit();
        const before = component.nodes().find((candidate) => candidate.id === 'postgres')!;
        const press = (label: string, init: KeyboardEventInit) => {
          grip(element, label).dispatchEvent(new KeyboardEvent('keydown', init));
          fixture.detectChanges();
        };

        // Mover la red privada arrastra sus subredes y sus nodos; lo de fuera no se mueve.
        press('VPC', { key: 'ArrowDown' });
        expect(box(zone(element, 'network'))).toEqual([320, 162, 472, 450]);
        expect(box(zone(element, 'subnet-data'))).toEqual([640, 194, 140, 406]);
        const after = component.nodes().find((candidate) => candidate.id === 'postgres')!;
        expect([after.x, after.y]).toEqual([before.x, before.y + 12]);
        expect(component.nodes().find((candidate) => candidate.id === 'secrets')!.y).toBe(215);

        press('Subred pública', { key: 'ArrowRight', shiftKey: true });
        press('Subred pública', { key: 'ArrowUp', shiftKey: true });
        expect(box(zone(element, 'subnet-public'))).toEqual([332, 194, 152, 394]);
      });

      it('gives a node the network zone of the box it ends up in, and the checks notice', () => {
        const { fixture, element, component } = edit();
        const postgres = () => component.nodes().find((candidate) => candidate.id === 'postgres')!;
        expect(postgres().zone).toBe('data');

        // Tres columnas a la izquierda: de la subred de datos a la pública.
        for (let step = 0; step < 26; step++) {
          node(element, 'RDS PostgreSQL').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        }
        fixture.detectChanges();
        expect(postgres().x).toBe(398);
        expect(postgres().zone).toBe('public');

        // Quitar la subred pública deja lo que contenía en la red, que es privada.
        grip(element, 'Subred pública').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
        fixture.detectChanges();
        expect(element.querySelectorAll('rect.zone').length).toBe(4);
        expect(postgres().zone).toBe('compute');
        expect(component.nodes().find((candidate) => candidate.id === 'lb')!.zone).toBe('compute');
        expect(component.findings().map((finding) => finding.check)).toContain('Warning: VPC Isolation');
      });

      it('drags a zone by its grip and resizes it from its corner without leaving the canvas', () => {
        const { fixture, element, component } = edit();
        openMenu(fixture, element, 'Añadir zona');
        menuItem(element, 'Subred privada').click();
        fixture.detectChanges();
        const pointer = (target: Element, type: string, x: number, y: number) => {
          target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
          fixture.detectChanges();
        };
        const bounds = diagram(element).getBoundingClientRect();
        const scale = bounds.width / 1110;
        const added = () => component.zones().at(-1)!;

        const handle = grip(element, 'Subred privada · aplicación. Arrastra');
        const grips = Array.from(element.querySelectorAll<SVGRectElement>('rect.zone-grip'));
        const own = grips.find((candidate) => candidate.getAttribute('x') === '24') ?? handle;
        pointer(own, 'pointerdown', bounds.left + 40 * scale, bounds.top + 400 * scale);
        pointer(own, 'pointermove', bounds.left + 140 * scale, bounds.top + 430 * scale);
        pointer(own, 'pointerup', 0, 0);
        expect(added().x).toBeCloseTo(124, -1);
        expect(added().y).toBeCloseTo(422, -1);

        const corner = Array.from(element.querySelectorAll<SVGRectElement>('rect.zone-corner')).at(-1)!;
        pointer(corner, 'pointerdown', bounds.left + 360 * scale, bounds.top + 590 * scale);
        pointer(corner, 'pointermove', bounds.left + 20 * scale, bounds.top + 9000 * scale);
        pointer(corner, 'pointerup', 0, 0);
        // Ni más pequeña que el mínimo ni más allá del borde inferior del lienzo.
        expect(added().w).toBe(90);
        expect(added().y + added().h).toBe(716);
      });

      const openView = (fixture: { detectChanges(): void }, element: HTMLElement) => {
        element.querySelector<HTMLButtonElement>('[aria-controls="menu-view"]')!.click();
        fixture.detectChanges();
      };

      it('does not offer to fit the diagram to the screen while studio.smart-rules is off', () => {
        const { fixture, element } = create();
        openView(fixture, element);

        expect(element.querySelector('#menu-view')!.textContent).toContain('Auto-ordenar');
        expect(element.querySelector('#menu-view')!.textContent).not.toContain('Ajustar a pantalla');
      });

      describe('with studio.smart-rules on (responsive canvas)', () => {
        beforeEach(async () => {
          await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'studio.smart-rules': true })));
        });

        afterEach(async () => {
          await OpenFeature.clearProviders();
        });

        it('stops a subnet at the size of its nodes and keeps them inside, apart', () => {
          const { fixture, element, component } = edit();
          const subnet = () => component.zones().find((candidate) => candidate.id === 'subnet-data')!;
          const inside = () => directNodes(subnet(), component.nodes(), component.zones());
          const count = inside().length;
          expect(count).toBe(2);

          // Mayús+flecha arriba encoge el recuadro desde su esquina inferior derecha.
          for (let step = 0; step < 60; step++) {
            grip(element, 'Subred privada · datos').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true }));
            fixture.detectChanges();
          }

          expect(inside().length).toBe(count);
          expect(fits(count, subnet().w, subnet().h)).toBeTrue();
          expect(settled(inside(), subnet())).toBeTrue();
          // Sin la flag habría bajado hasta los 90 del mínimo, con los nodos fuera.
          expect(subnet().h).toBeGreaterThan(90);
        });

        it('reflows the nodes into more columns when the subnet gets wider and shorter', () => {
          const { fixture, element, component } = edit();
          const subnet = () => component.zones().find((candidate) => candidate.id === 'subnet-data')!;
          const inside = () => directNodes(subnet(), component.nodes(), component.zones());
          // Sin la columna de servicios gestionados, que quedaría debajo del recuadro al ensancharlo.
          component.nodes.update((nodes) => nodes.filter((candidate) => candidate.zone !== 'managed'));
          fixture.detectChanges();
          const before = inside().map((candidate) => [candidate.id, candidate.x, candidate.y]);
          expect(before.length).toBe(2);
          const press = (init: KeyboardEventInit, times: number) => {
            for (let step = 0; step < times; step++) {
              grip(element, 'Subred privada · datos').dispatchEvent(new KeyboardEvent('keydown', init));
              // La plantilla le pasa el recuadro al manejador: hay que repintar entre pulsaciones.
              fixture.detectChanges();
            }
          };

          press({ key: 'ArrowRight', shiftKey: true }, 12);
          // Más ancha y con sitio: nadie se mueve.
          expect(inside().map((candidate) => [candidate.id, candidate.x, candidate.y])).toEqual(before);

          press({ key: 'ArrowUp', shiftKey: true }, 60);
          expect(new Set(inside().map((candidate) => candidate.x)).size).toBeGreaterThan(1);
          expect(settled(inside(), subnet())).toBeTrue();
          // Los nodos no cambian de zona de red por reacomodarse.
          expect(inside().every((candidate) => candidate.zone === 'data')).toBeTrue();
        });

        it('fits the diagram to the screen and back from the View menu', () => {
          const { fixture, element } = create();
          const canvas = diagram(element);
          expect(canvas.getAttribute('viewBox')).toBe('0 0 1110 716');

          openView(fixture, element);
          menuItem(element, 'Ajustar a pantalla').click();
          fixture.detectChanges();
          const [x, y, width, height] = canvas.getAttribute('viewBox')!.split(' ').map(Number);
          expect(canvas.classList).toContain('canvas-fitted');
          expect([x >= 0, y >= 0, x + width <= 1110, y + height <= 716]).toEqual([true, true, true, true]);
          expect(height).toBeLessThan(716);

          openView(fixture, element);
          menuItem(element, 'Ver el lienzo completo').click();
          fixture.detectChanges();
          expect(canvas.getAttribute('viewBox')).toBe('0 0 1110 716');
          expect(canvas.classList).not.toContain('canvas-fitted');
        });
      });
    });

    describe('presets', () => {
      it('loads each scenario with its cloud, nodes and zones', () => {
        const { fixture, element, component } = create();
        openMenu(fixture, element, 'Plantillas');
        expect(element.querySelectorAll('#menu-presets button').length).toBe(10);
        expect(element.querySelector('#menu-presets')!.textContent).toContain('no describen la infraestructura real de ninguna entidad');

        menuItem(element, 'Core bancario AS400').click();
        fixture.detectChanges();
        expect(element.querySelector('#menu-presets')).toBeNull();
        expect(services(element)).toEqual(jasmine.arrayContaining(['IBM MQ', 'IBM AS400', 'Spring Batch', 'ECS Fargate', 'Lambda', 'SQS']));
        expect(diagram(element).textContent).toContain('Centro de datos propio');
        expect(tags()).toContain('Check: VPC Isolation OK');

        openMenu(fixture, element, 'Plantillas');
        menuItem(element, 'Modernización bancaria').click();
        fixture.detectChanges();
        expect(provider(element, 'Azure').getAttribute('aria-checked')).toBe('true');
        expect(services(element)).toEqual(jasmine.arrayContaining(['API Management', 'AKS', 'Entra External ID', 'Cache for Redis']));

        openMenu(fixture, element, 'Plantillas');
        menuItem(element, 'Plataforma electoral').click();
        fixture.detectChanges();
        expect(provider(element, 'AWS').getAttribute('aria-checked')).toBe('true');
        expect(services(element)).toEqual(jasmine.arrayContaining(['Cloudflare', 'WAF', 'ECS Fargate', 'ECS Fargate #2', 'RDS · réplica Multi-AZ']));
        expect(component.wires().filter((wire) => wire.from === 'lb').map((wire) => wire.to)).toEqual(['api', 'api-2']);
      });

      it('loads a pattern preset and translates it with the cloud switch', () => {
        const { fixture, element, component } = create();
        openMenu(fixture, element, 'Plantillas');
        menuItem(element, 'Pasarela de Pagos Zero-Trust').click();
        fixture.detectChanges();

        expect(services(element)).toEqual(jasmine.arrayContaining(['WAF', 'Amazon API Gateway', 'MSK (Kafka)', 'HashiCorp Vault', 'ElastiCache']));
        expect(component.findings().every((finding) => finding.level === 'ok')).toBeTrue();

        provider(element, 'GCP').click();
        fixture.detectChanges();
        expect(services(element)).toEqual(jasmine.arrayContaining(['Cloud Armor', 'Apigee', 'Managed Kafka', 'HashiCorp Vault', 'Memorystore']));
        expect(component.mainTf()).toContain('resource "google_managed_kafka_cluster" "events" {');

        provider(element, 'Azure').click();
        fixture.detectChanges();
        expect(services(element)).toEqual(jasmine.arrayContaining(['Web Application Firewall', 'API Management', 'Event Hubs', 'Cache for Redis']));
        expect(services(element)).not.toContain('Apigee');
      });

      it('starts from a blank canvas and keeps the other tools working on it', () => {
        const { fixture, element, component } = create();
        openMenu(fixture, element, 'Plantillas');
        menuItem(element, 'Lienzo en blanco').click();
        fixture.detectChanges();

        expect(element.querySelectorAll('g.node').length).toBe(0);
        expect(element.querySelectorAll('rect.zone').length).toBe(0);
        expect(element.querySelector('app-cost-badge button')!.textContent).toContain('$0');
        expect(component.mainTf()).toContain('resource "aws_vpc" "main" {');
        expect(component.recommendations().length).toBeGreaterThan(0);

        button(element, 'Editar arquitectura').click();
        fixture.detectChanges();
        catalogEntry(element, 'Kubernetes gestionado').click();
        fixture.detectChanges();
        expect(services(element)).toEqual(['EKS']);
      });
    });

    describe('history', () => {
      it('undoes and redoes topology changes with the buttons', () => {
        const { fixture, element } = edit();
        const undo = element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!;
        const redo = element.querySelector<HTMLButtonElement>('button[aria-label="Rehacer"]')!;
        expect(undo.disabled).toBeTrue();
        expect(redo.disabled).toBeTrue();

        catalogEntry(element, 'Broker AMQP').click();
        node(element, 'ElastiCache').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
        fixture.detectChanges();
        expect(services(element)).toContain('RabbitMQ');
        expect(services(element)).not.toContain('ElastiCache');
        expect(element.querySelectorAll('path.wire').length).toBe(8);

        undo.click();
        fixture.detectChanges();
        expect(services(element)).toContain('ElastiCache');
        expect(element.querySelectorAll('path.wire').length).toBe(9);
        undo.click();
        fixture.detectChanges();
        expect(services(element)).not.toContain('RabbitMQ');
        expect(undo.disabled).toBeTrue();

        redo.click();
        redo.click();
        fixture.detectChanges();
        expect(services(element)).toContain('RabbitMQ');
        expect(services(element)).not.toContain('ElastiCache');
        expect(redo.disabled).toBeTrue();
      });

      it('answers Ctrl+Z, Ctrl+Y and Cmd+Shift+Z, but leaves text fields alone', () => {
        const { fixture, element, component } = edit();
        const press = (target: Element, init: KeyboardEventInit) => {
          const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
          target.dispatchEvent(event);
          fixture.detectChanges();
          return event.defaultPrevented;
        };
        catalogEntry(element, 'Broker AMQP').click();
        fixture.detectChanges();

        expect(press(diagram(element), { key: 'z', ctrlKey: true })).toBeTrue();
        expect(services(element)).not.toContain('RabbitMQ');
        press(diagram(element), { key: 'y', ctrlKey: true });
        expect(services(element)).toContain('RabbitMQ');
        press(diagram(element), { key: 'z', metaKey: true });
        press(diagram(element), { key: 'Z', metaKey: true, shiftKey: true });
        expect(services(element)).toContain('RabbitMQ');

        // En el buscador del catálogo, Ctrl+Z es del propio campo.
        expect(press(element.querySelector('#catalog-search')!, { key: 'z', ctrlKey: true })).toBeFalse();
        expect(services(element)).toContain('RabbitMQ');
        expect(component.canUndo()).toBeTrue();
      });

      it('undoes a move, a preset, the properties of a node as one step, and a reset', () => {
        const { fixture, element, component } = edit();
        const undo = () => {
          fixture.detectChanges();
          element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!.click();
          fixture.detectChanges();
        };

        node(element, 'RDS PostgreSQL').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        undo();
        expect(component.nodes().find((candidate) => candidate.id === 'postgres')!.y).toBe(250);

        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        for (const name of ['R', 'Re', 'Red']) {
          const field = element.querySelector<HTMLInputElement>('app-node-properties input')!;
          field.value = name;
          field.dispatchEvent(new Event('input'));
        }
        fixture.detectChanges();
        expect(services(element)).toContain('Red');
        undo();
        expect(services(element)).toContain('ElastiCache');

        openMenu(fixture, element, 'Plantillas');
        menuItem(element, 'Lienzo en blanco').click();
        fixture.detectChanges();
        undo();
        expect(element.querySelectorAll('g.node').length).toBe(12);
      });
    });

    describe('persistence', () => {
      it('saves the edited project in the browser and restores it on the next visit', () => {
        const first = edit();
        expect(project()).toBeNull();
        provider(first.element, 'GCP').click();
        catalogEntry(first.element, 'Broker AMQP').click();
        first.fixture.detectChanges();
        TestBed.flushEffects();

        expect(project().format).toBe('architecture-studio');
        expect(project().provider).toBe('gcp');
        expect(first.element.textContent).toContain('Guardado en este navegador');
        first.fixture.destroy();

        const second = create();
        expect(provider(second.element, 'GCP').getAttribute('aria-checked')).toBe('true');
        expect(services(second.element)).toContain('RabbitMQ');
        expect(second.element.querySelectorAll('g.node').length).toBe(13);
        // Un id nuevo no pisa los que venían guardados.
        button(second.element, 'Editar arquitectura').click();
        second.fixture.detectChanges();
        catalogEntry(second.element, 'Broker AMQP').click();
        second.fixture.detectChanges();
        expect(new Set(second.component.nodes().map((candidate) => candidate.id)).size).toBe(14);
      });

      describe('a project saved before the smart rules existed', () => {
        // Una base de datos en la subred pública y conectada directamente con los visitantes: hoy
        // el lienzo no dejaría trazar esa conexión, pero el proyecto guardado tiene que abrir igual.
        function storeOldProject() {
          const old = referenceProject();
          old.nodes = old.nodes.map((candidate) => (candidate.id === 'postgres' ? { ...candidate, zone: 'public' as const } : candidate));
          old.links = [...old.links, { from: 'users', to: 'postgres' }];
          localStorage.setItem('architecture-studio-project', serializeProject(old));
          return old;
        }

        it('opens as it was, without warnings, while studio.smart-rules is off', () => {
          const old = storeOldProject();
          const { element, component } = create();

          expect(component.nodes().length).toBe(old.nodes.length);
          expect(component.wires().map((wire) => `${wire.from}>${wire.to}`)).toContain('users>postgres');
          expect(element.querySelector('[data-testid="graph-warnings"]')).toBeNull();
        });

        it('opens as it was with studio.smart-rules on: the rules only warn', async () => {
          await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'studio.smart-rules': true })));
          try {
            const old = storeOldProject();
            const { element, component } = create();

            expect(component.nodes().length).toBe(old.nodes.length);
            expect(component.wires().map((wire) => `${wire.from}>${wire.to}`)).toContain('users>postgres');
            const warnings = Array.from(element.querySelectorAll('[data-testid="graph-warnings"] li')).map((item) => item.textContent);
            expect(warnings.length).toBe(2);
            expect(warnings.join(' ')).toContain('Pon una API en medio');
          } finally {
            await OpenFeature.clearProviders();
          }
        });
      });

      it('forgets the saved project on reset and ignores a corrupted one', () => {
        const { fixture, element } = edit();
        catalogEntry(element, 'Broker AMQP').click();
        fixture.detectChanges();
        TestBed.flushEffects();
        expect(project()).not.toBeNull();

        button(element, 'Restablecer').click();
        fixture.detectChanges();
        TestBed.flushEffects();
        expect(project()).toBeNull();
        fixture.destroy();

        localStorage.setItem('architecture-studio-project', '{"format":"architecture-studio","version":1,"nodes":"no"}');
        const restored = create();
        expect(restored.element.querySelectorAll('g.node').length).toBe(12);
      });

      it('exports the project as .architecture.json and imports it back', async () => {
        const downloads = captureDownloads();
        const first = edit();
        catalogEntry(first.element, 'Streaming de eventos').click();
        first.fixture.detectChanges();
        openMenu(first.fixture, first.element, 'Exportar diagrama');
        menuItem(first.element, 'Proyecto (.architecture.json)').click();

        expect(downloads[0].name).toBe('arquitectura.architecture.json');
        const exported = await downloads[0].blob.text();
        expect(JSON.parse(exported).nodes.length).toBe(13);
        first.fixture.destroy();
        localStorage.removeItem('architecture-studio-project');

        const second = create();
        const input = second.element.querySelector<HTMLInputElement>('input[type="file"]')!;
        const transfer = new DataTransfer();
        transfer.items.add(new File([exported], 'arquitectura.architecture.json', { type: 'application/json' }));
        input.files = transfer.files;
        await second.component.importProject({ target: input } as unknown as Event);
        second.fixture.detectChanges();

        expect(services(second.element)).toContain('MSK (Kafka)');
        expect(second.element.querySelectorAll('g.node').length).toBe(13);
        expect(second.component.canUndo()).toBeTrue();
      });

      it('explains why a file cannot be imported and leaves the canvas as it was', async () => {
        const { fixture, element, component } = create();
        const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
        const transfer = new DataTransfer();
        transfer.items.add(new File(['{"format":"otra-cosa"}'], 'x.json'));
        input.files = transfer.files;
        await component.importProject({ target: input } as unknown as Event);
        fixture.detectChanges();

        expect(element.querySelector('[role="alert"]')!.textContent).toContain('no es un proyecto del Estudio de arquitectura');
        expect(element.querySelectorAll('g.node').length).toBe(12);
        expect(component.canUndo()).toBeFalse();
      });
    });

    describe('export', () => {
      it('downloads main.tf and variables.tf in a ZIP', async () => {
        const downloads = captureDownloads();
        const { component } = create();
        // Lo compila el backend (en los tests, su doble del modo demo).
        await component.exportTerraform();

        expect(downloads[0].name).toBe('terraform-aws.zip');
        const text = await downloads[0].blob.text();
        expect(text.startsWith('PK')).toBeTrue();
        expect(text).toContain('main.tf');
        expect(text).toContain('resource "aws_ecs_service" "api" {');
        expect(text).toContain('variables.tf');
        expect(text).toContain('variable "region" {');
        expect(text).toContain('No se puede aplicar tal cual.');
      });

      it('exports a standalone SVG: styles written inline and nothing that belongs to the interface', async () => {
        const downloads = captureDownloads();
        const { component, fixture, element } = edit();
        fixture.detectChanges();

        await component.exportImage('svg', '#0a0a0b');

        expect(downloads[0].name).toBe('arquitectura-aws.svg');
        const svg = await downloads[0].blob.text();
        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        expect(parsed.querySelector('parsererror')).toBeNull();
        expect(parsed.documentElement.getAttribute('width')).toBe('1110');
        expect(parsed.querySelector('rect')!.getAttribute('fill')).toBe('#0a0a0b');
        expect(svg).toContain('RDS PostgreSQL');
        expect(svg).toContain('AWS Cloud · región');
        // Los estilos de la hoja van escritos en cada elemento.
        expect(parsed.querySelector('text')!.getAttribute('style')).toContain('font-size');
        // Ni asas de edición, ni pulsos, ni clases o atributos de accesibilidad de la página.
        expect(parsed.querySelectorAll('[class], [tabindex], [role]').length).toBe(0);
        expect(parsed.querySelectorAll('path').length).toBe(element.querySelectorAll('path.wire').length + element.querySelectorAll('svg.node-icon path').length);
      });

      it('renders a high-resolution PNG, with a dark or a transparent background', async () => {
        const downloads = captureDownloads();
        const { component } = create();

        await component.exportImage('png', null);
        await component.exportImage('png', '#0a0a0b');

        expect(downloads.map((download) => download.name)).toEqual(['arquitectura-aws.png', 'arquitectura-aws.png']);
        for (const { blob } of downloads) {
          expect(blob.type).toBe('image/png');
          const bitmap = await createImageBitmap(blob);
          expect([bitmap.width, bitmap.height]).toEqual([3330, 2148]);
        }
        expect(component.exporting()).toBeFalse();
        expect(component.projectError()).toBeNull();
      });
    });
  });
  describe('backend as the source of projects', () => {
    const menuItem = (element: HTMLElement, text: string) =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('.project-menu:not([hidden]) button')).find((item) => item.textContent?.includes(text))!;
    function openMenu(fixture: { detectChanges(): void }, element: HTMLElement, name: string) {
      button(element, name).click();
      fixture.detectChanges();
    }
    const signIn = () => sessionStorage.setItem('portfolio.session', JSON.stringify({ accessToken: 'demo.mock.token', expiresAt: Date.now() + 600_000 }));

    afterEach(() => sessionStorage.clear());

    it('offers its own presets at once and replaces the scenarios with the ones served by the backend', fakeAsync(() => {
      const { fixture, element } = create();
      openMenu(fixture, element, 'Plantillas');
      expect(element.querySelector('#menu-presets')!.textContent).toContain('Plantillas incluidas en el estudio.');
      expect(element.querySelectorAll('#menu-presets button').length).toBe(10);

      tick(400);
      fixture.detectChanges();
      expect(element.querySelector('#menu-presets')!.textContent).toContain('Plantillas y proyectos servidos por el backend.');
      expect(Array.from(element.querySelectorAll('#menu-presets button')).map((item) => item.querySelector('span')!.textContent!.trim())).toEqual([
        'Arquitectura de referencia',
        'Modernización bancaria (AKS + OAuth2 + Redis)',
        'Core bancario AS400 (IBM MQ + Spring Batch + AWS Lambda + SQS)',
        'Plataforma electoral anti-DDoS',
        'Arquitectura Event-Driven de Alto Rendimiento (Kafka + Spring Cloud Stream + DynamoDB)',
        'E-Commerce Global Multi-Region (CQRS + Event Sourcing + Aurora Multi-AZ)',
        'Plataforma SaaS B2B Multi-Inquilino (API Gateway + Micro-Frontends + Isolated Tenant Schemas)',
        'Pasarela de Pagos Zero-Trust FinTech (Vault + Kafka + Idempotency Engine)',
        'Sistema RAG Enterprise & Vector Search (Spring Boot + pgvector + Redis + LLM API)',
        'Lienzo en blanco',
      ]);
    }));

    it('fetches the graph of a backend preset when it is chosen', fakeAsync(() => {
      const { fixture, element } = create();
      tick(400);
      openMenu(fixture, element, 'Plantillas');
      menuItem(element, 'Modernización bancaria').click();
      fixture.detectChanges();
      // Todavía no ha llegado: el lienzo sigue como estaba.
      expect(element.querySelectorAll('g.node').length).toBe(12);

      tick(400);
      fixture.detectChanges();
      expect(provider(element, 'Azure').getAttribute('aria-checked')).toBe('true');
      expect(services(element)).toEqual(jasmine.arrayContaining(['API Management', 'AKS', 'Entra External ID']));
      expect(tags()).toContain('Terraform');
      flush();
    }));

    it('keeps working with its own presets when the backend does not answer', fakeAsync(() => {
      const api = TestBed.inject(ArchitectureStudioApi);
      spyOn(api, 'publicArchitectureProjectsGet').and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const { fixture, element } = create();
      tick(400);
      openMenu(fixture, element, 'Plantillas');

      expect(element.querySelector('#menu-presets')!.textContent).toContain('Plantillas incluidas en el estudio.');
      menuItem(element, 'Core bancario AS400').click();
      fixture.detectChanges();
      expect(services(element)).toContain('IBM AS400');
      flush();
    }));

    it('reports a backend project that cannot be opened and leaves the canvas untouched', fakeAsync(() => {
      const { fixture, element, component } = create();
      tick(400);
      const api = TestBed.inject(ArchitectureStudioApi);
      spyOn(api, 'publicArchitectureProjectsIdGet').and.returnValue(of({
        id: 'electoral', title: 'x', cloudProvider: 'aws', isPreset: true, createdAt: '', nodes: [{ id: '<script>' }], connections: [], zones: [],
      }) as never);
      openMenu(fixture, element, 'Plantillas');
      menuItem(element, 'Plataforma electoral').click();
      fixture.detectChanges();

      expect(element.querySelector('[role="alert"]')!.textContent).toContain('No se pudo abrir');
      expect(element.querySelector('[role="alert"]')!.textContent).toContain('nodo no válido');
      expect(element.querySelectorAll('g.node').length).toBe(12);
      expect(component.canUndo()).toBeFalse();
    }));

    it('explains that saving to the server needs the administrator, without calling the API', fakeAsync(() => {
      const api = TestBed.inject(ArchitectureStudioApi);
      const post = spyOn(api, 'adminArchitectureProjectsPost').and.callThrough();
      const { fixture, element } = create();
      tick(400);
      openMenu(fixture, element, 'Guardar en la nube');

      expect(element.querySelector('#menu-cloud')!.textContent).toContain('Guardar en el servidor es cosa del administrador');
      expect(element.querySelector('#menu-cloud a')!.getAttribute('href')).toBe('login');
      expect(element.querySelector('#cloud-title')).toBeNull();
      expect(post).not.toHaveBeenCalled();
    }));

    it('saves the canvas as a new project, lists it for everyone and then updates it', fakeAsync(() => {
      signIn();
      const api = TestBed.inject(ArchitectureStudioApi);
      const post = spyOn(api, 'adminArchitectureProjectsPost').and.callThrough();
      const put = spyOn(api, 'adminArchitectureProjectsIdPut').and.callThrough();
      const { fixture, element } = edit();
      tick(400);
      catalogEntry(element, 'Streaming de eventos').click();
      fixture.detectChanges();

      openMenu(fixture, element, 'Guardar en la nube');
      const title = element.querySelector<HTMLInputElement>('#cloud-title')!;
      expect(menuItem(element, 'Guardar').disabled).toBeTrue();
      title.value = 'Plataforma con Kafka';
      title.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      menuItem(element, 'Guardar').click();
      tick(800);
      fixture.detectChanges();

      const sent = post.calls.mostRecent().args[0];
      expect(sent.title).toBe('Plataforma con Kafka');
      expect(sent.cloudProvider).toBe('aws');
      expect(sent.nodes.length).toBe(13);
      expect(sent.connections.length).toBe(9);
      expect(sent.zones.length).toBe(5);
      expect(element.textContent).toContain('«Plataforma con Kafka» guardado en el servidor.');

      // Ya figura entre los proyectos que sirve el backend, marcado como guardado.
      openMenu(fixture, element, 'Plantillas');
      expect(menuItem(element, 'Plataforma con Kafka').textContent).toContain('guardado');

      // Con un proyecto del servidor abierto, se puede actualizar o guardar aparte.
      openMenu(fixture, element, 'Guardar en la nube');
      menuItem(element, 'Actualizar «Plataforma con Kafka»').click();
      tick(800);
      expect(put.calls.mostRecent().args[0]).toBe('demo-1');
      expect(post).toHaveBeenCalledTimes(1);
      // El logo del nodo añadido vuelve solo a su sitio pasados unos segundos.
      tick(6000);
    }));

    it('reopens a saved project from the backend, ready to be updated', fakeAsync(() => {
      signIn();
      const first = edit();
      tick(400);
      catalogEntry(first.element, 'Broker AMQP').click();
      first.fixture.detectChanges();
      first.component.cloudTitle.set('Con RabbitMQ');
      first.component.saveToCloud(true);
      tick(800);
      first.fixture.destroy();
      localStorage.removeItem('architecture-studio-project');

      const second = create();
      tick(400);
      openMenu(second.fixture, second.element, 'Plantillas');
      menuItem(second.element, 'Con RabbitMQ').click();
      tick(400);
      second.fixture.detectChanges();

      expect(services(second.element)).toContain('RabbitMQ');
      expect(second.component.cloudProject()).toEqual({ id: 'demo-1', title: 'Con RabbitMQ' });
      expect(second.component.cloudTitle()).toBe('Con RabbitMQ');
      flush();
    }));

    it('refuses to overwrite a preset and falls back to its own Terraform if the backend fails', async () => {
      const api = TestBed.inject(ArchitectureStudioApi);
      spyOn(api, 'publicArchitectureGenerateTerraformPost').and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
      const downloads: Blob[] = [];
      spyOn(URL, 'createObjectURL').and.callFake((blob: Blob | MediaSource) => {
        downloads.push(blob as Blob);
        return 'blob:test';
      });
      spyOn(HTMLAnchorElement.prototype, 'click');
      const { component } = create();

      await component.exportTerraform();

      expect(await downloads[0].text()).toContain('resource "aws_ecs_service" "api" {');
    });
  });
  describe('smart canvas', () => {
    function pointerOn(fixture: { detectChanges(): void }, element: HTMLElement) {
      const bounds = () => diagram(element).getBoundingClientRect();
      // De coordenadas del lienzo a coordenadas de ventana.
      const client = (x: number, y: number) => ({ clientX: bounds().left + (x * bounds().width) / 1110, clientY: bounds().top + (y * bounds().height) / 716 });
      return (target: Element, type: string, x: number, y: number) => {
        target.dispatchEvent(new PointerEvent(type, { ...client(x, y), bubbles: true }));
        fixture.detectChanges();
      };
    }
    const wireKeys = (component: CloudInfraComponent) => component.wires().map((wire) => `${wire.from}>${wire.to}`);
    const handle = (element: HTMLElement) => element.querySelector<SVGGElement>('g.connect')!;
    function select(fixture: { detectChanges(): void }, element: HTMLElement, service: string) {
      node(element, service).dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
    }

    describe('dragging', () => {
      it('moves any node with the pointer, redrawing its wires as it goes and highlighting the zone that will adopt it', () => {
        const { fixture, element, component } = edit();
        const pointer = pointerOn(fixture, element);
        const postgres = () => component.nodes().find((candidate) => candidate.id === 'postgres')!;
        const wire = () => component.wires().find((candidate) => candidate.to === 'postgres')!.path;
        const start = wire();
        const target = node(element, 'RDS PostgreSQL');

        pointer(target, 'pointerdown', 710, 250);
        pointer(target, 'pointermove', 600, 300);
        // A medio camino el cable ya ha cambiado y la subred de aplicación está resaltada.
        const midway = wire();
        expect(midway).not.toBe(start);
        expect(element.querySelector('rect.zone-target')!.getAttribute('data-zone-id')).toBe('subnet-app');

        pointer(target, 'pointermove', 402, 430);
        expect(wire()).not.toBe(midway);
        expect(element.querySelector('rect.zone-target')!.getAttribute('data-zone-id')).toBe('subnet-public');
        pointer(target, 'pointerup', 402, 430);

        expect(postgres().x).toBeCloseTo(402, -1);
        expect(postgres().y).toBeCloseTo(430, -1);
        expect(postgres().zone).toBe('public');
        expect(element.querySelector('rect.zone-target')).toBeNull();
        // Todo el arrastre es un solo paso de historial.
        button(element, 'Deshacer');
        element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!.click();
        fixture.detectChanges();
        expect([postgres().x, postgres().y, postgres().zone]).toEqual([710, 250, 'data']);
      });

      it('drags the nodes that start outside the network too, and keeps them inside the canvas', () => {
        const { fixture, element, component } = edit();
        const pointer = pointerOn(fixture, element);
        const users = node(element, 'Visitantes');

        pointer(users, 'pointerdown', 64, 250);
        pointer(users, 'pointermove', -500, 9000);
        pointer(users, 'pointerup', -500, 9000);

        const moved = component.nodes().find((candidate) => candidate.id === 'users')!;
        expect([moved.x, moved.y]).toEqual([68, 676]);
        expect(moved.zone).toBe('outside');
      });

      it('does not move anything outside edit mode', () => {
        const { fixture, element, component } = create();
        const pointer = pointerOn(fixture, element);
        const target = node(element, 'RDS PostgreSQL');
        pointer(target, 'pointerdown', 710, 250);
        pointer(target, 'pointermove', 402, 430);
        pointer(target, 'pointerup', 402, 430);

        expect(component.nodes().find((candidate) => candidate.id === 'postgres')!.x).toBe(710);
      });
    });

    describe('resizing zones from any corner', () => {
      it('keeps the opposite corner in place', () => {
        const { fixture, element, component } = edit();
        const pointer = pointerOn(fixture, element);
        const zone = () => component.zones().find((candidate) => candidate.id === 'subnet-public')!;
        const corner = (name: string) =>
          Array.from(element.querySelectorAll<SVGRectElement>(`rect.zone-corner[data-corner="${name}"]`))
            .find((candidate) => Math.abs(Number(candidate.getAttribute('x')) - (name.endsWith('e') ? zone().x + zone().w - 12 : zone().x)) < 1
              && Math.abs(Number(candidate.getAttribute('y')) - (name.startsWith('s') ? zone().y + zone().h - 12 : zone().y)) < 1)!;

        // Esquina superior izquierda: crece hacia arriba y a la izquierda; la inferior derecha no se mueve.
        pointer(corner('nw'), 'pointerdown', 332, 182);
        pointer(corner('nw'), 'pointermove', 322, 162);
        pointer(corner('nw'), 'pointerup', 322, 162);
        expect(zone().x).toBeCloseTo(322, -1);
        expect(zone().y).toBeCloseTo(162, -1);
        expect(zone().x + zone().w).toBe(472);
        expect(zone().y + zone().h).toBe(588);

        // Esquina superior derecha: no puede hacerse más pequeña que el mínimo.
        pointer(corner('ne'), 'pointerdown', zone().x + zone().w, zone().y);
        pointer(corner('ne'), 'pointermove', 0, 9000);
        pointer(corner('ne'), 'pointerup', 0, 9000);
        expect(zone().w).toBe(90);
        expect(zone().h).toBe(90);
        expect(zone().y + zone().h).toBe(588);
      });
    });

    describe('auto-arrange', () => {
      it('puts a scrambled canvas back on its grid, layer by layer, and can be undone', () => {
        const { fixture, element, component } = edit();
        const position = (id: string) => {
          const found = component.nodes().find((candidate) => candidate.id === id)!;
          return [found.x, found.y];
        };
        // Desordenar dentro de cada zona: unas teclas a cada nodo.
        for (const [service, keys] of [['RDS PostgreSQL', ['ArrowDown', 'ArrowDown', 'ArrowDown']], ['ElastiCache', ['ArrowUp', 'ArrowUp', 'ArrowLeft']],
          ['ECS Fargate', ['ArrowDown', 'ArrowRight']], ['Secrets Manager', ['ArrowRight', 'ArrowDown']], ['Gemini API', ['ArrowRight', 'ArrowRight']],
          ['Visitantes', ['ArrowDown', 'ArrowDown']]] as const) {
          for (const key of keys) {
            node(element, service).dispatchEvent(new KeyboardEvent('keydown', { key }));
          }
        }
        fixture.detectChanges();
        expect(position('redis')).toEqual([698, 316]);
        const scrambled = structuredClone(component.nodes());

        button(element, 'Auto-ordenar').click();
        fixture.detectChanges();

        // Vuelve exactamente a la rejilla de la arquitectura de referencia.
        expect(component.nodes().map((candidate) => [candidate.id, candidate.x, candidate.y]))
          .toEqual(CLOUD_NODES.map((candidate) => [candidate.id, candidate.x, candidate.y]));
        expect(component.nodes().map((candidate) => candidate.zone)).toEqual(CLOUD_NODES.map((candidate) => candidate.zone));
        expect(tags()).toContain('Terraform');

        element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!.click();
        fixture.detectChanges();
        expect(component.nodes()).toEqual(scrambled);
      });

      it('is disabled on an empty canvas', () => {
        const { fixture, element, component } = create();
        component.loadPreset(component.presets().find((preset) => preset.id === 'blank')!);
        fixture.detectChanges();
        expect(button(element, 'Auto-ordenar').disabled).toBeTrue();
      });
    });

    describe('connections', () => {
      it('connects two nodes by picking the source handle and then the target', () => {
        const { fixture, element, component } = edit();
        select(fixture, element, 'Application LB');
        expect(handle(element).getAttribute('aria-label')).toBe('Conectar Application LB con otro nodo');

        handle(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();
        expect(element.querySelector('[role="toolbar"][aria-label="Edición de la arquitectura"] [role="status"]')!.textContent)
          .toContain('Pulsa el nodo de destino para conectar «Application LB»');

        node(element, 'ElastiCache').dispatchEvent(new MouseEvent('click'));
        fixture.detectChanges();
        expect(wireKeys(component)).toContain('lb>redis');
        expect(element.querySelectorAll('path.wire').length).toBe(9);
        expect(component.connectingFrom()).toBeNull();
        expect(tags()).toEqual(jasmine.arrayContaining(['Route Table Updated', 'Warning: Public Access to DB']));
        expect(component.mainTf()).toContain('depends_on = [aws_ecs_service.api, aws_elasticache_replication_group.redis]');
      });

      it('draws a connection by dragging from the handle to another node, with a live preview', () => {
        const { fixture, element, component } = edit();
        const pointer = pointerOn(fixture, element);
        select(fixture, element, 'ECS Fargate');

        pointer(handle(element), 'pointerdown', 620, 250);
        pointer(handle(element), 'pointermove', 760, 230);
        const preview = element.querySelector('path.wire-preview')!;
        expect(preview.getAttribute('d')).toMatch(/^M556 250 L7\d\d(\.\d+)? 2\d\d/);
        pointer(handle(element), 'pointerup', 865, 215);

        expect(wireKeys(component)).toContain('api>secrets');
        expect(element.querySelector('path.wire-preview')).toBeNull();
      });

      it('cancels a connection released on empty space or with Escape, and ignores duplicates and self-links', () => {
        const { fixture, element, component } = edit();
        const pointer = pointerOn(fixture, element);
        select(fixture, element, 'ECS Fargate');

        pointer(handle(element), 'pointerdown', 620, 250);
        pointer(handle(element), 'pointermove', 250, 600);
        pointer(handle(element), 'pointerup', 250, 600);
        expect(component.connectingFrom()).toBeNull();

        handle(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();
        diagram(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        expect(component.connectingFrom()).toBeNull();

        component.connect('api', 'postgres');
        component.connect('api', 'api');
        component.connect('api', 'fantasma');
        expect(component.wires().length).toBe(8);
        expect(component.canUndo()).toBeFalse();
      });

      it('lists the connections of a node in its properties, where they can be added and removed', () => {
        const { fixture, element, component } = edit();
        node(element, 'ECS Fargate').dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        const panel = element.querySelector('app-node-properties')!;
        // Sin el desplegable del tipo de conexión, que tiene su propio test.
        const listed = () => Array.from(panel.querySelectorAll('ul li')).map((item) => {
          const copy = item.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('select').forEach((select) => select.remove());
          return copy.textContent!.replace(/\s+/g, ' ').trim();
        });

        expect(listed()).toEqual(['←Desde Application LB ×', '→Hacia RDS PostgreSQL ×', '→Hacia ElastiCache ×', '→Hacia Gemini API ×']);
        const options = () => Array.from(panel.querySelectorAll<HTMLOptionElement>('#connect-with option')).map((option) => option.textContent);
        expect(options()).toContain('Secrets Manager');
        expect(options()).not.toContain('RDS PostgreSQL');

        const picker = panel.querySelector<HTMLSelectElement>('#connect-with')!;
        picker.value = 'secrets';
        picker.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(wireKeys(component)).toContain('api>secrets');
        expect(listed()).toContain('→Hacia Secrets Manager ×');

        panel.querySelector<HTMLButtonElement>('button[aria-label="Quitar la conexión con ElastiCache"]')!.click();
        fixture.detectChanges();
        expect(wireKeys(component)).not.toContain('api>redis');
        expect(element.querySelectorAll('path.wire').length).toBe(8);

        // Cada cambio de conexión se puede deshacer.
        element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!.click();
        fixture.detectChanges();
        expect(wireKeys(component)).toContain('api>redis');
      });

      it('saves the connections with the project', () => {
        const { fixture, element, component } = edit();
        component.connect('lb', 'secrets');
        fixture.detectChanges();
        TestBed.flushEffects();

        const stored = JSON.parse(localStorage.getItem('architecture-studio-project')!);
        expect(stored.links).toContain(jasmine.objectContaining({ from: 'lb', to: 'secrets' }));
        expect(element.querySelectorAll('path.wire').length).toBe(9);
      });

      it('creates any connection and highlights nothing while studio.smart-rules is off', () => {
        const { fixture, element, component } = edit();
        select(fixture, element, 'Visitantes');
        handle(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();

        expect(element.querySelector('.node-target-ok, .node-target-no')).toBeNull();
        node(element, 'RDS PostgreSQL').dispatchEvent(new MouseEvent('click'));
        fixture.detectChanges();
        expect(wireKeys(component)).toContain('users>postgres');
        expect(element.querySelector('[data-testid="connection-refusal"]')).toBeNull();
      });

      describe('with studio.smart-rules on', () => {
        beforeEach(async () => {
          await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'studio.smart-rules': true })));
        });
        afterEach(async () => {
          await OpenFeature.clearProviders();
        });

        it('highlights the valid targets and dims the others while a connection is drawn', () => {
          const { fixture, element } = edit();
          select(fixture, element, 'Visitantes');
          handle(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          fixture.detectChanges();

          expect(node(element, 'ECS Fargate').classList).toContain('node-target-ok');
          expect(node(element, 'RDS PostgreSQL').classList).toContain('node-target-no');
          expect(node(element, 'Visitantes').classList).not.toContain('node-target-ok');
          expect(node(element, 'Visitantes').classList).not.toContain('node-target-no');

          diagram(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          fixture.detectChanges();
          expect(element.querySelector('.node-target-ok, .node-target-no')).toBeNull();
        });

        it('does not create a connection dropped on an invalid target, and says what to do instead', () => {
          const { fixture, element, component } = edit();
          const pointer = pointerOn(fixture, element);
          select(fixture, element, 'Visitantes');

          pointer(handle(element), 'pointerdown', 128, 250);
          pointer(handle(element), 'pointermove', 600, 250);
          pointer(handle(element), 'pointerup', 710, 250);

          expect(wireKeys(component)).not.toContain('users>postgres');
          expect(component.canUndo()).toBeFalse();
          const refusal = element.querySelector('[data-testid="connection-refusal"]')!;
          expect(refusal.getAttribute('role')).toBe('alert');
          expect(refusal.textContent).toContain('Conexión no creada.');
          expect(refusal.textContent).toContain('Pon una API en medio: Visitantes → API → RDS PostgreSQL.');
          expect(tags()).toContain('Graph Rule');

          refusal.querySelector('button')!.click();
          fixture.detectChanges();
          expect(element.querySelector('[data-testid="connection-refusal"]')).toBeNull();
        });

        it('still creates a valid connection, and that clears the last explanation', () => {
          const { fixture, element, component } = edit();
          component.connect('users', 'postgres');
          fixture.detectChanges();
          expect(element.querySelector('[data-testid="connection-refusal"]')).not.toBeNull();

          component.connect('lb', 'secrets');
          fixture.detectChanges();
          expect(wireKeys(component)).toContain('lb>secrets');
          expect(element.querySelector('[data-testid="connection-refusal"]')).toBeNull();
        });

        it('warns about a database moved into the public subnet, with what to do', () => {
          const { fixture, element, component } = edit();
          component.nodes.update((nodes) => nodes.map((candidate) => (candidate.id === 'postgres' ? { ...candidate, zone: 'public' as const } : candidate)));
          fixture.detectChanges();

          const warnings = element.querySelector('[data-testid="graph-warnings"]')!.textContent!;
          expect(warnings).toContain('Riesgo de seguridad: RDS PostgreSQL está en una subred pública');
          expect(warnings).toContain('Muévela a una subred privada');
          expect(element.querySelectorAll('[data-testid="rule-badge"]').length).toBe(1);
        });
      });
    });
  });
  describe('Oracle Cloud (cloud.oracle)', () => {
    const clouds = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('[role="radiogroup"][aria-label="Proveedor de nube"] [role="radio"]')).map((item) => item.textContent?.trim());

    it('is not offered while the flag is off', () => {
      const { element } = create();

      expect(clouds(element)).toEqual(['AWS', 'GCP', 'Azure']);
    });

    it('still shows a project that was saved in OCI', () => {
      localStorage.setItem('architecture-studio-project', serializeProject({ ...referenceProject(), provider: 'oci' }));
      const { element } = create();

      expect(clouds(element)).toEqual(['AWS', 'GCP', 'Azure', 'OCI']);
      expect(provider(element, 'OCI').getAttribute('aria-checked')).toBe('true');
    });

    describe('with the flag on', () => {
      beforeEach(async () => {
        await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'cloud.oracle': true })));
      });
      afterEach(async () => {
        await OpenFeature.clearProviders();
      });

      it('translates the diagram, the network and the Terraform to OCI, without any cloud logo', () => {
        const { fixture, element, component } = create();
        expect(clouds(element)).toEqual(['AWS', 'GCP', 'Azure', 'OCI']);

        provider(element, 'OCI').click();
        fixture.detectChanges();

        expect(services(element)).toEqual(jasmine.arrayContaining(['OCI Database with PostgreSQL', 'OCI Cache', 'Container Instances', 'Load Balancer', 'Vault']));
        expect(services(element)).not.toContain('RDS PostgreSQL');
        expect(element.textContent).toContain('Oracle Cloud · región');
        expect(component.mainTf()).toContain('provider "oci"');
        expect(component.mainTf()).toContain('resource "oci_core_vcn" "main"');
        // Ningún icono de arquitectura de otra nube en un diagrama de OCI.
        const images = Array.from(element.querySelectorAll('svg[role="group"] image.node-icon')).map((image) => image.getAttribute('href'));
        expect(images.filter((href) => /cloud-icons\/(aws|gcp|azure)\//.test(href ?? ''))).toEqual([]);
      });

      it('shows no hand-written cost for a cloud service in OCI: each one is "sin estimación"', () => {
        const { fixture, element } = create();
        provider(element, 'OCI').click();
        fixture.detectChanges();

        const labels = Array.from(element.querySelectorAll('[data-testid="node-cost"] text')).map((label) => label.textContent?.trim());
        expect(labels.length).toBeGreaterThan(5);
        // La única cifra es la de Cloudflare, que no es un servicio de la nube.
        expect(new Set(labels)).toEqual(new Set(['sin estimación', '$20/mes']));
      });
    });
  });

  describe('data patterns', () => {
    const data = (element: HTMLElement) => Array.from(element.querySelectorAll('path.wire[data-kind]')).map((wire) => wire.getAttribute('data-kind'));
    const warnings = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('[data-testid="graph-warnings"] li')).map((item) => item.textContent!.trim());

    it('hooks a new CDC to the database, not to the API, with a typed link', () => {
      const { fixture, element, component } = edit();
      catalogEntry(element, 'Database Migration Service').click();
      fixture.detectChanges();

      expect(component.project().links.at(-1)).toEqual({ from: 'postgres', to: 'cdc-1', kind: 'CDC_STREAM' });
      expect(data(element)).toEqual(['CDC_STREAM']);
      expect(Array.from(element.querySelectorAll('text.wire-label')).at(-1)?.textContent).toBe('CDC');
      expect(warnings(element)).toEqual([]);
    });

    it('leaves a data piece unconnected when nothing on the canvas may feed it', () => {
      const { fixture, element, component } = edit();
      const before = component.project().links.length;
      catalogEntry(element, 'Managed Flink').click();
      fixture.detectChanges();
      expect(component.project().links.length).toBe(before);
      expect(warnings(element)).toEqual([]);
    });

    it('warns beside the node and in the inspector when a connection is not allowed, without blocking it', () => {
      const { fixture, element, component } = edit();
      catalogEntry(element, 'Database Migration Service').click();
      component.connect('api', 'cdc-1');
      fixture.detectChanges();

      // La conexión se hace: es un aviso, no un bloqueo.
      expect(component.project().links.some((link) => link.from === 'api' && link.to === 'cdc-1')).toBeTrue();
      const message = 'Conexión no permitida: ECS Fargate → Database Migration Service. Un CDC solo recibe de: una base de datos, una base de datos global.';
      expect(warnings(element)).toEqual([message]);
      expect(element.querySelectorAll('[data-testid="rule-badge"]').length).toBe(1);
      expect(element.querySelector('[data-testid="rule-badge"] title')?.textContent).toBe(message);
      const events = TestBed.inject(SystemEventsService).events().filter((event) => event.tag === 'Graph Rule');
      expect(events.map((event) => [event.kind, event.detail, event.component])).toEqual([['warn', message, 'cdc-1']]);

      // Al deshacer la conexión, el aviso desaparece; no se repite en el inspector.
      component.disconnect('api', 'cdc-1');
      fixture.detectChanges();
      expect(warnings(element)).toEqual([]);
      expect(element.querySelector('[data-testid="rule-badge"]')).toBeNull();
      expect(TestBed.inject(SystemEventsService).events().filter((event) => event.tag === 'Graph Rule').length).toBe(1);
    });

    it('warns about a duplicated instance of a service that admits only one', () => {
      const { fixture, element } = edit();
      catalogEntry(element, 'Tableau').click();
      catalogEntry(element, 'Tableau').click();
      fixture.detectChanges();
      expect(warnings(element)).toEqual(['Instancia duplicada: Tableau #2. Este lienzo admite una sola.']);
      expect(element.querySelectorAll('[data-testid="rule-badge"]').length).toBe(1);
    });

    it('says in main.tf, in the panel and in the trace that a service has no Terraform support yet', () => {
      const { fixture, element, component } = edit();
      catalogEntry(element, 'Debezium').click();
      button(element, 'main.tf').click();
      fixture.detectChanges();

      expect(component.mainTf()).toContain('# Debezium: sin soporte de Terraform todavía');
      expect(component.mainTf()).not.toContain('Fuera de Terraform: Debezium');
      expect(Array.from(element.querySelectorAll('[data-testid="terraform-gap"]')).map((item) => item.textContent!.trim()))
        .toEqual(['Debezium: sin soporte de Terraform todavía']);
      const event = TestBed.inject(SystemEventsService).events().find((candidate) => candidate.detail.includes('sin soporte'))!;
      expect([event.kind, event.tag, event.detail]).toEqual(['warn', 'Terraform', 'Debezium: sin soporte de Terraform todavía']);
      expect(tags().some((tag) => tag.includes('resource "null"'))).toBeFalse();
    });

    it('shows the services without a cost estimate instead of counting them as free', () => {
      const { fixture, element, component } = edit();
      const total = component.cost().total;
      catalogEntry(element, 'Snowflake').click();
      fixture.detectChanges();
      expect(component.cost().total).toBe(total);
      const badge = element.querySelector('app-cost-badge')!;
      expect(badge.textContent).toContain('+1 sin estimación');
      badge.querySelector('button')!.click();
      fixture.detectChanges();
      expect(badge.querySelector('[data-testid="cost-unestimated"]')!.textContent!.trim()).toBe('Sin estimación: Snowflake. No suman al total.');
    });

    it('marks in the catalog the services with no direct equivalent in the chosen cloud', () => {
      const { fixture, element } = edit();
      expect(element.querySelector('[data-testid="no-equivalent"]')).toBeNull();
      provider(element, 'Azure').click();
      fixture.detectChanges();
      const marked = Array.from(element.querySelectorAll('[data-testid="no-equivalent"]')).map((mark) => mark.closest('button')!.getAttribute('aria-label'));
      expect(marked).toEqual([
        'Añadir Azure SQL Database (failover groups): Base de datos global con réplica entre regiones',
        'Añadir Data Factory (CDC): Captura de cambios (CDC) gestionada',
      ]);
      expect(catalogEntry(element, 'Data Factory (CDC)').title).toContain('Debezium publicando en Event Hubs');
    });

    it('lets the kind of a connection be changed from the properties of a node, as one undo step', () => {
      const { fixture, element, component } = edit();
      node(element, 'ECS Fargate').dispatchEvent(new MouseEvent('dblclick'));
      fixture.detectChanges();
      const select = element.querySelector<HTMLSelectElement>('app-node-properties select[aria-label="Tipo de la conexión con RDS PostgreSQL"]')!;
      expect(Array.from(select.options).map((option) => option.textContent!.trim())).toEqual(['Peticiones', 'Flujo CDC', 'Bus de eventos', 'Carga analítica', 'Replicación']);

      select.value = 'REPLICATION';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(component.project().links.find((link) => link.from === 'api' && link.to === 'postgres')).toEqual({ from: 'api', to: 'postgres', kind: 'REPLICATION' });
      // Una réplica desde un servicio no tiene sentido: se avisa.
      expect(warnings(element)).toEqual(['Tipo de conexión REPLICATION no válido entre ECS Fargate y RDS PostgreSQL.']);

      component.setLinkKind('api', 'postgres', null);
      fixture.detectChanges();
      expect(component.project().links.find((link) => link.from === 'api' && link.to === 'postgres')).toEqual({ from: 'api', to: 'postgres' });
      expect(warnings(element)).toEqual([]);
      component.undo();
      component.undo();
      expect(component.project().links.some((link) => link.kind)).toBeFalse();
      expect(component.canUndo()).toBeFalse();
    });

    it('loads a blueprint replacing the canvas, in the chosen cloud, as one undo step', () => {
      const { fixture, element, component } = create();
      provider(element, 'GCP').click();
      const blueprint = DATA_BLUEPRINTS.find((candidate) => candidate.id === 'cdc-realtime')!;
      component.loadBlueprint({ blueprint, mode: 'replace' });
      fixture.detectChanges();

      expect(component.selectedId()).toBe('gcp');
      expect(services(element)).toEqual(['Visitantes', 'Cloudflare', 'Cloud Load Balancing', 'Cloud Run', 'Cloud SQL', 'Datastream', 'BigQuery', 'Secret Manager']);
      expect(data(element)).toEqual(['CDC_STREAM', 'CDC_STREAM']);
      expect(warnings(element)).toEqual([]);
      expect(component.warnings()).toEqual([]);
      expect(tags()).toContain('Blueprint');

      component.undo();
      fixture.detectChanges();
      expect(services(element).length).toBe(CLOUD_NODES.length);
    });

    it('adds a blueprint to what is on the canvas without duplicating the shared pieces', () => {
      const { fixture, element, component } = create();
      component.loadBlueprint({ blueprint: DATA_BLUEPRINTS.find((candidate) => candidate.id === 'event-analytics')!, mode: 'add' });
      fixture.detectChanges();

      expect(component.nodes().length).toBe(CLOUD_NODES.length + 5);
      expect(services(element).filter((name) => name === 'Application LB').length).toBe(1);
      expect(services(element)).toContain('Kinesis Data Streams');
      expect(warnings(element)).toEqual([]);
      expect(TestBed.inject(SystemEventsService).events().find((event) => event.tag === 'Blueprint')!.detail)
        .toBe('«Analítica por eventos» v1 agregado al lienzo (5 piezas nuevas)');
      component.undo();
      expect(component.nodes().length).toBe(CLOUD_NODES.length);
    });

    it('tells the gallery the cloud and whether the canvas has content, and loads what it asks for', () => {
      const { fixture, element, component } = create();
      const studio = TestBed.inject(ArchitectureStudio);
      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(studio.activeProvider()).toBe('azure');
      expect(studio.canvasHasContent()).toBeTrue();

      studio.requestBlueprint({ blueprint: DATA_BLUEPRINTS.find((candidate) => candidate.id === 'multi-region-recovery')!, mode: 'replace' });
      fixture.detectChanges();
      expect(services(element)).toContain('Azure SQL Database (failover groups) #2');
      expect(data(element)).toEqual(['REPLICATION']);
    });

    it('publishes the diff of the graph to the inspector after a short wait, grouping quick changes', fakeAsync(() => {
      const { fixture, element, component } = edit();
      const inspector = TestBed.inject(TraceInspectorService);
      tick(GRAPH_DIFF_DEBOUNCE_MS);
      expect(inspector.graphEntries()).toEqual([]);
      expect(JSON.parse(inspector.graphJson()).nodes.length).toBe(CLOUD_NODES.length);

      catalogEntry(element, 'Database Migration Service').click();
      fixture.detectChanges();
      catalogEntry(element, 'Redshift').click();
      fixture.detectChanges();
      tick(GRAPH_DIFF_DEBOUNCE_MS - 1);
      expect(inspector.graphEntries()).toEqual([]);
      tick(1);

      // Dos cambios seguidos, una sola entrada.
      expect(inspector.graphEntries().map((entry) => entry.summary)).toEqual(['2 nodos agregados, 2 aristas agregadas']);
      expect(inspector.graphEntries()[0].lines.map((line) => `${line.sign} ${line.label}`)).toEqual(['+ nodo', '+ nodo', '+ arista', '+ arista']);
      expect(JSON.parse(inspector.graphJson()).links.at(-1)).toEqual({ from: 'api', to: 'warehouse-2', kind: 'ANALYTICS_SINK' });

      component.remove(component.nodes().at(-1)!);
      fixture.detectChanges();
      tick(GRAPH_DIFF_DEBOUNCE_MS);
      expect(inspector.graphEntries().map((entry) => entry.summary).at(-1)).toBe('1 nodo quitado, 1 arista quitada');

      button(element, 'Grafo').click();
      expect(inspector.graphView()).toBeTrue();
      flush();
    }));
  });
  describe('live list prices', () => {
    const costs = (element: HTMLElement) => Array.from(element.querySelectorAll('[data-testid="node-cost"]'))
      .map((badge) => [badge.querySelector('text')!.textContent, badge.classList.contains('node-cost-live')]);

    afterEach(() => resetRuntimeConfig());

    it('labels every node with its monthly cost and, in demo mode, says they are all rough figures', () => {
      const { fixture, element, component } = create();
      const api = spyOn(TestBed.inject(ArchitectureStudioApi), 'publicArchitecturePricingPost');

      expect(costs(element)).toContain(['$36/mes', false]);
      expect(costs(element).some(([, live]) => live)).toBeFalse();
      expect(component.cost().liveUsd).toBe(0);
      expect(component.pricingState()).toBe('demo');
      const badge = element.querySelector('app-cost-badge')!;
      expect(badge.querySelector('[data-testid="cost-live"]')).toBeNull();
      badge.querySelector('button')!.click();
      fixture.detectChanges();
      expect(badge.querySelector('[data-testid="cost-source"]')!.textContent!.trim())
        .toBe('Modo demo: sin backend no se consultan precios. Todas las cifras son orientativas.');
      // En modo demo no se pide ningún precio.
      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(api).not.toHaveBeenCalled();
    });

    it('with a backend, asks for the prices when the cloud or the services change and shows the real ones', () => {
      (runtimeConfig as { mockMode: boolean }).mockMode = false;
      const quote = (code: string, monthlyCost: number, sku: string): PriceQuote =>
        ({ code, status: 'LIVE', sku, monthlyCost, currency: 'USD', region: 'eastus', source: 'Azure Retail Prices API', note: 'Solo cómputo.' });
      const api = spyOn(TestBed.inject(ArchitectureStudioApi), 'publicArchitecturePricingPost').and.callFake(((request: PricingRequest) => of({
        cloudProvider: request.cloudProvider, currency: 'USD',
        quotes: request.cloudProvider === 'azure'
          ? [quote('postgres', 12.41, 'PostgreSQL B1MS'), quote('redis', 40.15, 'Redis Basic C1'), quote('vm', 70.08, 'D2s_v5'),
             { code: 'snowflake', status: 'UNESTIMATED_ENTERPRISE_LICENSE' }]
          : request.services.map((code) => ({ code, status: 'UNKNOWN_PRICING' })),
      })) as never);

      const { fixture, element, component } = edit();
      // Al abrir, pide los precios de la nube y los servicios del lienzo.
      expect(api).toHaveBeenCalledTimes(1);
      expect(api.calls.mostRecent().args[0].cloudProvider).toBe('aws');
      expect(api.calls.mostRecent().args[0].services).toContain('postgres');
      expect(component.cost().liveUsd).toBe(0);

      provider(element, 'Azure').click();
      fixture.detectChanges();
      expect(api).toHaveBeenCalledTimes(2);
      expect(component.pricingState()).toBe('live');
      expect(costs(element)).toContain(['$12/mes', true]);
      expect(costs(element)).toContain(['$40/mes', true]);
      expect(component.cost().liveUsd).toBeCloseTo(52.56, 2);
      expect(element.querySelector('[data-testid="cost-live"]')!.textContent).toBe('$53 reales');
      expect(Array.from(element.querySelectorAll('[data-testid="node-cost"] title')).map((title) => title.textContent))
        .toContain('Precio de lista real · PostgreSQL B1MS · Azure Retail Prices API (eastus). Solo cómputo.');

      // Añadir un tipo nuevo vuelve a pedir; una segunda instancia del mismo tipo, no.
      catalogEntry(element, 'Virtual Machines').click();
      fixture.detectChanges();
      expect(api).toHaveBeenCalledTimes(3);
      expect(api.calls.mostRecent().args[0].services).toContain('vm');
      expect(costs(element)).toContain(['$70/mes', true]);
      catalogEntry(element, 'Virtual Machines').click();
      fixture.detectChanges();
      expect(api).toHaveBeenCalledTimes(3);
      expect(component.cost().liveUsd).toBeCloseTo(52.56 + 140.16, 2);

      // Un producto con licencia sigue sin estimación: ni precio ni cero.
      catalogEntry(element, 'Snowflake').click();
      fixture.detectChanges();
      expect(costs(element)).toContain(['sin estimación', false]);
      expect(component.cost().unestimated.map((item) => item.name)).toEqual(['Snowflake']);
    });
  });
});

describe('CloudInfraComponent · barra con jerarquía', () => {
  beforeEach(() => {
    localStorage.removeItem('architecture-studio-project');
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });
  afterEach(() => localStorage.removeItem('architecture-studio-project'));

  function create() {
    const fixture = TestBed.createComponent(CloudInfraComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('deja a la vista una sola acción primaria y agrupa el resto en tres menús', () => {
    const { element } = create();
    const toolbar = element.querySelector('[role="toolbar"][aria-label="Estudio de arquitectura"]')!;

    const primary = toolbar.querySelectorAll('.ui-btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent!.trim()).toBe('Editar arquitectura');

    const menus = Array.from(toolbar.querySelectorAll<HTMLButtonElement>(':scope > [data-menu] > button'));
    expect(menus.map((menu) => menu.textContent!.replace('▾', '').trim())).toEqual(['Proyecto', 'Ver', 'Analizar']);
    expect(menus.every((menu) => menu.getAttribute('aria-expanded') === 'false')).toBeTrue();
    // Cerrados, sus listas no se ven.
    expect(Array.from(toolbar.querySelectorAll<HTMLElement>('#menu-project, #menu-view, #menu-analyze')).every((list) => list.hidden)).toBeTrue();
  });

  it('abre un menú cada vez y lo cierra al elegir una acción', () => {
    const { fixture, element } = create();
    const open = (name: string) => {
      Array.from(element.querySelectorAll<HTMLButtonElement>('[data-menu] > button')).find((button) => button.textContent!.includes(name))!.click();
      fixture.detectChanges();
    };

    open('Ver');
    expect(element.querySelector<HTMLElement>('#menu-view')!.hidden).toBeFalse();
    open('Analizar');
    expect(element.querySelector<HTMLElement>('#menu-view')!.hidden).toBeTrue();
    expect(element.querySelector<HTMLElement>('#menu-analyze')!.hidden).toBeFalse();

    Array.from(element.querySelectorAll<HTMLButtonElement>('#menu-analyze button')).find((item) => item.textContent!.includes('Simular caos'))!.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLElement>('#menu-analyze')!.hidden).toBeTrue();
    expect(element.querySelector('#chaos-panel')).not.toBeNull();
  });
});

describe('CloudInfraComponent · estrecho (móvil)', () => {
  beforeEach(() => {
    localStorage.removeItem('architecture-studio-project');
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });
  afterEach(() => {
    localStorage.removeItem('architecture-studio-project');
    document.querySelectorAll('body > app-cloud-infra, body > [data-studio-host]').forEach((host) => host.remove());
  });

  function create(width: number) {
    ContainerWidthDirective.fixedWidth = width;
    const fixture = TestBed.createComponent(CloudInfraComponent);
    (fixture.nativeElement as HTMLElement).dataset['studioHost'] = '';
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('shows the project top to bottom and read-only, with the same pieces and connections', () => {
    const { element, component } = create(342);
    const mobile = element.querySelector('app-studio-mobile-canvas')!;

    expect(mobile).not.toBeNull();
    expect(mobile.querySelectorAll('[data-node-id]').length).toBe(component.nodes().length);
    expect(mobile.querySelectorAll('path.wire').length).toBeGreaterThan(5);
    // El lienzo de trabajo sigue en el documento (para exportar), pero no se ve.
    expect(element.querySelector('[data-work-canvas]')!.parentElement!.classList).toContain('hidden');
    expect(Array.from(element.querySelectorAll('button')).some((button) => button.textContent!.includes('Editar arquitectura'))).toBeFalse();
    expect(mobile.textContent).toContain('Solo lectura');
  });

  it('names each piece as the selected cloud does, with its network zone and cost', () => {
    const { fixture, element } = create(342);
    const text = () => element.querySelector('app-studio-mobile-canvas [data-node-id="api"]')!.getAttribute('aria-label')!;

    expect(text()).toContain('ECS Fargate');
    expect(text()).toContain('Subred privada');
    expect(text()).toMatch(/\$\d+\/mes/);

    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent!.includes('Azure'))!.click();
    fixture.detectChanges();
    expect(text()).not.toContain('ECS Fargate');
  });

  it('moves the live metrics and FinOps out of the diagram, into a row below it', () => {
    const { element } = create(342);
    const panels = element.querySelector('[data-testid="studio-panels"]')!;

    expect(panels.classList).toContain('flex');
    for (const panel of ['app-live-vitals', 'app-cost-badge']) {
      expect(panels.querySelector(panel)!.classList).not.toContain('absolute');
    }
    const canvas = element.querySelector('app-studio-mobile-canvas')!.getBoundingClientRect();
    expect(panels.getBoundingClientRect().top).toBeGreaterThanOrEqual(canvas.bottom - 1);
  });

  it('selects a piece when it is tapped and explains it below', () => {
    const { fixture, element, component } = create(342);

    const node = Array.from(element.querySelectorAll<SVGGElement>('app-studio-mobile-canvas [data-node-id]'))
      .find((candidate) => candidate.getAttribute('data-node-id') !== component.activeId())!;
    const id = node.getAttribute('data-node-id')!;
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(component.activeId()).toBe(id);
    expect(element.querySelector(`app-studio-mobile-canvas [data-node-id="${id}"]`)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves editing when the canvas becomes too narrow to work on', () => {
    const { fixture, element, component } = create(1280);
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent!.includes('Editar arquitectura'))!.click();
    fixture.detectChanges();
    expect(component.editing()).toBeTrue();
    expect(element.querySelector('app-studio-mobile-canvas')).toBeNull();

    // Girar el móvil o acoplar el inspector estrecha el hueco.
    fixture.debugElement.query(By.directive(ContainerWidthDirective)).injector.get(ContainerWidthDirective).width.set(500);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.editing()).toBeFalse();
    expect(element.querySelector('app-studio-mobile-canvas')).not.toBeNull();
  });
});
