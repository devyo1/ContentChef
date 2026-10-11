# Contributing to Content Chef

Thanks for helping! This project is small and dependency-light on purpose. Please keep it that way.

## Setup

```bash
npm install
npm run setup      # downloads the Chromium used for rendering (one-off)
npm start          # editor at http://localhost:4545
npm run desktop    # the same editor in the desktop (Electron) window
npm test           # unit tests (fast, no browser)
```

## How it fits together

| Path | What it does |
|---|---|
| `src/core/` | Everything that makes content: brands, palettes, fonts, templates, rendering (Playwright + ffmpeg), captions, bulk generation. No UI code. |
| `src/core/templates/` | One file per template. `base.js` holds shared CSS/helpers; `runtime.client.js` runs inside each ad page (text fitting, animation timeline, effects). |
| `src/tools.js` | Every action an AI assistant can take, defined once (zod schemas + handlers). |
| `src/mcp.js` | Exposes those tools over MCP (Claude Desktop, Claude Code, other clients). |
| `src/chat.js`, `src/claude-code.js`, `src/codex.js` | The in-app chat: Anthropic API, local Claude Code, or ChatGPT through local Codex. |
| `src/copywriter.js` | Copy and caption generation, routed through the same assistant connection. |
| `src/website-scan.js`, `src/brand-import.js` | Public website/CSS extraction, isolated rendering for JS-only pages, validated AI brand drafts and explicit creation. |
| `src/server.js` | Local web server for the editor (binds to localhost only). |
| `public/` | The editor UI: Preact + htm, no build step. |
| `electron/` | The desktop app shell. |
| `tests/` | Unit tests (`node --test`). |

## Adding a template

1. Create `src/core/templates/<id>.js` exporting `{ id, name, description, category, fields, render(ctx) → { css, body } }`.
2. Register it in `src/core/templates/index.js`.
3. Size everything in `var(--u)` (1% of the ad's short side) so it works at every format, and use `var(--pad-top)` / `var(--pad-bottom)` so Story formats keep text out of the app UI.
4. Mark auto-sized text with `data-fit data-min data-max` inside a `.fitbox` with a definite height.
5. Check it: render every format with and without a background image, and the first frame of every motion preset. Nothing may be visible at t = 0 except the background.

**Custom (no-code) templates** live as JSON in the workspace's `templates/` folder: `{ name, description, fields, css, html }`, where the HTML uses `{{tokens}}` (`{{root}}`, `{{bg}}`, `{{headline}}`, `{{body}}`, `{{points}}`…) and `{{#if field}}…{{/if}}`. They're sanitised (no scripts, handlers or remote URLs) and hot-reloaded. The MCP tools `template_guide`, `save_template`, `get_template` and `delete_template` let Claude make them; see `src/core/templates/custom.js` for the token list. `examples/templates/` is copied into new workspaces.

## Guidelines

- Rendering must be deterministic: no `Date.now()` or randomness inside templates (except defaults the user can override, like the lock-screen date).
- Colours come from the palette. Use the CSS variables (`--bg`, `--fg`, `--accent`, `--block`, `--g1…`), never hard-coded brand colours.
- Run `npm test` before opening a PR.
- Codex integration tests use local child-process fixtures and need no account. For a live check, sign in to Codex with ChatGPT, choose it in Settings, ask the assistant to inspect/edit a demo design, send a follow-up, and try both copywriting and captions.
