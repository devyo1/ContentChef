import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-auto-'));
process.env.CONTENT_CHEF_HOME = home;
const { isDue, PLATFORM_FORMAT, duePosts } = await import('../src/autopilot.js');
const { savePlanner, upsertPosts, getPlanner } = await import('../src/planner.js');
const { FORMATS, BRANDS_DIR, ROOT } = await import('../src/core/index.js');

const now = new Date('2026-10-12T09:00:00');
const post = (extra = {}) => ({ id: 'p', date: '2026-10-12', time: '17:00', status: 'idea', platforms: ['instagram'], ...extra });

test('every platform maps to one of its own sizes', () => {
  for (const [platform, format] of Object.entries(PLATFORM_FORMAT)) assert.equal(FORMATS[format].platform, platform);
});

test('isDue: on the day, the day before, off', () => {
  assert.equal(isDue(post(), 'on-the-day', now), true);
  assert.equal(isDue(post({ date: '2026-10-13' }), 'on-the-day', now), false);
  assert.equal(isDue(post({ date: '2026-10-13', time: '08:00' }), 'day-before', now), true); // 23h away
  assert.equal(isDue(post({ date: '2026-10-13', time: '10:00' }), 'day-before', now), false); // 25h away
  assert.equal(isDue(post(), 'off', now), false);
});

test('isDue skips posts that are made, being made, manual, unscheduled or long gone', () => {
  assert.equal(isDue(post({ assets: [{}] }), 'on-the-day', now), false);
  assert.equal(isDue(post({ auto: { state: 'making', at: now.getTime() } }), 'on-the-day', now), false);
  assert.equal(isDue(post({ status: 'draft' }), 'on-the-day', now), false); // you're working on it in the builder
  assert.equal(isDue(post({ date: null }), 'on-the-day', now), false);
  assert.equal(isDue(post({ date: '2026-10-01' }), 'on-the-day', now), false);
  // A failure is retried, but not straight away.
  assert.equal(isDue(post({ auto: { state: 'error', at: now.getTime() - 3600e3 } }), 'on-the-day', now), false);
  assert.equal(isDue(post({ auto: { state: 'error', at: now.getTime() - 7 * 3600e3 } }), 'on-the-day', now), true);
});

test('a save from a stale Planner page keeps what the autopilot made', async () => {
  await fs.cp(path.join(ROOT, 'examples/brands/northside-coffee'), path.join(BRANDS_DIR, 'northside-coffee'), { recursive: true });
  const stale = { id: 'a', date: '2026-10-12', time: '10:00', status: 'idea', headline: 'Hi' };
  await savePlanner('northside-coffee', { posts: [stale] });
  await upsertPosts('northside-coffee', { posts: [{ id: 'a', status: 'ready', assets: [{ platform: 'instagram', format: 'ig-portrait', file: 'x.png', path: '/x.png' }], auto: { state: 'done', at: Date.now() } }] });
  await savePlanner('northside-coffee', { posts: [{ ...stale, notes: 'edited' }] }); // the page didn't know yet
  const p = (await getPlanner('northside-coffee')).posts[0];
  assert.equal(p.notes, 'edited');
  assert.equal(p.status, 'ready');
  assert.equal(p.assets.length, 1);
});

test('"make the next 7 days" picks unmade ideas in range only', async () => {
  const d = (n) => { const x = new Date(Date.now() + n * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  await savePlanner('northside-coffee', { posts: [
    { id: 'in', date: d(3), status: 'idea' }, { id: 'far', date: d(20), status: 'idea' },
    { id: 'made', date: d(2), status: 'ready', assets: [{ platform: 'x', format: 'x-post', file: 'a', path: 'a' }] }, { id: 'none', date: null },
  ] });
  assert.deepEqual(await duePosts('northside-coffee', { days: 7 }), ['in']);
});
