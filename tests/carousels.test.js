import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'content-chef-carousel-'));
process.env.CONTENT_CHEF_HOME = home;
const { createCarousel, loadCarousel, listCarousels, saveCarouselSlide, refineCarouselSlide, exportCarousel, carouselContent } = await import('../src/carousels.js');
const { createBrand } = await import('../src/core/brands.js');
const { composeAd } = await import('../src/core/compose.js');
const brand = await createBrand({ name: 'Carousel Test' });
after(async () => { await fs.rm(home, { recursive: true, force: true }); });
const copy = (i) => ({ eyebrow: `Idea ${i}`, headline: `Story ${i}`, subhead: 'A connected point.', body: 'A useful explanation.', cta: 'Wrong early CTA' });
const input = { brand: brand.id, prompt: 'Teach readers three ways to prepare a coffee tasting.', count: 5, cta: 'Book a tasting', palette: 'default', format: 'ig-portrait' };
const create = (over = {}, options = {}) => createCarousel({ ...input, ...over }, { generate: async () => ({ title: 'A coffee story', slides: Array.from({ length: over.count ?? 5 }, (_, i) => copy(i + 1)) }), ...options });

test('carousel generation is one coherent request with exact count, brand context and final CTA', async () => {
  let request;
  const c = await create({}, { generate: async (_, req) => { request = req; return { title: 'One story', slides: Array.from({ length: 5 }, (_, i) => copy(i)) }; } });
  assert.match(request.system, /connected narrative/);
  assert.equal(JSON.parse(request.text).brand.name, brand.name);
  assert.equal(request.schema.properties.slides.minItems, 5);
  assert.equal(c.slides.length, 5);
  assert.deepEqual(c.slides.map(s => s.role), ['hook', 'story', 'story', 'story', 'cta']);
  assert.deepEqual(c.slides.map(s => s.content.cta), ['', '', '', '', 'Book a tasting']);
  assert.equal(new Set(c.slides.map(s => s.id)).size, 5);
  assert.deepEqual(await loadCarousel(c.id), c);
  assert.ok((await listCarousels(brand.id)).some(item => item.id === c.id));
  assert.equal((await listCarousels('another-brand')).length, 0);
});

test('invalid counts, wrong model counts and cancelled generations never save partial carousels', async () => {
  const before = (await listCarousels(brand.id)).length;
  for (const count of [1, 21, 2.5]) await assert.rejects(create({ count }));
  await assert.rejects(create({}, { generate: async () => ({ title: 'Wrong count', slides: [copy(1), copy(2)] }) }));
  const controller = new AbortController();
  await assert.rejects(create({}, { signal: controller.signal, generate: async () => { controller.abort(); return { title: 'Cancelled', slides: Array.from({ length: 5 }, (_, i) => copy(i)) }; } }), { name: 'AbortError' });
  assert.equal((await listCarousels(brand.id)).length, before);
  await assert.rejects(loadCarousel('../secrets'));
});

