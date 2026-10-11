// Platform-aware caption builder. Takes one piece of copy + brand caption settings and produces
// a caption shaped for each platform's conventions and limits. Any platform can be overridden
// verbatim with content.captions[platform] (e.g. hand-written, or written by an LLM).

export const PLATFORMS = {
  instagram: { label: 'Instagram', limit: 2200, hashtags: 12, link: false, hashtagBlock: true },
  facebook:  { label: 'Facebook',  limit: 2000, hashtags: 2,  link: true },
  x:         { label: 'X / Twitter', limit: 280, hashtags: 2, link: true, urlLength: 23 },
  linkedin:  { label: 'LinkedIn',  limit: 3000, hashtags: 3,  link: true },
  tiktok:    { label: 'TikTok',    limit: 2200, hashtags: 5,  link: false },
  pinterest: { label: 'Pinterest', limit: 500,  hashtags: 4,  link: true, titleLimit: 100 },
  youtube:   { label: 'YouTube',   limit: 5000, hashtags: 3,  link: true },
  display:   { label: 'Display',   limit: 90,   hashtags: 0,  link: false },
};

const plain = (s) => String(s ?? '').replace(/[*_]/g, '').replace(/\s*(\\n|\n|\|)\s*/g, ' ').trim();
const tag = (h) => (h.startsWith('#') ? h : `#${h.replace(/\s+/g, '')}`);

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '') + '…';
}

export function buildCaptions(brand, content, platforms = Object.keys(PLATFORMS)) {
  const cap = content.caption ?? {};
  const overrides = content.captions ?? {};
  const bc = brand.captions ?? {};
  const headline = plain(content.offer ? `${content.offer} ${content.headline ?? ''}` : content.headline);
  // Value posts: include the body paragraph and list points so the caption carries the substance.
  const points = (Array.isArray(content.points) ? content.points : String(content.points ?? '').split(/\n|\\n/))
    .map((x) => plain(String(x).replace(/^\s*([-*•–]|\d+[.)])\s+/, ''))).filter(Boolean);
  const extra = [
    content.body && String(content.body).split(/\n\s*\n/).map(plain).join('\n\n'),
    points.length && points.map((x) => `• ${x}`).join('\n'),
  ].filter(Boolean).join('\n\n');
  const body = plain(cap.body ?? [headline, plain(content.subhead)].filter(Boolean).join(' — ')) + (cap.body || !extra ? '' : `\n\n${extra}`);
  const ctaAll = plain(cap.cta ?? content.cta);
  const linkAll = cap.link ?? bc.link ?? '';
  const hashtags = [...new Set([...(cap.hashtags ?? []), ...(bc.hashtags ?? [])].map(tag))];
  const signoff = cap.signoff ?? bc.signoff ?? '';

  const out = {};
  for (const id of platforms) {
    const rules = PLATFORMS[id];
    if (!rules) continue;
    // Per-platform switches (content.platformOpts[id]): caption, link, hashtags and cta can each be turned off.
    const po = content.platformOpts?.[id] ?? {};
    if (po.caption === false) continue;
    if (overrides[id]) { out[id] = overrides[id]; continue; }
    const tags = po.hashtags === false ? '' : hashtags.slice(0, rules.hashtags).join(' ');
    const link = po.link === false ? '' : linkAll;
    const cta = po.cta === false ? '' : ctaAll;
    let text;
    switch (id) {
      case 'instagram':
        text = [body, cta && `${cta}${link ? ' — link in bio' : ''}`, signoff, tags && `.\n.\n${tags}`].filter(Boolean).join('\n\n');
        break;
      case 'tiktok':
        text = [body, tags].filter(Boolean).join(' ');
        break;
      case 'x': {
        const tail = [cta, link, tags].filter(Boolean).join(' ');
        const tailLen = tail.length - (link ? link.length - rules.urlLength : 0);
        text = `${truncate(body, rules.limit - tailLen - 2)}\n\n${tail}`.trim();
        break;
      }
      case 'pinterest':
        out[id] = {
          title: truncate(headline || body, rules.titleLimit),
          description: truncate([plain(content.subhead) || body, cta, tags].filter(Boolean).join(' '), rules.limit),
          link,
        };
        continue;
      case 'display':
        text = truncate(headline, rules.limit);
        break;
      default:
        text = [body, [cta, link].filter(Boolean).join(': '), signoff, tags].filter(Boolean).join('\n\n');
    }
    out[id] = truncate(text, rules.limit);
  }
  return out;
}

export function captionsMarkdown(caps) {
  return Object.entries(caps)
    .map(([p, c]) => `## ${PLATFORMS[p]?.label ?? p}\n\n${typeof c === 'string' ? c : Object.entries(c).map(([k, v]) => `**${k}:** ${v}`).join('\n\n')}\n`)
    .join('\n');
}
