// A carousel uses the normal editor fields as a projection of the selected slide.
// Commit that projection before switching, saving, AI edits or exporting.
export function commitCarousel(d) {
  if (d?.mode !== 'carousel' || !d.slides?.length) return d;
  const index = Math.max(0, Math.min(d.slides.length - 1, d.slideIndex ?? 0));
  const content = { ...d.content, slideNumber: index + 1, slideCount: d.slides.length, slideRole: index === 0 ? 'hook' : index === d.slides.length - 1 ? 'cta' : 'story' };
  if (index !== d.slides.length - 1) content.cta = '';
  return { ...d, slideIndex: index, content, variants: [], slides: d.slides.map((s, i) => i === index ? { ...s, content, templates: [...d.templates], palettes: [...d.palettes] } : s) };
}
export function selectCarouselSlide(design, index) {
  const d = commitCarousel(design);
  if (!d.slides?.[index]) return d;
  const s = d.slides[index];
  return commitCarousel({ ...d, slideIndex: index, content: { ...s.content }, templates: [...s.templates], palettes: [...s.palettes], pick: { templates: s.templates.length > 1 ? 'many' : 'one', palettes: s.palettes.length > 1 ? 'many' : 'one' } });
}
export function carouselAds(design) {
  const d = commitCarousel(design);
  return (d.slides ?? []).map((s, i) => ({ ...s, label: `Slide ${i + 1}${i === d.slides.length - 1 ? ' · CTA' : ''}`, content: { ...s.content, slideNumber: i + 1, slideCount: d.slides.length, slideRole: i === 0 ? 'hook' : i === d.slides.length - 1 ? 'cta' : 'story', ...(i < d.slides.length - 1 ? { cta: '' } : {}) } }));
}
export function carouselToDesign(c) {
  if (c.design) return { ...c.design, carousel: { ...c.design.carousel, id: c.id, revision: c.revision } };
  const slides = c.slides.map(s => ({ id: s.id, content: { ...s.content }, templates: ['carousel-slide'], palettes: [s.palette] }));
  return commitCarousel({ mode: 'carousel', slides, slideIndex: 0, content: slides[0].content, templates: slides[0].templates, palettes: slides[0].palettes, variants: [], rows: [], formats: [c.format], campaign: c.title,
    pick: { templates: 'one', palettes: 'one' }, output: { type: 'png', scale: 1, still: true, video: false }, captions: {},
    carousel: { id: c.id, revision: c.revision, brief: c.brief, website: c.website || '', ctaMode: c.ctaMode || 'manual' } });
}
/**
 * Apply a look change to every slide (not just the one being edited): palettes, templates
 * and/or content fields (background, bgStyle, align, styles…; undefined/'' removes a field).
 */
export function applyToAllSlides(design, { palettes, templates, content } = {}) {
  const d = commitCarousel(design);
  if (d?.mode !== 'carousel' || !d.slides?.length) return d;
  const merge = (c) => {
    if (!content) return c;
    const out = { ...c, ...content };
    for (const [k, v] of Object.entries(content)) if (v === undefined || v === '') delete out[k];
    return out;
  };
  const slides = d.slides.map((s) => ({ ...s, ...(palettes ? { palettes: [...palettes] } : {}), ...(templates ? { templates: [...templates] } : {}), content: merge(s.content) }));
  const cur = slides[d.slideIndex];
  return commitCarousel({ ...d, slides, content: { ...cur.content }, templates: [...cur.templates], palettes: [...cur.palettes] });
}
