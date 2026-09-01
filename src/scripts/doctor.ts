/**
 * Deployment doctor — verifies that the configured Elasticsearch/Kibana
 * deployment is reachable, that credentials authenticate, and reports what the
 * agent will be able to see (cluster health + indices).
 *
 * Run with `npm run doctor`. Reads the same configuration as the server
 * (`.env` / environment): `KIBANA_URL`, `KIBANA_API_KEY`, and the optional
 * `ELASTICSEARCH_URL` override for self-hosted / custom-domain clusters.
 *
 * The API key is never printed. Exit code is 0 when auth succeeds, 1 otherwise,
 * so the script is usable as a CI/readiness gate.
 *
 * @module
 */
import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import { loadConfig } from '../lib/config';

function line(label: string, value: string): void {
  process.stdout.write(`${label.padEnd(20)} ${value}\n`);
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const body =
        typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data)
          : String(error.response.data);
      return `HTTP ${error.response.status} — ${body.slice(0, 300)}`;
    }
    const code = error.code || 'network error';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return `${code} — host did not resolve. Check KIBANA_URL / ELASTICSEARCH_URL.`;
    }
    if (code === 'ECONNREFUSED') return `${code} — connection refused. Is the cluster reachable from here?`;
    if (code === 'ECONNABORTED') return `timeout after ${error.config?.timeout ?? '?'}ms.`;
    return code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    process.stderr.write(`✗ Configuration error: ${describeError(error)}\n`);
    process.stderr.write('  Set KIBANA_URL and KIBANA_API_KEY (copy .env.example to .env).\n');
    return 1;
  }

  line('Kibana URL', config.kibanaUrl);
  line('Elasticsearch URL', config.elasticsearchUrl);
  if (config.allowedIndexPatterns.length) {
    line('Allowed patterns', config.allowedIndexPatterns.join(', '));
  }
  process.stdout.write('\n');

  const es: AxiosInstance = axios.create({
    baseURL: config.elasticsearchUrl,
    timeout: config.requestTimeoutMs,
    headers: { Authorization: `ApiKey ${config.kibanaApiKey}` },
  });

  // 1. Authenticate.
  try {
    const { data } = await es.get('/_security/_authenticate');
    process.stdout.write('✓ Authentication OK\n');
    line('  username', String(data.username ?? '(unknown)'));
    line('  roles', Array.isArray(data.roles) ? data.roles.join(', ') || '(none)' : '(unknown)');
    line('  realm', String(data.authentication_realm?.type ?? data.authentication_type ?? '(unknown)'));
  } catch (error) {
    process.stdout.write(`✗ Authentication FAILED — ${describeError(error)}\n`);
    return 1;
  }
  process.stdout.write('\n');

  // 2. Cluster health (non-fatal — key may lack cluster:monitor privilege).
  try {
    const { data } = await es.get('/_cluster/health');
    const status = String(data.status ?? '?');
    const mark = status === 'green' ? '✓' : status === 'yellow' ? '!' : '✗';
    process.stdout.write(`${mark} Cluster health: ${status}\n`);
    line('  nodes', String(data.number_of_nodes ?? '?'));
    line('  active shards', String(data.active_shards ?? '?'));
    if (data.unassigned_shards) line('  unassigned', String(data.unassigned_shards));
  } catch (error) {
    process.stdout.write(`! Cluster health unavailable — ${describeError(error)}\n`);
    process.stdout.write('  (The API key may lack the cluster:monitor/health privilege — not fatal.)\n');
  }
  process.stdout.write('\n');

  // 3. Index discovery (what the agent can query).
  try {
    const { data } = await es.get('/_cat/indices', {
      params: { format: 'json', h: 'health,status,index,docs.count,store.size', s: 'index' },
    });
    const rows = (Array.isArray(data) ? data : []).filter(
      (r: { index?: string }) => !String(r.index ?? '').startsWith('.'),
    );
    process.stdout.write(`✓ Visible indices: ${rows.length}\n`);
    for (const r of rows.slice(0, 40)) {
      line(`  ${r.index}`, `${r['docs.count'] ?? '?'} docs, ${r['store.size'] ?? '?'} [${r.status}]`);
    }
    if (rows.length > 40) process.stdout.write(`  … and ${rows.length - 40} more\n`);
    if (rows.length === 0) {
      process.stdout.write('  (No non-system indices found — nothing for the agent to query yet.)\n');
    }
  } catch (error) {
    process.stdout.write(`! Index listing unavailable — ${describeError(error)}\n`);
  }

  process.stdout.write('\n✓ Deployment reachable and authenticated.\n');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`Unexpected error: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
