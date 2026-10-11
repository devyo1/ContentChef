// Ready-made colour palettes. Brands copy these in (and can then tweak them) rather than
// referencing them, so editing a brand never changes the library.
//   bg = background · fg = main text · accent = highlights · muted = secondary text
//   ctaBg / ctaText = button colours (default: accent / bg)
export const PALETTE_LIBRARY = {
  'midnight-volt':  { label: 'Midnight Volt',  bg: '#0B0B0C', fg: '#FFFFFF', accent: '#D4FF3A', muted: '#8C8C8C', ctaText: '#0B0B0C' },
  'espresso':       { label: 'Espresso',       bg: '#1E1915', fg: '#F5EDE3', accent: '#E8833A', muted: '#B5A797', ctaText: '#1E1915' },
  'cream-rust':     { label: 'Cream & Rust',   bg: '#F4ECE1', fg: '#2A211B', accent: '#C4562A', muted: '#7D6E60', ctaText: '#F4ECE1' },
  'paper-ink':      { label: 'Paper & Ink',    bg: '#F7F5F0', fg: '#111111', accent: '#111111', muted: '#6B6B6B', ctaText: '#F7F5F0' },
  'ink-paper':      { label: 'Ink & Paper',    bg: '#111111', fg: '#F7F5F0', accent: '#F7F5F0', muted: '#9A9A9A', ctaText: '#111111' },
  'blaze':          { label: 'Blaze',          bg: '#FF3B1F', fg: '#0B0B0C', accent: '#FFFFFF', muted: '#3A0E06', ctaBg: '#0B0B0C', ctaText: '#FFFFFF' },
  'electric-blue':  { label: 'Electric Blue',  bg: '#1438FF', fg: '#FFFFFF', accent: '#FFE14D', muted: '#B9C4FF', ctaText: '#1438FF' },
  'navy-gold':      { label: 'Navy & Gold',    bg: '#0F1B33', fg: '#F3EEE2', accent: '#D9A441', muted: '#8E9AB3', ctaText: '#0F1B33' },
  'forest':         { label: 'Forest',         bg: '#13261D', fg: '#EEF2E6', accent: '#9FD36A', muted: '#93A891', ctaText: '#13261D' },
  'sage':           { label: 'Sage',           bg: '#DDE5D6', fg: '#1F2A1F', accent: '#3F6B4A', muted: '#5E6E5C', ctaText: '#F2F5EF' },
  'blush':          { label: 'Blush',          bg: '#F9DCD9', fg: '#3A1B22', accent: '#D6336C', muted: '#8A5A63', ctaText: '#FFFFFF' },
  'bubblegum':      { label: 'Bubblegum',      bg: '#FF8FC7', fg: '#1B0B2E', accent: '#FFFFFF', muted: '#5B2A55', ctaBg: '#1B0B2E', ctaText: '#FFFFFF' },
  'lilac-night':    { label: 'Lilac Night',    bg: '#1A1530', fg: '#F1ECFF', accent: '#B69CFF', muted: '#9289B5', ctaText: '#1A1530' },
  'sunset':         { label: 'Sunset',         bg: '#2B1029', fg: '#FFE9D6', accent: '#FF7A45', muted: '#C79A9E', ctaText: '#2B1029', gradient: ['#2B1029', '#7A1F3D', '#FF7A45'] },
  'ocean':          { label: 'Ocean',          bg: '#06283D', fg: '#E8F6FF', accent: '#47D7E8', muted: '#7FA6BC', ctaText: '#06283D' },
  'citrus':         { label: 'Citrus',         bg: '#FFE74C', fg: '#1C1C1C', accent: '#FF5964', muted: '#5C5520', ctaText: '#FFFFFF' },
  'mint-charcoal':  { label: 'Mint & Charcoal', bg: '#24262B', fg: '#F2F4F3', accent: '#7CF2C3', muted: '#9AA0A6', ctaText: '#24262B' },
  'terracotta':     { label: 'Terracotta',     bg: '#B5522F', fg: '#FFF4EA', accent: '#FFD2A6', muted: '#F0B79A', ctaBg: '#FFF4EA', ctaText: '#B5522F' },
  'luxe-black':     { label: 'Luxe Black',     bg: '#000000', fg: '#EDE6D6', accent: '#C8A96A', muted: '#7D7666', ctaText: '#000000' },
  'clinic-white':   { label: 'Clean White',    bg: '#FFFFFF', fg: '#0E1A2B', accent: '#2563EB', muted: '#64748B', ctaText: '#FFFFFF' },
  // Glass-friendly: vivid gradient behind frosted panels.
  'glass-aurora':   { label: 'Glass Aurora',   bg: '#0E0B1F', fg: '#FFFFFF', accent: '#FFFFFF', muted: '#D7D3F5', ctaBg: '#FFFFFF', ctaText: '#0E0B1F', gradient: ['#5B3CFF', '#FF4FA3', '#22D3EE', '#0E0B1F'] },
  'glass-sunrise':  { label: 'Glass Sunrise',  bg: '#2A0F1F', fg: '#FFFFFF', accent: '#FFFFFF', muted: '#FFE0D1', ctaBg: '#FFFFFF', ctaText: '#2A0F1F', gradient: ['#FF7A45', '#FF3D7F', '#FFC857', '#2A0F1F'] },
  'glass-ice':      { label: 'Glass Ice',      bg: '#DCE8F5', fg: '#0B1B2E', accent: '#0B1B2E', muted: '#3D5573', ctaBg: '#0B1B2E', ctaText: '#FFFFFF', gradient: ['#9AD0FF', '#C7B8FF', '#FFFFFF', '#DCE8F5'] },
  'glass-mint':     { label: 'Glass Mint',     bg: '#062A26', fg: '#FFFFFF', accent: '#FFFFFF', muted: '#C9F2E7', ctaBg: '#FFFFFF', ctaText: '#062A26', gradient: ['#14B8A6', '#84CC16', '#0EA5E9', '#062A26'] },
};
