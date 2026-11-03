import { APP_PIECES } from './app-catalog.data';
import { attributionsFor, logoFor } from './app-brands';

describe('application studio brands', () => {
  it('recognises a technology by what the piece says, also with a version', () => {
    expect(logoFor('PostgreSQL 16', 'aws')?.title).toBe('PostgreSQL');
    expect(logoFor('Next.js', 'aws')?.title).toBe('Next.js');
    expect(logoFor('Go', 'aws')?.title).toBe('Go');
    expect(logoFor('Cargo', 'aws')).toBeNull();
  });

  it('keeps the generic symbol for what has no logo', () => {
    expect(logoFor('Cron', 'aws')).toBeNull();
    expect(logoFor('HTTP', 'gcp')).toBeNull();
  });

  it('shows the official icon of a cloud service only in a design on that cloud', () => {
    expect(logoFor('SQS', 'aws')?.image).toContain('sqs.svg');
    expect(logoFor('SQS', 'gcp')).toBeNull();
    expect(logoFor('CloudFront', 'azure')).toBeNull();
  });

  it('asks for the attribution of each brand on screen, once', () => {
    const lines = attributionsFor([logoFor('Redis', 'aws'), logoFor('Redis 7', 'aws'), logoFor('Spring Boot', 'aws'), logoFor('Angular', 'aws'), null]);

    expect(lines.length).toBe(2);
    expect(lines.join(' ')).toContain('Redis is a registered trademark');
    expect(lines.join(' ')).toContain('Spring is a trademark');
  });

  it('never leaves a default technology of the catalog without a name to go with its logo', () => {
    for (const piece of APP_PIECES) {
      expect(piece.tech.trim().length).withContext(piece.type).toBeGreaterThan(0);
    }
  });
});
