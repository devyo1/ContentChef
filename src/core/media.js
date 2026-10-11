import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)$/i;
export const isVideo = (ref) => typeof ref === 'string' && VIDEO_EXT.test(ref.split('?')[0]);

function run(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim().slice(-500)}`))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

/** A still frame from a video (cached next to it in .cache/), used for image renders and thumbnails. */
export async function videoPoster(file, at = 0.5) {
  const cacheDir = path.join(path.dirname(file), '.cache');
  const out = path.join(cacheDir, `${path.basename(file)}.poster.jpg`);
  try {
    const [a, b] = await Promise.all([fs.stat(out), fs.stat(file)]);
    if (a.mtimeMs >= b.mtimeMs) return out;
  } catch { /* not cached yet */ }
  await fs.mkdir(cacheDir, { recursive: true });
  await run(['-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '3', out]).catch(() => run(['-y', '-i', file, '-frames:v', '1', '-q:v', '3', out]));
  return out;
}

/** Start an ffmpeg process that encodes a stream of JPEG/PNG frames (via `write`) into an H.264 MP4. */
export function videoEncoder({ out, width, height, fps, duration, quality = 17 }) {
  const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-vf', `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(quality),
    '-profile:v', 'high', '-movflags', '+faststart', '-r', String(fps), out];
  const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve, reject) => {
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg failed: ${err.trim().slice(-600)}`))));
  });
  p.stdin.on('error', () => { /* surfaced via close */ });
  return {
    write: (buf) => new Promise((resolve) => { if (!p.stdin.write(buf)) p.stdin.once('drain', resolve); else resolve(); }),
    end: () => { p.stdin.end(); return done; },
  };
}

/**
 * Decode a background video into JPEG frames pre-cropped to cover `width`×`height`
 * (looping if it's shorter than `duration`). Returns the number of frames written.
 */
export async function extractFrames(file, dir, { width, height, fps, duration }) {
  await fs.mkdir(dir, { recursive: true });
  await run(['-y', '-stream_loop', '-1', '-i', file, '-t', String(duration),
    '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}`,
    '-q:v', '2', path.join(dir, '%05d.jpg')]);
  return (await fs.readdir(dir)).filter((f) => f.endsWith('.jpg')).length;
}

/** Animated GIF → MP4 (H.264), so GIFs work as background video with exact frame stepping. */
export async function gifToMp4(file) {
  const out = file.replace(/\.gif$/i, '.mp4');
  await run(['-y', '-i', file, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', out]);
  return out;
}

/** MP4 → looping GIF with an optimised palette (smaller and cleaner than a plain conversion). */
export async function mp4ToGif(file, out, { width = 720, fps = 15 } = {}) {
  await run(['-y', '-i', file, '-vf',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', out]);
  return out;
}

const ASPECTS = { original: null, '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
export const VIDEO_ASPECTS = Object.keys(ASPECTS);

/**
 * Video mode: trim a clip, optionally crop it to a social aspect ratio (keeping `focusX` 0–1 in
 * view), mute it, and write an H.264 MP4.
 */
export async function trimVideo(file, out, { start = 0, end, aspect = 'original', focusX = 0.5, mute = false, speed = 1 } = {}) {
  const A = ASPECTS[aspect];
  const fx = Math.min(1, Math.max(0, Number(focusX) || 0.5));
  const sp = Math.min(4, Math.max(0.25, Number(speed) || 1));
  const vf = [
    A ? `crop=w='min(iw,ih*${A})':h='min(ih,iw/${A})':x='(iw-ow)*${fx}':y='(ih-oh)/2'` : null,
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    sp !== 1 ? `setpts=PTS/${sp}` : null,
    'format=yuv420p',
  ].filter(Boolean).join(',');
  const s0 = Math.max(0, Number(start) || 0);
  const args = ['-y', '-ss', String(s0)];
  if (end != null) args.push('-t', String(Math.max(0.1, Number(end) - s0))); // duration from the seek point
  args.push('-i', file, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart');
  if (mute) args.push('-an');
  else if (sp !== 1) args.push('-af', sp > 2 ? `atempo=2,atempo=${sp / 2}` : sp < 0.5 ? `atempo=0.5,atempo=${sp / 0.5}` : `atempo=${sp}`, '-c:a', 'aac');
  else args.push('-c:a', 'aac');
  args.push(out);
  await run(args);
  return out;
}
