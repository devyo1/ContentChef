import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// A short, shared log of what connected AIs (Claude, ChatGPT, …) are doing with Content Chef's
// tools, so the editor can show it live. Written by the MCP server(s), read by the web editor.
export const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
const KEEP = 40;

let queue = Promise.resolve();

/** Add an entry, or update one with the same id (e.g. running → done). Never throws. */
export function logActivity(entry) {
  queue = queue.then(async () => {
    const list = await getActivity();
    const i = list.findIndex((e) => e.id === entry.id);
    if (i >= 0) list[i] = { ...list[i], ...entry };
    else list.push({ at: Date.now(), ...entry });
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${ACTIVITY_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(list.slice(-KEEP)));
    await fs.rename(tmp, ACTIVITY_FILE);
  }).catch(() => {});
  return queue;
}

export async function getActivity() {
  try { return JSON.parse(await fs.readFile(ACTIVITY_FILE, 'utf8')); } catch { return []; }
}

/** Friendly name for an MCP client ("claude-ai" → "Claude", "openai-mcp" → "ChatGPT"). */
export function clientLabel(name) {
  const n = String(name ?? '');
  if (/claude/i.test(n)) return 'Claude';
  if (/chatgpt|openai/i.test(n)) return 'ChatGPT';
  if (/cursor/i.test(n)) return 'Cursor';
  if (/gemini|google/i.test(n)) return 'Gemini';
  return n ? n.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'AI';
}
