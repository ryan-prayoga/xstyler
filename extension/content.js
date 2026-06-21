'use strict';

/* ============================================================
 * XStyler content.js — runs at document_start on twitter.com / x.com
 *
 * Responsibilities:
 *  1. Inject default Neo-Brutalism theme SYNCHRONOUSLY (FOUC-free)
 *  2. Read storage async → apply user's active theme
 *  3. Listen for STORAGE_CHANGED messages from background SW
 *  4. Re-inject if Twitter SPA strips our style (MutationObserver)
 *
 * Storage contract (shared with background.js + popup.js):
 *   - `theme:${id}`   → { id, name, author, description, css,
 *                          isDefault, isRemote, createdAt, updatedAt }
 *   - `theme:index`   → string[]  (ordered theme IDs)
 *   - `prefs:global`  → { activeThemeId: string | null }
 *
 * Message contract:
 *   { type: 'STORAGE_CHANGED', key: string,
 *     oldValue: any, newValue: any }
 * ============================================================ */

/* ---- Inline default CSS (FOUC-free guarantee) -------------
 * This string MUST match extension/default-themes/neo-brutalism.css.
 * Applied synchronously before the async storage read below,
 * so users on the default theme never see unstyled Twitter.
 *
 * v1.4.0 — fixes from full element dump: global a { color } override,
 * verified icon, tweetTextarea, app-text-transition-container,
 * show more link, timestamp, nav rail, caret button.
 * ---------------------------------------------------------- */
