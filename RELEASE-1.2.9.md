# Neodyme 1.2.9 - Website Foundation

A website that works on a phone, a real account area, and the tooling to check it.

## Highlights

- **Mobile navigation.** A burger menu with a side drawer on every page, a scrolling tab strip in the account area, and a bottom tab bar (Home, Friends, Shop, Security, Profile) for signed-in players. The header menu is built from one list shared by all pages.
- **Account area.** The dashboard is now `/account`, with addresses for each section: `/account/profile`, `/account/friends`, `/account/security`, `/account/settings`, `/account/support`, `/account/creator-code`. `/dashboard` redirects to `/account`, and the browser back button works between sections.
- **Overview with real data.** V-Bucks, friends online, two-factor state, last sign-in, a security checklist (two-factor, backup codes, email, Discord) and recent security activity. The fake statistics and the unused inventory and statistics sections are removed.
- **Game versions and server address.** `gameVersionsUrl` adds a "Game versions" button on the dashboard and in the site header (hidden when empty). "Copy server address" copies `serverAddress`, or an address derived from `publicUrl`.
- **Account data export.** Settings > "Download my data" returns a zip of JSON files: account, settings, friends and blocked players, purchases, linked accounts, sessions, security events, support tickets, creator code, locker, owned cosmetics and game profiles. It asks for the password (and a two-factor code when enabled) and never includes password hashes or two-factor secrets.
- **Plugin route guard.** `pluginRouteGuard=warn|block|off` detects plugin routes placed on website paths when the plugin loads.
- **Updates page.** Changelog and Roadmap tabs; the Copy link button works again.

## Tooling

- New `web` test group: pages, shared shell, script syntax, internal links, docs markup, account routes, plugin guard and site info.
- `npm test` runs every functional self-test without starting the server (`npm test web` for one group) and exits with an error code on failure.
- `npm run lint` runs ESLint (errors are real bugs, warnings are style).
- `npm run setup` checks Node.js, installs dependencies and creates `.env` when missing.

## Fixes

- `/stop` shuts down cleanly, and the logger no longer writes to a closed prompt.
- Audit log: a single Export CSV button, filters follow the real actions, test entries are hidden by default, IP addresses no longer carry the IPv6 prefix.
- Game images display on the website; the ban button of the reports list works; loading indicators look right.
- Profile shows the account ID instead of an empty username; the Users tab search and role filter work.
- Documentation no longer lists the Founder and Helper roles, its markup is valid, and a stale "planned for 1.2.8" note is corrected.
- Found by lint and fixed: undefined variables in the Save the World theater, the client version parser and the companion name route (whose error handler would itself throw); the missing `crypto` import in the functions service.
- Configuration values may now contain an equals sign.
- The ban check of the JSON database never saw existing bans (`/ban remove` answered "not banned"); it now does, and a test covers it.
- The update check at startup times out after 5 seconds, no longer delays the launch, and reports the real cause when GitHub is unreachable.

## New configuration keys

| Key | Default | Purpose |
|---|---|---|
| `serverAddress` | empty | Address shown by "Copy server address" |
| `gameVersionsUrl` | empty | Link for the "Game versions" button, hidden when empty |
| `pluginRouteGuard` | `warn` | `warn`, `block` or `off` for plugin routes on website paths |

## New routes

- `GET /neodyme/api/site` (public): version, server address, game versions link.
- `POST /neodyme/api/security/export` (signed in, password required): account data as a zip.

## Upgrade notes

Add the three keys above to `server.properties` if you want to change them; the defaults apply when they are missing. Bookmarks to `/dashboard` keep working.
