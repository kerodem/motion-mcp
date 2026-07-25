#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is reserved for the MCP protocol.
  process.stderr.write("motion-mcp server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`motion-mcp fatal error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