const DEFAULT_THEME_CSS = `/* theme-name: Neo-Brutalism */
/* theme-author: Ryan Prayoga */
/* theme-description: Loud. Raw. Unapologetic. Hard shadows, thick black borders, saturated color blocks. */
/* theme-version: 1.5.1 */
/* theme-recommended-twitter-theme: Default (Light) */

/* ============================================================
   XStyler — Neo-Brutalism default theme (v1.5.1)
   Comprehensive Twitter/X override.
   Revised after live DOM inspection of twitter.com/x.com.
   v1.4.0: fixes from full element dump — <a> default blue, verified
   icon, tweetTextarea, app-text-transition-container, show more link.

   STRATEGY:
   1. Kill inline body bg + hijack Twitter CSS vars
   2. Override color-scheme on :root
   3. Target .r-* atomic classes that carry background
   4. data-testid for structural elements
   5. SVG fill/stroke for icons
   6. Tweet metadata (name, handle, timestamp, counts)
   7. Sidebar widgets (trending, who-to-follow)
   8. Cards, quote tweets, media containers
   9. Dropdowns, modals, composer toolbar
   10. Polls, notifications, profile tabs, danger buttons
   ============================================================ */

/* ============================================================
   1. ROOT + BASE
   ============================================================ */
:root {
  color-scheme: light !important;
}

html,
body {
  background-color: #FFFDF5 !important;
  color: #000 !important;
  font-family: "Courier New", ui-monospace, monospace !important;
}

#react-root,
#react-root > div {
  background-color: #FFFDF5 !important;
  color: #000 !important;
}

/* Twitter theme class overrides — hijack their CSS vars */
body.LightsOut,
body.Dim,
body.Default {
  background-color: #FFFDF5 !important;
  color: #000 !important;
  --border-color: #000 !important;
  --color: #000 !important;
  --color-emphasis: #000 !important;
  --hover-bg-color: #FECA57 !important;
  --background-color: #FFFDF5 !important;
  --primary-color: #FF4757 !important;
  --accent-color: #FF4757 !important;
}

/* ============================================================
   2. INLINE STYLE OVERRIDES
   ============================================================ */
[style*="background-color: rgb(0, 0, 0)"],
[style*="background-color: rgb(5, 5, 5)"],
[style*="background-color: rgb(21, 32, 43)"] {
  background-color: #FFFDF5 !important;
}

[style*="background-color: rgb(255, 255, 255)"] {
  background-color: #FFFDF5 !important;
}

[style*="background-color: rgb(29, 155, 240)"] {
  background-color: #FF4757 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
}

[style^="color: rgb(29, 155, 240)"] {
  color: #FF4757 !important;
  font-weight: 700 !important;
}

[style^="color: rgb(113, 118, 123)"] {
  color: #000 !important;
  font-weight: 600 !important;
}

[style^="color: rgb(239, 243, 24)"] {
  color: #000 !important;
}

[style^="color: rgb(249, 24, 128)"] {
  color: #FF4757 !important;
}

[style^="color: rgb(0, 186, 124)"] {
  color: #2ECC71 !important;
}

[style^="color: rgb(244, 33, 46)"] {
  color: #FF4757 !important;
}

[style^="background-color: rgb(107, 201, 251)"] {
  background-color: #FECA57 !important;
}

[style*="scrollbar-color: rgb(62, 65, 68) rgb(22, 24, 28)"] {
  scrollbar-color: #000 transparent !important;
  scrollbar-width: thin !important;
}

/* ============================================================
   3. ATOMIC CLASS OVERRIDES (.r-*)
   ============================================================ */
.r-yfoy6g { background-color: #FFFDF5 !important; }
.r-g6ijar { background-color: #FFFDF5 !important; }
.r-ii8lfi { background-color: #FFFDF5 !important; }

.r-8erxvq {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
}

.r-xnswec {
  background-color: #FFFDF5 !important;
  border: 3px solid #000 !important;
  box-shadow: 6px 6px 0 0 #000 !important;
}

.r-5zmot {
  background-color: rgba(255, 253, 245, 0.85) !important;
  backdrop-filter: blur(12px) !important;
  border-bottom: 4px solid #000 !important;
}

.r-1ldzwu0 * { stroke: #FF4757 !important; }
.r-19wmn03 { color: #FF4757 !important; }

/* Polls */
.r-1fneopy { border-color: #000 !important; }
.r-1fneopy > * { color: #000 !important; }
.r-eok2q2 { background-color: rgba(255, 71, 87, 0.8) !important; }
.r-1peqgm7 { background-color: rgba(254, 202, 87, 0.3) !important; }

/* Notification colors */
.r-vkub15 { color: #FF4757 !important; }
.r-o6sn0f { color: #2ECC71 !important; }

/* User URL */
[data-testid="UserUrl"] { color: #FF4757 !important; }

/* Show more buttons */
[role="link"].r-1vvnge1 * { color: #FF4757 !important; }

/* Search filter ring */
.r-vhj8yc { border-color: #000 !important; }

/* Settings borders */
.r-1pbtemp { border-right-color: #000 !important; }

/* Password/input prompt */
.r-9cip40 { box-shadow: #000 0px 0px 0px 2px !important; }

/* Side tweet button hover */
.r-1vtznih,
.r-yuvema { background-color: rgba(255, 71, 87, 0.8) !important; }

/* Video upload progress */
[style*="background-color: rgb(2, 17, 61)"].r-1xfd6ze {
  background-color: #2ECC71 !important;
}

/* "You can reply" box */
.r-rgqbpe { background-color: #FECA57 !important; }

/* Error state */
.r-1kwlb9n { background-color: #FF4757 !important; }

/* Accent text spreads */
.r-13gxpu9 { color: #FF4757 !important; }
.r-1cvl2hr,
.r-1cvl2hr * { color: #FF4757 !important; }
.r-l5o3uw { background-color: #FF4757 !important; }

/* DM chat bubbles */
.r-eff69c { background-color: #FF4757 !important; color: #FFF !important; }
.r-hjejmn { background-color: #FFF !important; border: 2px solid #000 !important; }

/* Backdrop blur behind images */
.r-11yh6sk.r-buy8e9 { backdrop-filter: blur(4px) !important; }

/* ============================================================
   4. STRUCTURAL — data-testid
   ============================================================ */
[data-testid="primaryColumn"] {
  background-color: #FFFDF5 !important;
  border: 4px solid #000 !important;
  box-shadow: 8px 8px 0 0 #000 !important;
  margin: 8px !important;
}

[data-testid="primaryColumn"] > div {
  background-color: #FFFDF5 !important;
}

[data-testid="sidebarColumn"] {
  background-color: #FFFDF5 !important;
  /* NO outer frame: the column is full page height (~5000px) but its
     content is short, so a 4px border + 6px shadow rendered as a long
     empty black bar down the right edge (looked like a "cut line").
     Inner widget cards carry their own border+shadow as floating
     blocks. Clip horizontally (clip, not hidden → sticky unaffected)
     so card shadows don't poke into the feed gutter. */
  overflow-x: clip !important;
}

[data-testid="tweet"] {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  margin: 6px 0 !important;
  padding: 12px !important;
}

[data-testid="tweet"]:hover {
  background-color: #FECA57 !important;
}

[data-testid="tweetText"] {
  font-weight: 700 !important;
  color: #000 !important;
  font-size: 16px !important;
  line-height: 1.4 !important;
}

[data-testid="tweetButton"] {
  background-color: #FECA57 !important;
  color: #000 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
}

[data-testid="tweetButtonInline"] {
  background-color: #FECA57 !important;
  color: #000 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  font-weight: 800 !important;
}

/* Avatars */
[data-testid^="UserAvatar-Container"] {
  border-radius: 0 !important;
  border: 3px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
}
[data-testid^="UserAvatar-Container"] img { border-radius: 0 !important; }

/* Search — border lives on the parent form (icon+input as one box,
   see sec H). Input itself is borderless so the magnifier isn't
   fenced off in its own cell by the input's left border. */
input[type="text"][data-testid="SearchBox_Search_Input"],
input[data-testid="SearchBox_Search_Input"] {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #000 !important;
  font-weight: 600 !important;
}

/* Links */
[data-testid="tweet"] a[href],
[data-testid="tweetText"] a[href] {
  color: #FF4757 !important;
  text-decoration: underline !important;
  font-weight: 700 !important;
}

/* Compose */
textarea[data-testid="tweetTextarea_0"],
[contenteditable="true"][data-testid="tweetTextarea_0"] {
  color: #000 !important;
  font-weight: 600 !important;
  background-color: #FFFDF5 !important;
}

/* Loading */
[aria-label="Loading…"] { background-color: #FFFDF5 !important; }

/* Cards (NOT placementTracking — it wraps tracking pixels too small
   to border; cellInnerDiv provides the visible frame for promoted
   tweets. Bordering it produced a stray ~7px black notch.) */
[data-testid="cardWrapper"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  background-color: #FFF !important;
}

/* Block confirm */
[data-testid="confirmationSheetConfirm"] {
  background-color: #FF4757 !important;
  color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  font-weight: 800 !important;
}

/* ============================================================
   5. SVG / ICONS
   ============================================================ */
[data-testid="icon-verified"] > g > [fill="#1d9bf0"],
[data-testid="verificationBadge"] > g > [fill="#1d9bf0"] {
  fill: #FF4757 !important;
}

/* Yellow verified gradient */
[data-testid="icon-verified"] > g > g > [fill^="url(#"],
[data-testid="verificationBadge"] > g > g > [fill^="url(#"] {
  fill: #FECA57 !important;
}
[data-testid="icon-verified"] > g > g > [fill="#d18800"],
[data-testid="verificationBadge"] > g > g > [fill="#d18800"] {
  fill: #FECA57 !important;
}

[stroke="#1D9BF0"],
[stroke="#1d9bf0"] { stroke: #FF4757 !important; }

path[fill="#61BCF6"] { fill: #FECA57 !important; }
path[fill="#F16888"] { fill: #FF4757 !important; }
path[fill="#FD9E1A"] { fill: #FECA57 !important; }

/* ============================================================
   6. TWEET METADATA — name, handle, timestamp, counts
   ============================================================ */

/* Display name — bold */
[data-testid="User-Name"],
[data-testid="UserName"] {
  font-weight: 800 !important;
  color: #000 !important;
}

[data-testid="User-Name"] a,
[data-testid="UserName"] a {
  color: #000 !important;
  text-decoration: none !important;
}

[data-testid="User-Name"] a:hover,
[data-testid="UserName"] a:hover {
  color: #FF4757 !important;
  text-decoration: underline !important;
}

/* Timestamp — small muted */
[data-testid="tweet"] time,
[data-testid="User-Name"] time {
  color: #000 !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
}

/* Engagement counts (reply/retweet/like/view counts under tweet) */
[data-testid="tweet"] [href*="/status/"] {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Tweet action bar (reply/retweet/like/share row) */
[role="group"][data-testid="tweet"] + div,
[data-testid="tweet"] [role="group"] {
  border-top: 2px solid #000 !important;
  padding-top: 8px !important;
}

/* ============================================================
   7. SIDEBAR WIDGETS — trending, who-to-follow
   ============================================================ */

/* Trending section container */
[data-testid="sidebarColumn"] section,
[data-testid="sidebarColumn"] [role="complementary"] {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  margin-bottom: 12px !important;
}

/* Trending items */
[data-testid="trend"] {
  border-bottom: 2px solid #000 !important;
  padding: 10px 12px !important;
}

[data-testid="trend"]:hover {
  background-color: #FECA57 !important;
}

/* Trending rank number + category */
[data-testid="trend"] [dir="auto"] {
  color: #000 !important;
  font-weight: 700 !important;
}

/* "What's happening" header */
[data-testid="sidebarColumn"] h2,
[data-testid="sidebarColumn"] [role="heading"] {
  font-weight: 800 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  border-bottom: 3px solid #000 !important;
  padding-bottom: 8px !important;
}

/* Who-to-follow card */
[data-testid="UserCell"] {
  border-bottom: 2px solid #000 !important;
  padding: 10px 12px !important;
}

[data-testid="UserCell"]:hover {
  background-color: #FECA57 !important;
}

/* Follow button in sidebar */
[data-testid="UserCell"] [role="button"] {
  background-color: #000 !important;
  color: #FFF !important;
  border: 2px solid #000 !important;
  box-shadow: 3px 3px 0 0 #FF4757 !important;
  font-weight: 800 !important;
}

/* ============================================================
   8. CARD PREVIEWS + QUOTE TWEETS + MEDIA
   ============================================================ */

/* Link preview cards in tweets */
[data-testid="card.wrapper"],
[data-testid="SummaryCard"],
[data-testid="PlayerCard"],
[data-testid="ImageCard"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  background-color: #FFF !important;
  border-radius: 0 !important;
}

/* Quote tweet (embedded tweet inside tweet) */
[data-testid="quoteTweet"],
[data-testid="tweet"] [data-testid="tweet"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #FF4757 !important;
  background-color: #FFFDF5 !important;
  margin: 8px 0 !important;
}

/* Media containers (images/videos in tweets) */
[data-testid="tweetPhoto"],
[data-testid="videoPlayer"],
[data-testid="previewInterstitial"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
}

/* Image grid in tweets (multi-image) */
[data-testid="tweet"] [style*="grid-template"] {
  gap: 3px !important;
}

/* Sensitive media overlay */
[data-testid="button"] + [data-testid="placementTracking"],
[data-testid="sensitiveMedia"] {
  background-color: #FFFDF5 !important;
  border: 3px solid #000 !important;
}

/* ============================================================
   9. DROPDOWN MENUS + MODALS + COMPOSER
   ============================================================ */

/* Dropdown menu (three-dot, more) */
[role="menu"],
[role="menuitem"],
[role="menuitemcheckbox"] {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 6px 6px 0 0 #000 !important;
}

[role="menuitem"]:hover,
[role="menuitemcheckbox"]:hover {
  background-color: #FECA57 !important;
  color: #000 !important;
}

[role="menuitem"] [dir="auto"],
[role="menuitemcheckbox"] [dir="auto"] {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Modal overlay (image lightbox, tweet detail, compose modal) */
[aria-modal="true"],
[data-testid="mask"],
[data-testid="sheetDialog"] {
  background-color: #FFFDF5 !important;
  border: 4px solid #000 !important;
  box-shadow: 8px 8px 0 0 #000 !important;
}

/* Modal close button */
[aria-label="Close"],
[data-testid="app-bar-close"] {
  background-color: #FECA57 !important;
  color: #000 !important;
  border: 2px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
  font-weight: 800 !important;
}

/* Composer toolbar (emoji, gif, poll, media buttons) */
[data-testid="toolBar"] [role="button"],
[data-testid="tweetButton"] ~ [role="button"] {
  border: 2px solid #000 !important;
  box-shadow: 2px 2px 0 0 #000 !important;
  background-color: #FFF !important;
}

[data-testid="toolBar"] [role="button"]:hover {
  background-color: #FECA57 !important;
}

/* ============================================================
   10. POLLS + NOTIFICATIONS + PROFILE TABS + DANGER
   ============================================================ */

/* Poll container */
[data-testid="poll"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  background-color: #FFF !important;
}

/* Poll choice */
[data-testid="poll"] [role="radio"],
[data-testid="poll"] [role="button"] {
  border: 2px solid #000 !important;
  background-color: #FFFDF5 !important;
  color: #000 !important;
  font-weight: 700 !important;
}

/* Notification badge (bell icon unread count) */
[data-testid="AppTabBar_Notifications"] [data-testid="badge"],
[aria-label*="notif"] [data-testid="badge"] {
  background-color: #FF4757 !important;
  color: #FFF !important;
  border: 2px solid #000 !important;
  font-weight: 800 !important;
}

/* Profile tabs (Posts, Replies, Media, Likes) — NO tablist border:
   the per-tab border-bottom (below) IS the single divider line.
   A tablist border here sat 4px below the tab border → double line. */
[data-testid="primaryColumn"] [role="tablist"] {
  border-bottom: none !important;
  background-color: #FFFDF5 !important;
}

[data-testid="UserRating_AppTabBar_Profile"] [role="tab"],
[data-testid="primaryColumn"] [role="tablist"] [role="tab"] {
  border-bottom: 4px solid #000 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  color: #000 !important;
}

[data-testid="primaryColumn"] [role="tablist"] [role="tab"][aria-selected="true"] {
  border-bottom: 4px solid #FF4757 !important;
  color: #FF4757 !important;
}

/* Unfollow / danger buttons */
[data-testid$="-unfollow"],
[role="button"][data-testid="confirmationSheetCancel"] {
  border-color: #FF4757 !important;
  background-color: rgba(255, 71, 87, 0.1) !important;
  color: #FF4757 !important;
  font-weight: 800 !important;
  border: 2px solid #FF4757 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
}

/* ============================================================
   11. MISC — empty states, profile header, tweet detail
   ============================================================ */

/* Empty state ("No tweets yet", "No replies") */
[data-testid="emptyState"],
[role="presentation"] [dir="auto"] {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Profile header banner */
[data-testid="UserRating_ProfileBanner"],
[data-testid="profileHeaderPhoto"] {
  border-bottom: 4px solid #000 !important;
}

/* Profile display name + bio */
[data-testid="UserDescription"],
[data-testid="UserProfileHeader_Items"] {
  color: #000 !important;
  font-weight: 600 !important;
}

/* Tweet detail view (reply chain) */
[data-testid="tweet"] + [data-testid="tweet"] {
  border-top: 4px solid #000 !important;
}

/* "Show more" / "Show this thread" links */
[data-testid="tweet"] [role="link"] {
  color: #FF4757 !important;
  font-weight: 700 !important;
  text-decoration: underline !important;
}

/* Settings panel nav */
[data-testid="settingsMenu"] {
  background-color: #FFFDF5 !important;
  border-right: 4px solid #000 !important;
}

/* ============================================================
   12. GENERIC BUTTONS + TABS + HEADER
   ============================================================ */
[role="button"]:not([data-testid="tweetButton"]):not([data-testid="tweetButtonInline"]):not([role="menuitem"]):not([role="menuitemcheckbox"]):not([data-testid$="-follow"]):not([data-testid$="-unfollow"]):not([style*="linear-gradient"]):not([data-testid="AppTabBar_More_Menu"]):not(:has(> svg[data-testid="icon-verified"])):not(:has(> svg[data-testid="verificationBadge"])) {
  border: 2px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
  background-color: #FFF !important;
  color: #000 !important;
  font-weight: 700 !important;
}

[role="tab"] {
  border-bottom: 4px solid transparent !important;
  font-weight: 700 !important;
  color: #000 !important;
}

[role="tab"][aria-selected="true"] {
  border-bottom: 4px solid #FF4757 !important;
  color: #FF4757 !important;
}

header[role="banner"] {
  background-color: #FFFDF5 !important;
  border-bottom: 4px solid #000 !important;
}

/* Left nav rail */
[aria-label="Primary"] nav,
nav[aria-label="Navigation"] {
  background-color: #FFFDF5 !important;
  border-right: 4px solid #000 !important;
}

/* Nav rail items */
[aria-label="Primary"] [role="link"],
[aria-label="Primary"] [role="button"] {
  font-weight: 800 !important;
  text-transform: uppercase !important;
}

[aria-label="Primary"] [role="link"]:hover,
[aria-label="Primary"] [role="button"]:hover {
  background-color: #FECA57 !important;
}

/* Tweet actions hover */
[data-testid="like"]:hover,
[data-testid="unlike"]:hover,
[data-testid="retweet"]:hover,
[data-testid="unretweet"]:hover,
[data-testid="reply"]:hover {
  border: 2px solid #000 !important;
  box-shadow: 2px 2px 0 0 #000 !important;
  background-color: #FECA57 !important;
}

[data-testid="like"],
[data-testid="unlike"],
[data-testid="retweet"],
[data-testid="unretweet"],
[data-testid="reply"] {
  border: 2px solid transparent !important;
}

/* ============================================================
   13. SCROLLBAR + SELECTION
   ============================================================ */
::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

::-webkit-scrollbar-track {
  background: #FFFDF5 !important;
  border-left: 2px solid #000 !important;
}

::-webkit-scrollbar-thumb {
  background: #000 !important;
  border: 2px solid #FFFDF5 !important;
}

::-webkit-scrollbar-thumb:hover {
  background: #FF4757 !important;
}

::selection {
  background: #FECA57 !important;
  color: #000 !important;
}

/* ============================================================
   14. v1.3.0 FIXES — from live DOM inspection of twitter.com
   Twitter uses CLASS-BASED colors (not inline style) for most
   text. Our inline-style selectors missed these entirely.
   ============================================================ */

/* ---- Gray text: rgb(83, 100, 113) — @handle, timestamp, counts ---- */
[style*="color: rgb(83, 100, 113)"],
.r-1ttztb7[style*="color: rgb(83, 100, 113)"] {
  color: #000 !important;
  font-weight: 600 !important;
}

/* Class-based color carriers — Twitter sets color via .r-* classes */
.r-bcqeeo,
.r-qvutc0,
.r-poiln3,
.r-1ttztb7 {
  color: #000 !important;
}

/* Blue text via class (not inline) — "Everyone can reply", links */
.r-1q142lx,
.r-17bb8tj,
a.r-bcqeeo,
a.r-qvutc0 {
  color: #FF4757 !important;
  font-weight: 700 !important;
  text-decoration: underline !important;
}

/* ---- Post button (nav rail) — was rgb(15, 20, 25) ---- */
[data-testid="SideNav_NewTweet_Button"] {
  background-color: #FECA57 !important;
  color: #000 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}

/* ---- Follow buttons — was rgb(15, 20, 25) ---- */
[data-testid$="-follow"] {
  background-color: #000 !important;
  color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #FF4757 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}

[data-testid$="-follow"]:hover {
  background-color: #FF4757 !important;
  color: #FFF !important;
}

/* ---- "See new posts" button — was rgb(29, 155, 240) ---- */
[aria-label*="New posts"],
[aria-label*="new posts"] {
  background-color: #FF4757 !important;
  color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}

/* ---- Progress bar — was rgb(29, 155, 240) ---- */
[data-testid="progressBar-bar"] {
  background-color: #FF4757 !important;
}

/* ---- Unread count badge — was rgb(29, 155, 240).
   NB: [aria-label*="unread"] ALSO matches the Notifications nav <a>
   ("N unread notification"), which painted the ENTIRE nav item red.
   Exclude links so only the small count bubble is styled. ---- */
[aria-label*="unread"]:not(a):not([role="link"]) {
  background-color: #FF4757 !important;
  border: 2px solid #000 !important;
}

/* ---- Carousel prev/next — was rgba(15, 20, 25, 0.75) ---- */
[aria-label="Previous"],
[aria-label="Next"] {
  background-color: #FECA57 !important;
  color: #000 !important;
  border: 3px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
}

/* ---- "For you/Following" tab bg — was rgba(255, 255, 255, 0.85) ---- */
.r-6026j,
.r-105ug2t,
.r-173mn98,
.r-1e5uvyk,
.r-1xsrhxi,
.r-1867qdf,
.r-1upvrn0,
.r-8oi148,
.r-1tfmumk {
  background-color: rgba(255, 253, 245, 0.9) !important;
  backdrop-filter: blur(12px) !important;
}

/* ---- Border color rgb(159, 181, 195) → brutalist black ---- */
.r-105ug2t,
.r-173mn98,
.r-1e5uvyk,
.r-6026j {
  border-color: #000 !important;
}

/* ---- Gray placeholder boxes rgb(207, 217, 222) ---- */
.r-1bimlpy {
  background-color: #FECA57 !important;
  border: 2px solid #000 !important;
}

/* ---- Subtle bg rgb(239, 243, 24) → cream ---- */
.r-109y4c4,
.r-1sw30gj,
.r-l00any {
  background-color: #FFFDF5 !important;
}

/* ---- Border rgb(207, 217, 222) → black ---- */
.r-sdzlij,
.r-1phboty,
.r-lrvibr,
.r-4iw3lz,
.r-1xk2f4g,
.r-wwvuq4,
.r-92ng3h,
.r-2yi16,
.r-1qi8awa,
.r-adacv,
.r-eqz5dr,
.r-1wbh5a2,
.r-eafdt9,
.r-3nhw2p,
.r-brjqxz,
.r-1ets6dv {
  border-color: #000 !important;
}

/* ---- Border rgb(239, 243, 244) → black ---- */
.r-jxzhtn,
.r-8e33y0,
.r-1lnugsr,
.r-184en5c,
.r-1abdc3e,
.r-1lg4w6u,
.r-f8sm7e,
.r-1ye8kvj,
.r-1ifxtd0,
.r-14lw9ot,
.r-16y2uox {
  border-color: #000 !important;
}

/* ---- Grok/Chat drawer header ---- */
[data-testid="GrokDrawerHeader"],
[data-testid="chat-drawer-main"] {
  background-color: #FFFDF5 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
}

/* ---- Grok + Messages docked drawer containers ----
   Each collapsed dock (~400px wide) carries a translucent cream bg +
   backdrop-filter: blur(12px) from a shared .r-* class, rendering as
   a frosted-glass panel floating left of the Grok/DM buttons. Kill it
   so only the (bordered) buttons show. div[...] specificity beats the
   .r-* blur rule. Expanded drawer content keeps its own child bg. */
div[data-testid="GrokDrawer"],
div[data-testid="chat-drawer-root"] {
  background-color: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
  border: none !important;
}

/* ---- Light mode scrollbar-color (Twitter sets inline) ---- */
[style*="scrollbar-color: rgb(185, 202, 211) rgb(247, 249, 249)"] {
  scrollbar-color: #000 transparent !important;
  scrollbar-width: thin !important;
}

/* ---- Video player bg (keep dark for contrast) ---- */
video {
  background-color: #000 !important;
}

/* ---- Tweet engagement counts — make bold black ---- */
[data-testid="tweet"] [href*="/status/"] span,
[data-testid="app-text-transition-container"] {
  color: #000 !important;
  font-weight: 800 !important;
}

/* ---- "Ad" label ---- */
[data-testid="tweet"] [data-testid="placementTracking"] ~ * {
  color: #000 !important;
  font-weight: 700 !important;
}

/* ---- Compose box "What's happening?" placeholder ---- */
[data-testid="tweetTextarea_0"]:empty::before {
  color: #000 !important;
  font-weight: 600 !important;
}

/* ---- Sidebar "What's happening" + "Who to follow" section headers ---- */
[data-testid="sidebarColumn"] [role="heading"] h2,
[data-testid="sidebarColumn"] h2 {
  font-weight: 900 !important;
  text-transform: uppercase !important;
  letter-spacing: 1px !important;
  border-bottom: 3px solid #000 !important;
  padding-bottom: 6px !important;
  color: #000 !important;
}

/* ---- Bottom bar (mobile) ---- */
[data-testid="BottomBar"] {
  background-color: #FFFDF5 !important;
  border-top: 4px solid #000 !important;
}

/* ============================================================
   15. v1.4.0 FIXES — from full element dump of twitter.com
   Found: <a> tags use browser default blue rgb(0,0,238) because
   Twitter doesn't set color on all links. Our .r-bcqeeo override
   only works when class is present. Need global a { color } rule.
   ============================================================ */

a:link,
a:visited {
  color: #FF4757 !important;
  text-decoration: none !important;
  font-weight: 700 !important;
}

a:hover {
  color: #000 !important;
  text-decoration: underline !important;
}

a:active {
  color: #FECA57 !important;
}

/* Display name links — keep bold black, hover red */
[data-testid="User-Name"] a:link,
[data-testid="User-Name"] a:visited,
[data-testid="UserName"] a:link,
[data-testid="UserName"] a:visited {
  color: #000 !important;
  font-weight: 800 !important;
  text-decoration: none !important;
}

[data-testid="User-Name"] a:hover,
[data-testid="UserName"] a:hover {
  color: #FF4757 !important;
  text-decoration: underline !important;
}

/* Verified icon — Twitter blue rgb(29, 155, 240) on svg element */
svg[data-testid="icon-verified"],
svg[data-testid="verificationBadge"] {
  color: #FF4757 !important;
  border-color: #FF4757 !important;
}

svg[data-testid="icon-verified"] path,
svg[data-testid="verificationBadge"] path {
  fill: #FF4757 !important;
  stroke: #FF4757 !important;
}

/* "Show more" link on long tweets */
[data-testid="tweet-text-show-more-link"],
[data-testid="tweet-text-show-more-link"] span {
  color: #FF4757 !important;
  font-weight: 700 !important;
  text-decoration: underline !important;
}

/* "Everyone can reply" text */
[data-testid="tweetTextarea_0RichTextInputContainer"] {
  color: #000 !important;
  border-color: #000 !important;
}

/* Compose textarea "What's happening?" placeholder */
[data-testid="tweetTextarea_0"] {
  color: #000 !important;
  border-color: #000 !important;
}

/* Engagement count transition containers */
[data-testid="app-text-transition-container"] {
  color: #000 !important;
  border-color: #000 !important;
  font-weight: 800 !important;
}

/* Engagement count numbers (58, 283, 2.1K, etc) */
[data-testid="app-text-transition-container"] + span,
[data-testid="app-text-transition-container"] span {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Views count link */
a[aria-label*="views"],
a[aria-label*="View post"] {
  color: #000 !important;
  text-decoration: none !important;
}

a[aria-label*="views"]:hover,
a[aria-label*="View post"]:hover {
  color: #FF4757 !important;
}

/* "Ad" label */
[data-testid="placementTracking"] ~ * span {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Timestamp */
time,
a time,
a[aria-label*="ago"] {
  color: #000 !important;
  font-weight: 600 !important;
  text-decoration: underline !important;
}

/* "Following" tab (inactive) */
[role="tab"]:not([aria-selected="true"]) span {
  color: #000 !important;
  font-weight: 700 !important;
}

/* Quote tweet border */
[role="link"] .r-adacv,
.r-adacv {
  border-color: #000 !important;
}

/* Skip-to buttons (accessibility, hidden by default) */
[aria-label*="Skip to"] {
  border-color: #000 !important;
  background-color: #FECA57 !important;
  color: #000 !important;
}

/* "See new posts" pill label text */
[data-testid="pillLabel"] {
  color: #FFF !important;
  font-weight: 800 !important;
}

/* X logo link */
a[aria-label="X"] {
  color: #000 !important;
}

/* Nav rail links — brutalist uppercase */
[aria-label="Primary"] a:link,
[aria-label="Primary"] a:visited,
[aria-label="Primary"] button {
  color: #000 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
  text-decoration: none !important;
}

[aria-label="Primary"] a:hover,
[aria-label="Primary"] button:hover {
  background-color: #FECA57 !important;
  color: #000 !important;
}

/* Account switcher button */
[data-testid="SideNav_AccountSwitcher_Button"] {
  border: 2px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
}

/* Caret / more button on tweets */
[data-testid="caret"] {
  border: 2px solid transparent !important;
}

[data-testid="caret"]:hover {
  border: 2px solid #000 !important;
  box-shadow: 2px 2px 0 0 #000 !important;
  background-color: #FECA57 !important;
}

/* ============================================================
   16. v1.5.0 FIXES — from screenshot review
   (Post / Home / Notifications / Explore / DM)
   A. Follow buttons rendered as empty pills (white-on-white text)
   B. Inconsistent card borders (notif / news / feed rows missed)
   C. Gradient buttons (Show more / Football Hub) untouched
   D. DM / Chat page barely themed (blue bubbles, plain rows)
   E. Soft-rounded grey cards (football schedule widget)
   F. Mixed border-radius — enforce sharp brutalist corners
   ============================================================ */

/* ---- A. FOLLOW / UNFOLLOW BUTTON --------------------------------
   Generic [role=button] rule no longer repaints these (excluded
   above). Force inner span/div color so text isn't invisible. */
[data-testid$="-follow"] {
  background-color: #000 !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #FF4757 !important;
  border-radius: 0 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}
[data-testid$="-follow"] span,
[data-testid$="-follow"] div {
  color: #FFF !important;
}
[data-testid$="-follow"]:hover {
  background-color: #FF4757 !important;
}

/* Following / Unfollow (outlined) — dark text on light fill */
[data-testid$="-unfollow"] {
  background-color: #FFFDF5 !important;
  border: 3px solid #FF4757 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}
[data-testid$="-unfollow"] span,
[data-testid$="-unfollow"] div {
  color: #FF4757 !important;
}

/* ---- B. UNIFIED FEED CARD — every timeline/notif/news row ------
   Twitter wraps each row in cellInnerDiv. Style it as the card so
   notifications, news and feed rows match tweets. Inner tweet's
   own frame is neutralised to avoid double borders. */
[data-testid="cellInnerDiv"] {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  margin: 6px 4px !important;
}
[data-testid="cellInnerDiv"] [data-testid="tweet"] {
  border: none !important;
  box-shadow: none !important;
  margin: 0 !important;
}
[data-testid="cellInnerDiv"] [data-testid="cellInnerDiv"] {
  margin: 0 !important;
}

/* ---- C. FLATTEN GRADIENT BUTTONS (Show more / Football Hub) ----- */
[style*="linear-gradient"] {
  background-image: none !important;
  background-color: #FECA57 !important;
}
[role="button"][style*="linear-gradient"],
a[style*="linear-gradient"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}
[style*="linear-gradient"] span,
[style*="linear-gradient"] div {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
}

/* ---- D. DM / CHAT ----------------------------------------------- */
/* Conversation list rows */
[data-testid="conversation"] {
  background-color: #FFF !important;
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
  margin: 4px 6px !important;
}
[data-testid="conversation"]:hover {
  background-color: #FECA57 !important;
}
/* Message bubbles — kill rounding */
[data-testid="messageEntry"] [style*="border-radius"],
[data-testid="messageEntry"] > div > div {
  border-radius: 0 !important;
}
/* Sent bubble (Twitter blue, class- or inline-based) → red */
[data-testid="messageEntry"] [style*="rgb(29, 155, 240)"],
[data-testid="messageEntry"] [style*="rgb(29,155,240)"] {
  background-color: #FF4757 !important;
  border: 2px solid #000 !important;
  box-shadow: 3px 3px 0 0 #000 !important;
  border-radius: 0 !important;
}
/* Received bubble (light grey) → white framed */
[data-testid="messageEntry"] [style*="rgb(247, 249, 249)"],
[data-testid="messageEntry"] [style*="rgb(239, 243, 244)"] {
  background-color: #FFF !important;
  border: 2px solid #000 !important;
  border-radius: 0 !important;
}
/* DM composer input bar */
[data-testid="dmComposerTextInput"],
[data-testid="DMComposerInput"] {
  border: 2px solid #000 !important;
  border-radius: 0 !important;
  background-color: #FFF !important;
}

/* ---- E. SOFT GREY CARDS → FLAT WHITE (football widget etc) ------ */
[style*="background-color: rgb(247, 249, 249)"],
[style*="background-color: rgb(245, 248, 250)"],
[style*="background-color: rgb(22, 24, 28)"] {
  background-color: #FFF !important;
}

/* ---- F. ENFORCE SHARP CORNERS on themed chrome ----------------- */
[data-testid="SearchBox_Search_Input"],
form[role="search"],
[data-testid="SideNav_NewTweet_Button"],
[data-testid="tweetButton"],
[data-testid="tweetButtonInline"],
[data-testid="cardWrapper"],
[data-testid="card.wrapper"] {
  border-radius: 0 !important;
}

/* Country flags / emoji images — keep full saturation */
img[draggable="true"][alt],
img[src*="emoji"],
img[src*="flag"] {
  filter: none !important;
  opacity: 1 !important;
}

/* ---- C2. X "jf-element" design-system gradient CTAs ------------
   Verified via live DOM: the "Show more" CTA (and similar X promo
   widgets) live in a SEPARATE component framework — class
   "jf-element" with obfuscated "j-*" tokens — set the gradient
   via a CSS CLASS, not inline style, so [style*="linear-gradient"]
   never matched. These buttons also include the Football schedule
   rows (NOT gradient), so we only kill gradients + force readable
   text — we do NOT box every jf-element button. */
button.jf-element,
button.jf-element * {
  background-image: none !important;
}
button.jf-element p,
button.jf-element span {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
}

/* ---- G. SIDEBAR NESTED-BORDER CLEANUP -------------------------
   Verified via live DOM: Twitter's original card wrappers (classes
   r-14lw9ot / r-jxzhtn / r-1867qdf / r-1phboty, ~350px wide, 1px
   border, radius 16px or 9999px) sit BEHIND our square 3px card
   borders. We blackened their border-color but left the radius, so
   the rounded corners peeked out past the sharp card. Square them
   (brutalism = no radius) so they align flush and disappear. */
.r-1ets6dv,
.r-1phboty,
.r-14lw9ot,
.r-jxzhtn,
.r-1867qdf,
.r-rs99b7,
.r-1niwhzg,
[data-testid="sidebarColumn"] div {
  border-radius: 0 !important;
}

/* Tracking pixel — never border (caused a ~7px black notch). Higher
   specificity (div[...]) to beat the adopted-stylesheet card rule. */
div[data-testid="placementTracking"] {
  border: none !important;
  box-shadow: none !important;
}

/* ---- H. TAB INDICATOR + SEARCH FIELD --------------------------- */

/* For You / Following floating tab indicator uses inline
   background-color: rgb(29,155,240). The generic blue-inline rule
   (sec 2) recolored it red but also added a 3px border + hard shadow
   → black blob on a 6px bar; and it sat 4px above the divider → a
   second line. We mark the active tab via its own border-bottom (red)
   instead, so just hide this floating indicator entirely. */
[role="tablist"] [style*="rgb(29, 155, 240)"],
[role="tablist"] [style*="rgb(29,155,240)"] {
  display: none !important;
}

/* Search field: border the FORM so the magnifier icon + input + clear
   button live inside one box. Verified via live DOM — the input has a
   parent <form>, and bordering the input alone fenced the icon off in
   its own cell. */
form:has([data-testid="SearchBox_Search_Input"]) {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
  background-color: #FFF !important;
}

/* ---- I. ACTIVE NAV ITEM MARKER -------------------------------
   Twitter marks the active Primary-nav item only by swapping to a
   filled icon + bolding its label container with class r-b88u0q
   (font-weight 700) — too subtle next to the loud feed, and there's
   no aria-current to hook. r-b88u0q is a shared bold-700 atomic
   class, but INSIDE a Primary-nav link it appears ONLY on the active
   item, so :has() scopes it reliably. Give it a brutalist highlight
   (inset shadow → no layout shift). */
nav[aria-label="Primary"] a[role="link"]:has(.r-b88u0q) {
  background-color: #FECA57 !important;
  box-shadow: inset 7px 0 0 0 #FF4757, inset 0 0 0 2px #000 !important;
  border-radius: 0 !important;
}

/* Twitter's nav hover paints a ROUNDED inner pill (the icon+label
   flex wrapper, radius 9999px) tinted by a translucent overlay — it
   peeked out as a rounded, darker-yellow patch inside our rectangular
   a:hover bg. Square it + make it transparent so the hover/active
   surface is the <a>'s own rectangular bg (single tone). Direct child
   only (a > div) so the unread badge bubble keeps its red bg. */
nav[aria-label="Primary"] a div,
nav[aria-label="Primary"] a span {
  border-radius: 0 !important;
}
nav[aria-label="Primary"] a > div {
  background-color: transparent !important;
}

/* ---- J. PROFILE POLISH ----------------------------------------
   Edit profile button shipped thin (1px, no shadow) — bring it up to
   the brutalist button standard. Following/Followers counts read as
   plain text; uppercase + bold them so the stats pop, yellow hover. */
[data-testid="editProfileButton"] {
  border: 3px solid #000 !important;
  box-shadow: 4px 4px 0 0 #000 !important;
  border-radius: 0 !important;
  font-weight: 800 !important;
  text-transform: uppercase !important;
}
a[href$="/following"],
a[href$="/verified_followers"],
a[href$="/followers"] {
  text-transform: uppercase !important;
}
a[href$="/following"] span,
a[href$="/verified_followers"] span,
a[href$="/followers"] span {
  font-weight: 800 !important;
}
a[href$="/following"]:hover,
a[href$="/verified_followers"]:hover,
a[href$="/followers"]:hover {
  background-color: #FECA57 !important;
}

`;

