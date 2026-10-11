// Fast unit tests for the pure parts of the core (no browser needed). Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePalette, contrast, glowColors, hexToOklch, MOODS } from '../public/js/color.js';
import { rich, paragraphs, listItems, pointHtml, esc } from '../src/core/templates/base.js';
import { stackLines } from '../src/core/templates/stack.js';
import { buildCaptions, PLATFORMS } from '../src/core/captions.js';
import { resolveFormats, FORMATS } from '../src/core/formats.js';
import { slugify, safeJoin } from '../src/core/paths.js';
import { normalizeContent } from '../src/core/compose.js';
import { describeTemplates, CATEGORIES } from '../src/core/templates/index.js';
import { parseRows, parseCSV } from '../public/js/bulk.js';
import { sanitizeHtml, sanitizeCss, normalizeSpec } from '../src/core/templates/custom.js';
import { splitDate } from '../src/core/templates/event.js';
import { chatLines } from '../src/core/templates/chat.js';
import { menuItem } from '../src/core/templates/menu.js';

test('generated palettes are readable in every mood', () => {
  for (const mood of Object.keys(MOODS)) {
    for (let i = 0; i < 25; i++) {
      const { palette: p } = generatePalette({ mood });
      assert.ok(contrast(p.fg, p.bg) >= 4.5, `${mood}: text contrast ${contrast(p.fg, p.bg)}`);
      assert.ok(contrast(p.ctaText, p.ctaBg ?? p.accent) >= 4.5, `${mood}: button contrast`);
    }
  }
});

test('locked colours are kept by the generator', () => {
  const r = generatePalette({ locked: { accent: '#FF5A36' } });
  assert.equal(r.palette.accent, '#FF5A36');
});

