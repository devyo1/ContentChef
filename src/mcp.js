#!/usr/bin/env node
// MCP server: exposes the ad generator's tools (src/tools.js) to Claude desktop, Claude Code
// or any MCP-capable client over stdio. Never write to stdout here except via the transport.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, INSTRUCTIONS, runTool } from './tools.js';
import { closeBrowser, ensureWorkspace, ROOT } from './core/index.js';

ensureWorkspace();

const server = new McpServer({ name: 'content-chef', version: '0.3.0' }, { instructions: INSTRUCTIONS });
for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.schema }, (args) => runTool(t.name, args));
}

const shutdown = async () => { await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);

await server.connect(new StdioServerTransport());
console.error(`content-chef MCP server ready: ${TOOLS.length} tools (root: ${ROOT})`);
