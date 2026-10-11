// Shared labels and connection state for chat, copywriting and captions.
export const assistantProvider = (settings) => settings?.assistant?.provider ?? settings?.claude?.provider ?? 'codex';
export const assistantName = (settings) => assistantProvider(settings) === 'codex' ? 'ChatGPT' : 'Claude';
export function assistantReady(settings) {
  switch (assistantProvider(settings)) {
    case 'codex': return !!settings?.codexStatus?.loggedIn;
    case 'api': return !!settings?.claude?.hasApiKey;
    default: return !!settings?.claudeCode?.loggedIn;
  }
}
export function assistantHint(settings) {
  if (assistantProvider(settings) === 'codex') return settings?.codexStatus?.installed
    ? 'Sign in with ChatGPT through Codex in Settings to chat here. No API key needed.'
    : 'Install Codex CLI, then sign in with ChatGPT in Settings.';
  if (assistantProvider(settings) === 'api') return 'Add your Anthropic API key in Settings to chat with Claude here.';
  return settings?.claudeCode?.installed
    ? 'Sign in with your Claude account in Settings to chat here.'
    : 'Install Claude Code, or choose another connection in Settings.';
}
