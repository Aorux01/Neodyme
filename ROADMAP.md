# Neodyme - Roadmap & Features

> Release plan and complete list of implemented and planned features.

---

## Release plan

Versions are sized to carry a similar amount of work: about 32 effort points each (S = 1, M = 2, L = 3, XL = 4), a little less than 1.2.8, which is around 38. The detailed plan, with origins, dependencies and criteria, is in [VERSION-PLAN.md](VERSION-PLAN.md).

There are two tracks:

- **Platform** (1.2.9 to 1.3.7): everything that is not Fortnite client compatibility: website, accounts, staff panel, content, storage, API, translations, economy.
- **Game** (1.4.1 to 1.4.9): Fortnite compatibility routes and systems, added step by step, including tournaments, ranked and arena. 1.4.9 adds the remaining missing endpoints season by season.

**No Epic compatibility route is added before 1.4.1.** The server-to-server bridge with game servers (`match/result`, stats, tracker) is Neodyme-specific and belongs to the Platform track.

### Released

#### 1.2.6 - Dynamic Content & Image Pipeline
- [x] **First-launch prompt** - Local or remote Fortnite assets, chosen on the first boot
- [x] **Assets index** - `content/assets-index.json` maps every `/images/<path>` to local or remote
- [x] **Folder bundles** - Asset folders shipped through the Plugins repository, downloaded on demand
- [x] **MOTD and news editor** - Multilingual editing of `config/motd.json` (13 languages), with a spotlight item
- [x] **Shop editor (BETA)** - Visual editor for the shop categories
- [x] **Admin page extraction** - Staff panels moved to a dedicated `admin.html`
- [x] **Translations (pass 1)** - 100% coverage of the `config` files in 13 languages
- [x] **Condensed rate-limit logs** - One line per IP and route instead of spam

#### 1.2.7 - Random Skins Fixes
- [x] **Random cosmetics fix** - Players no longer appear with a random outfit, backpack, pickaxe and glider

#### 1.2.8 - Auth, Security & Account Recovery
- [x] **Two-factor authentication** - TOTP, 10 backup codes, email fallback, staff policy, `/security`
- [x] **Password reset, email verification and sign-in links** - One-time links, same answer for any email
- [x] **Discord sign-in and account linking** - Stored in `account_links`, off without `.env` keys
- [x] **Particular authorizations** - `/caps` and the Permissions tab, 26 permissions on top of roles
- [x] **Staff toolbox** - Force logout, admin password reset, ban appeals, audit log export
- [x] **XMPP over SSL** - `xmppProtocol=ws|wss`
- [x] **Whitelist and `/sac`** - `whitelistEnabled`, `/whitelist`, creator code console
- [x] **Unified self-tests and real status page** - `/test` health and functional checks
- [x] **Clean website addresses, hardening and logs** - One log file per launch, configuration advisor

### Upcoming

| Version | Theme | Track | Points |
|---|---|---|---|
| 1.2.9 | Website Foundation | Platform | 32 |
| 1.3.0 | Account Complete | Platform | 32 |
| 1.3.1 | Panel Rebuild | Platform | 32 |
| 1.3.2 | Content Studio | Platform | 32 |
| 1.3.3 | Game Bridge & Tracker | Platform | 34 |
| 1.3.4 | Storage & Reliability | Platform | 32 |
| 1.3.5 | Public API & Integrations | Platform | 32 |
| 1.3.6 | Translations & Onboarding | Platform | 32 |
| 1.3.7 | Economy & Shop | Platform | 32 |
| 1.4.0 | Platform Release Candidate | Milestone | 32 |
| 1.4.1 | Matchmaking & Party | Game | 32 |
| 1.4.2 | Social Parity & Launcher | Game | 32 |
| 1.4.3 | Stats, Arena & Ranked | Game | 32 |
| 1.4.4 | Tournaments & Events | Game | 32 |
| 1.4.5 | Game Modes & Creative | Game | 32 |
| 1.4.6 | Progression & MCP Parity | Game | 32 |
| 1.4.7 | Ward AntiCheat | Game | 32 |
| 1.4.8 | Replay & Notifications | Game | 32 |
| 1.4.9 | New Fortnite Endpoints | Game | 32 |
| 1.5.0 | Neodyme Complete | Milestone | 32 |

#### 1.2.9 - Website Foundation

Focus: Make the website solid and usable everywhere: fixes, mobile navigation, one shared shell and the account area.

- [x] **Clean shutdown** - `/stop` closes readline last, the logger never writes to a closed prompt, the uncaught-error handler is hardened, a test covers it
- [x] **Image URLs on the website** - Epic CDN addresses converted for browser previews (`siteAssetUrl`), copy buttons keep the game address
- [x] **Audit log fixes** - one export button, working summary chips, metadata for every 1.2.8 action, IP normalisation, dynamic action filter, test entries hidden
- [x] **Loading states** - `.spinner` and `.loading-state`, `showBanModal`
- [x] **Profile cleanup** - remove the duplicate "Username" field, show the account id with a copy button
- [x] **Users tab search and role filter that really work**
- [x] **Docs repair** - invalid HTML, Founder and Helper roles mismatch, new pages documented
- [x] **Mobile navigation** - burger menu with a side drawer, scrolling tab strip in the account area, bottom tab bar for signed-in players
- [x] **Shared navigation** - one list for the header and the mobile drawer on every page
- [x] **Account area** - `/account/*` pages, `/dashboard` redirects, real overview data (two-factor itself stays on `/security`)
- [x] **Game versions button and Copy server address** - `gameVersionsUrl` and `serverAddress` in `server.properties`
- [x] **Security checklist and recent activity** on the account overview
- [x] **Account data export** - JSON download, password and two-factor code required
- [x] **Plugin route guard** - `pluginRouteGuard=warn|block|off`
- [x] **Updates page** - Changelog and Roadmap tabs, working Copy link
- [x] **Tooling** - `web` test group, real `npm test`, `npm run lint` and `npm run setup`
- [x] = Done
- [ ] = To do / In development

---

*Last updated: v1.2.9, 2026-10-23*
