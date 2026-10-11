import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// App settings (data/settings.json — git-ignored, stays on this machine).
const FILE = path.join(DATA_DIR, 'settings.json');

export const SETTINGS_DEFAULTS = {
  theme: 'system',                 // system | light | dark
  sidebarCollapsed: false,
  assistant: { provider: 'codex' }, // codex | claude-code | api (Anthropic)
  codex: { codePath: '', model: '' },
  images: { provider: 'auto', model: 'gpt_image_2_5' },
  // provider: 'claude-code' = your Claude account via the local Claude Code CLI (no API key);
  //           'api' = Anthropic API key.
  claude: { provider: 'claude-code', codeModel: '', codePath: '', apiKey: '', model: 'claude-opus-5', effort: 'medium' },
  export: { type: 'png', scale: 1 },
};

export async function getSettings() {
  try {
    const s = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return normalizeSettings(s);
  } catch {
    return structuredClone(SETTINGS_DEFAULTS);
  }
}

/** Preserve the selected Claude connection when opening settings from older versions. */
export function normalizeSettings(s = {}) {
  const provider = s.assistant?.provider ?? (s.claude ? s.claude.provider ?? 'claude-code' : 'codex');
  return {
    ...SETTINGS_DEFAULTS, ...s,
    assistant: { provider },
    codex: { ...SETTINGS_DEFAULTS.codex, ...s.codex },
    images: { ...SETTINGS_DEFAULTS.images, ...s.images },
    claude: { ...SETTINGS_DEFAULTS.claude, ...s.claude },
    export: { ...SETTINGS_DEFAULTS.export, ...s.export },
  };
}

/** Settings safe to send to the browser: the API key is never echoed back, only whether one is set. */
export function publicSettings(s) {
  const { apiKey, ...claude } = s.claude;
  return { ...s, claude: { ...claude, hasApiKey: !!apiKey || !!process.env.ANTHROPIC_API_KEY, keySource: apiKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'environment' : null } };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = normalizeSettings({ ...cur, ...patch,
    assistant: { ...cur.assistant, ...patch.assistant },
    codex: { ...cur.codex, ...patch.codex },
    images: { ...cur.images, ...patch.images },
    claude: { ...cur.claude, ...patch.claude }, export: { ...cur.export, ...patch.export },
  });
  if (!['codex', 'claude-code', 'api'].includes(next.assistant.provider)) throw new Error('Unknown assistant provider');
  if (!['auto', 'chatgpt', 'higgsfield'].includes(next.images.provider)) throw new Error('Unknown image provider');
  if (typeof next.images.model !== 'string' || next.images.model.length > 120) throw new Error('Invalid image model');
  for (const key of ['codePath', 'model']) {
    if (typeof next.codex[key] !== 'string') throw new Error(`Codex ${key} must be text`);
    next.codex[key] = next.codex[key].trim();
  }
  if (patch.claude && patch.claude.apiKey === undefined) next.claude.apiKey = cur.claude.apiKey; // keep the stored key unless replaced
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2));
  return next;
}