/* ============================================================
 * Injection mechanism
 *   Primary:  document.adoptedStyleSheets + CSSStyleSheet
 *   Fallback: <style class="xstyler-theme"> on documentElement
 *
 * Verified production pattern: Stylus + DarkReader both use
 * adoptedStyleSheets with <style> fallback (NOT insertCSS).
 * ============================================================ */

let activeSheet = null;        // CSSStyleSheet | null
let activeStyleEl = null;      // HTMLStyleElement | null (fallback path)
let currentThemeCss = null;    // string | null — what's currently applied
let usingFallback = false;     // boolean

function supportsConstructedSheets() {
  try {
    return typeof CSSStyleSheet === 'function' &&
           typeof document !== 'undefined' &&
           Array.isArray(document.adoptedStyleSheets) &&
           typeof document.adoptedStyleSheets.push === 'function';
  } catch (_) {
    return false;
  }
}

function applyTheme(css) {
  if (css == null) {
    removeTheme();
    return;
  }
  currentThemeCss = css;

  if (supportsConstructedSheets()) {
    try {
      if (activeSheet) {
        // Update in-place — no flicker
        activeSheet.replaceSync(css);
      } else {
        activeSheet = new CSSStyleSheet();
        activeSheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, activeSheet];
      }
      // Clean up fallback if we had one
      if (activeStyleEl) {
        activeStyleEl.remove();
        activeStyleEl = null;
      }
      usingFallback = false;
      return;
    } catch (err) {
      console.warn('[XStyler] adoptedStyleSheets failed, falling back to <style>:', err);
    }
  }

  // Fallback: <style> element
  usingFallback = true;
  if (!activeStyleEl) {
    activeStyleEl = document.createElement('style');
    activeStyleEl.className = 'xstyler-theme';
    activeStyleEl.setAttribute('data-xstyler', 'active');
    document.documentElement.appendChild(activeStyleEl);
  }
  activeStyleEl.textContent = css;
}

