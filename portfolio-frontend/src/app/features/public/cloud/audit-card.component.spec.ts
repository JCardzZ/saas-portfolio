import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AppliedAIRAGService } from '../../../core/api';
import { AuditCardComponent } from './audit-card.component';
import { CLOUD_LINKS, CLOUD_NODES } from './cloud-topology.data';
import { auditTopology } from './topology-auditor';

describe('AuditCardComponent', () => {
  function create(aiRagQueryPost: jasmine.Spy) {
    TestBed.configureTestingModule({ providers: [{ provide: AppliedAIRAGService, useValue: { aiRagQueryPost } }] });
    const fixture = TestBed.createComponent(AuditCardComponent);
    fixture.componentRef.setInput('recommendations', auditTopology(CLOUD_NODES, CLOUD_LINKS, 'aws'));
    fixture.componentRef.setInput('providerName', 'AWS');
    const answered: boolean[] = [];
    fixture.componentInstance.answered.subscribe((ok) => answered.push(ok));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, answered };
  }

  it('asks the assistant about the findings and shows its grounded answer with the number of sources', () => {
    const api = jasmine.createSpy().and.returnValue(of({ answer: 'La caché es **best-effort**.', citations: [{}, {}] }));
    const { element, answered } = create(api);

    expect(api.calls.mostRecent().args[0].prompt).toContain('Activa Multi-AZ en RDS PostgreSQL');
    expect(element.querySelector('app-markdown strong')!.textContent).toBe('best-effort');
    expect(element.textContent).toContain('2 fuentes citadas del índice');
    expect(answered).toEqual([true]);
  });

  it('keeps the rule-based recommendations when the AI engine is unavailable, and lets the visitor retry', () => {
    const failure = new HttpErrorResponse({ status: 503, error: { detail: 'El motor de IA no está disponible' } });
    const api = jasmine.createSpy().and.returnValues(throwError(() => failure), of({ answer: 'Recuperado.', citations: [] }));
    const { fixture, element, answered } = create(api);

    expect(element.textContent).toContain('El asistente no está disponible ahora (El motor de IA no está disponible)');
    expect(element.textContent).toContain('Añade una réplica a ElastiCache');
    expect(answered).toEqual([false]);

    Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Reintentar'))!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-markdown')!.textContent).toContain('Recuperado.');
    expect(answered).toEqual([false, true]);
  });
});
