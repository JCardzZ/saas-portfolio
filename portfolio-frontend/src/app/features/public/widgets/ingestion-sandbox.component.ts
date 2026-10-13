import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { SystemEventsService } from '../data/system-events.service';
import { TextChunk, chunkText, illustrativeEmbedding } from '../data/text-chunker';

interface Template {
  label: string;
  sourceId: string;
  text: string;
}

const TEMPLATES: Template[] = [
  {
    label: 'Spring Security Config',
    sourceId: 'portfolio-backend/…/config/SecurityConfig.java',
    text: `@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http,
        JwtTokenService tokenService,
        ProblemDetailSecurityHandler securityHandler) throws Exception {
    return http
        .csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(session ->
            session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .exceptionHandling(handling -> handling
            .authenticationEntryPoint(securityHandler)
            .accessDeniedHandler(securityHandler))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated())
        .addFilterBefore(new JwtAuthenticationFilter(tokenService, securityHandler),
            UsernamePasswordAuthenticationFilter.class)
        .build();
}`,
  },
  {
    label: 'Redis Lua Script',
    sourceId: 'portfolio-backend/…/ratelimit/RedisRateLimiterAdapter.java',
    text: `local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}`,
  },
  {
    label: 'Proyecto del CMS',
    sourceId: 'cms/projects/prj-platform',
    text: `Proyecto: SaaS Portfolio Platform
Resumen: Plataforma contract-first con arquitectura hexagonal y un asistente RAG que cita el código.
Repositorio: https://github.com/example/saas-portfolio
Impacto: Dominio y aplicación sin dependencias de framework
Tecnologías: Java 21, Hexagonal Architecture, Gemini AI, Tailwind CSS, Angular 18`,
  },
];

const FREE_TEXT_SOURCE = 'sandbox/entrada.txt';
const MAX_INPUT = 4000;
// Límites reducidos para que el troceo se vea con textos cortos (el backend usa 60 líneas y 1800 caracteres).
const DEMO_MAX_LINES = 6;
const DEMO_MAX_CHARS = 320;
const SHOWN_DIMENSIONS = 48;
const TOTAL_DIMENSIONS = 768;
const STEP_MS = 750;

/** Fragmentos alternos: dos superficies neutras bastan para distinguir uno del siguiente. */
const CHUNK_STYLES = ['border-line-subtle bg-surface-2', 'border-line-strong bg-surface-3'];

/**
 * Recorre en tres pasos lo que hace la ingesta RAG con un texto: trocear, etiquetar y vectorizar.
 * El troceo es el algoritmo real; el vector es ilustrativo (no se llama a ningún modelo).
 */
@Component({
  selector: 'app-ingestion-sandbox',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule],
  host: { class: 'bento-card block' },
  templateUrl: './ingestion-sandbox.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngestionSandboxComponent {
  private readonly events = inject(SystemEventsService);

  readonly templates = TEMPLATES;
  readonly maxInput = MAX_INPUT;
  readonly shownDimensions = SHOWN_DIMENSIONS;
  readonly totalDimensions = TOTAL_DIMENSIONS;
  readonly steps = ['Segmentación', 'Metadatos', 'Embedding'];

  readonly input = new FormControl(TEMPLATES[0].text, { nonNullable: true });
  readonly activeTemplate = signal<string | null>(TEMPLATES[0].label);

  /** 0 = sin procesar; 1..3 = último paso mostrado. Arranca procesado para no abrir vacío. */
  readonly step = signal(3);
  readonly chunks = signal<TextChunk[]>(chunkText(TEMPLATES[0].text, DEMO_MAX_LINES, DEMO_MAX_CHARS));
  readonly sourceId = signal(TEMPLATES[0].sourceId);
  readonly selectedIndex = signal(0);

  readonly selected = computed(() => this.chunks()[this.selectedIndex()] ?? null);
  readonly kind = computed(() => (this.sourceId().startsWith('cms/') ? 'cms' : 'code'));
  readonly embedding = computed(() => {
    const chunk = this.selected();
    return chunk ? illustrativeEmbedding(chunk.content, SHOWN_DIMENSIONS) : [];
  });

  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimers());
    // Editar el texto a mano lo convierte en entrada libre.
    this.input.valueChanges.subscribe(() => this.activeTemplate.set(null));
  }

  useTemplate(template: Template): void {
    this.input.setValue(template.text);
    this.activeTemplate.set(template.label);
  }

  process(): void {
    const text = this.input.value;
    if (!text.trim()) {
      return;
    }
    this.clearTimers();
    const template = TEMPLATES.find((candidate) => candidate.label === this.activeTemplate());
    const chunks = chunkText(text, DEMO_MAX_LINES, DEMO_MAX_CHARS);

    this.sourceId.set(template?.sourceId ?? FREE_TEXT_SOURCE);
    this.chunks.set(chunks);
    this.selectedIndex.set(0);
    this.events.emitFromUser([
      ['info', 'ingest', `${this.sourceId()} → ${chunks.length} chunks`],
      ['ai', 'embedDocuments', `${chunks.length} × ${TOTAL_DIMENSIONS} dims`],
      ['vector', 'pgvector UPSERT', `document_embeddings · tenant default-tenant`],
    ]);

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.step.set(3);
      return;
    }
    this.step.set(1);
    this.timers = [setTimeout(() => this.step.set(2), STEP_MS), setTimeout(() => this.step.set(3), STEP_MS * 2)];
  }

  chunkStyle(index: number): string {
    return CHUNK_STYLES[index % CHUNK_STYLES.length];
  }

  cellColor(value: number): string {
    const strength = 0.08 + Math.abs(value) * 0.55;
    return value >= 0 ? `rgb(10 132 255 / ${strength})` : `rgb(244 114 182 / ${strength})`;
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
