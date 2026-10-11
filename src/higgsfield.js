// Official Higgsfield MCP connector. OAuth credentials never leave this local data file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { DATA_DIR } from './core/paths.js';
import { fetchWebsite } from './website-scan.js';

const ENDPOINT = 'https://mcp.higgsfield.ai/mcp';
const FILE = path.join(DATA_DIR, 'higgsfield-oauth.json');
let pending, connection, connecting;
const read = async () => { try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return {}; } };
async function update(patch) {
  const data = { ...await read(), ...patch };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data), { mode: 0o600 });
}
const boundedFetch = (url, init = {}) => fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });

function oauthProvider(flow) {
  return {
    get redirectUrl() { return flow?.redirectUrl; },
    get clientMetadata() { return { client_name: 'Content Chef', redirect_uris: [flow.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; },
    state: () => flow.state,
    clientInformation: async () => (await read()).client,
    saveClientInformation: client => update({ client }),
    tokens: async () => flow?.reconnect ? undefined : (await read()).tokens,
    saveTokens: tokens => update({ tokens }),
    saveCodeVerifier: verifier => { flow.verifier = verifier; },
    codeVerifier: () => { if (!flow?.verifier) throw new Error('Sign-in expired. Connect Higgsfield again.'); return flow.verifier; },
    redirectToAuthorization: url => { if (!flow) throw new Error('Reconnect Higgsfield in Settings.'); flow.url = url.href; },
    discoveryState: async () => (await read()).discovery,
    saveDiscoveryState: discovery => update({ discovery }),
    invalidateCredentials: async scope => {
      const patch = {};
      if (['all', 'client'].includes(scope)) patch.client = undefined;
      if (['all', 'tokens'].includes(scope)) patch.tokens = undefined;
      if (['all', 'discovery'].includes(scope)) patch.discovery = undefined;
      await update(patch);
    },
  };
}

export async function connectHiggsfield(port) {
  await disconnectClient();
  pending = { state: randomBytes(32).toString('hex'), redirectUrl: `http://localhost:${port}/api/higgsfield/callback`, expires: Date.now() + 10 * 60_000, reconnect: true };
  const saved = await read();
  if (saved.redirectUrl !== pending.redirectUrl) await update({ client: undefined });
  const outcome = await auth(oauthProvider(pending), { serverUrl: ENDPOINT, fetchFn: boundedFetch });
  if (outcome !== 'REDIRECT' || !pending.url) throw new Error('Higgsfield did not start sign-in. Try again.');
  return { url: pending.url };
}

export function validOAuthState(expected, actual) {
  return typeof actual === 'string' && typeof expected === 'string' && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function finishHiggsfield(query) {
  const flow = pending;
  if (!flow || Date.now() > flow.expires || !validOAuthState(flow.state, query.state)) throw new Error('Sign-in expired or invalid. Connect Higgsfield again.');
  if (query.error || typeof query.code !== 'string') { pending = null; throw new Error('Higgsfield sign-in was not completed.'); }
  const data = await read();
  const issuer = data.discovery?.authorizationServerMetadata?.issuer;
  if (query.iss && issuer && query.iss !== issuer) throw new Error('Higgsfield returned an unexpected OAuth issuer. Please reconnect or contact Higgsfield support.');
  pending = null; // Authorization codes are one-use, including failed exchanges.
  const outcome = await auth(oauthProvider(flow), { serverUrl: ENDPOINT, authorizationCode: query.code, fetchFn: boundedFetch });
  if (outcome !== 'AUTHORIZED') throw new Error('Higgsfield sign-in did not finish. Please reconnect.');
  await update({ redirectUrl: flow.redirectUrl });
  return { ok: true };
}

async function disconnectClient() { if (connection) await connection.client.close().catch(() => {}); connection = null; }
export async function disconnectHiggsfield() { pending = null; await disconnectClient(); await fs.rm(FILE, { force: true }); return { ok: true }; }

async function getClient() {
  if (connection) return connection;
  if (!connecting) connecting = openClient().finally(() => { connecting = null; });
  return connecting;
}

async function openClient() {
  const data = await read();
  if (!data.tokens) throw new Error('Connect Higgsfield in Settings → Image generation first.');
  const provider = oauthProvider({ redirectUrl: data.redirectUrl });
  provider.redirectToAuthorization = () => { throw new Error('Higgsfield sign-in expired. Reconnect in Settings.'); };
  const client = new Client({ name: 'content-chef', version: '0.2.2' });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), { authProvider: provider, fetch: boundedFetch });
  try {
    await client.connect(transport);
    const tools = [];
    let cursor;
    do { const page = await client.listTools(cursor ? { cursor } : {}); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor && tools.length < 500);
    connection = { client, tools };
    client.onclose = () => { connection = null; };
    return connection;
  } catch { await client.close().catch(() => {}); throw new Error('Could not connect to Higgsfield. Reconnect in Settings and check your subscription.'); }
}

export function toolData(result) {
  if (result.structuredContent) return result.structuredContent;
  for (const c of result.content ?? []) if (c.type === 'text') { try { return JSON.parse(c.text); } catch { /* human-readable block */ } }
  throw new Error('Higgsfield returned an unsupported response.');
}

export async function higgsfieldTools() { return (await getClient()).tools; }

// Higgsfield's direct OAuth connector and its ChatGPT plugin expose different profiles.
// Cost preflight must never fall through to a generation without a declared get_cost flag.
export function higgsfieldOperation(tools, operation, args) {
  const find = name => tools.find(t => t.name === name || t.name === `higgsfield_${name}`);
  let tool = find(operation);
  if (tool) return { tool, args };
  if (operation === 'models_list' && (tool = find('models_explore'))) return { tool, args: { action: 'list', ...args } };
  if (operation === 'jobs_wait' && (tool = find('job_status'))) return { tool, args: { jobId: args.jobs[0].job_id, sync: true }, normalizeJob: true };
  if (operation === 'estimate_image_cost' && (tool = find('generate_image'))) {
    const schema = tool.inputSchema?.properties?.params;
    if ([schema, ...(schema?.anyOf ?? [])].some(s => s?.properties?.get_cost?.type === 'boolean')) return { tool, args: { params: { ...args.params, get_cost: true } } };
  }
  throw new Error(`This Higgsfield connection does not expose ${operation}. Update your connector.`);
}

async function call(name, args, signal) {
  const { client, tools } = await getClient();
  const operation = higgsfieldOperation(tools, name, args);
  const result = await client.callTool({ name: operation.tool.name, arguments: operation.args }, undefined, { signal, timeout: 120_000 });
  const data = toolData(result);
  if (result.isError || data.error) throw new Error(String(data.error || 'Higgsfield could not complete this request.').slice(0, 500));
  if (operation.normalizeJob) {
    const job = data.generation;
    if (!job?.status) throw new Error('Higgsfield did not return this generation’s status.');
    return { jobs: [{ ...job, job_id: job.id, result_url: job.results?.rawUrl }], all_terminal: ['completed', 'failed', 'canceled', 'nsfw', 'ip_detected'].includes(job.status), poll_after_seconds: data.poll_after_seconds };
  }
  return data;
}

export async function higgsfieldStatus({ fresh = false } = {}) {
  if (!(await read()).tokens) return { ready: false, message: 'Connect your Higgsfield account with OAuth.' };
  try {
    if (fresh) await disconnectClient();
    const { tools } = await getClient();
    const ready = tools.some(t => /^(higgsfield_)?generate_image$/.test(t.name));
    return { ready, message: ready ? 'Higgsfield connected' : 'This connection has no image generation tool.' };
  } catch (e) { return { ready: false, message: e.message }; }
}

export async function higgsfieldModels() {
  const models = []; let after;
  do {
    const page = await call('models_list', { type: 'image', limit: 100, ...(after ? { after } : {}) });
    models.push(...(page.items ?? []).filter(m => m.output_type === 'image' && m.aspect_ratios?.length && !m.medias?.some(media => media.required)
      && !m.parameters?.some(p => p.required === 'required' && p.default == null && !['prompt', 'aspect_ratio', 'count'].includes(p.name)))
      .map(m => ({ id: m.id, name: m.name, ratios: m.aspect_ratios, supportsUnlim: !!m.supports_unlim && page.unlim?.available === true })));
    after = page.next_page_token;
  } while (after && models.length < 300);
  return models;
}

export async function quoteHiggsfield(params, signal) { return call('estimate_image_cost', { params }, signal); }

export async function generateHiggsfield(params, signal, { invoke = call, fetchImage = fetchWebsite } = {}) {
  signal?.throwIfAborted();
  const preference = await invoke('get_preferences', {}, signal);
  if (preference.auto_create_project && !params.folder_id) {
    const workspaces = await invoke('list_workspaces', {}, signal);
    const workspace = workspaces.workspaces?.find(w => w.is_selected);
    if (!workspace) throw new Error('Select a Higgsfield workspace before creating a background.');
    const project = await invoke('create_project', { name: 'Content Chef background', workspace_id: workspace.id, idempotency_key: randomUUID() }, signal);
    if (!project.default_folder_id) throw new Error('Higgsfield did not return the project folder. No image was submitted.');
    params = { ...params, folder_id: project.default_folder_id };
  }
  let response;
  try { response = await invoke('generate_image', { params }, signal); }
  catch (e) { throw new Error(`${e.message} The submission may have reached Higgsfield. Check your Higgsfield library before retrying.`); }
  if (response.unlim_choice) return { choice: response.unlim_choice };
  let job = response.results?.[0];
  if (!job?.id) throw new Error('Higgsfield did not return a generation ID. Check your Higgsfield library before retrying.');
  const jobId = job.id;
  try {
    const deadline = Date.now() + 10 * 60_000;
    while (job.status !== 'completed' && Date.now() < deadline) {
      signal?.throwIfAborted();
      if (['failed', 'canceled', 'nsfw', 'ip_detected'].includes(job.status)) throw new Error(`Generation ${job.status}.`);
      const poll = await invoke('jobs_wait', { jobs: [{ index: 0, job_id: jobId }], timeout_seconds: 15 }, signal);
      job = poll.jobs?.[0];
      if (!job || (job.status === 'lookup_failed' && !job.retryable)) throw new Error('Could not read generation status.');
      if (!poll.all_terminal) await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('Stopped waiting.')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.min(15, Math.max(1, poll.poll_after_seconds ?? 2)) * 1000);
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
    const url = job.result_url || job.results?.rawUrl;
    if (job.status !== 'completed' || !url) throw new Error('The image is still processing.');
    const file = await fetchImage(url, { maxBytes: 25_000_000, signal });
    return { body: file.body, jobId };
  } catch (e) { throw new Error(`${e.message} Higgsfield job: ${jobId}. Check your Higgsfield library before starting another generation.`); }
}
