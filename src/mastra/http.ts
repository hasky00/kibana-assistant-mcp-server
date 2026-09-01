/**
 * Remote MCP endpoint over HTTP.
 *
 * Exposes the Kibana banking MCP server to networked agents using two transports:
 *
 *   - **Streamable HTTP** (modern, recommended) at `MCP_HTTP_PATH` (default `/mcp`).
 *   - **HTTP + SSE** (legacy client compatibility) at `MCP_SSE_PATH` (default `/sse`)
 *     with client messages POSTed to `MCP_MESSAGE_PATH` (default `/message`).
 *
 * Every MCP request is gated by bearer-token authentication (see {@link ../lib/httpAuth}).
 * A liveness endpoint at `/healthz` is intentionally unauthenticated so load balancers
 * and orchestrators can probe it.
 *
 * @module
 */
import 'dotenv/config';
import http from 'node:http';
import { createServer } from './server';
import { resolveAuthPolicy, isAuthorized, type AuthPolicy } from '../lib/httpAuth';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const HTTP_PATH = process.env.MCP_HTTP_PATH || '/mcp';
const SSE_PATH = process.env.MCP_SSE_PATH || '/sse';
const MESSAGE_PATH = process.env.MCP_MESSAGE_PATH || '/message';

function log(message: string, extra: Record<string, unknown> = {}): void {
  process.stderr.write(
    JSON.stringify({ ts: new Date().toISOString(), component: 'mcp-http', message, ...extra }) + '\n',
  );
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function unauthorized(res: http.ServerResponse): void {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer realm="kibana-banking-mcp"',
  });
  res.end(JSON.stringify({ error: 'unauthorized', message: 'Valid bearer token required.' }));
}

async function main(): Promise<void> {
  // Fail closed: refuse to start unauthenticated unless explicitly allowed.
  const policy: AuthPolicy = resolveAuthPolicy();
  const server = createServer();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const path = url.pathname;

    try {
      // Unauthenticated liveness probe.
      if (path === '/healthz' || path === '/') {
        send(res, 200, { status: 'ok', transports: { http: HTTP_PATH, sse: SSE_PATH } });
        return;
      }

      const isMcpRoute = path === HTTP_PATH || path === SSE_PATH || path === MESSAGE_PATH;
      if (!isMcpRoute) {
        send(res, 404, { error: 'not_found' });
        return;
      }

      if (!isAuthorized(policy, req.headers.authorization)) {
        unauthorized(res);
        return;
      }

      if (path === HTTP_PATH) {
        await server.startHTTP({ url, httpPath: HTTP_PATH, req, res });
        return;
      }

      // SSE establishment (GET) and client messages (POST) share startSSE.
      await server.startSSE({ url, ssePath: SSE_PATH, messagePath: MESSAGE_PATH, req, res });
    } catch (error) {
      log('request handler error', { path, error: String(error) });
      if (!res.headersSent) send(res, 500, { error: 'internal_error' });
      else res.end();
    }
  });

  httpServer.listen(PORT, HOST, () => {
    log('listening', {
      host: HOST,
      port: PORT,
      httpPath: HTTP_PATH,
      ssePath: SSE_PATH,
      messagePath: MESSAGE_PATH,
      authRequired: policy.required,
    });
    if (!policy.required) {
      log('WARNING: anonymous access enabled (MCP_ALLOW_ANONYMOUS=true). Do not use in production.');
    }
  });

  const shutdown = (signal: string) => {
    log('shutting down', { signal });
    httpServer.close(() => {
      server
        .close()
        .catch((error) => log('error during server.close', { error: String(error) }))
        .finally(() => process.exit(0));
    });
    // Force-exit if graceful close stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  process.stderr.write(`Error starting HTTP MCP server: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
