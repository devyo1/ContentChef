// One-click publishing: opens a platform's own composer in an app window (signed in as the user, in
// a separate "social" session), attaches the finished image(s), fills in the caption and walks the
// platform's steps, then highlights the platform's Post button. Nothing is posted unless the user
// presses Post, or explicitly asked Content Chef to press it for them.
//
// Each platform is a short recipe of steps. Pages change, so every step looks for its target several
// ways and the window tells the user what's left to do if a step can't be completed.
import { BrowserWindow, session, clipboard } from 'electron';

export const SOCIAL_PARTITION = 'persist:content-chef-social';
const LOGIN_WAIT = 5 * 60_000;

// css: selectors tried in order; text: visible labels (buttons / links), matched case-insensitively;
// within: only inside the open dialog. Checked against the live X and Instagram composers.
const D = 'div[role="dialog"]';
export const RECIPES = {
  x: {
    name: 'X', url: 'https://x.com/compose/post', login: /\/(login|i\/flow|i\/jf\/onboarding)/,
    steps: [
      { wait: { css: ['[data-testid="tweetTextarea_0"]', 'div[role="textbox"][contenteditable="true"]'] } },
      { upload: { css: ['input[data-testid="fileInput"]', 'input[type="file"]'] } },
      { caption: { css: ['[data-testid="tweetTextarea_0"]', 'div[role="textbox"][contenteditable="true"]'] } },
    ],
    post: { css: ['[data-testid="tweetButton"]'], text: ['Post'] },
  },
  linkedin: {
    name: 'LinkedIn', url: 'https://www.linkedin.com/feed/?shareActive=true', login: /\/(login|checkpoint|uas|authwall)/,
    steps: [
      { wait: { css: ['.share-box', '.ql-editor[contenteditable="true"]', 'div[role="textbox"][contenteditable="true"]'] } },
      { click: { css: ['button[aria-label*="Add media" i]', 'button[aria-label*="Add a photo" i]', 'button[aria-label*="photo" i]'] }, then: 'upload', optional: true },
      { clickIf: { within: D, text: ['Next', 'Done'] }, timeout: 8000 },
      { caption: { css: ['.ql-editor[contenteditable="true"]', 'div[role="textbox"][contenteditable="true"]'] } },
    ],
    post: { within: D, css: ['button.share-actions__primary-action'], text: ['Post'] },
  },
  instagram: {
    name: 'Instagram', url: 'https://www.instagram.com/', login: /\/accounts\/(login|onetap)|\/challenge/,
    steps: [
      { click: { css: ['svg[aria-label="New post"]', 'svg[aria-label="Create"]'] } },
      { clickIf: { text: ['Post'] }, timeout: 3000 }, // the New post menu: Post / Live video / Ad
      { upload: { within: D, css: ['form input[type="file"]', 'input[type="file"]'] }, orClick: { within: D, text: ['Select from computer'] } },
      { clickIf: { within: D, text: ['OK'] }, timeout: 2500 }, // "video posts are now shared as reels"
      { click: { within: D, text: ['Next'] } }, // crop
      { click: { within: D, text: ['Next'] } }, // filters
      { caption: { within: D, css: ['div[aria-label="Write a caption..."]', 'div[aria-label*="caption" i][contenteditable="true"]', 'textarea[aria-label*="caption" i]'] } },
    ],
    post: { within: D, text: ['Share'] },
  },
  facebook: {
    name: 'Facebook', url: 'https://www.facebook.com/', login: /\/(login|checkpoint)/,
    steps: [
      { click: { text: ["What's on your mind?", 'What’s on your mind?'], css: ['div[role="button"][aria-label*="Create a post" i]'], partial: true } },
      { wait: { css: ['div[role="dialog"] div[role="textbox"][contenteditable="true"]'] } },
      { caption: { css: ['div[role="dialog"] div[role="textbox"][contenteditable="true"]'] } },
      { click: { css: ['div[role="dialog"] [aria-label="Photo/video" i]', 'div[role="dialog"] [aria-label*="Photo" i]'] }, then: 'upload', optional: true },
    ],
    post: { within: D, text: ['Post', 'Next'] },
  },
  tiktok: {
    name: 'TikTok', url: 'https://www.tiktok.com/tiktokstudio/upload', login: /\/login/, video: true,
    steps: [
      { upload: { css: ['input[type="file"][accept*="video"]', 'input[type="file"]'] } },
      { wait: { css: ['.public-DraftEditor-content', 'div[contenteditable="true"]'] }, timeout: 120_000 },
      { caption: { css: ['.public-DraftEditor-content', 'div[contenteditable="true"]'], replace: true } },
    ],
    post: { css: ['button[data-e2e="post_video_button"]'], text: ['Post'] },
  },
  pinterest: {
    name: 'Pinterest', url: 'https://www.pinterest.com/pin-creation-tool/', login: /\/login/,
    steps: [
      { upload: { css: ['input#storyboard-upload-input', 'input[type="file"]'] } },
      { caption: { css: ['input#storyboard-selector-title', 'input[placeholder*="title" i]'] }, field: 'title' },
      { caption: { css: ['[data-test-id="storyboard-description-field-container"] [contenteditable="true"]', 'div[aria-label*="description" i][contenteditable="true"]', 'textarea[placeholder*="description" i]'] }, field: 'description', optional: true },
    ],
    post: { text: ['Publish'] },
  },
};

