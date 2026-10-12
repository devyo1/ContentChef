import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-gcal-'));
process.env.CONTENT_CHEF_HOME = home;
const { postEvent, syncPlannerToGoogle, googleStatus, saveGoogleClient } = await import('../src/google-calendar.js');
const { DATA_DIR } = await import('../src/core/paths.js');

const post = (id, extra = {}) => ({ id, date: '2026-10-14', time: '08:00', platforms: ['instagram'], pillar: 'Tips', format: 'single', status: 'idea', headline: 'Grind *fresh*', brief: 'Why', caption: 'Hi', notes: '', ...extra });

test('postEvent: valid Google id, local times, status colour and reminder', () => {
  const ev = postEvent('northside', 'Northside', post('a1b2'), 'Europe/London');
  assert.match(ev.id, /^[a-v0-9]{5,1024}$/);
  assert.equal(ev.id, postEvent('northside', 'Northside', post('a1b2')).id); // stable
  assert.notEqual(ev.id, postEvent('other', 'Other', post('a1b2')).id);
  assert.equal(ev.summary, 'Grind fresh · Instagram');
  assert.deepEqual(ev.start, { dateTime: '2026-10-14T08:00:00', timeZone: 'Europe/London' });
  assert.equal(ev.end.dateTime, '2026-10-14T08:30:00');
  assert.equal(ev.reminders.overrides[0].minutes, 30);
  const done = postEvent('northside', 'Northside', post('x', { status: 'posted' }));
  assert.ok(done.summary.startsWith('✓ '));
  assert.deepEqual(done.reminders.overrides, []);
});

test('saveGoogleClient rejects things that are not OAuth client ids', async () => {
  await assert.rejects(saveGoogleClient({ id: 'hello' }));
  assert.equal((await saveGoogleClient({ id: '1-x.apps.googleusercontent.com' })).configured, true);
});

test('sync creates the calendar once, sends only changes, removes deleted posts', async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'google-calendar.json'), JSON.stringify({ client: { id: '1-x.apps.googleusercontent.com' }, tokens: { refresh_token: 'r', access_token: 'a', expires: Date.now() + 3600e3 } }));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method} ${String(url).replace('https://www.googleapis.com/calendar/v3', '')}`);
    if (init.method === 'POST' && String(url).endsWith('/calendars')) return new Response(JSON.stringify({ id: 'cal1' }), { status: 200 });
    if (init.method === 'PUT') return new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  try {
    const plan = { posts: [post('p1'), post('p2', { date: null }), post('p3', { time: '17:00' })] };
    let r = await syncPlannerToGoogle('northside', plan, 'Northside');
    assert.deepEqual(r, { events: 2, changed: 2 });
    assert.equal(calls.filter((c) => c === 'POST /calendars').length, 1);
    assert.equal(calls.filter((c) => c.startsWith('PUT ')).length, 2); // try update, fall back to create
    assert.equal(calls.filter((c) => c === 'POST /calendars/cal1/events').length, 2);

    calls.length = 0;
    r = await syncPlannerToGoogle('northside', plan, 'Northside');
    assert.equal(r.changed, 0);
    assert.equal(calls.length, 0); // nothing changed, nothing sent

    calls.length = 0;
    r = await syncPlannerToGoogle('northside', { posts: [post('p1', { status: 'ready' })] }, 'Northside');
    assert.equal(r.changed, 2); // p1 updated, p3 removed
    assert.equal(calls.filter((c) => c.startsWith('DELETE /calendars/cal1/events/')).length, 1);
    assert.equal(calls.filter((c) => c === 'POST /calendars').length, 0);

    const st = await googleStatus();
    assert.equal(st.connected, true);
    assert.equal(st.sync.northside.events, 1);
  } finally { globalThis.fetch = realFetch; }
});
