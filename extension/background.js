'use strict';

/* ============================================================
 * XStyler background.js — MV3 service worker (type: module)
 *
 * Responsibilities:
 *  1. Top-level storage.onChanged listener → broadcast to Twitter tabs
 *  2. onInstalled → seed default theme into storage + set active
 *  3. Optional remote fetch of default theme updates
 *
 * CRITICAL: storage.onChanged listener MUST be top-level synchronous.
 * SW auto-restarts on idle (~30s); listeners in async callbacks
 * won't be re-registered after restart.
 *
 * Storage contract (shared with content.js + popup.js):
 *   - `theme:${id}`   → { id, name, author, description, css,
 *                          isDefault, isRemote, createdAt, updatedAt }
 *   - `theme:index`   → string[]
 *   - `prefs:global`  → { activeThemeId: string | null }
 *
 * Message contract:
 *   { type: 'STORAGE_CHANGED', key: string,
 *     oldValue: any, newValue: any }
 * ============================================================ */

const BUNDLED_VERSION = '1.3.0';
const REMOTE_THEME_URL = 'https://xstyler.ryanprayoga.dev/default-theme.css';
const TWITTER_TAB_URLS = ['https://twitter.com/*', 'https://x.com/*'];

/* ============================================================
 * 1. Top-level storage.onChanged listener (CRITICAL — sync)
 * ============================================================ */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
    if (key === 'prefs:global' || key.startsWith('theme:')) {
      broadcastToTwitterTabs({ type: 'STORAGE_CHANGED', key, oldValue, newValue });
    }
  }
});

/* ============================================================
 * Broadcast helper — fire-and-forget with error swallow
 * Pattern verified: DarkReader, kiss-translator, Screenity
 * ============================================================ */
async function broadcastToTwitterTabs(msg) {
  try {
    const tabs = await chrome.tabs.query({ url: TWITTER_TAB_URLS });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {
        // "Receiving end does not exist" — CS not loaded / tab navigated away.
        // No-op: content script will read storage on next load.
      });
    }
  } catch (err) {
    console.warn('[XStyler] broadcastToTwitterTabs failed:', err);
  }
}

/* ============================================================
 * 2. onInstalled — seed default theme on first install
 * ============================================================ */
chrome.runtime.onInstalled.addListener((details) => {
  // Fire-and-forget — onInstalled callback can be async but SW may
  // be killed before async work completes. Best-effort seeding.
  if (details.reason === 'install') {
    seedDefaultTheme().then(() => {
      tryRemoteThemeUpdate().catch(() => {});
    }).catch((err) => {
      console.error('[XStyler] onInstalled seed failed:', err);
    });
  } else if (details.reason === 'update') {
    // Extension updated — refresh bundled default theme CSS in storage
    // so existing users get the new theme version without reinstall.
    refreshBundledDefault().then(() => {
      tryRemoteThemeUpdate().catch(() => {});
    }).catch((err) => {
      console.error('[XStyler] onInstalled refresh failed:', err);
    });
  }
});

async function seedDefaultTheme() {
  // Check if already seeded (avoid duplicating on extension update)
  const existing = await chrome.storage.local.get('theme:index');
  const existingIndex = existing['theme:index'];
  if (Array.isArray(existingIndex) && existingIndex.length > 0) {
    // Already seeded before — skip
    return;
  }

  // Fetch bundled default theme CSS via runtime URL
  // (SW can't import CSS as string without bundler)
  const cssUrl = chrome.runtime.getURL('default-themes/neo-brutalism.css');
  const response = await fetch(cssUrl);
  if (!response.ok) {
    throw new Error(`failed to fetch bundled default theme: ${response.status}`);
  }
  const css = await response.text();

  // Parse metadata from CSS comments
  const meta = parseThemeMetadata(css);
  const id = crypto.randomUUID();
  const now = Date.now();

  const theme = {
    id,
    name: meta['theme-name'] || 'Neo-Brutalism',
    author: meta['theme-author'] || 'unknown',
    description: meta['theme-description'] || '',
    css,
    isDefault: true,
    isRemote: false,
    createdAt: now,
    updatedAt: now,
  };

  // Seed storage: theme entry + index + prefs
  await chrome.storage.local.set({
    [`theme:${id}`]: theme,
    'theme:index': [id],
    'prefs:global': { activeThemeId: id },
  });

  console.log('[XStyler] default theme seeded:', theme.name, id);
}

/**
 * On extension update: re-fetch bundled default CSS and update the
 * existing default theme entry in storage. Without this, users who
 * installed v1.0.0 would be stuck with the old CSS — seedDefaultTheme
 * skips because theme:index already exists.
 */
