import headline from './headline.js';
import glass from './glass.js';
import lockscreen from './lockscreen.js';
import stack from './stack.js';
import marker from './marker.js';
import split from './split.js';
import frame from './frame.js';
import offer from './offer.js';
import quote from './quote.js';
import minimal from './minimal.js';
import insight from './insight.js';
import list from './list.js';
import stat from './stat.js';
import textpost from './textpost.js';
import compare from './compare.js';
import notes from './notes.js';
import photoStory from './photo-story.js';
import photoCard from './photo-card.js';
import polaroid from './polaroid.js';
import cover from './cover.js';
import event from './event.js';
import chat from './chat.js';
import poll from './poll.js';
import carousel from './carousel.js';
import carouselSlide from './carousel-slide.js';
import menu from './menu.js';
import ticket from './ticket.js';
import newspaper from './newspaper.js';
import spotlight from './spotlight.js';
import { loadCustomTemplates } from './custom.js';

// Template categories, shown as tabs in the template browser.
export const CATEGORIES = {
  promo: { name: 'Promo & ads', description: 'Sell something: offers, launches, product moments' },
  content: { name: 'Value & education', description: 'Tips, insights, stats and lists: posts people save and share' },
  social: { name: 'Social-native', description: 'Look like the apps people scroll: posts, notes, notifications' },
  photo: { name: 'Photo', description: 'Built around your own photo: it stays true-colour, text sits on panels or a neutral fade' },
  custom: { name: 'Custom', description: 'Templates made by you or Claude. Ask Claude to "design a new template that…" and it appears here.' },
};

// Templates that put text straight onto a background photo: with a photo they switch to white
// text over a neutral dark fade (never a palette-tinted wash over the picture).
const TEXT_ON_PHOTO = new Set(['headline', 'stack', 'offer', 'quote', 'minimal', 'insight', 'list', 'stat', 'compare', 'event', 'carousel', 'menu']);

// Category for templates that don't declare one.
const DEFAULT_CATEGORY = {
  headline: 'promo', glass: 'social', lockscreen: 'social', stack: 'promo', marker: 'social',
  split: 'promo', frame: 'promo', offer: 'promo', quote: 'content', minimal: 'content',
};

// To add a template: create a module exporting
//   { id, name, description, category?, fields, preferBg?, render(ctx) → { css, body } }
// and register it here. See base.js for shared helpers and CSS classes.
export const TEMPLATES = Object.fromEntries(
  [headline, insight, list, stat, carousel, carouselSlide, newspaper, textpost, compare, notes, chat, poll, photoStory, photoCard, polaroid, cover, spotlight, glass, lockscreen, stack, marker, split, frame, offer, event, ticket, menu, quote, minimal]
    .map((t) => [t.id, { ...t, category: t.category ?? DEFAULT_CATEGORY[t.id] ?? 'promo', textOnPhoto: t.textOnPhoto ?? TEXT_ON_PHOTO.has(t.id) }]),
);

/** Built-in templates plus custom ones from HOME/templates (re-read when they change). */
export function allTemplates() {
  return { ...TEMPLATES, ...Object.fromEntries(loadCustomTemplates().filter((t) => !TEMPLATES[t.id]).map((t) => [t.id, t])) };
}

export function getTemplate(id) {
  const all = allTemplates();
  const t = all[id];
  if (!t) throw new Error(`Unknown template "${id}". Known: ${Object.keys(all).join(', ')}`);
  return t;
}

export function describeTemplates() {
  return Object.values(allTemplates()).map(({ id, name, description, category, fields, preferBg, custom }) => ({ id, name, description, category, fields, preferBg, ...(custom ? { custom: true } : {}) }));
}
