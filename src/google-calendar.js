// Google Calendar sync for the Planner. Signs in with Google (OAuth, PKCE, loopback redirect) and keeps
// a dedicated "Content Chef" calendar in step with each brand's planned posts. The scope only lets the
// app touch calendars it created itself, never the user's other calendars. Tokens stay in a local file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DATA_DIR } from './core/paths.js';
import { validOAuthState } from './higgsfield.js';

const FILE = path.join(DATA_DIR, 'google-calendar.json');
const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_NAME = 'Content Chef';
// Google Calendar event colours by post status (idea grey, draft yellow, ready green, posted blue).
const STATUS_COLOUR = { idea: '8', draft: '5', ready: '10', posted: '9' };
const STATUS_LABEL = { idea: 'Idea', draft: 'Draft', ready: 'Ready to post', posted: 'Posted' };

let pending = null;
const timers = new Map();
const running = new Map();

const read = async () => { try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return {}; } };
async function update(patch) {
  const data = { ...await read(), ...patch };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return data;
}

/** The OAuth client: one saved in Settings, else one shipped with the app via environment variables. */
function clientOf(data) {
  if (data.client?.id) return data.client;
  const id = process.env.CONTENT_CHEF_GOOGLE_CLIENT_ID;
  return id ? { id, secret: process.env.CONTENT_CHEF_GOOGLE_CLIENT_SECRET ?? '' } : null;
}

export async function googleStatus() {
  const data = await read();
  const client = clientOf(data);
  return {
    configured: !!client,
    ownClient: !!data.client?.id,
    connected: !!data.tokens?.refresh_token,
    calendar: data.calendarId ? CALENDAR_NAME : null,
    sync: data.status ?? {},
  };
}

/** Save (or clear, with an empty id) the user's own Google OAuth client. The secret is never sent back. */
export async function saveGoogleClient({ id = '', secret = '' } = {}) {
  id = String(id).trim(); secret = String(secret).trim();
  if (id && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('That does not look like a Google OAuth client ID (it ends in .apps.googleusercontent.com).');
  await update({ client: id ? { id, secret } : undefined });
  return googleStatus();
}

export async function connectGoogle(port) {
  const client = clientOf(await read());
  if (!client) throw new Error('Add a Google OAuth client ID first (Settings → Google Calendar).');
  const verifier = randomBytes(48).toString('base64url');
  pending = { state: randomBytes(32).toString('hex'), verifier, redirect: `http://127.0.0.1:${port}/api/google/callback`, expires: Date.now() + 10 * 60_000 };
  const q = new URLSearchParams({
    client_id: client.id, redirect_uri: pending.redirect, response_type: 'code', scope: SCOPE,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    state: pending.state, access_type: 'offline', prompt: 'consent',
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(30_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || `Google sign-in failed (${res.status})`);
  return j;
}

export async function finishGoogle(query) {
  const flow = pending;
  if (!flow || Date.now() > flow.expires || !validOAuthState(flow.state, query.state)) throw new Error('Sign-in expired. Connect Google Calendar again from Content Chef.');
  pending = null;
  if (query.error || typeof query.code !== 'string') throw new Error('Google sign-in was cancelled.');
  const data = await read();
  const client = clientOf(data);
  const t = await tokenRequest({
    client_id: client.id, ...(client.secret ? { client_secret: client.secret } : {}),
    code: query.code, code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: flow.redirect,
  });
  if (!t.refresh_token) throw new Error('Google did not grant offline access. Please connect again.');
  await update({ tokens: { refresh_token: t.refresh_token, access_token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 }, synced: {}, status: {} });
  return { ok: true };
}

export async function disconnectGoogle() {
  const data = await read();
  const token = data.tokens?.refresh_token;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(15_000) }).catch(() => {});
  // Keep the user's own client ID; forget the sign-in, the calendar and what was synced.
  await update({ tokens: undefined, calendarId: undefined, synced: undefined, status: undefined });
  return googleStatus();
}

async function accessToken() {
  const data = await read();
  if (!data.tokens?.refresh_token) throw new Error('Google Calendar is not connected.');
  if (data.tokens.access_token && Date.now() < data.tokens.expires) return data.tokens.access_token;
  const client = clientOf(data);
  let t;
  try {
    t = await tokenRequest({ client_id: client.id, ...(client.secret ? { client_secret: client.secret } : {}), refresh_token: data.tokens.refresh_token, grant_type: 'refresh_token' });
  } catch (e) {
    if (/invalid_grant|expired|revoked/i.test(e.message)) {
      await update({ tokens: undefined });
      throw new Error('Google Calendar access was removed. Connect it again in Settings.');
    }
    throw e;
  }
  await update({ tokens: { ...data.tokens, access_token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 } });
  return t.access_token;
}

async function gcal(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method, headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error?.message || `Google Calendar error ${res.status}`); e.status = res.status; throw e; }
  return j;
}

