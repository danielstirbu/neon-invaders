# NEON INVADERS — notes for agents

Synthwave space shooter (HTML5 Canvas + vanilla ES6 + Tailwind CDN + Web Audio API).
No build step, no dependencies: `index.html`, `style.css`, `script.js`.

## Canonical location & workflow
- This clone (`/workspace/project/neon-invaders`) is the ONLY copy. Never edit or
  create game files elsewhere in `/workspace` (root copies caused drift before and
  were removed on 2026-11-14).
- `/workspace/project/.git` (stray, empty) was deleted — do not `git init` at
  `/workspace` or `/workspace/project` level; OpenHands internal data
  (`conversations/`, `bash_events/`) lives there.
- Flow: edit here → commit → push `origin main` → reload the page (http.server
  sends no cache headers, but browsers do cache).
- Remote: `github.com/danielstirbu/neon-invaders` (renamed from `llm` on
  2026-11-14; GitHub redirects the old URL). Remote URL embeds a PAT from the
  original setup — replace with a clean URL + credential helper if asked.

## Serving / test ports
- Serve from this directory: `nohup python3 -m http.server 8011 --bind 0.0.0.0 >/tmp/http8011.log 2>&1 &` (and 8012 if a second port is wanted).
- Hosts mapped by the environment: port 8011 → http://10.13.42.90:49761,
  port 8012 → http://10.13.42.90:50167.
- Processes do not survive container rebuilds; files do (ZFS dataset mounted at
  /workspace). Restart the server after any container restart.
- Headless validation lives in /tmp/e2e (puppeteer): `test.js`, `test_touch.js`,
  `test_boss.js` — /tmp is ephemeral, expect to recreate after rebuilds.

## Project rules learned
- Android Chrome: never trust `100vh` (includes area behind URL bar). `.game-shell`
  uses `100dvh` + JS anchoring to `window.innerHeight` in `fitCanvas()`; touch
  buttons are bottom-pinned and this kept them on screen (bug: controls rendered
  under the toolbar).
- Touch controls render only when `ontouchstart`/`maxTouchPoints`; they use
  `pointerdown/up/cancel` + pointer capture, `touch-action:none`, safe-area insets.
  Sizes: move 58px, fire 76px, dash 54px, dash at `right:98px; bottom:+10px` to
  avoid overlapping the right-arrow button.
- Boss (`BossEnemy`) needs its own `moveT` motion clock starting at 0; reusing the
  random-phase `t` from `Enemy` made the boss teleport to the screen edge at the
  end of its entry descent.
- UI text is Romanian with diacritics (REÎNCEARCĂ). Game-over button id:
  `btn-restart`.
