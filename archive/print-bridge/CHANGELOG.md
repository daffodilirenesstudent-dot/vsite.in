# Print Bridge Changelog

## 2.4.0 — Origin-independent CORS (one-time install, no future updates)

### What changed
- Removed the origin allowlist. CORS is now `origin: '*'`.
- Print + config endpoints are still gated by `X-BYS-Token` (token auth was
  already there; it is now the single security boundary).
- `allowedHeaders` explicitly includes `X-BYS-Token` so browsers permit it
  through the preflight.

### Why
Previously the allowlist hardcoded production domains (`buildyoustore.com`,
`*.vercel.app`). Every time we moved the web app to a new host (Netlify,
custom domain, future migrations), every restaurant had to uninstall and
reinstall the bridge to pick up the new allowlist. That's an operational
nightmare for a feature where downtime = no kitchen tickets.

With the new model, the bridge accepts requests from any origin but the
token gate makes print spam from random websites impossible. The bridge
URL (http://127.0.0.1:7878) and the token are paired secrets that only
the legitimate web app possesses.

### Migration for restaurants
**One-time:** uninstall old bridge → install 2.4.0. After that, the
bridge works regardless of what host the web app is on, forever. No
further updates required for hosting changes.

### Security analysis
| Endpoint | Authentication | Risk if abused |
|---|---|---|
| GET /status, /printers, /config, /autostart | none | Leaks printer names + bridge health to any website. Acceptable. |
| POST /print, POST /print/test | X-BYS-Token | Without token, every random website on the internet would queue print jobs. With token, only the paired web app can. |
| PUT /config, PUT /autostart | X-BYS-Token | Same. |

The token is generated at first install and persisted in the bridge's
local config file. It's transferred to the web app's settings page
during the one-time setup. No need to share it again unless the
restaurant explicitly resets it.