// Runs inside the platform page: find an element by selector or visible label, remember it, return its box.
const FINDER = `(() => {
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const clickable = (e) => e.closest('button,a,[role="button"],[role="link"],[role="menuitem"],label') || e;
  window.__ccFind = (spec) => {
    let el = null;
    // within: only look inside the platform's post dialog (feeds have their own "Share" / "Post" buttons).
    const root = spec.within ? [...document.querySelectorAll(spec.within)].filter(visible).pop() : document;
    if (!root) return null;
    for (const css of spec.css || []) { const all = [...root.querySelectorAll(css)]; el = all.find((e) => e.type === 'file' || visible(e)); if (el) break; }
    if (!el && spec.text) {
      const want = spec.text.map((t) => t.toLowerCase());
      const nodes = [...root.querySelectorAll('button,a,[role="button"],[role="link"],[role="menuitem"],span,div')].filter(visible);
      // Wrappers often have exactly the same text as the button inside them: take the smallest match.
      const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
      const hit = nodes.filter((e) => { const t = (e.innerText || e.getAttribute('aria-label') || '').trim().toLowerCase(); return t && want.some((w) => (spec.partial ? t.startsWith(w) : t === w)); }).sort((x, y) => area(x) - area(y))[0];
      if (hit) el = clickable(hit);
    }
    if (el && el.tagName === 'svg') el = clickable(el);
    window.__ccEl = el;
    if (!el) return null;
    if (el.type !== 'file') el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, file: el.type === 'file', disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true') };
  };
  window.__ccBanner = (html, tone) => {
    let b = document.getElementById('__cc_banner');
    if (!b) { b = document.createElement('div'); b.id = '__cc_banner'; document.documentElement.appendChild(b); }
    b.setAttribute('style', 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(560px,92vw);padding:12px 18px;border-radius:14px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);color:#fff;background:' + (tone === 'ok' ? '#0f9d68' : tone === 'warn' ? '#b45309' : '#E5531A'));
    b.innerHTML = html;
  };
  window.__ccHighlight = () => { const e = window.__ccEl; if (e) { e.style.outline = '4px solid #E5531A'; e.style.outlineOffset = '3px'; e.style.borderRadius = e.style.borderRadius || '999px'; } };
})()`;

