# PLAN: Twitter Theme Executor

## KONSEP
Ekstensi browser yang berfungsi sebagai "theme loader/executor" untuk Twitter/X.
- Ekstensi kosongan (ngak ada tema hardcode)
- User import file tema (.css) ke ekstensi
- Ekstensi inject CSS tersebut ke twitter.com/x.com
- User bisa ganti tema kapan saja tanpa install ekstensi baru

## FASE 1: EKSTENSI DASAR (CURRENT)
Bikin ekstensi yang bisa:
1. Load file CSS dari lokal (file picker)
2. Inject CSS ke twitter.com dan x.com
3. Toggle on/off tema yang aktif
4. Simpen tema yang sudah di-import (chrome.storage)

### Struktur Folder Ekstensi
```
extension/
├── manifest.json          # Manifest V3 config
├── background.js           # Service worker (handle install, storage)
├── content.js              # Content script (inject CSS ke page)
├── popup.html              # UI popup saat klik icon ekstensi
├── popup.css               # Style popup
├── popup.js                # Logic popup (import, toggle, list tema)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### manifest.json
- manifest_version: 3
- content_scripts: match twitter.com + x.com
- permissions: storage, activeTab
- action: popup (popup.html)
- host_permissions: twitter.com, x.com

### Alur Kerja Ekstensi
1. User klik icon ekstensi → popup muncul
2. Popup nampilin:
   - List tema yang sudah di-import
   - Tombol "Import Theme" (file picker .css)
   - Toggle on/off per tema
   - Tombol "Remove" per tema
3. Saat user pilih tema → simpen CSS ke chrome.storage
4. Content script baca tema aktif dari storage → inject ke page
5. Saat toggle off → remove CSS dari page

### Format File Tema
.css file biasa. Contoh:
```css
/* theme-name: Dark Purple */
/* theme-author: anon */
/* theme-description: Dark theme with purple accent */

body {
  background-color: #1a1a2e !important;
  color: #e0e0e0 !important;
}

/* CSS variables Twitter */
:root {
  --primary-color: #6c5ce7 !important;
  --background-color: #1a1a2e !important;
}
```

Header komentar dipake buat metadata (nama, author, deskripsi).

## FASE 2: LANDING PAGE
- Gallery tema yang bisa di-download
- Upload/share tema
- Custom theme builder (web-based, generate .css)
- Download ekstensi
- Cara install

### Struktur Folder Landing
```
landing/
├── index.html
├── style.css
├── script.js
├── themes/              # File tema .css yang bisa di-download
│   ├── dark-purple.css
│   ├── midnight-blue.css
│   └── ...
├── extension/           # Ekstensi siap download (.zip)
│   └── twitter-theme-executor.zip
└── assets/              # Screenshot, preview
```

## FASE 3: THEME BUILDER (WEB)
- Form di landing page: pilih warna, font, dll
- Generate .css file yang bisa di-download
- Preview real-time
- Share ke gallery

## TIMELINE
1. Fase 1 (Ekstensi dasar): 2-3 hari
2. Fase 2 (Landing page): 2-3 hari
3. Fase 3 (Theme builder): 3-4 hari

## TECH STACK
- Ekstensi: Vanilla JS, Chrome Extension Manifest V3
- Landing page: HTML + CSS + JS (no framework, no CDN)
- Hosting: TBD (VPS / GitHub Pages / Netlify)

## YANG PERLU DIPUTUSIN
1. Nama ekstensi: ? (saran: "Twintone" / "ThemeDeck" / "XStyler")
2. Tema default yang mau lu bikin pertama: ?
3. Hosting landing page di mana: ?
4. Domain: ? (anonymous .xyz/.top atau apa?)