async function refreshBundledDefault() {
  const indexResult = await chrome.storage.local.get('theme:index');
  const index = indexResult['theme:index'];
  if (!Array.isArray(index) || index.length === 0) {
    // No prior install — seed fresh instead
    return seedDefaultTheme();
  }

  const themeKeys = index.map((id) => `theme:${id}`);
  const themesResult = await chrome.storage.local.get(themeKeys);

  let defaultThemeId = null;
  let defaultTheme = null;
  for (const id of index) {
    const t = themesResult[`theme:${id}`];
    if (t && t.isDefault) {
      defaultThemeId = id;
      defaultTheme = t;
      break;
    }
  }
  if (!defaultTheme) {
    console.warn('[XStyler] no default theme in storage, seeding fresh');
    return seedDefaultTheme();
  }

  const cssUrl = chrome.runtime.getURL('default-themes/neo-brutalism.css');
  const response = await fetch(cssUrl);
  if (!response.ok) {
    throw new Error(`failed to fetch bundled default theme: ${response.status}`);
  }
  const newCss = await response.text();
  const meta = parseThemeMetadata(newCss);
  const newVersion = meta['theme-version'] || BUNDLED_VERSION;

  if (defaultTheme.css === newCss) {
    // Already up to date
    return;
  }

  defaultTheme.css = newCss;
  defaultTheme.updatedAt = Date.now();
  if (meta['theme-name']) defaultTheme.name = meta['theme-name'];
  if (meta['theme-author']) defaultTheme.author = meta['theme-author'];
  if (meta['theme-description']) defaultTheme.description = meta['theme-description'];

  await chrome.storage.local.set({ [`theme:${defaultThemeId}`]: defaultTheme });
  console.log(`[XStyler] default theme refreshed to v${newVersion}`);
}

/* ============================================================
 * 3. Remote fetch — best-effort default theme update
 *
 * Policy: remote CSS treated as DATA (replaceSync), never as code.
 * Remote version > bundled → update existing default in place.
 * ============================================================ */
chrome.runtime.onStartup.addListener(() => {
  tryRemoteThemeUpdate().catch(() => {});
});

async function tryRemoteThemeUpdate() {
  let response;
  try {
    response = await fetch(REMOTE_THEME_URL, { cache: 'no-cache' });
  } catch (err) {
    // Offline / server down — no-op
    return;
  }
  if (!response.ok) {
    console.warn('[XStyler] remote theme fetch failed:', response.status);
    return;
  }

  const remoteCss = await response.text();
  const meta = parseThemeMetadata(remoteCss);
  const remoteVersion = meta['theme-version'];

  if (!remoteVersion) {
    console.warn('[XStyler] remote theme missing theme-version metadata, skipping');
    return;
  }

  if (!isVersionNewer(remoteVersion, BUNDLED_VERSION)) {
    // Remote is same or older — no update needed
    return;
  }

  // Find existing default theme in storage and update in place
  const indexResult = await chrome.storage.local.get('theme:index');
  const index = indexResult['theme:index'];
  if (!Array.isArray(index) || index.length === 0) {
    console.warn('[XStyler] no theme:index found, cannot apply remote update');
    return;
  }

  // Bulk-fetch all themes to find the default one
  const themeKeys = index.map((id) => `theme:${id}`);
  const themesResult = await chrome.storage.local.get(themeKeys);

  let defaultThemeId = null;
  let defaultTheme = null;
  for (const id of index) {
    const t = themesResult[`theme:${id}`];
    if (t && t.isDefault) {
      defaultThemeId = id;
      defaultTheme = t;
      break;
    }
  }

  if (!defaultTheme) {
    console.warn('[XStyler] no default theme found in storage to update');
    return;
  }

  // Update CSS + version + timestamp in place
  defaultTheme.css = remoteCss;
  defaultTheme.updatedAt = Date.now();
  defaultTheme.isRemote = true;

  await chrome.storage.local.set({ [`theme:${defaultThemeId}`]: defaultTheme });
  console.log(`[XStyler] default theme updated from remote: v${BUNDLED_VERSION} → v${remoteVersion}`);
}

/* ============================================================
 * Helpers
 * ============================================================ */

/**
 * Parse `/* theme-key: value *​/` metadata comments from CSS.
 * Returns a map { 'theme-name': '...', 'theme-author': '...', ... }
 */
function parseThemeMetadata(css) {
  const meta = {};
  const re = /\/\*\s*theme-([\w-]+):\s*(.+?)\s*\*\//g;
  let m;
  while ((m = re.exec(css)) !== null) {
    meta[`theme-${m[1]}`] = m[2];
  }
  return meta;
}

/**
 * Returns true if `remote` is strictly newer than `bundled`.
 * Compares semver-style "major.minor.patch".
 */
function isVersionNewer(remote, bundled) {
  const r = String(remote).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(bundled).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(r.length, b.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0;
    const bv = b[i] || 0;
    if (rv > bv) return true;
    if (rv < bv) return false;
  }
  return false; // equal
}
