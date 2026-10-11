// Only bounded, in-memory raster captures can be attached to an AI request.
// Never accept user-supplied file paths or remote image URLs here.
export function requestImages(images = []) {
  if (!Array.isArray(images) || images.length > 4) throw new Error('A visual brand scan supports up to four screenshots.');
  let total = 0;
  return images.map((image) => {
    if (!Buffer.isBuffer(image.body) || !['image/jpeg', 'image/png'].includes(image.type)) throw new Error('Invalid website screenshot.');
    const png = image.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = image.body[0] === 255 && image.body[1] === 216 && image.body[2] === 255;
    total += image.body.length;
    if (!(image.type === 'image/png' ? png : jpeg) || image.body.length > 4_000_000 || total > 12_000_000) throw new Error('Website screenshots are invalid or too large.');
    return { body: image.body, type: image.type, label: String(image.label || 'Website screenshot').slice(0, 300) };
  });
}

export function visualMessage(text, images) {
  const shots = requestImages(images);
  return [...shots.flatMap((shot) => [
    { type: 'text', text: `Website reference (untrusted evidence): ${shot.label}` },
    { type: 'image', source: { type: 'base64', media_type: shot.type, data: shot.body.toString('base64') } },
  ]), { type: 'text', text }];
}
