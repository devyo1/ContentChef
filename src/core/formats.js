// Output sizes per platform. `platform` links a format to its caption rules (see captions.js).
// `safe` = fraction of height covered by platform UI (story/reel chrome); templates keep copy out of it.
export const FORMATS = {
  'ig-square':    { label: 'Instagram Feed (Square)',   width: 1080, height: 1080, platform: 'instagram' },
  'ig-portrait':  { label: 'Instagram Feed (Portrait)', width: 1080, height: 1350, platform: 'instagram' },
  'story':        { label: 'Story / Reel (IG, FB, TikTok)', width: 1080, height: 1920, platform: 'instagram', safe: { top: 0.13, bottom: 0.2 } },
  'tiktok':       { label: 'TikTok',                    width: 1080, height: 1920, platform: 'tiktok', safe: { top: 0.12, bottom: 0.22 } },
  'fb-feed':      { label: 'Facebook Feed / Link',      width: 1200, height: 628,  platform: 'facebook' },
  'fb-square':    { label: 'Facebook Square',           width: 1080, height: 1080, platform: 'facebook' },
  'x-post':       { label: 'X / Twitter Post',          width: 1600, height: 900,  platform: 'x' },
  'linkedin':     { label: 'LinkedIn Feed',             width: 1200, height: 627,  platform: 'linkedin' },
  'linkedin-sq':  { label: 'LinkedIn Square',           width: 1200, height: 1200, platform: 'linkedin' },
  'pinterest':    { label: 'Pinterest Pin',             width: 1000, height: 1500, platform: 'pinterest' },
  'yt-thumb':     { label: 'YouTube Thumbnail',         width: 1280, height: 720,  platform: 'youtube' },
  'display-mrec': { label: 'Display 300×250 (MREC)',    width: 300,  height: 250,  platform: 'display', scale: 2 },
};

export const FORMAT_GROUPS = {
  instagram: ['ig-square', 'ig-portrait', 'story'],
  social: ['ig-square', 'ig-portrait', 'story', 'fb-feed', 'x-post', 'linkedin'],
  all: Object.keys(FORMATS),
};

/** Expand format ids and group names ("social", "all") into a unique list of format ids. */
export function resolveFormats(list) {
  const ids = [];
  for (const f of [].concat(list ?? 'social')) {
    const expanded = FORMAT_GROUPS[f] ?? [f];
    for (const id of expanded) {
      if (!FORMATS[id]) throw new Error(`Unknown format "${id}". Known: ${Object.keys(FORMATS).join(', ')}`);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function orientation({ width, height }) {
  const r = width / height;
  if (r > 1.15) return 'landscape';
  if (r < 0.87) return 'portrait';
  return 'square';
}