test('saving one slide preserves all neighbours and rejects concurrent or stale saves', async () => {
  const c = await create();
  const slide = c.slides[2];
  const update = { revision: c.revision, palette: slide.palette, content: { ...slide.content, headline: 'Edited only here' } };
  const outcomes = await Promise.allSettled([saveCarouselSlide(c.id, slide.id, update), saveCarouselSlide(c.id, c.slides[1].id, update)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const saved = await loadCarousel(c.id);
  assert.equal(saved.slides[2].content.headline, 'Edited only here');
  for (const i of [0, 1, 3, 4]) assert.deepEqual(saved.slides[i], c.slides[i]);
  await assert.rejects(saveCarouselSlide(c.id, slide.id, update), /another window/);
  await assert.rejects(saveCarouselSlide(c.id, c.slides[4].id, { ...update, revision: saved.revision, content: { ...slide.content, cta: '' } }), /final slide needs/);
  await assert.rejects(saveCarouselSlide(c.id, slide.id, { ...update, revision: saved.revision, palette: 'missing' }), /palette/);
});

test('AI refinement targets only the chosen slide, retains design and waits for user acceptance', async () => {
  const c = await create();
  const slide = c.slides[1];
  let req;
  const result = await refineCarouselSlide(c.id, slide.id, { revision: c.revision, prompt: 'Make this more concrete.' }, { generate: async (_, request) => { req = JSON.parse(request.text); return { ...copy(9), headline: 'The better second point' }; } });
  assert.equal(req.selectedSlide, 2);
  assert.equal(req.sequence.length, 5);
  assert.match(req.instruction, /only slide 2/);
  assert.equal(result.content.cta, '');
  assert.equal(result.content.bgStyle, slide.content.bgStyle);
  assert.deepEqual(await loadCarousel(c.id), c);
  const saved = await saveCarouselSlide(c.id, slide.id, { revision: c.revision, palette: slide.palette, content: result.content });
  assert.equal(saved.slides[1].content.headline, 'The better second point');
  for (const i of [0, 2, 3, 4]) assert.deepEqual(saved.slides[i], c.slides[i]);
  await assert.rejects(refineCarouselSlide(c.id, c.slides[4].id, { revision: saved.revision, prompt: 'Shorten it' }, { generate: async () => ({ ...copy(1), cta: '' }) }), /omitted the final CTA/);
});

test('a concurrent edit during AI refinement does not replace the new saved slide', async () => {
  const c = await create();
  const s = c.slides[1];
  await assert.rejects(refineCarouselSlide(c.id, s.id, { revision: c.revision, prompt: 'Rewrite' }, { generate: async () => {
    await saveCarouselSlide(c.id, s.id, { revision: c.revision, palette: s.palette, content: { ...s.content, headline: 'A newer manual edit' } });
    return copy(9);
  } }), /another window/);
  assert.equal((await loadCarousel(c.id)).slides[1].content.headline, 'A newer manual edit');
});

test('carousel export snapshots every slide and creates ordered, distinct PNG files', async () => {
  const c = await create({ count: 3 });
  const calls = [], progress = [];
  const output = await exportCarousel(c.id, { onProgress: (done, total) => progress.push([done, total]), generate: async options => {
    calls.push(options);
    const dir = path.join(home, 'output', brand.id, options.campaign, options.id);
    await fs.mkdir(dir, { recursive: true });
    const image = path.join(dir, 'render.png');
    await fs.writeFile(image, options.content.headline);
    options.onProgress(1, 1, { file: image });
    return { dir, files: [{ path: image }] };
  } });
  assert.deepEqual(calls.map(c => c.id), ['slide-01', 'slide-02', 'slide-03']);
  assert.deepEqual(calls.map(c => c.content.slideNumber), [1, 2, 3]);
  assert.deepEqual(calls.map(c => c.content.cta), ['', '', 'Book a tasting']);
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  assert.deepEqual(output.files.map(f => path.basename(f)), ['slide-01.png', 'slide-02.png', 'slide-03.png']);
  assert.equal(await fs.readFile(output.files[1], 'utf8'), c.slides[1].content.headline);
  assert.equal(JSON.parse(await fs.readFile(path.join(output.dir, 'carousel.json'), 'utf8')).id, c.id);
});

test('carousel layout shows correct position and a CTA only on its final slide', async () => {
  const c = await create({ count: 3 });
  const render = (i) => composeAd({ brand, template: 'carousel-slide', palette: 'default', format: c.format, content: carouselContent(c, c.slides[i], i) });
  const first = await render(0), last = await render(2);
  assert.match(first, /01 \/ 03/); assert.match(last, /03 \/ 03/);
  assert.match(first, /Swipe to continue/); assert.doesNotMatch(first, /class="cta"/);
  assert.match(last, /class="cta"/); assert.match(last, /Book a tasting/);
});
