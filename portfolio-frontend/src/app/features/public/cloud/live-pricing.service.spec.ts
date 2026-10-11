import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { ArchitectureStudioService as ArchitectureStudioApi, PriceQuote, PricingResponse } from '../../../core/api';
import { resetRuntimeConfig, runtimeConfig } from '../../../core/config/runtime-config';
import { CLOUD_NODES } from './cloud-topology.data';
import { estimateCost } from './cloud-costs.data';
import { LivePricingService } from './live-pricing.service';

const D2S: PriceQuote = {
  code: 'vm', status: 'LIVE', sku: 'D2s_v5', unit: 'HOURLY', unitPrice: 0.096, monthlyCost: 70.08, currency: 'USD',
  region: 'eastus', source: 'Azure Retail Prices API', note: 'Solo cómputo',
};

describe('LivePricingService', () => {
  let post: jasmine.Spy;

  function setup(mockMode: boolean) {
    (runtimeConfig as { mockMode: boolean }).mockMode = mockMode;
    post = jasmine.createSpy('publicArchitecturePricingPost');
    TestBed.configureTestingModule({ providers: [{ provide: ArchitectureStudioApi, useValue: { publicArchitecturePricingPost: post } }] });
    return TestBed.inject(LivePricingService);
  }
  const answer = (...quotes: PriceQuote[]): PricingResponse => ({ cloudProvider: 'azure', currency: 'USD', quotes });

  afterEach(() => resetRuntimeConfig());

  it('asks nothing and invents nothing in demo mode', () => {
    const service = setup(true);
    service.refresh('azure', ['vm']);
    expect(post).not.toHaveBeenCalled();
    expect(service.state()).toBe('demo');
    expect(service.monthlyFor('azure')).toEqual({});
  });

  it('asks the backend for the distinct services of the canvas and keeps what has a real price', () => {
    const service = setup(false);
    expect(service.state()).toBe('idle');
    post.and.returnValue(of(answer(
      D2S,
      { code: 'redis', status: 'CACHED', sku: 'Redis Basic C1', monthlyCost: 40.15, currency: 'USD' },
      { code: 'postgres', status: 'STALE', sku: 'PostgreSQL B1MS', monthlyCost: 12.41, currency: 'USD' },
      { code: 'snowflake', status: 'UNESTIMATED_ENTERPRISE_LICENSE', note: 'oferta comercial' },
      { code: 'functions', status: 'UNKNOWN_PRICING' },
    )));

    service.refresh('azure', ['vm', 'redis', 'vm', 'postgres', 'snowflake', 'functions']);

    expect(post).toHaveBeenCalledOnceWith({ cloudProvider: 'azure', services: ['vm', 'redis', 'postgres', 'snowflake', 'functions'] });
    expect(service.state()).toBe('live');
    expect(service.monthlyFor('azure')).toEqual({ vm: 70.08, redis: 40.15, postgres: 12.41 });
    expect(service.quotesFor('azure')['snowflake'].status).toBe('UNESTIMATED_ENTERPRISE_LICENSE');
    // Los precios son de la nube para la que se pidieron.
    expect(service.monthlyFor('aws')).toEqual({});
  });

  it('never turns a quote without a usable price into a number', () => {
    const service = setup(false);
    post.and.returnValue(of(answer(
      { code: 'vm', status: 'LIVE', monthlyCost: 0 },
      { code: 'redis', status: 'LIVE' }, // precio por GB: no hay coste mensual
      { code: 'postgres', status: 'UNKNOWN_PRICING', monthlyCost: 99 }, // estado y precio no casan: manda el estado
      { code: 'kubernetes', status: 'LIVE', monthlyCost: 73, currency: 'EUR' },
      { code: 'x', status: 'INVENTADO' as PriceQuote.StatusEnum, monthlyCost: 5 },
      null as unknown as PriceQuote,
    )));
    service.refresh('azure', ['vm']);
    expect(service.monthlyFor('azure')).toEqual({});
    expect(Object.keys(service.quotesFor('azure')).sort()).toEqual(['kubernetes', 'postgres', 'redis', 'vm']);
  });

  it('sends only catalog codes, never anything else the canvas may carry', () => {
    const service = setup(false);
    post.and.returnValue(of(answer()));
    service.refresh('aws', ['vm', "x' or 1 eq 1", 'https://example.com', '']);
    expect(post).toHaveBeenCalledOnceWith({ cloudProvider: 'aws', services: ['vm'] });
    post.calls.reset();
    service.refresh('aws', ['', 'a b']);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps the previous prices and says so when the backend does not answer', () => {
    const service = setup(false);
    post.and.returnValue(of(answer(D2S)));
    service.refresh('azure', ['vm']);
    post.and.returnValue(throwError(() => new Error('503')));
    service.refresh('azure', ['vm', 'redis']);
    expect(service.state()).toBe('unavailable');
    expect(service.monthlyFor('azure')).toEqual({ vm: 70.08 });
  });

  it('ignores an answer that arrives after a newer request', () => {
    const service = setup(false);
    const first = new Subject<PricingResponse>();
    const second = new Subject<PricingResponse>();
    post.and.returnValues(first, second);
    service.refresh('azure', ['vm']);
    service.refresh('azure', ['redis']);
    expect(service.state()).toBe('loading');

    second.next(answer({ code: 'redis', status: 'LIVE', monthlyCost: 40, currency: 'USD' }));
    first.next(answer({ ...D2S, monthlyCost: 1 }));
    expect(service.monthlyFor('azure')).toEqual({ redis: 40 });
    expect(service.state()).toBe('live');
  });
});

describe('estimateCost with real list prices', () => {
  const vm = { ...CLOUD_NODES[0], id: 'vm-1', type: 'vm', service: { aws: 'EC2', gcp: 'Compute Engine', azure: 'Virtual Machines' } };
  const stream = { ...CLOUD_NODES[0], id: 'events', type: 'event-stream', service: 'Event Hubs' };

  it('uses the real price instead of the rough figure and marks it', () => {
    const rough = estimateCost([vm], 'azure');
    const real = estimateCost([vm], 'azure', {}, { vm: 70.08 });
    expect(rough.liveUsd).toBe(0);
    expect(rough.categories[0].items[0].live).toBeUndefined();
    expect(real.total).toBe(70.08);
    expect(real.liveUsd).toBe(70.08);
    expect(real.categories[0].items[0]).toEqual({ nodeId: 'vm-1', type: 'vm', name: 'Virtual Machines', usd: 70.08, live: true });
    // Manda también sobre el coste servido por el catálogo del backend.
    expect(estimateCost([vm], 'azure', { vm: { azure: 500 } }, { vm: 70.08 }).total).toBe(70.08);
  });

  it('counts each instance and separates what is real from what is rough', () => {
    const estimate = estimateCost([...CLOUD_NODES, vm, { ...vm, id: 'vm-2' }], 'azure', {}, { vm: 70.08 });
    expect(estimate.liveUsd).toBeCloseTo(140.16, 2);
    expect(estimate.total).toBeCloseTo(estimateCost(CLOUD_NODES, 'azure').total + 140.16, 2);
  });

  it('prices a service that had no rough figure, so it stops being unestimated', () => {
    expect(estimateCost([stream], 'azure').unestimated.map((item) => item.nodeId)).toEqual(['events']);
    const real = estimateCost([stream], 'azure', {}, { 'event-stream': 21.9 });
    expect(real.unestimated).toEqual([]);
    expect(real.categories.map((category) => [category.id, category.usd])).toEqual([['messaging', 21.9]]);
  });
});