async function calendarId({ fresh = false } = {}) {
  const data = await read();
  if (data.calendarId && !fresh) return data.calendarId;
  const cal = await gcal('POST', '/calendars', { summary: CALENDAR_NAME, description: 'Posts planned in Content Chef. Edit them in the Content Chef Planner; changes here are overwritten.', timeZone: localZone() });
  await update({ calendarId: cal.id, synced: {} });
  return cal.id;
}

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
// Google event ids: 5–1024 chars from a–v and 0–9. A hash of brand + post id is stable and valid.
const eventId = (brand, postId) => `cc${createHash('sha1').update(`${brand}:${postId}`).digest('hex')}`;
const plain = (s) => String(s ?? '').replace(/[*_]/g, '').replace(/\s*\|\s*/g, ' ').trim();
const addMinutes = (date, time, mins) => {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + mins);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};

/** The calendar event for one planned post. */
export function postEvent(brand, brandName, post, tz = localZone()) {
  const platforms = post.platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ');
  return {
    id: eventId(brand, post.id),
    status: 'confirmed',
    summary: `${post.status === 'posted' ? '✓ ' : ''}${plain(post.headline) || 'Untitled post'}${platforms ? ` · ${platforms}` : ''}`,
    description: [
      `${STATUS_LABEL[post.status]} · ${brandName}${post.pillar ? ` · ${post.pillar}` : ''}`,
      post.brief,
      post.caption && `Caption:\n${post.caption}`,
      'Planned in Content Chef.',
    ].filter(Boolean).join('\n\n'),
    start: { dateTime: `${post.date}T${post.time}:00`, timeZone: tz },
    end: { dateTime: addMinutes(post.date, post.time, 30), timeZone: tz },
    colorId: STATUS_COLOUR[post.status],
    reminders: { useDefault: false, overrides: post.status === 'posted' ? [] : [{ method: 'popup', minutes: 30 }] },
    extendedProperties: { private: { ccBrand: brand, ccPost: post.id } },
  };
}

const hashOf = (ev) => createHash('sha1').update(JSON.stringify(ev)).digest('hex').slice(0, 16);

/**
 * Bring the Content Chef calendar in line with a brand's planner: create / update changed posts and
 * remove posts that were deleted or unscheduled. `force` re-sends everything (e.g. "Sync now").
 */
export async function syncPlannerToGoogle(brand, planner, brandName, { force = false } = {}) {
  const cal = await calendarId();
  const data = await read();
  const prev = force ? {} : (data.synced?.[brand] ?? {});
  const known = data.synced?.[brand] ?? {};
  const want = new Map(planner.posts.filter((p) => p.date).map((p) => { const ev = postEvent(brand, brandName, p); return [ev.id, ev]; }));
  const next = {};
  let changed = 0;

  const put = async (ev) => {
    try { await gcal('PUT', `/calendars/${encodeURIComponent(cal)}/events/${ev.id}`, ev); }
    catch (e) { if (e.status === 404) await gcal('POST', `/calendars/${encodeURIComponent(cal)}/events`, ev); else throw e; }
  };
  for (const [id, ev] of want) {
    const h = hashOf(ev);
    if (prev[id] !== h) {
      try { await put(ev); }
      catch (e) {
        // The calendar itself was deleted in Google: make a fresh one and send everything again.
        if (e.status !== 404 && e.status !== 410) throw e;
        await calendarId({ fresh: true });
        return syncPlannerToGoogle(brand, planner, brandName, { force: true });
      }
      changed++;
    }
    next[id] = h;
  }
  for (const id of Object.keys(known)) {
    if (want.has(id)) continue;
    await gcal('DELETE', `/calendars/${encodeURIComponent(cal)}/events/${id}`).catch((e) => { if (![404, 410].includes(e.status)) throw e; });
    changed++;
  }
  const cur = await read();
  await update({ synced: { ...cur.synced, [brand]: next }, status: { ...cur.status, [brand]: { at: Date.now(), events: want.size, error: null } } });
  return { events: want.size, changed };
}

/** Run a sync now, recording any error in the status instead of throwing (for background syncs). */
export async function syncBrand(brand, load, opts) {
  if (running.has(brand)) return running.get(brand);
  const job = (async () => {
    try { const { planner, name } = await load(); return await syncPlannerToGoogle(brand, planner, name, opts); }
    catch (e) {
      const cur = await read();
      await update({ status: { ...cur.status, [brand]: { ...(cur.status?.[brand] ?? {}), at: Date.now(), error: e.message } } });
      throw e;
    } finally { running.delete(brand); }
  })();
  running.set(brand, job);
  return job;
}

/** Debounced background sync after a planner change, only when Google Calendar is connected. */
export function scheduleGoogleSync(brand, load, onDone) {
  clearTimeout(timers.get(brand));
  timers.set(brand, setTimeout(async () => {
    timers.delete(brand);
    if (!(await read()).tokens?.refresh_token) return;
    await syncBrand(brand, load).catch(() => {});
    onDone?.();
  }, 2500));
}
