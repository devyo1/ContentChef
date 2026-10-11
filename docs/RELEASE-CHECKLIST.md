# Before the first public release

One-time decisions and chores. Everything else (tests, installers, release drafts) is automated.

## Decide

- [ ] **Name check.** Search "Content Chef" for existing products or trademarks in your market, and grab the GitHub org / domain you want.
- [ ] **License.** MIT is a placeholder (permissive, popular). Alternatives: Apache-2.0 (adds a patent grant) or AGPL-3.0 (forks that run it as a service must share their changes).
- [ ] **Repository URL.** Add `"repository": "github:<owner>/content-chef"` to `package.json` so release publishing knows where to upload.

## Clean up

- [ ] Start the public repo from a fresh history (or check `git log`) so no personal files ever existed in it.
- [ ] Confirm `brands/`, `catalog/`, `output/` and `data/` are **not** committed. They're git-ignored, and `examples/` holds the shipped demo content.
- [ ] The demo B-roll in `examples/brands/northside-coffee/assets/broll-demo.mp4` is generated (ffmpeg gradients), so it's safe to ship.
- [ ] Add a few screenshots / a GIF to the README (the canvas view and a bulk export make good ones).

## Ship

- [ ] Optional but recommended: code-signing certificates. Unsigned Windows installers show a SmartScreen warning, and unsigned macOS apps need right-click → Open. Add the secrets the release workflow mentions.
- [ ] Bump `version` in `package.json`, commit, then tag: `git tag v0.1.0 && git push --tags`.
- [ ] The **Release** workflow builds Windows, macOS and Linux installers and attaches them to a **draft** release. Test one, then publish.
