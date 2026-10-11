// In-app Claude assistant: a streaming tool-use loop over the same tools the MCP server
// exposes (src/tools.js). Tools that touch the editor write the shared workspace, and the
// web server pushes those changes to open editors, so Claude edits what you're looking at.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TOOLS, INSTRUCTIONS, runTool } from './tools.js';
import { getSettings } from './core/index.js';

const SYSTEM = `You are the assistant built into Content Chef, a tool for making on-brand social content: ads and value posts (tips, insights, lists, stats). You work alongside the user in the same editor: use get_editor to see what they see, update_editor to change it (their screen updates live), and the other tools to manage brands, colours, previews and exports.

${INSTRUCTIONS}

Style: be brief and concrete. The user sees your tool activity and the images you get back, so don't narrate every step. After changing something, say in a sentence or two what you changed and offer one useful next step. Ask before exporting large batches (more than ~60 files) or overwriting a brand's existing palettes.`;

// Tool definitions are stable and sorted for prompt caching (tools render before system).
const TOOL_DEFS = TOOLS.map((t) => {
  const { $schema, ...schema } = zodToJsonSchema(z.object(t.schema), { $refStrategy: 'none' });
  return { name: t.name, description: t.description, input_schema: schema, eager_input_streaming: true };
});
const VALIDATORS = Object.fromEntries(TOOLS.map((t) => [t.name, z.object(t.schema)]));

class MissingKeyError extends Error {
  constructor() { super('Claude needs an API key. Add one in Settings → AI assistant.'); }
}

const conversations = new Map(); // conversationId → Anthropic message history

export function resetChat(id) {
  conversations.delete(id);
}

const toApiContent = (content) => content.map((c) => (c.type === 'image'
  ? { type: 'image', source: { type: 'base64', media_type: c.mimeType, data: c.data } }
  : { type: 'text', text: c.text }));

/**
 * Run one user turn (which may involve many tool calls). `emit` receives UI events:
 * { type: 'text', delta } · { type: 'tool', id, name, input } · { type: 'tool_result', id, name, ok, summary, images }
 * { type: 'error', message } · { type: 'done' }
 */
export async function runChat({ conversationId, text, emit }) {
  const settings = await getSettings();
  // Credentials: a key saved in Settings, else whatever the SDK finds (env vars or an
  // `ant auth login` profile). Fail early with a friendly message if there's nothing at all.
  const env = process.env;
  const hasProfile = fs.existsSync(path.join(os.homedir(), '.config', 'anthropic'));
  if (!settings.claude.apiKey && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_PROFILE && !hasProfile) {
    throw new MissingKeyError();
  }
  const client = new Anthropic(settings.claude.apiKey ? { apiKey: settings.claude.apiKey } : {});
  const messages = conversations.get(conversationId) ?? [];
  conversations.set(conversationId, messages);
  messages.push({ role: 'user', content: text });

  let jsonRetries = 0;
  for (let step = 0; step < 30; step++) {
    const stream = client.beta.messages.stream({
      model: settings.claude.model || 'claude-opus-5',
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: settings.claude.effort || 'medium' },
      cache_control: { type: 'ephemeral' },
      // Server-side fallback: if a request is declined by a safety classifier, the API
      // re-runs it on a fallback model automatically instead of just stopping.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      tools: TOOL_DEFS,
      messages,
    });
    stream.on('text', (delta) => emit({ type: 'text', delta }));

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, an unparseable tool input rejects finalMessage; re-issue that turn.
      if (err instanceof Anthropic.AnthropicError || jsonRetries++ >= 2) throw err;
      continue;
    }

    messages.push({ role: 'assistant', content: message.content });
    if (message.stop_reason === 'refusal') {
      emit({ type: 'error', message: 'Claude declined that request. Try rephrasing it.' });
      break;
    }
    const calls = message.content.filter((b) => b.type === 'tool_use');
    if (!calls.length) break;
    if (message.stop_reason === 'max_tokens') {
      emit({ type: 'error', message: 'The response ran out of room mid-step. Try a smaller request.' });
      break;
    }

    // Run sequentially: several tools write the same editor workspace.
    const results = [];
    for (const call of calls) {
      emit({ type: 'tool', id: call.id, name: call.name, input: call.input });
      const parsed = VALIDATORS[call.name]?.safeParse(call.input);
      let res;
      if (!parsed?.success) {
        res = { isError: true, content: [{ type: 'text', text: `Invalid input for ${call.name}: ${parsed?.error?.message ?? 'unknown tool'}` }] };
      } else {
        res = await runTool(call.name, parsed.data);
      }
      const firstText = res.content.find((c) => c.type === 'text')?.text ?? '';
      emit({
        type: 'tool_result', id: call.id, name: call.name, ok: !res.isError,
        summary: firstText.slice(0, 280),
        images: res.content.filter((c) => c.type === 'image').map((c) => `data:${c.mimeType};base64,${c.data}`),
      });
      results.push({ type: 'tool_result', tool_use_id: call.id, content: toApiContent(res.content), ...(res.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: 'user', content: results }); // all results in one message
  }
  emit({ type: 'done' });
}

/** Friendly message for API errors, using the SDK's typed error classes. */
export function chatErrorMessage(err) {
  if (err instanceof MissingKeyError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return 'Claude needs an API key. Add one in Settings → AI assistant.';
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to that model. Pick another model in Settings.";
  if (err instanceof Anthropic.NotFoundError) return 'That model was not found. Pick another model in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.';
  if (err instanceof Anthropic.BadRequestError) return `The API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status}): ${err.message}`;
  return err?.message ?? String(err);
}
