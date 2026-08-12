import { describe, it, expect } from 'vitest';
import {
  resolveAuthPolicy,
  extractBearerToken,
  tokensMatch,
  isAuthorized,
} from '../httpAuth';

describe('resolveAuthPolicy', () => {
  it('requires auth when MCP_AUTH_TOKEN is set', () => {
    const policy = resolveAuthPolicy({ MCP_AUTH_TOKEN: 'secret-token' } as NodeJS.ProcessEnv);
    expect(policy).toEqual({ required: true, token: 'secret-token' });
  });

  it('trims surrounding whitespace on the token', () => {
    const policy = resolveAuthPolicy({ MCP_AUTH_TOKEN: '  secret-token  ' } as NodeJS.ProcessEnv);
    expect(policy.token).toBe('secret-token');
  });

  it('allows anonymous only when explicitly opted in', () => {
    const policy = resolveAuthPolicy({ MCP_ALLOW_ANONYMOUS: 'true' } as NodeJS.ProcessEnv);
    expect(policy).toEqual({ required: false, token: '' });
  });

  it('fails closed when neither token nor anonymous flag is set', () => {
    expect(() => resolveAuthPolicy({} as NodeJS.ProcessEnv)).toThrow(/without authentication/);
  });

  it('a token takes precedence over the anonymous flag', () => {
    const policy = resolveAuthPolicy({
      MCP_AUTH_TOKEN: 'secret-token',
      MCP_ALLOW_ANONYMOUS: 'true',
    } as NodeJS.ProcessEnv);
    expect(policy.required).toBe(true);
  });
});

describe('extractBearerToken', () => {
  it('parses a well-formed header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
  });

  it('tolerates extra spacing', () => {
    expect(extractBearerToken('  Bearer    abc123  ')).toBe('abc123');
  });

  it('returns undefined for missing or malformed headers', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('')).toBeUndefined();
    expect(extractBearerToken('Basic abc123')).toBeUndefined();
    expect(extractBearerToken('abc123')).toBeUndefined();
  });
});

describe('tokensMatch', () => {
  it('matches identical tokens', () => {
    expect(tokensMatch('s3cr3t', 's3cr3t')).toBe(true);
  });

  it('rejects different tokens', () => {
    expect(tokensMatch('s3cr3t', 'other')).toBe(false);
  });

  it('rejects empty or undefined inputs', () => {
    expect(tokensMatch(undefined, 's3cr3t')).toBe(false);
    expect(tokensMatch('', 's3cr3t')).toBe(false);
    expect(tokensMatch('s3cr3t', '')).toBe(false);
  });
});

describe('isAuthorized', () => {
  const policy = { required: true, token: 's3cr3t' };

  it('allows a valid bearer token', () => {
    expect(isAuthorized(policy, 'Bearer s3cr3t')).toBe(true);
  });

  it('denies a wrong or missing token', () => {
    expect(isAuthorized(policy, 'Bearer nope')).toBe(false);
    expect(isAuthorized(policy, undefined)).toBe(false);
  });

  it('allows any request when auth is not required', () => {
    expect(isAuthorized({ required: false, token: '' }, undefined)).toBe(true);
  });
});
