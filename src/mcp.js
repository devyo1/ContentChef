#!/usr/bin/env node
// MCP server: exposes the ad generator's tools (src/tools.js) to Claude desktop, Claude Code,
// ChatGPT or any MCP-capable client over stdio. Never write to stdout here except via the transport.
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, INSTRUCTIONS, runTool, setActor } from './tools.js';
import { closeBrowser, ensureWorkspace, logActivity, clientLabel, ROOT } from './core/index.js';

ensureWorkspace();

const server = new McpServer({ name: 'content-chef', version: '0.4.0' }, { instructions: INSTRUCTIONS });

// Which AI is connected ("Claude", "ChatGPT"…), from the client's MCP handshake. The in-app chat
// sets CONTENT_CHEF_ACTOR so its actions are labelled as coming from the chat panel.
const actor = () => process.env.CONTENT_CHEF_ACTOR || clientLabel(server.server.getClientVersion()?.name);

/** One line for the activity feed describing a call, e.g. 'headline "Fresh beans" · 3 templates · canvas'. */
function describe(name, a = {}) {
  const bits = [];
  const c = a.content ?? a.shared ?? {};
  if (c.headline) bits.push(`"${String(c.headline).replace(/[*_|]/g, '').slice(0, 48)}"`);
  if (a.variants?.length) bits.push(`${a.variants.length + 1} versions`);
  if (a.rows?.length) bits.push(`${a.rows.length} ads`);
  if (a.templates?.length) bits.push(a.templates.length > 1 ? `${a.templates.length} templates` : a.templates[0]);
  if (a.template) bits.push(a.template);
  if (a.palettes?.length) bits.push(a.palettes.length > 1 ? `${a.palettes.length} colourways` : a.palettes[0]);
  if (a.format) bits.push(a.format);
  if (a.view) bits.push(`${a.view} view`);
  if (a.brand && typeof a.brand === 'string') bits.push(a.brand);
  return bits.join(' · ');
}

for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.schema }, async (args) => {
    const id = randomUUID();
    const who = actor();
    setActor(who);
    await logActivity({ id, who, tool: t.name, detail: describe(t.name, args), status: 'running' });
    const res = await runTool(t.name, args);
    const first = res.content?.find((c) => c.type === 'text')?.text ?? '';
    await logActivity({ id, status: res.isError ? 'error' : 'done', doneAt: Date.now(), ...(res.isError ? { error: first.slice(0, 200) } : {}) });
    return res;
  });
}

const shutdown = async () => { await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);

await server.connect(new StdioServerTransport());
console.error(`content-chef MCP server ready: ${TOOLS.length} tools (root: ${ROOT})`);
