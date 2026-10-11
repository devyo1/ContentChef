// Curated Google Fonts with the weights each one actually has (the Google Fonts API rejects
// requests for weights a family doesn't include). Used by the brand editor's font pickers.
export const FONT_LIBRARY = [
  // Display / impact
  { family: 'Anton', category: 'Impact', weights: [400] },
  { family: 'Bebas Neue', category: 'Impact', weights: [400] },
  { family: 'Archivo Black', category: 'Impact', weights: [400] },
  { family: 'Oswald', category: 'Impact', weights: [400, 500, 600, 700] },
  { family: 'Barlow Condensed', category: 'Impact', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'League Spartan', category: 'Impact', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Unbounded', category: 'Impact', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Black Ops One', category: 'Impact', weights: [400] },
  { family: 'Righteous', category: 'Impact', weights: [400] },
  // Serif
  { family: 'Fraunces', category: 'Serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Playfair Display', category: 'Serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'DM Serif Display', category: 'Serif', weights: [400] },
  { family: 'Instrument Serif', category: 'Serif', weights: [400] },
  { family: 'Abril Fatface', category: 'Serif', weights: [400] },
  { family: 'Cormorant Garamond', category: 'Serif', weights: [400, 500, 600, 700] },
  { family: 'Lora', category: 'Serif', weights: [400, 500, 600, 700] },
  { family: 'Libre Baskerville', category: 'Serif', weights: [400, 700] },
  // Sans
  { family: 'Inter', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Manrope', category: 'Sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Plus Jakarta Sans', category: 'Sans', weights: [400, 500, 600, 700, 800] },
  { family: 'DM Sans', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Montserrat', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Outfit', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Sora', category: 'Sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', category: 'Sans', weights: [400, 500, 600, 700] },
  { family: 'Syne', category: 'Sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Bricolage Grotesque', category: 'Sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Figtree', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Urbanist', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Rubik', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Archivo', category: 'Sans', weights: [400, 500, 600, 700, 800, 900] },
  // Handwritten / fun
  { family: 'Permanent Marker', category: 'Handwritten', weights: [400] },
  { family: 'Caveat', category: 'Handwritten', weights: [400, 500, 600, 700] },
];

/** Google Fonts css2 family spec for a library font, e.g. "Inter:wght@400;700". */
export function googleSpec(family) {
  const f = FONT_LIBRARY.find((x) => x.family === family);
  const weights = f?.weights ?? [400, 700];
  const name = family.replace(/\s+/g, '+');
  return weights.length === 1 && weights[0] === 400 ? name : `${name}:wght@${weights.join(';')}`;
}