function removeTheme() {
  if (activeSheet) {
    try {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== activeSheet);
    } catch (err) {
      console.warn('[XStyler] failed to splice adoptedStyleSheets:', err);
    }
    activeSheet = null;
  }
  if (activeStyleEl) {
    activeStyleEl.remove();
    activeStyleEl = null;
  }
  currentThemeCss = null;
  usingFallback = false;
}

function reinjectIfStripped() {
  if (currentThemeCss == null) return; // no theme active

  if (usingFallback) {
    if (!activeStyleEl || !activeStyleEl.isConnected) {
      activeStyleEl = document.createElement('style');
      activeStyleEl.className = 'xstyler-theme';
      activeStyleEl.setAttribute('data-xstyler', 'active');
      activeStyleEl.textContent = currentThemeCss;
      document.documentElement.appendChild(activeStyleEl);
    }
  } else {
    // adoptedStyleSheets path — verify sheet still present
    if (activeSheet && !document.adoptedStyleSheets.includes(activeSheet)) {
      try {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, activeSheet];
      } catch (err) {
        console.warn('[XStyler] re-inject adoptedStyleSheets failed:', err);
      }
    }
  }
}

/* ============================================================
 * 1. Synchronous default theme injection (FOUC-free)
 *    Runs immediately at document_start, BEFORE async storage read.
 * ============================================================ */
