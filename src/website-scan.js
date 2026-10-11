// Bounded public-web reads, with a fresh isolated renderer for JS-only pages.
// Never uses the user's cookies/browser profile or permits local/private URLs.
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { getBrowser } from './core/renderer.js';

export function websiteUrl(input, base) {
  const value = String(input ?? '').trim();
  if (!value || value.length > 2048) throw new Error('Enter a website URL.');
  let url;
  try { url = new URL(base ? value : /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`, base); }
  catch { throw new Error('Enter a valid website URL, such as https://example.com.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public http or https website URL without login details.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Use the website’s standard http or https address.');
  url.hash = '';
  return url;
}

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export async function publicAddresses(url, resolve = lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('Only public websites can be scanned.');
  const records = ipaddr.isValid(host) ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }] : await resolve(host, { all: true });
  if (!records.length || records.some((r) => !isPublicAddress(r.address))) throw new Error('Only public websites can be scanned; private and local addresses are blocked.');
  return records;
}

/** Pin validated DNS results to the socket, including on every redirect. */
export async function fetchWebsite(input, { maxBytes = 2_000_000, signal, redirects = 4 } = {}) {
  const url = websiteUrl(input);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  deadline.throwIfAborted();
  const addresses = await Promise.race([
    publicAddresses(url),
    new Promise((_, reject) => { deadline.addEventListener('abort', () => reject(new Error('Website request timed out or was cancelled.')), { once: true }); }),
  ]);
  deadline.throwIfAborted();
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal: deadline,
      headers: { 'User-Agent': 'ContentChef/0.1 (brand setup)', Accept: '*/*', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family),
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume(); resolve({ redirect: res.headers.location }); return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); reject(new Error(`The website returned HTTP ${res.statusCode}. Try a public page that does not require sign-in.`)); return;
      }
      if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); reject(new Error('The website response is too large to scan.')); return; }
      const chunks = []; let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(new Error('The website response is too large to scan.')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ url: url.href, body: Buffer.concat(chunks), type: String(res.headers['content-type'] ?? '').split(';')[0].toLowerCase() }));
    });
    request.on('error', reject);
  });
  if ('redirect' in response) {
    if (!response.redirect || redirects <= 0) throw new Error('The website redirected too many times. Try its final URL.');
    return fetchWebsite(websiteUrl(response.redirect, url).href, { maxBytes, signal: deadline, redirects: redirects - 1 });
  }
  return response;
}

const shortText = (text, max = 500) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const linkedUrl = (value, base) => { try { return websiteUrl(value, base).href; } catch { return null; } };

export function readWebsiteHtml(html, url) {
  const $ = load(html);
  const base = linkedUrl($('base[href]').attr('href'), url) || url;
  const meta = (key) => shortText($(`meta[name="${key}"],meta[property="${key}"]`).first().attr('content'));
  const styles = $('style').map((_, el) => $(el).text()).get();
  styles.push($('[style]').map((_, el) => `{${$(el).attr('style')}}`).get().join('\n'));
  const sheets = [...new Set($('link[rel~="stylesheet"][href]').map((_, el) => linkedUrl($(el).attr('href'), base)).get().filter(Boolean))].slice(0, 8);
  const logos = [];
  $('img[src],img[data-src]').each((_, el) => {
    const img = $(el), src = linkedUrl(img.attr('src') || img.attr('data-src'), base);
    const label = `${img.attr('alt') ?? ''} ${img.attr('class') ?? ''} ${img.attr('id') ?? ''} ${src ?? ''}`;
    if (src && /logo|wordmark|brandmark/i.test(label)) logos.push({ url: src, label: shortText(img.attr('alt') || 'Website logo', 100) });
  });
  // Inline SVG wordmarks are common. Only the sanitized form can become a preview/asset.
  $('svg').each((_, el) => {
    if (/logo|wordmark|brandmark/i.test(`${$(el).attr('class') ?? ''} ${$(el).attr('id') ?? ''} ${$(el).attr('aria-label') ?? ''}`)) {
      logos.push({ svg: $.html(el), label: 'Website logo' });
    }
  });
  const title = shortText($('title').text(), 200), name = meta('og:site_name');
  const description = meta('description') || meta('og:description');
  const themeColor = meta('theme-color');
  const headings = $('h1,h2,h3').slice(0, 25).map((_, el) => shortText($(el).text(), 250)).get();
  $('script,style,noscript,template,svg,iframe,nav,footer').remove();
  return { url, title, name, description, themeColor, headings, text: shortText($('body').text(), 14000), styles, sheets, logos: logos.slice(0, 6) };
}

export function cssIdentity(css) {
  const colors = new Map(), fonts = new Set();
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of cleaned.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const [, property, value] = match;
    if (/color|background|border|fill|stroke|shadow|^--/i.test(property)) {
      for (const c of value.matchAll(/#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{3}\b|(?:rgb|hsl)a?\([^)]{1,90}\)/gi)) {
        let color = c[0].toUpperCase();
        if (/^#[\dA-F]{3}$/.test(color)) color = `#${[...color.slice(1)].map((s) => s + s).join('')}`;
        colors.set(color, (colors.get(color) ?? 0) + (/^--/.test(property) ? 3 : 1));
      }
    }
    if (/font-family$|^--.*font/i.test(property)) {
      for (const family of value.split(',')) {
        const name = family.trim().replace(/^['"]|['"]$/g, '');
        if (name && name.length < 80 && !/var\(|url\(|^\d|^inherit$|^initial$/i.test(name)) fonts.add(name);
      }
    }
  }
  return { colors: [...colors].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([value, occurrences]) => ({ value, occurrences })), fonts: [...fonts].slice(0, 24) };
}

/** Keep SVG logos inert: no scripts, links, CSS, foreign objects or remote references. */
export function safeLogo(body, type) {
  if (body.length > 1_000_000) return null;
  if (type === 'image/png' && body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { body, type, ext: 'png' };
  if (type === 'image/jpeg' && body[0] === 255 && body[1] === 216 && body[2] === 255) return { body, type, ext: 'jpg' };
  if (type === 'image/webp' && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return { body, type, ext: 'webp' };
  if (type !== 'image/svg+xml') return null;
  const $ = load(body.toString('utf8'), { xmlMode: true });
  const root = $('svg').first();
  if (!root.length) return null;
  const tags = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','mask','title','desc','text','tspan']);
  const attrs = new Set(['xmlns','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity','opacity','transform','id','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','clip-path','mask','font-family','font-size','font-weight','text-anchor']);
  root.find('*').addBack().each((_, el) => {
    if (!tags.has(el.name)) { $(el).remove(); return; }
    for (const [name, value] of Object.entries(el.attribs ?? {})) {
      if (!attrs.has(name) || /[<>]|(?:https?:|data:|javascript:|file:)|url\((?!\s*#[\w-]+\s*\))/i.test(value)) $(el).removeAttr(name);
    }
  });
  root.attr('xmlns', 'http://www.w3.org/2000/svg');
  return { body: Buffer.from($.xml(root)), type, ext: 'svg' };
}

/** Render JS-only sites in a fresh context; every request still goes through the public-web reader. */
async function renderWebsite(response, signal) {
  const browser = await getBrowser('cpu');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1280, height: 900 } });
  let count = 0, bytes = 0;
  const abort = () => context.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET' || !['document','script','stylesheet','image'].includes(req.resourceType()) || ++count > 40 || bytes > 12_000_000) return route.abort();
      try {
        const file = req.url() === response.url ? response : await fetchWebsite(req.url(), { maxBytes: 4_000_000, signal });
        bytes += file.body.length;
        await route.fulfill({ status: 200, contentType: file.type, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
      } catch { await route.abort().catch(() => {}); }
    });
    const page = await context.newPage();
    await page.goto(response.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('h1').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    const computed = await page.evaluate(() => {
      const read = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const s = getComputedStyle(el);
        return { font: s.fontFamily, weight: s.fontWeight, color: s.color, background: s.backgroundColor, radius: s.borderRadius };
      };
      return { body: read('body'), heading: read('h1'), button: read('main button,main a[class*="btn"],a[class*="button"],button') };
    });
    return { html: await page.content(), computed };
  } finally { signal?.removeEventListener('abort', abort); await context.close(); }
}

export async function scanWebsite(input, { fetcher = fetchWebsite, render = renderWebsite, signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  const url = websiteUrl(input).href;
  const response = await fetcher(url, { signal });
  if (!['text/html', 'application/xhtml+xml'].includes(response.type)) throw new Error('That URL is not a web page. Enter your website’s home or about page.');
  let page = readWebsiteHtml(response.body.toString('utf8'), response.url);
  const warnings = [];
  let computed;
  if (page.text.length < 200) {
    try {
      const rendered = await render(response, signal);
      page = readWebsiteHtml(rendered.html, response.url);
      computed = rendered.computed;
    } catch { warnings.push('The live page could not be rendered. Suggestions use its available metadata and styles.'); }
  }
  if (page.text.length < 100 && !page.description) throw new Error('This page has too little readable content. Try a public about or services page, or create the brand manually.');
  if (page.text.length < 100) warnings.push('Limited page text was available; review the suggested business description and audience.');
  const sheets = await Promise.all(page.sheets.map(async (url) => {
    try {
      const sheet = await fetcher(url, { maxBytes: 1_000_000, signal });
      if (sheet.type !== 'text/css') throw new Error('Not CSS');
      return { url: sheet.url, text: sheet.body.toString('utf8') };
    } catch { warnings.push('One or more stylesheets could not be read; some styles may be approximate.'); return null; }
  }));
  const identity = cssIdentity([...page.styles, ...sheets.filter(Boolean).map((s) => s.text)].join('\n'));
  if (!identity.colors.length) warnings.push('No stylesheet colours were detected; palette colours are AI suggestions.');
  if (!identity.fonts.length) warnings.push('No font families were detected; fonts are AI suggestions.');
  const logos = [];
  for (const candidate of page.logos) {
    signal.throwIfAborted();
    if (logos.length >= 3) break;
    try {
      const image = candidate.svg ? { body: Buffer.from(candidate.svg), type: 'image/svg+xml' } : await fetcher(candidate.url, { maxBytes: 1_000_000, signal });
      const safe = safeLogo(image.body, image.type);
      if (safe) logos.push({ ...safe, label: candidate.label });
    } catch { /* logo is optional; keep the rest of the brand usable */ }
  }
  if (!logos.length) warnings.push('No usable logo was found. A wordmark will be used; you can upload a logo later.');
  return { evidence: { url: page.url, name: page.name, title: page.title, description: page.description, headings: page.headings, text: page.text, themeColor: page.themeColor, computed, ...identity },
    sources: [page.url, ...sheets.filter(Boolean).map((s) => s.url)], warnings: [...new Set(warnings)], logos };
}
