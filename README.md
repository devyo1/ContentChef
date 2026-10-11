<p align="center"><img src="public/logo.svg" width="96" alt="Content Chef logo"></p>

<h1 align="center">Content Chef</h1>

<p align="center">Design social content once, in your brand. Export every size as a crisp image or video.<br>
Ads <i>and</i> value posts: tips, lists, stats, text posts, photo posts. Built so ChatGPT, Claude (or you) can cook it all up.</p>

---

## Download

Grab the installer for your system from the **[Releases](../../releases)** page:

| System | File |
|---|---|
| Windows | `Content-Chef-x.y.z-win-x64.exe` |
| macOS | `Content-Chef-x.y.z-mac-*.dmg` |
| Linux | `Content-Chef-x.y.z-linux-*.AppImage` |

Install, open, done. There's no terminal and nothing else to install. Your brands and exports live in **Documents/Content Chef**.

> The first export downloads a rendering engine if your computer has neither Edge nor Chrome (one-off, about 150 MB).

## What it does

- **Start a brand from your website.** Choose **New brand → From my website**, paste a URL and optionally describe what you want to advertise or who you want to reach. Your connected assistant reads the page and styles, suggests colours, fonts, audience and voice, and shows a starter kit to review. Choose a detected logo or keep a wordmark, then **Create brand & fine-tune**. The saved audience and ad goals guide later copy and captions. Sites with little readable content, blocked styles or unavailable fonts are flagged in the review; you can always start manually.
- **Brand kit.** Fonts (picked visually), logo, colourways, button style and caption voice. Everything you make stays on brand.
- **28 templates in four families:**
  - *Promo & ads*: Headline, Stack, Split, Frame, Big Offer, Event, Ticket, Menu
  - *Value & education*: Insight, List, Big Stat, This vs That, Carousel Cover, Newspaper, Quote, Minimal
  - *Social-native*: Text Post, iPhone Notes, Chat (iMessage), Poll, iPhone notification, liquid glass, highlighter
  - *Photo*: Photo Story, Photo Card, Polaroid, Magazine Cover, Spotlight
- **Your own templates.** Ask your assistant to design a brand-new template; it appears in the template browser under *Custom* (a Receipt example ships with the app).
- **Write with ChatGPT or Claude.** One click in the Words step writes on-brand copy (headline versions, body text, list points or a whole bulk list), with an optional brief and Undo. It only changes the words.
- **See every variation.** A rail in the preview shows every ad × template × colourway being made, and the Canvas view lays them all out on a free, zoomable board.
- **Every size at once.** Instagram (feed + Story), TikTok, Facebook, X, LinkedIn, Pinterest, YouTube and display banners. Text auto-fits each size, and Story layouts keep clear of the app UI.
- **Bulk mode.** Paste a spreadsheet of headlines and get a full set for each row, plus a CSV of every file and caption.
- **Motion and effects.** Fade up, Typewriter, Word rise, Pop or Wipe, plus Glimmer and Holo shimmer effects. Exports as MP4, including over your own background videos.
- **Colour generator.** Like coolors.co with locks and harmonies, and every palette is contrast-checked.
- **Click to edit.** Click any text in the preview to restyle it (colour, font, size in px, spacing, case) and drag it to move it, for every size at once or just one.
- **Photos your way.** Crop, zoom and flip background photos and videos, layer a grid, dots, glow or tint over them, and use GIFs as animated backgrounds.
- **Stickers.** Hand-drawn arrows, circles, underlines, sparkles and starbursts that draw themselves in, or custom animated SVGs from Claude.
- **Button animations and seamless loops.** Shine, arrow nudge or pulse on the CTA, and loop lengths that snap to repeat perfectly.
- **Captions** written to each platform's rules and limits (or by Claude, in each platform's style), with per-platform switches for caption, link, hashtags and the on-ad button.
- **Export your way.** PNG, JPG, MP4 and looping GIF; right-click any ad in Canvas to export just that one, and watch renders come together in the export popup. Undo / redo everything.
- **Dashboard and Video mode.** See every brand and recent work at a glance, and trim / crop / speed up clips for Reels and Stories.

## ChatGPT and Claude can drive it

Content Chef is an **MCP connector**, so your assistant can see your design (including a rendered image), change it live in your editor, create templates, generate palettes, write copy and export.

- **ChatGPT account:** choose **Settings → AI assistant → My ChatGPT account (via Codex)**. Install a current [Codex CLI](https://developers.openai.com/codex/cli) (`npm install -g @openai/codex`) if needed, click **Sign in with ChatGPT**, finish in your browser, then **Check again**. If Codex is already signed in with ChatGPT, it works immediately. Press **Ask ChatGPT** to start. Copywriting and captions use the same connection, with no API key required.
- **Claude:** select your Claude account through Claude Code, or an Anthropic API key, in the same settings. Existing installations keep their selected Claude connection.
- **From Codex, Claude Desktop or Claude Code:** **Settings → Use Content Chef from other AI apps** shows the exact command or config for your machine.

The ChatGPT connection uses Codex's local login and counts against your plan's Codex usage limits. It requires a recent CLI with `--ignore-user-config` support. Content Chef detects native, npm and desktop CLI installations; you can also set an executable path. Leave the model blank for Codex's default or enter a model available to your account. It runs with separate configuration, a read-only sandbox and shell tools disabled, connecting only Content Chef's MCP server. Your Codex settings are not changed. See [Codex authentication](https://developers.openai.com/codex/auth) and [non-interactive mode](https://developers.openai.com/codex/noninteractive).

## Run from source

Use Node.js 20.18.1 or newer.

```bash
npm install
npm run setup      # rendering engine (one-off)
npm start          # editor in your browser → http://localhost:4545
npm run desktop    # or in the desktop window
npm test
npm run dist:win   # build an installer (dist:mac / dist:linux)
```

From source, your work lives in the project folder (`brands/`, `catalog/`, `templates/`, `output/`, `data/`, all git-ignored). On first run these are seeded from `examples/`.

## CLI

```bash
node src/cli.js render <campaign> [--only id,id] [--scale 2] [--jpg]
node src/cli.js quick --brand pulse-fitness --headline "No excuses. *Just reps.*" --templates headline,list --formats instagram
node src/cli.js brands | templates | formats | catalogs
```

## Privacy and security

- Everything runs on your computer. The editor server only listens on `localhost`.
- Your API key (if you use one) stays in `data/settings.json` on your machine.
- ChatGPT sign-in credentials stay with Codex; Content Chef does not copy them into its settings or send them to the browser. AI requests send the relevant brief, conversation and tool results to the selected provider.
- Custom templates are plain HTML/CSS (no scripts), so a template can't run code.
- Fonts load from Google Fonts while rendering. Upload font files to a brand to work fully offline.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
