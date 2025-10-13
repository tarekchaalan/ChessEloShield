<div id="top">

<!-- HEADER STYLE: MODERN -->
<div align="center" style="width: 100%;">

<img src="./images/Logo.png" width="35%" style="display: block; margin: 0 auto;" alt="Project Logo"/>

# CHESSELOSHIELD

<em>Stops ELO-draining tilt on chess.com with a smart cooldown.</em>

<!-- BADGES -->
<img src="https://img.shields.io/github/license/tarekchaalan/ChessEloShield?style=flat&logo=opensourceinitiative&logoColor=white&color=69923E" alt="license">
<img src="https://img.shields.io/github/last-commit/tarekchaalan/ChessEloShield?style=flat&logo=git&logoColor=white&color=69923E" alt="last-commit">
<img src="https://img.shields.io/github/languages/top/tarekchaalan/ChessEloShield?style=flat&color=69923E" alt="repo-top-language">
<img src="https://img.shields.io/github/languages/count/tarekchaalan/ChessEloShield?style=flat&color=69923E" alt="repo-language-count">

<em>Built with the tools and technologies:</em>

<img src="https://img.shields.io/badge/JSON-000000.svg?style=flat&logo=JSON&logoColor=white" alt="JSON">
<img src="https://img.shields.io/badge/HTML-820000.svg?style=flat&logo=HTML5&logoColor=white" alt="HTML">
<img src="https://img.shields.io/badge/JavaScript-F7DF1E.svg?style=flat&logo=JavaScript&logoColor=black" alt="JavaScript">
<img src="https://img.shields.io/badge/CSS-663399.svg?style=flat&logo=CSS&logoColor=white" alt="CSS">

</div>
</div>
<br clear="right">

---

<div align="center">
  <a href="https://chromewebstore.google.com/detail/chesseloshield/ekjahhkooocdfnjjdfmlglmlbdomkpkn">
    <img src="images/Browser-Icons/chrome-img.png" alt="Get it on Chrome Web Store">
  </a>
  &nbsp;
  <a href="https://addons.mozilla.org/en-US/firefox/addon/chesseloshield/">
    <img src="images/Browser-Icons/firefox-img.png" alt="Get it on Firefox Add-ons">
  </a>
</div>

---

## Table of Contents

<details>
<summary>Table of Contents</summary>

- [Overview](#overview)
- [Folders](#folders)
- [Permissions (why)](#permissions-why)
- [How it works](#how-it-works)
- [Popup](#popup)
- [Privacy](#privacy)
- [License](#license)
- [Screenshots](#screenshots)

</details>

---

## Overview

Stops ELO-draining tilt on chess.com. After a loss, it starts a configurable **cooldown** and freezes ways to start a new game (Quick Play, Start Game, New 1 min, Rematch). Buttons show a **MM:SS** countdown via a CSS overlay (no React flicker). Cooldown survives page changes/reloads. Optional **Hide chat** and **Hide opponent info**. A subtle **Remove Cooldown** link is available in the popup.

---

## Folders

- `Firefox/` — MV2 (AMO).
- `Chrome/` — MV3 (Chrome Web Store).

---

## Permissions (why)

- `storage` — save cooldown duration + toggles + `cooldownUntil` timestamp.
- `tabs` — broadcast state to chess.com tabs.
- `webNavigation` — catch SPA navigations to re-apply state.
- `alarms` — wake exactly at cooldown expiry.
- Host `https://www.chess.com/*` — run only on chess.com.

---

## How it works

- **Content script** reads the game-over header/post-game text.
  - “You Won!” → ignore.
  - “White Won/Black Won” or “won by …” → start cooldown.
- **Background** stores state in sync storage, schedules an alarm, and **broadcasts** `{ type: "tilt-guard/state", until, settings }` to all chess.com tabs on start/expire/navigation.
- **CSS** sets `tg-cooling` + `--tg-timer` and overlays **MM:SS** without DOM churn.
- Loss detection pauses until **URL changes** after cooldown ends or manual removal (prevents loops on the same loss screen).

---

## Popup

- Presets: 5s / 15s / 1m / 3m / 5m + custom.
- Toggles: **Hide chat**, **Hide opponent info**.
- **Remove Cooldown** link (bottom-right).

---

## Privacy

No analytics. No network calls. Only local sync storage: `settings`, `cooldownUntil`.

---

## License

MIT

---

## Screenshots

<p>
  <img src="images/Screenshots/screenshot1.png" width="900" alt="Screenshot 1">
  <img src="images/Screenshots/screenshot2.png" width="900" alt="Screenshot 2">
</p>
<p>
  <img src="images/Screenshots/screenshot3.png" width="900" alt="Screenshot 3">
  <img src="images/Screenshots/screenshot4.png" width="900" alt="Screenshot 4">
</p>
<p>
  <img src="images/Screenshots/screenshot5.png" width="900" alt="Screenshot 5">
</p>

<div align="right">

[![][back-to-top]](#top)

</div>


[back-to-top]: https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square

---