import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// App settings (data/settings.json — git-ignored, stays on this machine).
const FILE = path.join(DATA_DIR, 'settings.json');

export const SETTINGS_DEFAULTS = {
  theme: 'system',                 // system | light | dark
  sidebarCollapsed: false,
  // provider: 'claude-code' = your Claude account via the local Claude Code CLI (no API key);
  //           'api' = Anthropic API key.
  claude: { provider: 'claude-code', codeModel: '', codePath: '', apiKey: '', model: 'claude-opus-5', effort: 'medium' },
  export: { type: 'png', scale: 1 },
};

export async function getSettings() {
  try {
    const s = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return { ...SETTINGS_DEFAULTS, ...s, claude: { ...SETTINGS_DEFAULTS.claude, ...s.claude }, export: { ...SETTINGS_DEFAULTS.export, ...s.export } };
  } catch {
    return structuredClone(SETTINGS_DEFAULTS);
  }
}

/** Settings safe to send to the browser: the API key is never echoed back, only whether one is set. */
export function publicSettings(s) {
  const { apiKey, ...claude } = s.claude;
  return { ...s, claude: { ...claude, hasApiKey: !!apiKey || !!process.env.ANTHROPIC_API_KEY, keySource: apiKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'environment' : null } };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch, claude: { ...cur.claude, ...(patch.claude ?? {}) }, export: { ...cur.export, ...(patch.export ?? {}) } };
  if (patch.claude && patch.claude.apiKey === undefined) next.claude.apiKey = cur.claude.apiKey; // keep the stored key unless replaced
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2));
  return next;
}