test('glow colours always parse and belong to the palette', () => {
  const pals = [
    { bg: '#FFFFFF', fg: '#0B0B0C', accent: '#FF3B1F' },
    { bg: '#0B0B0C', fg: '#FFFFFF', accent: '#D4FF3A' },
    { bg: '#1E1915', fg: '#F5EDE3', accent: '#E8833A' },
    { bg: '#0E0B1F', fg: '#FFFFFF', accent: '#FFFFFF', gradient: ['#5B3CFF', '#FF4FA3', '#22D3EE', '#0E0B1F'] },
  ];
  for (const p of pals) {
    const g = glowColors(p);
    assert.equal(g.length, 4);
    assert.equal(g[3], p.bg);
    for (const c of g) assert.match(c, /^#[0-9A-F]{6}([0-9A-F]{2})?$/i);
    // Glows behind dark text must be light enough to read on.
    if (hexToOklch(p.fg).l < 0.6) for (const c of g.slice(0, 3)) assert.ok(hexToOklch(c).l > 0.75, `${c} too dark behind dark text`);
  }
});

test('copy markup: accents, italics, line breaks and escaping', () => {
  assert.equal(rich('Say it *big*'), 'Say it <span class="hl">big</span>');
  assert.equal(rich('a | b'), 'a<br>b');
  assert.equal(rich('<script>'), '&lt;script&gt;');
  assert.equal(esc('"x" & y'), '&quot;x&quot; &amp; y');
  assert.equal(paragraphs('One.\n\nTwo *b*'), '<p>One.</p><p>Two <span class="hl">b</span></p>');
});

test('list points strip typed bullets and bold "Title:" lead-ins', () => {
  assert.deepEqual(listItems('- One\n2. Two\n• Three\n\n'), ['One', 'Two', 'Three']);
  assert.deepEqual(listItems(['a', ' b ']), ['a', 'b']);
  assert.equal(pointHtml('Sleep: 8 hours'), '<b>Sleep:</b> 8 hours');
});

test('stacked headline lines', () => {
  assert.deepEqual(stackLines('No excuses. Just reps.'), ['No', 'excuses.', 'Just', 'reps.']);
  assert.deepEqual(stackLines('One | two three'), ['One', 'two three']);
});

test('captions respect platform limits and include value-post content', () => {
  const brand = { captions: { hashtags: ['one', '#two'], link: 'https://example.com' } };
  const caps = buildCaptions(brand, { headline: 'x'.repeat(400), body: 'Para.', points: '- A\n- B' });
  assert.ok(caps.x.length <= PLATFORMS.x.limit);
  assert.ok(caps.instagram.includes('• A'));
  assert.ok(caps.instagram.includes('#one #two'));
  assert.ok(caps.pinterest.title.length <= PLATFORMS.pinterest.titleLimit);
});

test('format groups expand and unknown formats are rejected', () => {
  assert.deepEqual(resolveFormats('instagram'), ['ig-square', 'ig-portrait', 'story']);
  assert.equal(resolveFormats('all').length, Object.keys(FORMATS).length);
  assert.throws(() => resolveFormats(['nope']), /Unknown format/);
});

test('paths: slugs and traversal protection', () => {
  assert.equal(slugify('Café Crème — Autumn!'), 'cafe-creme-autumn');
  assert.throws(() => safeJoin('/base', '../etc/passwd'), /escapes/);
});

test('legacy shine/glimmer animations become effects', () => {
  assert.deepEqual(normalizeContent({ animation: 'shine' }), { animation: 'fade-up', effects: ['holo'] });
  assert.deepEqual(normalizeContent({ effects: ['glimmer', 'bogus'] }).effects, ['glimmer']);
});

test('every template has a known category and declares its fields', () => {
  for (const t of describeTemplates()) {
    assert.ok(CATEGORIES[t.category], `${t.id} has category ${t.category}`);
    assert.ok(Array.isArray(t.fields) && t.fields.length, `${t.id} fields`);
  }
});

test('bulk paste: plain lines, spreadsheet headers and CSV quoting', () => {
  assert.deepEqual(parseRows('First\nSecond'), [{ headline: 'First' }, { headline: 'Second' }]);
  const rows = parseRows('Headline\tButton\tBody\nHi\tGo\tSome text');
  assert.deepEqual(rows, [{ headline: 'Hi', cta: 'Go', body: 'Some text' }]);
  assert.deepEqual(parseCSV('a,"b, c","say ""hi"""'), [['a', 'b, c', 'say "hi"']]);
});

test('custom templates: scripts, handlers and remote loads are stripped', () => {
  const h = sanitizeHtml('<div onclick="x()" class="a"><script>alert(1)</script><img src="https://evil.test/a.png">{{headline}}<iframe src="x"></iframe><a href="javascript:x">l</a></div>');
  assert.ok(!/script|onclick|iframe|evil\.test|javascript:/i.test(h), h);
  assert.ok(h.includes('{{headline}}') && h.includes('class="a"'));
  const c = sanitizeCss('@import url(https://x.test/a.css); .a{background:url(https://x.test/b.png)} .b{background:url(data:image/png;base64,AA)} </style><script>');
  assert.ok(!/@import|x\.test|<\/style|<script/i.test(c), c);
  assert.ok(c.includes('data:image/png'));
});

test('custom templates: ids are slugged, built-ins are reserved, unknown fields dropped', () => {
  const s = normalizeSpec({ name: 'My Card!', html: '<div>{{headline}}</div>', fields: ['headline', 'bogus'] }, ['headline']);
  assert.equal(s.id, 'my-card');
  assert.deepEqual(s.fields, ['headline']);
  assert.throws(() => normalizeSpec({ name: 'Headline', html: '<div></div>' }, ['headline']), /built-in/);
  assert.throws(() => normalizeSpec({ name: 'Empty' }, []), /html/);
});

test('event dates, chat lines and menu prices parse the way people type them', () => {
  assert.deepEqual(splitDate('Sat 18 Oct'), { big: '18', top: 'Sat', bottom: 'Oct' });
  assert.equal(splitDate('18th October').big, '18');
  const lines = chatLines(['them: hi', 'me: hello', 'no prefix', 'and another']);
  assert.deepEqual(lines.map((l) => l.out), [false, true, false, true]);
  assert.equal(lines[1].text, 'hello');
  assert.deepEqual(menuItem('Oat flat white: £3.20'), { name: 'Oat flat white', price: '£3.20' });
  assert.deepEqual(menuItem('Croissant — 2.80'), { name: 'Croissant', price: '2.80' });
  assert.deepEqual(menuItem('Ask about specials'), { name: 'Ask about specials', price: '' });
});
