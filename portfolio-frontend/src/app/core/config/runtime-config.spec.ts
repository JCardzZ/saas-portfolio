import { environment } from '../../../environments/environment';
import {
  loadRuntimeConfig, normalizeApiBaseUrl, parseRuntimeConfig, resetRuntimeConfig, runtimeConfig,
} from './runtime-config';

function respond(body: unknown, ok = true): typeof fetch {
  return () => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe('runtimeConfig', () => {
  afterEach(() => resetRuntimeConfig());

  it('starts with the compiled values', () => {
    expect(runtimeConfig.apiBaseUrl).toBe(environment.apiBaseUrl);
    expect(runtimeConfig.mockMode).toBe(environment.mockMode);
  });

  it('takes the API address from config.json, without a trailing slash', async () => {
    await loadRuntimeConfig(respond({ apiBaseUrl: 'https://api.example.dev/v1/' }));

    expect(runtimeConfig.apiBaseUrl).toBe('https://api.example.dev/v1');
  });

  it('asks for the file without using the cache', async () => {
    const fetcher = jasmine.createSpy('fetch').and.callFake(respond({}));

    await loadRuntimeConfig(fetcher);

    expect(fetcher).toHaveBeenCalledOnceWith('config.json', jasmine.objectContaining({ cache: 'no-store' }));
  });

  it('keeps the compiled values when the file is missing', async () => {
    await loadRuntimeConfig(respond({ apiBaseUrl: 'https://other.example.dev' }, false));

    expect(runtimeConfig.apiBaseUrl).toBe(environment.apiBaseUrl);
  });

  it('keeps the compiled values when the answer is not JSON', async () => {
    const html: typeof fetch = () =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <')) } as Response);

    await loadRuntimeConfig(html);

    expect(runtimeConfig.apiBaseUrl).toBe(environment.apiBaseUrl);
  });

  it('keeps the compiled values when the request fails', async () => {
    await loadRuntimeConfig(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(runtimeConfig.apiBaseUrl).toBe(environment.apiBaseUrl);
  });

  it('stops waiting for a file that does not arrive', async () => {
    const never: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));

    await loadRuntimeConfig(never, 10);

    expect(runtimeConfig.apiBaseUrl).toBe(environment.apiBaseUrl);
  });

  it('cannot be switched to demo mode from the file', () => {
    expect(parseRuntimeConfig({ mockMode: true, apiBaseUrl: 'https://api.example.dev' }))
      .toEqual({ apiBaseUrl: 'https://api.example.dev' });
  });

  it('ignores anything that is not an object with a valid address', () => {
    expect(parseRuntimeConfig(null)).toEqual({});
    expect(parseRuntimeConfig('https://api.example.dev')).toEqual({});
    expect(parseRuntimeConfig({ apiBaseUrl: 42 })).toEqual({});
  });
});

describe('normalizeApiBaseUrl', () => {
  it('accepts http(s) addresses and paths from the root', () => {
    expect(normalizeApiBaseUrl('https://api.example.dev/v1')).toBe('https://api.example.dev/v1');
    expect(normalizeApiBaseUrl('http://localhost:8080/v1/')).toBe('http://localhost:8080/v1');
    expect(normalizeApiBaseUrl('/v1')).toBe('/v1');
  });

  it('rejects other schemes, credentials, queries and protocol-relative addresses', () => {
    for (const value of [
      'javascript:alert(1)', 'data:text/plain,x', 'ftp://example.dev', '//evil.example/v1',
      'https://user:pass@example.dev', 'https://example.dev/v1?x=1', 'api.example.dev', '',
    ]) {
      expect(normalizeApiBaseUrl(value)).withContext(value).toBeNull();
    }
  });
});
