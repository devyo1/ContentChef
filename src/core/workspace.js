import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// The "workspace" is whatever is open in the editor right now: brand + design + what's in focus.
// The web editor writes it as you work; Claude (via MCP or the in-app chat) reads and edits it,
// and the server pushes changes back to open editors — so you and Claude work on the same thing.
export const WORKSPACE_FILE = path.join(DATA_DIR, 'workspace.json');

export async function getWorkspace() {
  try { return JSON.parse(await fs.readFile(WORKSPACE_FILE, 'utf8')); } catch { return null; }
}

/**
 * Replace the workspace. `source` identifies the writer ('assistant' or an editor tab id); `actor`
 * names an AI writer for the UI ("Claude", "ChatGPT"); `view` asks open editors to switch to
 * 'focus' or 'canvas' (a one-off instruction, not a setting).
 */
export async function setWorkspace({ brand, design, focus, source = 'unknown', actor, view }) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const ws = { brand, design, focus: focus ?? {}, source, ...(actor ? { actor } : {}), ...(view ? { view } : {}), updatedAt: Date.now() };
  const tmp = `${WORKSPACE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ws, null, 2));
  await fs.rename(tmp, WORKSPACE_FILE); // atomic, so watchers never read half a file
  return ws;
}