try {
  applyTheme(DEFAULT_THEME_CSS);
} catch (err) {
  console.error('[XStyler] initial default inject failed:', err);
}

/* ============================================================
 * 2. Async storage read — switch to user's active theme if any
 * ============================================================ */
(async function readActiveTheme() {
  try {
    const { 'prefs:global': prefs } = await chrome.storage.local.get('prefs:global');
    const activeId = prefs && prefs.activeThemeId;
    if (!activeId) {
      // No active theme set — keep default (already applied)
      return;
    }
    const themeKey = `theme:${activeId}`;
    const result = await chrome.storage.local.get(themeKey);
    const theme = result[themeKey];
    if (!theme || typeof theme.css !== 'string') {
      console.warn('[XStyler] active theme not found in storage, keeping default');
      return;
    }
    if (theme.css === currentThemeCss) {
      // Already applied (e.g. default theme)
      return;
    }
    applyTheme(theme.css);
  } catch (err) {
    console.error('[XStyler] storage read failed:', err);
  }
})();

/* ============================================================
 * 3. Message listener — live updates from background SW
 * ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'STORAGE_CHANGED') {
    sendResponse({ ok: true });
    return false; // synchronous response
  }

  try {
    handleStorageChange(msg.key, msg.oldValue, msg.newValue);
  } catch (err) {
    console.error('[XStyler] message handler error:', err);
  }
  sendResponse({ ok: true });
  return false;
});

async function handleStorageChange(key, oldValue, newValue) {
  if (key === 'prefs:global') {
    const newActiveId = newValue && newValue.activeThemeId;
    if (newActiveId == null) {
      removeTheme();
      return;
    }
    const themeKey = `theme:${newActiveId}`;
    const result = await chrome.storage.local.get(themeKey);
    const theme = result[themeKey];
    if (!theme || typeof theme.css !== 'string') {
      console.warn('[XStyler] active theme missing in storage:', newActiveId);
      removeTheme();
      return;
    }
    if (theme.css !== currentThemeCss) {
      applyTheme(theme.css);
    }
  } else if (key.startsWith('theme:')) {
    // A theme's CSS changed — re-apply if it's the currently active one
    const newTheme = newValue;
    if (newTheme && typeof newTheme.css === 'string') {
      // Need to know if this theme is active — check prefs
      const { 'prefs:global': prefs } = await chrome.storage.local.get('prefs:global');
      const activeId = prefs && prefs.activeThemeId;
      if (activeId && newTheme.id === activeId && newTheme.css !== currentThemeCss) {
        applyTheme(newTheme.css);
      }
    }
  }
}

/* ============================================================
 * 4. MutationObserver — re-inject if Twitter SPA strips our style
 *    Debounced 100ms to avoid thrash on rapid mutations.
 * ============================================================ */
let reinjectTimer = null;
const observer = new MutationObserver(() => {
  if (reinjectTimer) return;
  reinjectTimer = setTimeout(() => {
    reinjectTimer = null;
    reinjectIfStripped();
  }, 100);
});

function startObserver() {
  try {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (err) {
    console.warn('[XStyler] MutationObserver start failed:', err);
  }
}
startObserver();

/* Defensive: re-verify on DOMContentLoaded */
document.addEventListener('DOMContentLoaded', () => {
  reinjectIfStripped();
});
