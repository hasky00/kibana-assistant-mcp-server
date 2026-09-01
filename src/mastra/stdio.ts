import 'dotenv/config';
import { createServer } from './server';

const server = createServer();

server.startStdio().catch((error) => {
  process.stderr.write(`Error running MCP server: ${error}\n`);
  process.exit(1);
});
