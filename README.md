# XStyler

Chrome extension to import and apply CSS themes to Twitter/X (twitter.com, x.com).

The extension ships with one default theme (Neo-Brutalism) and lets users import additional `.css` theme files. Themes are stored locally in `chrome.storage.local` — no data ever leaves the user's browser.

## Status

🚧 **Planning phase** — see [PLAN.md](./PLAN.md) for the full design document.

## Concept

- Extension bundles 1 default theme (Neo-Brutalism) as fallback
- User can import `.css` theme files via the popup
- Extension injects the active theme's CSS into twitter.com/x.com
- Single active theme (radio button behavior)
- Optional: extension fetches default theme updates from `xstyler.ryanprayoga.dev`

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JS (no framework, no CDN)
- `chrome.storage.local` for theme persistence
- Landing page: static HTML/CSS/JS hosted on `xstyler.ryanprayoga.dev`

## License

MIT
