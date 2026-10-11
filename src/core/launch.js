import path from 'node:path';
import { ROOT, HOME } from './paths.js';

/**
 * How to start Content Chef's MCP server from outside (Claude Desktop, Claude Code, the in-app
 * chat). Uses the absolute path of the current runtime so it works without Node on the PATH:
 *  - plain Node: that node binary;
 *  - desktop app: the app's own executable in Node mode (ELECTRON_RUN_AS_NODE=1).
 * CONTENT_CHEF_HOME makes the MCP server use the same brands/exports as the editor.
 */
export function mcpLaunch() {
  const script = path.join(ROOT, 'src', 'mcp.js');
  const env = { CONTENT_CHEF_HOME: HOME };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  return { command: process.execPath, args: [script], env };
}
