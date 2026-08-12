/**
 * Bearer-token authentication for the remote (HTTP/SSE) MCP transport.
 *
 * A remote endpoint that can reach a private Elasticsearch cluster holding
 * banking telemetry must never be exposed unauthenticated. This module resolves
 * the expected token from the environment (fail-closed) and verifies incoming
 * `Authorization: Bearer <token>` headers in constant time.
 *
 * @module
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** Resolved authentication policy for the HTTP transport. */
export interface AuthPolicy {
  /** Whether requests must present a valid bearer token. */
  required: boolean;
  /** The expected token when {@link required} is true; empty otherwise. */
  token: string;
}

/**
 * Resolve the auth policy from environment variables.
 *
 * - `MCP_AUTH_TOKEN` set → authentication is required with that token.
 * - `MCP_ALLOW_ANONYMOUS=true` → authentication is explicitly disabled
 *   (intended for local development only).
 * - Neither set → throws. The server refuses to start rather than silently
 *   exposing banking data to unauthenticated callers.
 *
 * @throws {Error} If no token is configured and anonymous access was not
 *   explicitly enabled.
 */
export function resolveAuthPolicy(env: NodeJS.ProcessEnv = process.env): AuthPolicy {
  const token = env.MCP_AUTH_TOKEN?.trim();
  const allowAnonymous = env.MCP_ALLOW_ANONYMOUS === 'true';

  if (token) {
    return { required: true, token };
  }

  if (allowAnonymous) {
    return { required: false, token: '' };
  }

  throw new Error(
    'Refusing to start the HTTP MCP endpoint without authentication. ' +
      'Set MCP_AUTH_TOKEN to a strong secret, or set MCP_ALLOW_ANONYMOUS=true ' +
      'to explicitly allow anonymous access (development only).',
  );
}

/**
 * Extract the token from an `Authorization` header value.
 *
 * @param header - Raw header value, e.g. `"Bearer abc123"`. Case-insensitive scheme.
 * @returns The token portion, or `undefined` if the header is missing or malformed.
 */
export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
}

/**
 * Constant-time comparison of a presented token against the expected token.
 *
 * Both sides are SHA-256 hashed to a fixed 32-byte length before comparison, so
 * neither the token length nor its content leaks through timing.
 *
 * @param presented - The token supplied by the caller (may be undefined).
 * @param expected - The configured expected token.
 */
export function tokensMatch(presented: string | undefined, expected: string): boolean {
  if (!presented || !expected) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Authorize a request under a policy.
 *
 * @param policy - The resolved {@link AuthPolicy}.
 * @param authorizationHeader - The request's `Authorization` header value.
 * @returns `true` if the request may proceed.
 */
export function isAuthorized(policy: AuthPolicy, authorizationHeader: string | undefined): boolean {
  if (!policy.required) return true;
  return tokensMatch(extractBearerToken(authorizationHeader), policy.token);
}
