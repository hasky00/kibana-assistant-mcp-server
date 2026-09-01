/**
 * Shared MCP server factory.
 *
 * Both transports — stdio ({@link ./stdio.ts}) and streamable HTTP / SSE
 * ({@link ./http.ts}) — construct the identical server from this factory so the
 * exposed tools, prompts, and resources never drift between deployment modes.
 *
 * @module
 */
import { MCPServer } from '@mastra/mcp';
import { allTools } from '../tools';
import { allPrompts } from '../prompts';
import { allResources } from '../resources';

/** Server name advertised to MCP clients. */
export const SERVER_NAME = 'kibana-banking-mcp-server';
/** Server version advertised to MCP clients. */
export const SERVER_VERSION = '1.0.0';

/**
 * Construct the Kibana banking MCP server with the full tool/prompt/resource set.
 *
 * @returns A configured {@link MCPServer} not yet bound to any transport.
 */
export function createServer(): MCPServer {
  return new MCPServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    tools: allTools,
    prompts: allPrompts,
    resources: allResources,
  });
}
