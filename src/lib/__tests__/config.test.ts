import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config';

/**
 * These tests mutate process.env, so snapshot and restore the relevant keys
 * around each case to keep them isolated.
 */
const KEYS = ['KIBANA_URL', 'KIBANA_API_KEY', 'ELASTICSEARCH_URL'] as const;

describe('loadConfig — Elasticsearch URL resolution', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.KIBANA_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('derives the ES URL from an Elastic Cloud Kibana URL (.kb. -> .es.)', () => {
    process.env.KIBANA_URL = 'https://bankstr.kb.us-east-1.aws.found.io';
    expect(loadConfig().elasticsearchUrl).toBe('https://bankstr.es.us-east-1.aws.found.io');
  });

  it('prefers an explicit ELASTICSEARCH_URL for self-hosted / custom domains', () => {
    process.env.KIBANA_URL = 'https://kibana.bankstr.xyz';
    process.env.ELASTICSEARCH_URL = 'https://es.bankstr.xyz:9200';
    expect(loadConfig().elasticsearchUrl).toBe('https://es.bankstr.xyz:9200');
  });

  it('falls back to the Kibana URL when a custom domain has no ".kb." and no override', () => {
    process.env.KIBANA_URL = 'https://kibana.bankstr.xyz';
    expect(loadConfig().elasticsearchUrl).toBe('https://kibana.bankstr.xyz');
  });

  it('ignores a blank ELASTICSEARCH_URL and derives instead', () => {
    process.env.KIBANA_URL = 'https://bankstr.kb.us-east-1.aws.found.io';
    process.env.ELASTICSEARCH_URL = '   ';
    expect(loadConfig().elasticsearchUrl).toBe('https://bankstr.es.us-east-1.aws.found.io');
  });

  it('throws when a required variable is missing', () => {
    delete process.env.KIBANA_API_KEY;
    process.env.KIBANA_URL = 'https://kibana.bankstr.xyz';
    expect(() => loadConfig()).toThrow(/KIBANA_API_KEY/);
  });
});
