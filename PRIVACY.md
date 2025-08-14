# ChessEloShield Privacy Policy

ChessEloShield does not collect, transmit, sell, or share personal data.

## What the extension does

- Runs only on https://www.chess.com/*
- Detects game results from on-page UI text
- Applies a CSS overlay to temporarily disable “start game” buttons
- Optionally hides chat and opponent info for focus

## Data stored

- `settings` (cooldown duration, Hide chat, Hide opponent info)
- `cooldownUntil` (a Unix timestamp for when the cooldown ends)

Storage location: `chrome.storage.sync` / `browser.storage.sync`
Data never leaves the user’s browser unless they use browser sync.

## Network

The extension makes **no** external network requests.

## Permissions

- `storage`: persist settings + timestamp
- `tabs`, `webNavigation`: keep cooldown in sync across chess.com tabs/routes
- `alarms`: clear cooldown exactly at expiry
- Host: `https://www.chess.com/*`: run only on chess.com

## Contact

tchaalan23@outlook.com
