# Deploying the remote MCP endpoint

This guide takes the HTTP transport (`dist/http.mjs`, packaged by the [`Dockerfile`](../Dockerfile))
to a **public URL** so networked agents — e.g. [erna-assistant](https://github.com/hasky00/erna-assistant)
via OpenAI's hosted MCP tool — can reach it.

> **Why public?** OpenAI's Responses API connects to your `server_url` **from OpenAI's servers**,
> not from the agent's process. A `localhost` URL will not work for the hosted-MCP path — the
> endpoint must be reachable from the public internet (protected by `MCP_AUTH_TOKEN`).

> **Security posture.** The container reaches your Elasticsearch and holds `KIBANA_API_KEY`.
> Deploy it **inside your own infrastructure / network boundary** whenever possible, expose only
> the authenticated `/mcp` route, and always set a strong `MCP_AUTH_TOKEN`. Never commit secrets —
> every recipe below injects them as platform secrets.

## Required configuration

| Variable            | Required | Notes                                                            |
| ------------------- | -------- | ---------------------------------------------------------------- |
| `KIBANA_URL`        | yes      | e.g. `https://kibana.bankstr.xyz`                                |
| `ELASTICSEARCH_URL` | self-hosted | Only when ES is on a different host/port than Kibana          |
| `KIBANA_API_KEY`    | yes      | Base64 API key                                                   |
| `MCP_AUTH_TOKEN`    | yes      | `openssl rand -hex 32` — hand this to your agents                |

---

## Option A — Fly.io

Uses [`fly.toml`](../fly.toml). One machine stays warm so streaming sessions aren't dropped.

```bash
fly launch --no-deploy --copy-config --name bankstr-mcp   # reuses fly.toml
fly secrets set \
  KIBANA_URL=https://kibana.bankstr.xyz \
  ELASTICSEARCH_URL=https://es.bankstr.xyz:9200 \
  KIBANA_API_KEY=xxxxxxxx \
  MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
fly deploy
```

Endpoint: `https://bankstr-mcp.fly.dev/mcp`

## Option B — Render

Uses [`render.yaml`](../render.yaml). In the dashboard: **New + → Blueprint → pick this repo**,
then fill in the four secret env vars when prompted. Use the **starter** plan (the free plan sleeps
and would drop MCP sessions).

Endpoint: `https://<service>.onrender.com/mcp`

## Option C — Any container host (Cloud Run, ECS, Kubernetes, a VM)

The image is a standard non-root `node:22-alpine` container listening on `$PORT` (default 3000)
with a health check at `/healthz`.

```bash
docker build -t kibana-banking-mcp .
docker run -d -p 3000:3000 \
  -e KIBANA_URL=https://kibana.bankstr.xyz \
  -e ELASTICSEARCH_URL=https://es.bankstr.xyz:9200 \
  -e KIBANA_API_KEY=xxxxxxxx \
  -e MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
  kibana-banking-mcp
```

Put it behind your own TLS-terminating load balancer / ingress and map a public hostname
(e.g. `mcp.bankstr.xyz`) to it. Point `/healthz` at your platform's health check.

---

## Verify the public endpoint

Replace `$BASE` and `$TOKEN` with your deployed URL and `MCP_AUTH_TOKEN`.

```bash
BASE=https://bankstr-mcp.fly.dev
TOKEN=<your MCP_AUTH_TOKEN>

# 1. Liveness (no auth) — expect {"status":"ok",...}
curl -s "$BASE/healthz"

# 2. Auth is enforced — expect HTTP 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}'

# 3. Authenticated initialize — expect an MCP result + an mcp-session-id header
curl -s -D - -X POST "$BASE/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}'
```

## Point an agent at it

**erna-assistant** — set these and the `query_banking_telemetry` tool activates automatically:

```bash
KIBANA_MCP_URL=https://bankstr-mcp.fly.dev/mcp
KIBANA_MCP_TOKEN=<your MCP_AUTH_TOKEN>
```

**Any MCP client** (streamable HTTP):

```jsonc
{
  "mcpServers": {
    "kibana": {
      "url": "https://bankstr-mcp.fly.dev/mcp",
      "headers": { "Authorization": "Bearer <your MCP_AUTH_TOKEN>" }
    }
  }
}
```