const debug = (...a) => { if (process.env.CC_DEBUG) console.warn('[publish]', ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** A recognisably normal Chrome user agent for the social session (sites block "Electron"). */
function chromeUA(ua) { return ua.replace(/\s(Electron|content-chef|Content Chef)\/\S+/gi, ''); }

export function socialSession() {
  const s = session.fromPartition(SOCIAL_PARTITION);
  s.setUserAgent(chromeUA(s.getUserAgent()));
  return s;
}

function socialWindow({ parent, title, url }) {
  const win = new BrowserWindow({
    width: 1180, height: 900, parent, title, autoHideMenuBar: true, show: true,
    webPreferences: { session: socialSession(), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  // Sign-in popups (e.g. "Continue with Google") stay in the same signed-in session.
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { session: socialSession(), contextIsolation: true, sandbox: true } } }));
  win.loadURL(url);
  return win;
}

/** Open a platform's sign-in page in the social session (Settings → Publishing → Log in). */
export function openLogin(platform, { parent } = {}) {
  const r = RECIPES[platform];
  if (!r) throw new Error('Unknown platform');
  socialWindow({ parent, title: `Log in to ${r.name}`, url: new URL(r.url).origin });
}

export async function forgetLogins() {
  await session.fromPartition(SOCIAL_PARTITION).clearStorageData();
}

/**
 * Publish one post to one platform. `files` are absolute paths of the finished images / video,
 * `caption` the text (Pinterest: first line = title). With `autoPost`, presses Post at the end.
 * Resolves with { ok, step } when the composer is filled (or the user closed the window).
 */
export async function publishPost({ platform, files, caption, autoPost = false, parent, recipes = RECIPES, loginWait = LOGIN_WAIT }) {
  const r = recipes[platform];
  if (!r) throw new Error(`Publishing to ${platform} isn't supported yet`);
  const win = socialWindow({ parent, title: `Publish to ${r.name} · Content Chef`, url: r.url });
  const wc = win.webContents;
  let closed = false;
  win.on('closed', () => { closed = true; });
  const alive = () => { if (closed) throw Object.assign(new Error('closed'), { closed: true }); };

  const dbg = wc.debugger;
  dbg.attach('1.3');
  const cdp = (method, params) => dbg.sendCommand(method, params);
  // Sites often open the file picker from a button: intercept it and hand over the files instead.
  let pickerWanted = false;
  dbg.on('message', (_e, method, params) => {
    if (method === 'Page.fileChooserOpened' && pickerWanted) {
      pickerWanted = false;
      cdp('DOM.setFileInputFiles', { files: params.mode === 'selectSingle' ? files.slice(0, 1) : files, backendNodeId: params.backendNodeId }).catch((e) => debug('picker', e.message));
    }
  });
  const setup = async () => {
    await cdp('Page.enable'); await cdp('DOM.enable'); await cdp('Runtime.enable');
    await cdp('Page.setInterceptFileChooserDialog', { enabled: true });
  };
  wc.on('did-navigate', () => { setup().catch(() => {}); });

  const js = async (code) => { alive(); try { return await wc.executeJavaScript(code, true); } catch { return null; } };
  const ensureFinder = () => js(`window.__ccFind ? 1 : (${FINDER}, 1)`);
  const banner = async (msg, tone) => { await ensureFinder(); await js(`window.__ccBanner(${JSON.stringify(msg)}, ${JSON.stringify(tone ?? '')})`); };
  const find = async (spec) => { await ensureFinder(); return js(`window.__ccFind(${JSON.stringify(spec)})`); };
  const waitFor = async (spec, timeout = 20_000) => {
    const start = Date.now();
    let warned = false;
    for (;;) {
      alive();
      const hit = await find(spec);
      if (hit) { if (warned) await banner('Thanks! Carrying on…'); return hit; }
      // Signed out: a login address, or a password box on the page.
      const loggingIn = r.login?.test(wc.getURL()) || await js(`!!document.querySelector('input[type="password"]')`);
      if (loggingIn && !warned) { warned = true; await banner(`Log in to ${esc(r.name)} in this window (once). Content Chef carries on by itself as soon as you're in.`, 'warn'); }
      if (Date.now() - start > (warned ? loginWait : timeout)) return null;
      await sleep(500);
    }
  };
  // Look for something that may or may not appear, briefly, without the login prompt.
  const poll = async (spec, ms) => { const end = Date.now() + ms; for (;;) { const h = await find(spec); if (h || Date.now() > end) return h; await sleep(300); } };
  const click = async (hit) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
  };
  const upload = async (hit) => {
    if (hit?.file) {
      const { result } = await cdp('Runtime.evaluate', { expression: 'window.__ccEl' });
      await cdp('DOM.setFileInputFiles', { files, objectId: result.objectId });
      return true;
    }
    return false;
  };
  // Paste (not type) the caption: editors keep line breaks, and hashtags don't trigger autocomplete picks.
  const paste = async (hit, text, replace) => {
    await click(hit);
    await sleep(250);
    if (replace) { wc.selectAll(); await sleep(100); }
    // Clipboard calls may be async in newer Electron: await them either way.
    const before = await clipboard.readText();
    await clipboard.writeText(String(text ?? ''));
    wc.paste();
    await sleep(400);
    if (typeof before === 'string' && before) await clipboard.writeText(before);
  };
  const text = (field) => {
    if (platform !== 'pinterest') return caption;
    const [title, ...rest] = String(caption).split('\n');
    return field === 'title' ? title.slice(0, 100) : rest.join('\n').trim() || caption;
  };

  let step = 'start';
  try {
    await new Promise((res) => wc.once('did-finish-load', res));
    await setup();
    for (const s of r.steps) {
      alive();
      step = Object.keys(s)[0];
      if (s.wait) {
        if (!(await waitFor(s.wait, s.timeout))) throw new Error(`Couldn't find the ${r.name} composer`);
      } else if (s.click || s.clickIf) {
        const hit = s.clickIf ? await poll(s.clickIf, s.timeout ?? 3000) : await waitFor(s.click, s.timeout);
        if (!hit) { if (s.clickIf || s.optional) continue; throw new Error(`Couldn't find "${(s.click.text ?? s.click.css)[0]}"`); }
        if (s.then === 'upload') pickerWanted = true;
        await click(hit);
        await sleep(s.then === 'upload' ? 2500 : 1200);
        if (s.then === 'upload' && pickerWanted) {
          // No picker opened: look for a file input that appeared instead.
          pickerWanted = false;
          const input = await find({ css: ['div[role="dialog"] input[type="file"]', 'input[type="file"]'] });
          if (!(await upload(input)) && !s.optional) throw new Error("Couldn't attach the image");
          await sleep(2500);
        }
      } else if (s.upload) {
        let hit = s.orClick ? await poll(s.upload, 4000) : await waitFor(s.upload, s.timeout ?? 15_000);
        if (!hit?.file && s.orClick) {
          const btn = await waitFor(s.orClick, 8000);
          if (btn) { pickerWanted = true; await click(btn); await sleep(2500); hit = null; }
        }
        if (hit && !(await upload(hit))) throw new Error("Couldn't attach the image");
        await sleep(r.video ? 4000 : 2500);
      } else if (s.caption) {
        const hit = await waitFor(s.caption, s.timeout ?? 20_000);
        if (!hit) { if (s.optional) continue; throw new Error("Couldn't find where the caption goes"); }
        await paste(hit, text(s.field), s.replace);
      }
    }
    step = 'post';
    const post = await waitFor(r.post, 20_000);
    if (post) await js('window.__ccHighlight()');
    if (autoPost && post && !post.disabled) {
      await click(post);
      await banner('Posted by Content Chef. Check it on your profile, then close this window.', 'ok');
    } else {
      await banner(`Image and caption are in. Check it, then press <u>${esc((r.post.text ?? ['Post'])[0])}</u>${post ? ' (highlighted)' : ''}.`, 'ok');
    }
    return { ok: true, step, posted: !!(autoPost && post && !post.disabled) };
  } catch (e) {
    if (e.closed || closed) return { ok: false, step, closed: true };
    await banner(`Almost: ${esc(e.message)}. Finish this step by hand (the image is in your Planner's posting kit to drag in).`, 'warn').catch(() => {});
    return { ok: false, step, error: e.message };
  }
}
