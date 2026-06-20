'use strict';

/* ============================================================
 * XStyler popup.js — UI logic
 *
 * Responsibilities:
 *  1. Load + render theme list from chrome.storage.local
 *  2. Import .css via file picker → parse metadata → save → set active
 *  3. Radio toggle → update prefs:global.activeThemeId
 *  4. Remove theme (except default) → delete from storage + index
 *  5. Live re-render on storage.onChanged
 *
 * Storage contract (shared with content.js + background.js):
 *   - `theme:${id}`   → { id, name, author, description, css,
 *                          isDefault, isRemote, createdAt, updatedAt }
 *   - `theme:index`   → string[]
 *   - `prefs:global`  → { activeThemeId: string | null }
 * ============================================================ */

const THEME_LIST_EL = document.getElementById('theme-list');
const EMPTY_STATE_EL = document.getElementById('empty-state');
const IMPORT_BTN_EL = document.getElementById('import-btn');
const FILE_INPUT_EL = document.getElementById('file-input');

/* ============================================================
 * Init
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  IMPORT_BTN_EL.addEventListener('click', () => FILE_INPUT_EL.click());
  FILE_INPUT_EL.addEventListener('change', handleFileImport);
  render();

  // Live updates if storage changes while popup is open
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const relevant = Object.keys(changes).some(
      (k) => k === 'prefs:global' || k === 'theme:index' || k.startsWith('theme:')
    );
    if (relevant) render();
  });
});

/* ============================================================
 * Render theme list
 * ============================================================ */
async function render() {
  try {
    const data = await chrome.storage.local.get(['theme:index', 'prefs:global']);
    const index = Array.isArray(data['theme:index']) ? data['theme:index'] : [];
    const prefs = data['prefs:global'] || { activeThemeId: null };

    THEME_LIST_EL.innerHTML = '';

    if (index.length === 0) {
      EMPTY_STATE_EL.hidden = false;
      THEME_LIST_EL.hidden = true;
      return;
    }

    EMPTY_STATE_EL.hidden = true;
    THEME_LIST_EL.hidden = false;

    // Bulk-fetch all themes in one call
    const themeKeys = index.map((id) => `theme:${id}`);
    const themesResult = await chrome.storage.local.get(themeKeys);

    for (const id of index) {
      const theme = themesResult[`theme:${id}`];
      if (!theme) continue;
      THEME_LIST_EL.appendChild(buildListItem(theme, prefs.activeThemeId === id));
    }
  } catch (err) {
    console.error('[XStyler] render failed:', err);
  }
}

function buildListItem(theme, isActive) {
  const li = document.createElement('li');
  li.className = 'xstyler-list-item';

  // Radio button (toggle active theme)
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'active-theme';
  radio.className = 'xstyler-radio';
  radio.checked = isActive;
  radio.addEventListener('change', () => setActiveTheme(theme.id));
  li.appendChild(radio);

  // Theme info
  const info = document.createElement('div');
  info.className = 'xstyler-theme-info';

  const name = document.createElement('div');
  name.className = 'xstyler-theme-name';
  name.textContent = theme.name || '(untitled)';
  if (theme.isDefault) {
    const badge = document.createElement('span');
    badge.className = 'xstyler-theme-badge';
    badge.textContent = 'default';
    name.appendChild(badge);
  }
  info.appendChild(name);

  if (theme.author && theme.author !== 'unknown') {
    const meta = document.createElement('div');
    meta.className = 'xstyler-theme-meta';
    meta.textContent = `by ${theme.author}`;
    info.appendChild(meta);
  }

  if (theme.description) {
    const desc = document.createElement('div');
    desc.className = 'xstyler-theme-desc';
    desc.textContent = theme.description;
    info.appendChild(desc);
  }
  li.appendChild(info);

  // Remove button (hidden for default — can't remove default)
  if (!theme.isDefault) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'xstyler-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeTheme(theme.id));
    li.appendChild(removeBtn);
  }

  return li;
}

/* ============================================================
 * Set active theme
 * ============================================================ */
async function setActiveTheme(themeId) {
  try {
    await chrome.storage.local.set({ 'prefs:global': { activeThemeId: themeId } });
    // storage.onChanged listener will trigger re-render
  } catch (err) {
    console.error('[XStyler] setActiveTheme failed:', err);
  }
}

/* ============================================================
 * Remove theme (non-default only)
 * ============================================================ */
async function removeTheme(themeId) {
  try {
    const data = await chrome.storage.local.get(['theme:index', 'prefs:global']);
    const index = Array.isArray(data['theme:index']) ? data['theme:index'] : [];
    const prefs = data['prefs:global'] || { activeThemeId: null };

    // Remove theme entry
    await chrome.storage.local.remove(`theme:${themeId}`);

    // Update index (filter out removed ID)
    const newIndex = index.filter((id) => id !== themeId);
    const updates = { 'theme:index': newIndex };

    // If removed theme was active, deactivate
    if (prefs.activeThemeId === themeId) {
      updates['prefs:global'] = { activeThemeId: null };
    }

    await chrome.storage.local.set(updates);
    // storage.onChanged listener will trigger re-render
  } catch (err) {
    console.error('[XStyler] removeTheme failed:', err);
  }
}

/* ============================================================
 * File import → parse metadata → save → set active
 * ============================================================ */
async function handleFileImport(event) {
  const file = event.target.files && event.target.files[0];
  // Reset input value so the same file can be re-imported later
  event.target.value = '';

  if (!file) return;

  // Guard: only .css
  if (!file.name.toLowerCase().endsWith('.css')) {
    console.warn('[XStyler] import rejected: not a .css file');
    return;
  }

  try {
    const css = await readFileAsText(file);
    const meta = parseThemeMetadata(css);

    const id = crypto.randomUUID();
    const now = Date.now();

    const theme = {
      id,
      name: meta['theme-name'] || file.name.replace(/\.css$/i, ''),
      author: meta['theme-author'] || 'unknown',
      description: meta['theme-description'] || '',
      css,
      isDefault: false,
      isRemote: false,
      createdAt: now,
      updatedAt: now,
    };

    // Load current index, append new ID, save theme + updated index
    const data = await chrome.storage.local.get('theme:index');
    const index = Array.isArray(data['theme:index']) ? data['theme:index'] : [];

    const newIndex = [...index, id];
    await chrome.storage.local.set({
      [`theme:${id}`]: theme,
      'theme:index': newIndex,
      'prefs:global': { activeThemeId: id }, // auto-activate imported theme
    });

    // storage.onChanged listener will trigger re-render
  } catch (err) {
    console.error('[XStyler] import failed:', err);
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsText(file);
  });
}

/**
 * Parse `/* theme-key: value *​/` metadata comments from CSS.
 * Returns a map { 'theme-name': '...', 'theme-author': '...', ... }
 *
 * Regex uses [\\w-]+ to catch hyphenated keys like
 * `theme-recommended-twitter-theme`.
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
