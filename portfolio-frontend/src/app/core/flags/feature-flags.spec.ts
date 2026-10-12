import { TestBed } from '@angular/core/testing';
import { OpenFeature } from '@openfeature/web-sdk';

import { environment } from '../../../environments/environment';
import { resetRuntimeConfig, runtimeConfig } from '../config/runtime-config';
import {
  BUILD_DEFAULTS, DEMO_FLAGS_STORAGE_KEY, FEATURE_FLAGS, PlatformFlagsProvider, demoOverrides, loadFeatureFlags, parseFlags,
  saveDemoOverride,
} from './feature-flags';
import { FlagService } from './flag.service';

function respondWith(body: unknown, ok = true): typeof fetch {
  return (() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)) as typeof fetch;
}

describe('feature flags', () => {
  const mutableConfig = runtimeConfig as { mockMode: boolean };

  beforeEach(() => {
    localStorage.removeItem(DEMO_FLAGS_STORAGE_KEY);
    resetRuntimeConfig();
  });

  afterEach(async () => {
    localStorage.removeItem(DEMO_FLAGS_STORAGE_KEY);
    resetRuntimeConfig();
    await OpenFeature.clearProviders();
  });

  it('ships every flag turned off', () => {
    expect(Object.keys(BUILD_DEFAULTS)).toEqual([...FEATURE_FLAGS]);
    expect(Object.values(BUILD_DEFAULTS).every((enabled) => enabled === false)).toBeTrue();
  });

  it('only accepts known keys with a boolean from the network', () => {
    expect(parseFlags([
      { key: 'mcp.section', enabled: true },
      { key: 'cloud.oracle', enabled: 'yes' },
      { key: 'made.up', enabled: true },
      null, 'text',
    ])).toEqual({ 'mcp.section': true });
    expect(parseFlags({ 'mcp.section': true })).toEqual({});
    expect(parseFlags(null)).toEqual({});
  });

  it('keeps demo overrides in this browser and ignores anything malformed', () => {
    saveDemoOverride('cloud.oracle', true);
    saveDemoOverride('mcp.section', false);
    expect(demoOverrides()).toEqual({ 'cloud.oracle': true, 'mcp.section': false });

    localStorage.setItem(DEMO_FLAGS_STORAGE_KEY, '{"made.up":true,"mcp.section":"on"}');
    expect(demoOverrides()).toEqual({});
    localStorage.setItem(DEMO_FLAGS_STORAGE_KEY, 'not json');
    expect(demoOverrides()).toEqual({});
  });

  it('reads the flags from the API when there is a backend', async () => {
    mutableConfig.mockMode = false;
    let requested = '';
    const fetcher = ((url: string) => {
      requested = url;
      return Promise.resolve({ ok: true, json: () => Promise.resolve([{ key: 'mcp.section', enabled: true }]) } as Response);
    }) as typeof fetch;

    await loadFeatureFlags(fetcher);
    const flags = TestBed.inject(FlagService);

    expect(requested).toBe(`${environment.apiBaseUrl}/public/features`);
    expect(flags.isEnabled('mcp.section')).toBeTrue();
    expect(flags.isEnabled('cloud.oracle')).toBeFalse();
  });

  it('leaves everything off when the API fails, answers an error or takes too long', async () => {
    mutableConfig.mockMode = false;
    const aborting = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;

    for (const fetcher of [respondWith([{ key: 'mcp.section', enabled: true }], false), (() => Promise.reject(new Error('offline'))) as typeof fetch, aborting]) {
      await loadFeatureFlags(fetcher, 5);
      expect(OpenFeature.getClient().getBooleanValue('mcp.section', false)).toBeFalse();
    }
  });

  it('never calls the API in demo mode: build defaults plus what this browser turned on', async () => {
    saveDemoOverride('studio.smart-rules', true);
    let called = false;
    const fetcher = (() => {
      called = true;
      return Promise.reject(new Error('must not be called'));
    }) as typeof fetch;

    await loadFeatureFlags(fetcher);
    const flags = TestBed.inject(FlagService);

    expect(called).toBeFalse();
    expect(flags.isEnabled('studio.smart-rules')).toBeTrue();
    expect(flags.isEnabled('mcp.section')).toBeFalse();
  });

  it('reflects a change made in this session without reloading', async () => {
    await loadFeatureFlags(respondWith([]));
    const flags = TestBed.inject(FlagService);
    expect(flags.isEnabled('cloud.oracle')).toBeFalse();

    flags.apply('cloud.oracle', true);

    expect(flags.isEnabled('cloud.oracle')).toBeTrue();
  });

  it('has everything off when no provider was registered', () => {
    const flags = TestBed.inject(FlagService);

    expect(FEATURE_FLAGS.some((key) => flags.isEnabled(key))).toBeFalse();
  });

  it('gives the caller its default for unknown keys and non-boolean questions', async () => {
    await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'mcp.section': true })));
    const client = OpenFeature.getClient();

    expect(client.getBooleanValue('mcp.section', false)).toBeTrue();
    expect(client.getBooleanValue('made.up', true)).toBeTrue();
    expect(client.getStringValue('mcp.section', 'fallback')).toBe('fallback');
    expect(client.getNumberValue('mcp.section', 7)).toBe(7);
  });
});
