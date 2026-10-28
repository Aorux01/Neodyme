const VERSIONS = [
    {
        version: '1.2.9',
        title: 'Website Foundation',
        date: 'October 23, 2026',
        type: 'feature',
        latest: true,
        lts: false,
        summary: 'A website that works on a phone, a real account area, and the tooling to check it: mobile navigation, shared header, account pages, data export, plugin route guard and a website test group.',
        features: [
            { kind: 'new', label: 'Mobile Navigation', text: 'A burger menu with a side drawer on every page, a scrolling tab strip in the account area and, for signed-in players, a bottom tab bar (Home, Friends, Shop, Security, Profile). The header menu now comes from a single list shared by all pages.' },
            { kind: 'new', label: 'Account Area', text: 'The dashboard became <code>/account</code> with its own addresses: <code>/account/profile</code>, <code>/account/friends</code>, <code>/account/security</code>, <code>/account/settings</code>, <code>/account/support</code> and <code>/account/creator-code</code>. <code>/dashboard</code> redirects there, and the browser back button works between sections.' },
            { kind: 'improved', label: 'Overview With Real Data', text: 'The overview shows V-Bucks, friends online, two-factor state and last sign-in, a security checklist (two-factor, backup codes, email, Discord) and your recent security activity. The fake statistics and the unused inventory and statistics sections are gone.' },
            { kind: 'new', label: 'Game Versions And Server Address', text: '<code>gameVersionsUrl</code> adds a "Game versions" button on the dashboard and in the header (hidden when empty), and "Copy server address" copies <code>serverAddress</code>, or an address derived from <code>publicUrl</code>.' },
            { kind: 'new', label: 'Account Data Export', text: 'Settings has a "Download my data" form: account, settings, friends and blocked players, purchases, linked accounts, sessions, security events, support tickets, creator code, locker, owned cosmetics and game profiles as one zip file. It asks for your password (and a two-factor code when enabled) and never includes password hashes or two-factor secrets.' },
            { kind: 'security', label: 'Plugin Route Guard', text: '<code>pluginRouteGuard=warn|block|off</code> detects plugin routes placed on website paths when a plugin loads. Warn logs it, block removes the route.' },
            { kind: 'improved', label: 'Updates Page: Changelog And Roadmap', text: 'The page has a Changelog tab and a Roadmap tab listing the planned versions. The Copy link button of each version works again.' },
            { kind: 'improved', label: 'Website Test Group', text: 'New <code>web</code> test group (pages, shared shell, scripts, internal links, docs markup, account routes, plugin guard, site info). <code>npm test</code> now runs every functional test without starting the server, <code>npm run lint</code> runs ESLint, and <code>npm run setup</code> prepares a fresh install.' },
            { kind: 'fixed', label: 'Audit Log, Images And Loading States', text: 'The audit log filters follow the real actions, test entries are hidden by default, IP addresses no longer show the IPv6 prefix, and there is one Export CSV button. Game images show on the website, the ban button of reports works, and loading indicators look right.' },
            { kind: 'fixed', label: 'Fixes', text: '<code>/stop</code> shuts down cleanly. Profile no longer shows an empty username (it shows your account ID). The Users tab search and role filter work. Documentation no longer lists the Founder and Helper roles and its markup is valid. Lint also exposed and fixed undefined variables in the Save the World theater, the client version parser and the companion name route, configuration values may now contain an equals sign, <code>/ban remove</code> and <code>/ban add</code> now see existing bans on the JSON database (the check never saw them), and the update check at startup no longer slows the launch down when GitHub is unreachable.' }
        ]
    },
    {
        version: '1.2.8',
        title: 'Auth, Security & Account Recovery',
        date: 'October 21, 2026',
        type: 'feature',
        latest: false,
        lts: false,
        summary: 'Modern, self-hosted account management: two-factor authentication, password reset, email verification, sign-in links and Discord sign-in, fine-grained per-account permissions, and a safer staff toolbox (force logout, password reset, ban appeals, audit export). It builds on the BETA email system, the server whitelist and the /sac command, and ships with a unified self-test system, clean website addresses and a round of security hardening. Everything works without any outside account: it is all yours to host.',
        features: [
            { label: 'Two-Factor Authentication', text: 'Players can turn on two-factor authentication from the new <code>/security</code> page with any authenticator app (Google Authenticator, Authy, Bitwarden). It uses a standard TOTP code, 10 single-use backup codes and, when SMTP is set up, an emailed code as a fallback. Secrets are encrypted with a dedicated <code>tfaKey</code> in <code>.env</code>, codes cannot be replayed, and password changes, account deletion and unlinking also ask for a code. It protects the website; the game still signs in with the password.' },
            { label: 'Staff Two-Factor Policy & /security Command', text: '<code>/security enable</code> makes two-factor mandatory for staff: moderators and above cannot open the staff panels until they turn it on. Also <code>status</code>, <code>disable-user</code> (lost phone, logged and the player is emailed), <code>regen-codes</code> and <code>force-reset</code>. Backup codes and reset links shown by the console are never written to the log files.' },
            { label: 'Password Reset, Email Verification & Sign-In Links', text: 'New <code>/forgot-password</code>, <code>/reset-password</code> and <code>/verify-email</code> pages, plus a one-time sign-in link on the login page. Links are stored hashed, work once, expire and are cancelled by newer ones; requests get the same answer whether or not the email exists. A reset ends every session. Email verification is optional (<code>requireEmailVerification</code>, off by default). All of it needs SMTP and simply stays hidden without it.' },
            { label: 'Particular Authorizations: /caps & Permissions Tab', text: 'Roles stay as defaults, and <code>/caps grant|deny|reset|show|list</code> plus the new <strong>Permissions</strong> tab of the Admin panel let you allow one extra permission to a single account or forbid one its role would give. 26 permissions cover every staff route; a denial always wins, nobody can edit their own authorizations, and you can only allow what you hold. Panels and tabs now appear only when the account can use them.' },
            { label: 'Force Logout, Admin Password Reset & Ban Appeals', text: 'Moderators can end every session of a player, and admins can reset a password (emailed link, or shown once when email is off). Banned players get an <strong>Appeal this decision</strong> link that opens <code>/appeal</code> and creates a ticket for the moderators; replies are emailed to the player. Ending sessions now also invalidates website sessions, which a reset did not do before.' },
            { label: 'Discord Sign-In & Account Linking', text: 'Players link Discord from their Security page, then sign in with one click. Accounts are only linked from an authenticated session and never matched by email; two-factor still applies. The host creates their own Discord application and sets <code>DISCORD_CLIENT_ID</code> and <code>DISCORD_CLIENT_SECRET</code> in <code>.env</code>; without them it stays off. Links are stored in <code>account_links</code> (JSON file or MongoDB collection).' },
            { label: 'Audit Log: Date Filter Fix & CSV Export', text: 'The period filter of the Audit Log never worked because the server ignored the dates the panel sent. Fixed, and a new <strong>Export CSV</strong> button downloads up to 5000 matching entries, with spreadsheet formulas neutralized.' },
            { label: 'XMPP Over SSL', text: '<code>xmppProtocol=wss</code> serves chat and matchmaking over TLS with the certificate already used for HTTPS. Clients are told <code>wss://</code> and <code>bUseSSL=true</code>; without a certificate only XMPP stays off, with a clear message.' },
            { label: 'Clean Website Addresses', text: 'Pages now live at <code>/login</code>, <code>/register</code>, <code>/dashboard</code>, <code>/shop</code>, <code>/admin</code>, <code>/docs</code> and so on. The old <code>/html/*.html</code> addresses redirect, and every link was updated. The login redirect also no longer accepts addresses outside the site.' },
            { label: 'Unified Self-Tests & Real Status Page', text: '<code>/test</code>, the Developer panel and the public status page now share one registry. Health checks are read-only and automatic; functional checks run real scenarios (sign in, tokens, bans, reset, two-factor, permissions, Discord) on throwaway accounts, only on demand with <code>/test all --functional</code> or from the System tab. The status page used to show fixed green values for several services and now reports the real state.' },
            { label: 'Security Hardening', text: 'CORS now only answers listed origins (<code>corsOrigins</code>), <code>trustProxy</code> is off by default, debug logs mask passwords and tokens, commands of one account run one at a time so profile writes cannot overwrite each other, and the session routes are CSRF protected. The web login also checks bans correctly with MongoDB, and a failed MongoDB connection no longer crashes with an unhandled error.' },
            { label: 'One Log File Per Launch', text: 'Every server start writes <code>logs/YYYY-MM-DD_HH-mm-ss.txt</code>, with colours removed and unexpected errors recorded with their stack. Old files are pruned with <code>logMaxFiles</code> (30 by default).' },
            { label: 'Configuration Advisor & Diagnostics', text: 'At startup, and in the System tab, the server points out settings that do not work together, for example email links without a <code>publicUrl</code>, or verification required without SMTP. <code>/diagnostic</code> gained an account security block.' },
            { label: 'Interface Polish & Fixes', text: 'Menus, panels and borders follow the site theme instead of grey, native select lists are readable, the shop loading message is styled, and danger buttons are lighter. Fixed a Developer panel call that hit a doubled address and returned a 404, and the missing style of error messages in the Admin panel.' },
            { label: 'BETA Email: SMTP & /email Command', text: 'New email subsystem built on <code>nodemailer</code>. Configure SMTP from the console with <code>/email create &lt;host&gt; &lt;port&gt; &lt;user&gt; &lt;pass&gt; [from]</code> (stored in <code>.env</code>, TLS auto-detected from the port), check it with <code>/email info</code>, remove it with <code>/email delete</code>, and send a branded HTML test with <code>/email test &lt;user|accountId&gt;</code>. The dependency loads lazily, so the server still boots if it has not been installed yet.' },
            { label: 'BETA Email: Templates & HTML Layouts', text: 'Templates (subject, heading, body, footer) live in <code>data/email/templates/</code> and are rendered into reusable HTML layouts in <code>data/email/layouts/</code> (a <code>default</code> dark theme + a <code>light</code> one ship by default). Both are fully editable from the Dev panel\'s new <strong>Email</strong> tab, with a <strong>Preview</strong> button that renders the result with sample data in an iframe. Variables like <code>{{displayName}}</code>, <code>{{serverName}}</code> and <code>{{version}}</code> are interpolated per recipient.' },
            { label: 'BETA Email: Mass Send', text: 'Send any template to selected roles and/or specific accounts (optionally verified-only) from the Dev panel. A <strong>Preview count</strong> shows how many recipients match, sending requires confirmation, and a live progress bar tracks the background job. Throttled in batches (<code>emailBatchSize</code> / <code>emailBatchDelayMs</code>) to respect SMTP limits. Mass sending is <strong>admin-only</strong>; template/layout editing is developer-level.' },
            { label: 'BETA Email: Automation', text: 'Rules in <code>data/email/automations.json</code> send emails automatically on triggers: <code>account.created</code> (welcome the new account), <code>maintenance.on</code> / <code>maintenance.off</code>, and <code>cron</code> (scheduled newsletters via <code>node-cron</code>). Each rule picks a template and a recipient selection and can be toggled on/off from the Dev panel. All rules ship disabled by default.' },
            { label: 'Server Whitelist', text: 'New optional whitelist that restricts who can connect to the server. Toggle it with <code>whitelistEnabled</code> in <code>server.properties</code> (default <code>false</code>); when enabled, only accountIds listed in <code>data/whitelist.json</code> (JSON) or the <code>whitelist</code> collection (MongoDB) can authenticate. The check runs at every auth entry point - <code>password</code>, <code>refresh_token</code> and <code>exchange_code</code> grants - and rejected players receive a clear <em>"Your account is not whitelisted on this server."</em> message instead of a generic credentials error. Toggling via the console or panel applies immediately without a restart.' },
            { label: '/whitelist Console Command', text: 'New <code>/whitelist</code> command with <code>set &lt;true|false&gt;</code> (enable/disable), <code>add &lt;user|accountId&gt;</code>, <code>remove &lt;user|accountId&gt;</code> and <code>list</code>. Add/remove accept either a displayName or a raw accountId, and <code>list</code> surfaces whitelisted accounts (flagging entries whose account no longer exists).' },
            { label: 'Whitelist Admin Tab', text: 'New <strong>Whitelist</strong> tab in the Admin panel to enable/disable the whitelist and add, remove or review whitelisted accounts from the browser - no console access required.' },
            { label: '/sac Console Command', text: 'New <code>/sac</code> command for full creator-code management from the console: <code>add &lt;user|accountId&gt; &lt;code&gt;</code> (create a code directly for an account), <code>list</code> (all active codes with uses and earnings), <code>delete &lt;code&gt;</code> and <code>info &lt;code&gt;</code> (owner, status, usage and earnings).' },
        ]
    },
    {
        version: '1.2.7',
        title: 'Random Cosmetics Fix',
        date: 'June 18, 2026',
        type: 'hotfix',
        latest: false,
        lts: false,
        summary: 'Hotfix for the long-standing "random skin in-game" issue. Players were spawning with a random outfit instead of the one equipped in the locker.',
        features: [
            { label: 'Fix: Random Cosmetics In-Game', text: 'Players were spawning with a random outfit / backpack / pickaxe / glider regardless of what they had equipped in the locker. Investigation of the MCP profile, the <code>favorite_*</code> stats and the locker_slots_data showed the backend was sending the correct loadout, ruling out the MCP layer. Root cause: <code>bLoadTestCosmetics=true</code> in <code>data/cloudstorage/system/DefaultGame.ini</code> instructs the Fortnite client to bypass the backend loadout and randomly pick cosmetics for test scenarios. The flag is now set to <code>false</code> by default. Existing servers should run with manually flip the flag in <strong>Dev Panel -> Config Files -> DefaultGame.ini</strong> or directly into the folder in <strong>data/cloudstorage/system/DefaultGame.ini</strong>. Credit to the community member who pinpointed the flag.' },
        ]
    },
    {
        version: '1.2.6',
        title: 'Asset Pipeline, Web Rebuild & Locker Sync',
        date: 'June 12, 2026',
        type: 'feature',
        latest: false,
        lts: false,
        summary: 'New unified Asset Pipeline (online CDN-redirect or local serving with one command), full /assets toolset with verification and integrity checks, versioned plugin manifests with per-version dependencies, a complete website backend/frontend logic rebuild (all web routes namespaced under /neodyme/api/* with a single unified response shape, a per-user website rate limiter, account self-deletion, a fully functional friends & player-search dashboard, and a large frontend cleanup), a fix for the locker "one-step-behind" desync where equip changes lagged a step in the menu, locker/stats synchronization on every equip, and a complete matchmaking configuration guide.',
        features: [
            { label: 'Asset Pipeline', text: 'New unified system controlling how Fortnite assets (images, banners, lobby art...) are served, with two modes: <code>online</code> (HTTP 302 redirects to the official Epic CDN listed in <code>content/assets-index.json</code>, zero disk usage) and <code>local</code> (serves from <code>public/images/</code> with automatic CDN fallback). Folders matching <code>alwaysLocal</code> globs (Neodyme branding, radios) always serve from disk. A new <code>asset-middleware.js</code> intercepts <code>/images/*</code> with path-traversal protection, and <code>content/assets-index.json</code> hot-reloads on change - no restart needed.' },
            { label: 'First-Launch Asset Prompt', text: 'When <code>assetsMode</code> is empty in <code>server.properties</code>, an interactive startup prompt asks <code>[O]nline</code> / <code>[L]ocal</code> and persists the choice. Non-interactive runs (CI, Docker) default to <code>online</code> silently.' },
            { label: '/assets Console Toolset', text: 'Full command set under <code>/assets</code> (<code>status</code>, <code>mode</code>, <code>list --tag</code>, <code>info</code>, <code>diagnose</code>, <code>install</code>, <code>uninstall</code>, <code>clean</code>, <code>verify</code>, <code>reload</code>, <code>refresh</code>). Switching to <code>local</code> auto-downloads every missing indexed asset via the global progress bar; <code>verify</code> audits file sizes against the manifest (zero-byte / mismatch warnings, plus orphan detection); destructive ops require <code>/confirm</code>.' },
            { label: 'Plugin Manifests & Dependencies', text: 'Manifests now support a grouped <code>versions</code> object so one plugin can ship multiple versions side-by-side (legacy flat <code>files[]</code> still accepted). <code>/plugins store install|update &lt;id&gt; [version]</code> takes an optional version - otherwise the latest compatible with the running backend is picked. Plugin-to-plugin <code>dependencies.plugins[]</code> are resolved recursively with cycle detection (npm deps still via <code>npm install --save</code>).' },
            { label: 'Unified Download Progress & Condensed Logs', text: 'Multi-file downloads (plugin installs, asset bundles) now render a single global console progress bar instead of one per file, with total size resolved up front. Repeated rate-limit hits from the same IP+route are aggregated into one condensed line flushed after the burst, configurable via <code>rateLimitLogCondenseSeconds</code> (default 5s; 0 = legacy per-hit logging).' },
            { label: 'Web Rebuild: Dedicated Staff Page & JS Split', text: 'Moderation/Developer/Admin panels moved out of the dashboard into a role-gated <code>admin.html</code> (non-staff redirected; dashboard shows a single "Staff Panel" link and no longer loads staff JS or Chart.js). The monolithic script was split into <code>dashboard.js</code> (player) + <code>staff-panel.js</code> (staff), with shared helpers consolidated in <code>common.js</code> and the fragile <code>showSection</code> / tab-router monkey-patches untangled into one clean definition per page.' },
            { label: 'Web Rebuild: API Namespace & Unified Responses', text: 'All website routes moved under a single <code>/neodyme/api/*</code> prefix, cleanly separated from game routes (<code>/fortnite/</code>, <code>/account/</code>...), with the old wildcard patterns (<code>*auth/login</code>, <code>*shop</code>) replaced by exact paths. Every route now returns a consistent shape - <code>{ success: true, ... }</code> or <code>{ success: false, error: CODE, message }</code> - with the correct HTTP status (400/401/403/409/429/500); game routes keep the Epic error format.' },
            { label: 'Web Rebuild: Per-User Rate Limit', text: 'The global IP rate-limiter no longer applies to the website API; a dedicated per-user limiter (<code>webMaxRequests</code>, default 600/min) covers it instead. Busy staff panels firing many calls in a burst are no longer throttled, and throttling now returns a clean <code>429</code> instead of a confusing <code>400</code>.' },
            { label: 'Account Self-Deletion & Friends Dashboard', text: 'New <code>DELETE /neodyme/api/auth/account</code> lets a player permanently delete their own account (password-confirmed; sessions revoked, cookies cleared). The dashboard Friends section is now fully functional - real player search, send/accept/reject/cancel requests, and remove friends - replacing the old "coming soon" stub (server-role accounts are excluded from search).' },
            { label: 'Frontend Logic Cleanup', text: 'Consolidated duplicated helpers into <code>common.js</code> (single <code>logout</code>, <code>getCsrfToken</code>, <code>secureFetch</code>, plus a new <code>apiError</code> that surfaces the human message). Fixed three staff actions (dismiss report, dismiss all, delete feedback) that silently failed CSRF by reading a non-existent <code>&lt;meta&gt;</code> token, and removed dead localStorage token handling.' },
            { label: 'Fix: Locker "One-Step-Behind" Desync', text: 'Equipping a cosmetic in the locker showed the <em>previous</em> selection instead of the one just picked. The MCP response set <code>profileChangesBaseRevision</code> to the already-incremented <code>rvn</code>, so the client rejected each delta and only caught up on the next action. The response builder now reports the correct pre-change base revision, and only emits a <code>fullProfileUpdate</code> when the client is genuinely out of sync (no more spurious full updates mid-session). <code>SetCosmeticLockerSlot</code>, <code>EquipBattleRoyaleCustomization</code> and <code>BulkEquipBattleRoyaleCustomization</code> are all covered.' },
            { label: 'Locker / Stats Synchronization', text: 'On every equip, the locker item\'s <code>locker_slots_data</code> and the matching <code>stats.attributes.favorite_*</code> (plus <code>last_applied_loadout</code>) are kept in sync via a shared <code>cosmetic-sync-service</code>, and reconciled on profile query - covering Character/Backpack/Pickaxe/Glider/SkyDiveContrail/MusicPack/LoadingScreen/Dance/ItemWrap. Note: a separate dedicated-server cosmetic-rendering issue is still under investigation.' },
            { label: 'Fix: dedicated_server Access', text: 'Dedicated game servers (RebootDS, custom DS) now reach <code>POST /fortnite/api/game/v2/profile/:accountId/dedicated_server/QueryProfile</code> without hitting 403. The route requires the caller account to have the <code>server</code> role - this is now documented in the Matchmaking guide so DS host accounts (e.g. <code>Host0001</code>) are set up correctly from the start.' },
            { label: 'Matchmaking Guide', text: 'New <a href="/docs/game-files#matchmaking">Matchmaking &amp; dedicated servers</a> section in the docs walks through configuring <code>config/game-servers.json</code>: declaring a server entry per region+gamemode, mapping playlists in <code>game_modes</code>, hosts/DNS rewrite for the launcher, and a checklist for the five most common matchmaking failures (with the exact log line each one produces). Also clarifies that the matchmaker does not health-check servers - the <code>status</code> field is honoured as-is.' },
            { label: 'OAuth Diagnostics & Exchange Endpoint', text: 'Failed <code>POST /account/api/oauth/token</code> now logs the grant type and username (no password) so launcher/DLL auth failures are diagnosable from server logs. New <code>GET /account/api/oauth/exchange</code> endpoint matches the Epic flow (returns an exchange code for the bearer\'s account, falls through to <code>{}</code> without one for launcher parity). Also fixed a missing <code>await</code> in the existing exchange-code grant path that made the consumed accountId a Promise.' },
            { label: 'Content Editor (Dev Panel)', text: 'New typed editors in the Dev Panel for 17 in-game content sections - no more raw JSON editing for MOTD, news, lobby messages or BR/Creative/STW content. Each section has a schema-driven form with per-field <strong>i18n toggle</strong> (string vs 13-locale object), live coverage badge (<code>13/13</code> green / <code>7/13</code> orange / <code>0/13</code> red), a locale switcher bar that re-renders every field at once, draggable/duplicatable/deletable list entries, and a "Reset file" action that re-downloads the canonical file from the GitHub repo. Backed by <code>GET/PUT /neodyme/api/dev/content/:scope/:section</code> with an allowlist and automatic pages-cache invalidation. Covers <em>login message, emergency notice v1/v2, lobby, special offer video, subgame select/info, MOTD modern (config/motd.json), BR News v1/v2, battle pass about, creative news, creative ads, creative features, STW news, athena message, survival message</em>.' },
            { label: 'Assets Manager (Dev Panel)', text: 'New <strong>Assets</strong> tab with three sub-views: <code>Upload</code> (drag-and-drop or file picker, max 5MB, magic-byte validation for PNG/JPEG/WebP/GIF - a renamed script is rejected), <code>Browse local</code> (grid of every image in <code>public/images/</code> grouped by folder, with copy-URL and delete on uploaded entries), <code>Browse online</code> (CDN-only entries from <code>assets-index.json</code>). Uploaded files land in <code>public/images/uploaded-images/</code> with timestamped names, get registered in <code>assets-index.json</code> with metadata (<code>originalName</code>, <code>uploadedBy</code>, <code>uploadedAt</code>), and are forced <code>alwaysLocal</code> so the public URL <code>https://&lt;your-host&gt;/images/uploaded-images/&lt;file&gt;</code> always resolves to disk. The Content Editor\'s image fields now have inline <strong>Upload</strong> and <strong>Browse</strong> buttons that open the same library and auto-fill the URL.' },
            { label: 'Shop Editor BETA (Dev Panel)', text: 'New <strong>Shop</strong> tab to hand-pick what fills each slot of <code>data/shop.json</code>. Slots come from <code>config/shop.json -> shopCategories[].count</code> and are grouped by category (Daily, Featured...). Each card supports: <strong>pick</strong> (opens a searchable cosmetic grid backed by <code>fortnite-api.com</code> with rarity-coloured borders), <strong>random</strong> (single-slot reroll), <strong>edit</strong> (manual grant/price), <strong>clear</strong>, plus a <strong>Randomize all empty</strong> bulk action. Prices default sensibly by rarity (legendary 2000, epic 1500, rare 1200, uncommon 800, common 200). Catalog is cached server-side for 1h to stay friendly to the API.' },
        ]
    },
    {
        version: '1.2.5',
        title: 'XMPP Overhaul & Shop Generator',
        date: 'March 28, 2026',
        type: 'feature',
        latest: false,
        lts: true,
        summary: 'Complete XMPP overhaul, full party system (pings, invites, promote, intentions, Vivox voice chat) with real-time XMPP notifications, SVG shop image generation with zero native dependencies, historical date-based shop rotation, real gift eligibility validation, player report system with moderation panel, improved item image quality, and optional HTTPS/SSL support. Known issues remain: Battle Pass on some seasons, and EOS on builds 19+.',
        features: [
            { label: 'XMPP Overhaul', text: 'Full MUC (party lobbies), friend-based presence filtering, real-time party notifications (join, leave, meta patch), and stale connection cleanup on reconnect' },
            { label: 'Party System', text: 'Full ping/invite flow (<code>PING</code>, <code>INITIAL_INVITE</code>, <code>INVITE_CANCELLED</code>), captain promotion (<code>MEMBER_NEW_CAPTAIN</code>), join-request intentions, and Vivox JWT voice chat' },
            { label: 'Shop Image Generator', text: 'Server-side SVG shop image generation with zero native dependencies. Available at <code>GET /api/shop/image</code> with 10-minute cache and a "Shop Preview" button in the dashboard' },
            { label: 'Historical Shop by Date', text: '<code>POST /api/admin/shop/rotate-date</code> rotates the shop to cosmetics released on a specific date (<code>{ date: "YYYY-MM-DD" }</code>)' },
            { label: 'Optional HTTPS / SSL', text: 'Set <code>protocol=https</code> in <code>server.properties</code> to enable HTTPS with <code>sslCertPath</code> / <code>sslKeyPath</code>' },
            { label: 'Player Reports', text: 'In-game toxicity report system stored in JSON/MongoDB, visible in Mod Panel with dismiss and ban shortcuts' },
            { label: 'Friend Block / Unblock', text: 'Block/unblock fully implemented with ownership check and database persistence' },
            { label: 'Cosmetic Loadout Presets', text: '<code>CopyCosmeticLoadout</code>, <code>DeleteCosmeticLoadout</code>, and <code>RequestRestedStateIncrease</code> MCP operations added' },
            { label: 'config/playlists.json', text: 'Single source of truth for lobby game modes: <code>enabled</code> toggle, <code>minBuild</code> version gate. Controls both <code>DefaultGame.ini</code> cloud storage and the discovery surface. Trios from 15.0+, STW from 19.30+' },
            { label: '/give item command', text: '<code>/give item &lt;username&gt; &lt;templateId&gt;</code> - grants any athena cosmetic directly from the console' },
            { label: 'PurchaseMultipleCatalogEntries', text: 'New MCP endpoint - batch version of <code>PurchaseCatalogEntry</code>, processes multiple offers in a single request' },
            { label: 'Fix: Purchases not finalizing', text: 'Stale <code>rvn</code> caused the client to discard purchases ("impossible de finaliser") - fixed by sharing the same profile object reference' },
            { label: 'Fix: XP Boost Showing 0%', text: 'Battle Pass XP boost tokens were treated as cosmetics - <code>season_match_boost</code> now correctly accumulates the bonus' },
            { label: 'Fix: Battle Pass Double Purchase', text: '<code>battlePassPurchased</code> guard now returns error 19000 if the pass was already bought this season' },
            { label: 'Fix: Skins with Styles (BP rewards)', text: 'Athena cosmetics granted from Battle Pass tiers were missing <code>variants: []</code> - style options now display correctly' },
            { label: 'Fix: SetCosmeticLockerSlot on Purchased Items', text: 'Items purchased were stored under UUID keys but client sends templateId - fixed with two-step key resolution' },
            { label: 'Fix: Trios Not Showing in Lobby', text: '<code>Playlist_Trios</code> was hardcoded disabled in <code>DefaultGame.ini</code> - now driven by <code>config/playlists.json</code>' },
            { label: 'Fix: XMPP Unreachable from Other Machines', text: '<code>DefaultEngine.ini</code> had <code>ServerAddr="ws://127.0.0.1"</code> hardcoded - now uses configurable <code>xmppHost</code>' },
            { label: 'Fix: Refund System', text: 'Refund unified under a single code path, free-refund items no longer consume a token, duplicate refunds blocked, and V-Bucks restoration no longer uses a hardcoded item key' },
            { label: 'Fix: Chapter 1 Shop', text: 'Added <code>isChapter1</code> flag so Chapter 1 clients always get the correct <code>BRDailyStorefront</code> / <code>BRWeeklyStorefront</code> layout' },
            { label: 'Fix: Creator Code Commission', text: 'Commissions now credited on all in-game V-Bucks deductions (BP, tiers, BR cosmetics, STW)' },
            { label: '404 Page', text: 'Unknown routes now serve <code>web/html/404.html</code> for browser requests; API paths still return JSON errors' },
        ]
    },
    {
        version: '1.2.4',
        title: 'Commands & Admin Panel',
        date: 'March 05, 2026',
        type: 'feature',
        latest: false,
        lts: false,
        summary: 'New commands, greatly enhanced admin/dev/mod panels with role-based access, creator code integration, V-Bucks purchase flow redesign, improved shop UI, live monitoring, local docs, and a series of bug fixes.',
        features: [
            { label: 'Graceful Service Startup', text: 'XMPP, Shop, Backup, Commands, Plugins, and Rate Limiting no longer crash the server on startup failure - each service logs a warning and marks itself as disabled, so the rest of the server continues running normally' },
            { label: 'New Commands', text: '<code>/data migrate</code> (JSON↔MongoDB with <code>--dry-run</code>), <code>/test</code> suite, <code>/diagnostic</code> full system report; <code>/reload</code> now reloads config+plugins+shop in one shot' },
            { label: 'Role-Based Command Access', text: 'Each staff level now sees only their own commands - Moderators see moderation tools, Developers see dev commands, Admins see the full command set across all levels' },
            { label: 'Live Monitor', text: 'Real-time charts for CPU (system & process), RAM (system & process heap), and active players - sampling-based CPU measurement works correctly on Windows; RAM chart line order corrected (dashed = Process, solid = System)' },
            { label: 'Plugin Config Editor', text: "Browse and edit any plugin's JSON config files directly from the Dev panel without leaving the dashboard" },
            { label: 'Dev Panel', text: 'Added Logs and Plugins tabs - developers can view console logs and manage plugins from the Dev section' },
            { label: 'Admin Panel', text: 'Commands panel redesigned as categorized buttons (Reload, Shop, Backup, Tokens, Maintenance); Settings expanded with Creator Code commission, Maintenance toggle, and Security options; Server Config tab removed (managed via <code>server.properties</code>)' },
            { label: 'Mod Panel', text: 'Commands tab added for moderation actions (ban/unban/lookup); tab icons added; players list now filters correctly by role level so staff are never shown' },
            { label: 'V-Bucks Purchase Redesign', text: 'Multi-step flow with animated step indicator (Package -> Payment -> Review -> Done); package cards now correctly display base amount + bonus breakdown before purchase' },
            { label: 'Creator Code - Purchase', text: 'Creator code input added to the V-Bucks purchase flow (step 2); code is validated live against the server; commission is credited to the creator on successful purchase; pre-filled from <code>?creator=</code> URL param or localStorage' },
            { label: 'Creator Code - Shop', text: '"Support a Creator" card added to the shop sidebar; code persists in localStorage and is automatically applied when visiting the V-Bucks purchase page' },
            { label: 'Creator Code - Validate API', text: 'New public endpoint <code>GET /api/creator-code/validate/:code</code> to check if a creator code is active without authentication' },
            { label: 'Shop UI', text: 'Rarity-coloured card accents and image backgrounds, item price display, owned badge, pill-shape filter buttons, and improved section styling' },
            { label: 'CSRF Fix', text: 'Fixed a token field mismatch (<code>data.token</code> -> <code>data.csrfToken</code>) that caused all mutating operations (role change, plugin reload, file save) to return 403' },
            { label: '404 Page', text: 'Unknown routes now serve <code>web/html/404.html</code> for browser requests; API paths still return JSON errors' },
            { label: 'Updates Page', text: 'Redesigned with a split layout - version list on the left, feature detail panel on the right; fully JavaScript-driven for easy maintenance' },
            { label: 'Docs', text: 'Documentation pages served locally - DOCS nav link points to built-in pages' },
            { label: 'Code Architecture', text: 'Commands split into <code>src/commands/</code> modules; <code>api/network/web.js</code> split into 11 focused sub-modules under <code>api/web/</code>' },
            { label: 'Server Role', text: 'New <code>server</code> role (level 5) for internal service accounts; <code>verifyServer</code> middleware restricts endpoints to server-only callers; assignable via admin panel or <code>/admin set &lt;user&gt; server</code>' },
            { label: 'Security Toggle State', text: 'Admin Panel › Settings › Security buttons (Rate Limiting, CORS, Helmet, Compression, Trust Proxy) now show the current active state - the active option is highlighted green and the inactive one is highlighted red' },
            { label: 'System Tests', text: 'Dev Panel › System tests now distinguish config-disabled services (XMPP off, shop rotation off) from startup failures, and report the exact error message when a service failed to start' },
            { label: 'Fix: Creator Code on Shop Purchases', text: 'Creator codes entered on the purchase page are now persisted to localStorage so they are correctly applied when buying items directly from the shop' },
            { label: 'Fix: CMD_PERMS_SORTED', text: 'Moved command permission table into <code>web-service.js</code> where <code>getCommandMinRole()</code> lives - resolved "CMD_PERMS_SORTED is not defined" runtime error on command execution' },
            { label: 'CloudStorage MongoDB', text: 'ClientSettings.Sav is now stored directly in MongoDB as a binary document when the database type is set to MongoDB - no more filesystem writes for user cloud storage data in MongoDB mode' },
            { label: 'CloudStorage Auth', text: 'All three user CloudStorage routes (<code>GET /user/:accountId</code>, <code>GET /user/*/:file</code>, <code>PUT /user/*/:file</code>) now require a valid bearer token via <code>verifyToken</code> middleware' },
            { label: 'Ownership Validation', text: 'Wildcard CloudStorage routes now explicitly verify that the accountId in the URL matches the authenticated user - prevents any user from reading or overwriting another account\'s settings' },
            { label: 'Fix: version.buildId', text: 'Corrected a bug where <code>version.buildId</code> (undefined) was passed to all ClientSettings calls - replaced with the correct <code>version.build</code> field from VersionService' },
        ]
    },
    {
        version: '1.2.3',
        title: 'Plugin Store',
        date: 'February 18, 2026',
        type: 'feature',
        latest: false,
        lts: false,
        summary: 'New integrated plugin store allowing to browse, install, and update plugins directly from the console with real-time progress tracking and automatic npm dependency management.',
        features: [
            { label: 'Plugin Store', text: 'New <code>/plugins store</code> command to browse, search, install and update plugins directly from GitHub' },
            { label: 'Content & API', text: 'Improvements to content files and API endpoints' },
        ]
    },
    {
        version: '1.2.2',
        title: 'Battle Pass & Game Mode Fixes',
        date: 'February 11, 2026',
        type: 'hotfix',
        latest: false,
        lts: false,
        summary: 'Critical fixes for Battle Pass, game mode selection, shop display, and major backend improvements.',
        features: [
            { label: 'Battle Pass Offers', text: 'Fixed 950 V-Bucks button for Season 11+ by implementing dynamic storefront generation (BRSeason11+)' },
            { label: 'Game Mode Selection', text: 'Fixed missing Save the World / Battle Royale / Creative menu' },
            { label: 'Shop Categories', text: 'Fixed shop tabs to display "Daily" and "Featured" instead of "NEODYME ITEM SHOP"' },
            { label: 'MCP Route', text: 'Added SetHardcoreModifier endpoint for game mode switching functionality' },
            { label: 'Catalog Structure', text: 'Improved battle pass offers structure with DenyOnFulfillment requirements, displayAssetPath, and proper metadata' },
            { label: 'Dynamic Quest Expiration', text: 'All quest and event dates now calculate dynamically (3 months from current date) instead of hardcoded "9999-01-01" dates' },
            { label: 'Redis Integration', text: 'Implemented Redis support for Party system with automatic fallback to memory storage' },
            { label: 'Party Manager', text: 'Added Redis persistence for party data with 24-hour TTL, enabling multi-instance deployments' },
        ]
    },
    {
        version: '1.2.1',
        title: 'Hotfixes',
        date: 'February 3, 2026',
        type: 'hotfix',
        latest: false,
        lts: false,
        summary: 'Bug fixes and improvements for shop, XMPP, and timeline systems.',
        features: [
            { label: 'ClientSettings.Sav', text: 'Fixed binary encoding (latin1) for proper game settings persistence' },
            { label: 'Dynamic Timeline', text: 'Season dates and store expiration now calculated dynamically from shop_state.json' },
            { label: 'XMPP Friend Requests', text: 'Fixed direction values (OUTBOUND/INBOUND) for proper friend request handling' },
            { label: 'Dynamic Shop Categories', text: 'Website now supports all custom shop categories from config' },
            { label: 'Shop Config API', text: 'New <code>/api/shop/config</code> endpoint for retrieving shop category configuration' },
            { label: 'Other', text: 'Command system and plugin system improvements' },
        ]
    },
    {
        version: '1.2.0',
        title: 'Release',
        date: 'January 31, 2026',
        type: 'release',
        latest: false,
        lts: false,
        summary: 'Major security hardening and enhanced server architecture.',
        features: [
            { label: 'Bcrypt Work Factor', text: 'Increased to 12-14 (configurable) for 2026 security standards' },
            { label: 'Password Complexity', text: 'Enforced requirements (uppercase, lowercase, numbers, special chars)' },
            { label: 'Timing Attack Protection', text: 'Random delays (50-200ms) prevent account enumeration' },
            { label: 'Token Encryption', text: 'Optional AES-256-GCM encryption for tokens at rest' },
            { label: 'Session Management', text: 'Token rotation with family detection, IP binding, device fingerprinting' },
            { label: 'Session Dashboard', text: 'New "Security & Sessions" tab to view and manage active sessions' },
            { label: 'Global Logout', text: '"Log Out All Devices" functionality added' },
            { label: 'Request Limits', text: 'Configurable 1 MB limit for regular requests (50 MB for cloud storage)' },
            { label: 'Shop Categories', text: 'Support for custom shop categories beyond Daily/Featured' },
            { label: 'V-Bucks API', text: 'New dedicated endpoints for V-Bucks management' },
            { label: 'EOS Connect (Partial)', text: 'Basic EOS authentication routes implemented. Builds 19+ (EOS-only auth) may still encounter connection failures - ongoing investigation' },
            { label: 'Server Architecture', text: 'The server architecture was reviewed and cleaned up' },
            { label: 'Admin Panel', text: 'The server now has an administrator panel' },
        ]
    },
    {
        version: '1.1.6',
        title: 'Security Hardening',
        date: 'January 15, 2026',
        type: 'security',
        latest: false,
        lts: false,
        summary: 'Critical security improvements and Redis support.',
        features: [
            { label: 'Token Hashing', text: 'Tokens are now stored as SHA-256 hashes - raw tokens never persisted' },
            { label: 'JWT Secret Rotation', text: 'Automatic monthly rotation with 256-bit secrets' },
            { label: 'HttpOnly Cookies', text: 'Authentication tokens moved from localStorage to secure HttpOnly cookies with SameSite=Strict' },
            { label: 'CSRF Protection', text: 'Added CSRF middleware with token validation for all forms' },
            { label: 'Account Enumeration Fix', text: '/check-email and /check-username now return uniform responses' },
            { label: 'Redis Support', text: 'Optional Redis storage for tokens and cache (configurable in server.properties)' },
            { label: 'Async File Operations', text: 'Converted synchronous file reads to async for better performance' },
            { label: 'Site', text: 'Website functionality improvements' },
        ]
    },
    {
        version: '1.1.5',
        title: 'Security',
        date: 'December 21, 2025',
        type: 'security',
        latest: false,
        lts: false,
        summary: 'Major security improvements and critical fixes.',
        features: [
            { label: 'Automated Secret Management', text: 'JWT and Game Server secrets auto-generated on first startup' },
            { label: 'Secure Secret Storage', text: 'All secrets moved from server.properties to .env file' },
            { label: 'Enhanced Authentication', text: 'Fixed critical NULL pointer crash and added timing attack protection' },
            { label: 'Input Validation', text: 'Comprehensive type checking and length limits' },
            { label: 'Token Validation', text: 'Enhanced security with automatic account ownership validation' },
        ]
    },
    {
        version: '1.1.4',
        title: 'Security Hardening',
        date: 'December 13, 2025',
        type: 'security',
        latest: false,
        lts: false,
        summary: 'Major security fixes addressing 10 critical vulnerabilities.',
        features: [
            { label: 'Token Persistence', text: 'Tokens now persist to Tokens.json file instead of in-memory storage - survives server restarts' },
            { label: 'Input Validation', text: 'Added comprehensive input validation for all authentication endpoints with length limits' },
            { label: 'Password Requirements', text: 'Enforced strong password policy (8+ chars, uppercase, lowercase, number, special char) with visual strength indicator' },
            { label: 'Email Normalization', text: 'All emails are now normalized to lowercase to prevent duplicate accounts' },
            { label: 'Account Lockout', text: 'Added account lockout after 5 failed login attempts with exponential backoff' },
            { label: 'Race Condition Protection', text: 'Implemented file locking and atomic write operations for all JSON database operations' },
            { label: 'Shop Images', text: 'Shop now displays item images from fortnite-api.com and shows "Already Owned" badge' },
            { label: 'Token Commands', text: 'New /tokens, /health, /ready, /unlock commands for token and server management' },
            { label: 'Website', text: 'Updated the Neodyme website' },
        ]
    },
    {
        version: '1.1.3',
        title: 'Rate Limiting & Security',
        date: 'December 08, 2025',
        type: 'security',
        latest: false,
        lts: false,
        summary: 'Complete rate limiting system with 3 protection levels and security improvements.',
        features: [
            { label: 'Rate Limiting', text: '3 levels (Global, Authentication, Expensive Ops) - fully configurable' },
            { label: 'Protected Endpoints', text: 'Login, register, purchases, refunds, shop rotation' },
            { label: 'Security Settings', text: 'All security parameters (CORS, Helmet, Compression) now work correctly' },
            { label: 'Configuration', text: 'Fixed parameter naming consistency in server.properties' },
        ]
    },
    {
        version: '1.1.2',
        title: 'Hotfixes',
        date: 'November 21, 2025',
        type: 'hotfix',
        summary: 'Bug fixes and stability improvements.',
        features: [
            { label: 'EXP System', text: 'Fixed experience point calculation errors' },
            { label: 'Tournaments', text: 'Fixed tournaments page display issues' },
            { label: 'Images', text: 'Resolved image loading and rendering bugs' },
        ]
    },
    {
        version: '1.1.1',
        title: 'Hotfixes',
        date: 'November 18, 2025',
        type: 'hotfix',
        latest: false,
        lts: false,
        summary: 'Fix update and new feature.',
        features: [
            { label: 'Role System', text: 'Added role system for user management' },
            { label: 'Site Improvements', text: 'Fixed various website bugs and UI issues' },
            { label: 'Dependency Management', text: 'Fixed dependency installation process' },
            { label: 'CloudStorage', text: 'Fixed customer settings saving functionality' },
            { label: 'Commands', text: 'Fixed command execution bugs' },
        ]
    },
    {
        version: '1.1.0',
        title: 'Major Update',
        date: 'November 16, 2025',
        type: 'release',
        latest: false,
        lts: false,
        summary: 'Major update with performance improvements and new features.',
        features: [
            { label: 'Matchmaking', text: 'Improved matchmaking system with better player pairing' },
            { label: 'Game Modes', text: 'Added support for custom game modes' },
            { label: 'Server Stability', text: 'Enhanced server stability and crash prevention' },
            { label: 'API Updates', text: 'Updated and optimized API endpoints' },
            { label: 'Website', text: 'Complete website redesign with modern UI' },
            { label: 'Storage System', text: 'Multi-system storage foundation implementation' },
            { label: 'Shop Rotation', text: 'Automatic shop rotation system' },
            { label: 'Performance', text: 'General performance improvements across the board' },
            { label: 'Backup System', text: 'Automated backup system for data protection' },
            { label: 'CloudStorage', text: 'Enhanced CloudStorage functionality' },
            { label: 'Configuration', text: 'Improved configuration management system' },
            { label: 'Documentation', text: 'Comprehensive documentation added' },
            { label: 'Commands', text: 'New command system implementation' },
            { label: 'Bug Fixes', text: 'Fixed Friend system, Party system, and XMPP bugs' },
        ]
    },
    {
        version: '1.0.1-9',
        title: 'Early Hotfixes',
        date: 'Aug 28, 2024 - Sep 12, 2025',
        type: 'hotfix',
        latest: false,
        lts: false,
        isRange: true,
        from: '1.0.1',
        to: '1.0.9',
        summary: 'Series of hotfixes addressing bugs found after initial release.',
        features: [
            { label: 'Fixed errors', text: 'Fixed most of the errors preventing the server from functioning correctly' },
        ]
    },
    {
        version: '1.0.0',
        title: 'Initial Release',
        date: 'August 24, 2024',
        type: 'release',
        latest: false,
        lts: false,
        isOrigin: true,
        summary: 'First official release of Neodyme. May contain bugs - fixes released in subsequent updates.',
        features: [
            { label: 'Season Support', text: 'Full support for Fortnite seasons 1-32' },
            { label: 'Configuration', text: 'Comprehensive configuration management system' },
            { label: 'Logging', text: 'Detailed logging and monitoring capabilities' },
            { label: 'Matchmaking', text: 'Foundation for matchmaking system' },
            { label: 'Error Handling', text: 'Robust error handling throughout the application' },
            { label: 'Multi-Account', text: 'Support for multiple user accounts' },
            { label: 'Web Dashboard', text: 'Simple and intuitive web-based dashboard' },
        ]
    },
    {
        version: 'Before 1.0.0',
        title: 'Internal Beta Builds',
        date: 'February 2023 - August 2024',
        type: 'archive',
        latest: false,
        lts: false,
        isPre: true,
        summary: 'The early days of Neodyme: private prototypes built while figuring out how the game talks to its backend. Unstable, undocumented and never publicly released.',
        features: []
    }
];

const TYPE_META = {
    feature:  { label: 'FEATURE',  cls: 'badge-feature' },
    hotfix:   { label: 'HOTFIXES', cls: 'badge-hotfix' },
    security: { label: 'SECURITY', cls: 'badge-security' },
    release:  { label: 'RELEASE',  cls: 'badge-release' },
    archive:  { label: 'ARCHIVE',  cls: 'badge-archive' },
};

const FILTERS = ['all', 'feature', 'hotfix', 'security', 'release'];

const KINDS = [
    { id: 'new',      label: 'New',      icon: 'fa-star' },
    { id: 'improved', label: 'Improved', icon: 'fa-arrow-up' },
    { id: 'security', label: 'Security', icon: 'fa-shield-halved' },
    { id: 'fixed',    label: 'Fixed',    icon: 'fa-wrench' }
];

const state = { filter: 'all', query: '' };

function versionId(v) {
    return 'v-' + v.version.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
}

function plain(html) {
    return String(html).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function excerpt(html, max = 170) {
    const text = plain(html);
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)) + '...';
}

function kindOf(feature) {
    if (feature.kind) return feature.kind;
    const text = (feature.label + ' ' + plain(feature.text)).toLowerCase();
    if (/\b(fix|fixes|fixed|bug|crash|regression|broken)\b/.test(feature.label.toLowerCase())) return 'fixed';
    if (/(security|two-factor|csrf|hardening|encrypt|permission|ban appeal)/.test(feature.label.toLowerCase())) return 'security';
    if (/\bfixed\b|\bno longer\b/.test(text) && !/\bnew\b/.test(text)) return 'fixed';
    return 'new';
}

function matches(v) {
    if (state.filter !== 'all' && v.type !== state.filter) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [v.version, v.title, v.summary, ...v.features.map(f => f.label + ' ' + f.text)].join(' ').toLowerCase();
    return hay.includes(q);
}

function badges(v) {
    const meta = TYPE_META[v.type] || TYPE_META.release;
    return `
        ${v.latest ? '<span class="vbadge vbadge-latest">LATEST</span>' : ''}
        ${v.lts ? '<span class="vbadge vbadge-lts">LTS</span>' : ''}
        <span class="vbadge ${meta.cls}">${meta.label}</span>`;
}

function renderToolbar() {
    const el = document.getElementById('version-toolbar');
    el.innerHTML = `
        <div class="vsearch">
            <i class="fas fa-search"></i>
            <input type="search" id="version-search" placeholder="Search updates..." autocomplete="off" aria-label="Search updates">
        </div>
        <div class="vfilters" role="group" aria-label="Filter by type">
            ${FILTERS.map(f => `<button type="button" class="vchip${f === state.filter ? ' vchip-active' : ''}" data-filter="${f}">${f === 'all' ? 'All' : TYPE_META[f].label}</button>`).join('')}
        </div>`;
    document.getElementById('version-search').addEventListener('input', e => {
        state.query = e.target.value;
        renderTimeline();
    });
    el.querySelector('.vfilters').addEventListener('click', e => {
        const b = e.target.closest('[data-filter]');
        if (!b) return;
        state.filter = b.dataset.filter;
        el.querySelectorAll('.vchip').forEach(c => c.classList.toggle('vchip-active', c === b));
        renderTimeline();
    });
}

function renderPre() {
    return `
        <div class="vd-pre">
            <div class="vd-pre-icon"><i class="fas fa-hourglass-start"></i></div>
            <h4>Beyond this point lies history.</h4>
            <p>Versions prior to 1.0.0 were internal beta builds: unstable, undocumented, and never publicly released. They were part of the journey, but not part of the story we tell here.</p>
        </div>`;
}

function renderChanges(v) {
    const groups = KINDS.map(kind => {
        const items = v.features.filter(f => kindOf(f) === kind.id);
        if (items.length === 0) return '';
        return `
            <section class="tl-group">
                <h4 class="tl-group-title tl-${kind.id}"><i class="fas ${kind.icon}"></i> ${kind.label} <span>${items.length}</span></h4>
                ${items.map(f => `
                    <div class="tl-change">
                        <div class="tl-change-label">${f.label}</div>
                        <p class="tl-change-text">${f.text}</p>
                    </div>`).join('')}
            </section>`;
    }).join('');
    return groups;
}

function renderCounts(v) {
    return KINDS
        .map(kind => [kind, v.features.filter(f => kindOf(f) === kind.id).length])
        .filter(([, n]) => n > 0)
        .map(([kind, n]) => `<span class="tl-count tl-${kind.id}"><i class="fas ${kind.icon}"></i> ${n} ${kind.label.toLowerCase()}</span>`)
        .join('');
}

function renderItem(v) {
    const count = v.features.length;
    const highlights = v.features.slice(0, 3);
    const hasMore = count > 3;
    const mod = v.isPre ? ' tl-is-pre' : v.isRange ? ' tl-is-range' : v.isOrigin ? ' tl-is-origin' : '';

    return `
        <article class="tl-item${mod}${v.latest ? ' tl-is-latest' : ''}" id="${versionId(v)}">
            <div class="tl-card">
                <header class="tl-head">
                    <h2 class="tl-ver">${v.isPre ? v.version : v.version}</h2>
                    <div class="tl-badges">${badges(v)}</div>
                    <span class="tl-date"><i class="fas fa-calendar-alt"></i> ${v.date}</span>
                    <button class="tl-copy" type="button" data-copy="${versionId(v)}" title="Copy link to this version"><i class="fas fa-link"></i></button>
                </header>
                <h3 class="tl-title">${v.title}</h3>
                <p class="tl-summary">${v.summary}</p>
                ${v.isPre ? renderPre() : ''}
                ${v.isRange ? '<p class="tl-note"><i class="fas fa-circle-info"></i> These patches were small and shipped in quick succession, so they are summarised as a single entry.</p>' : ''}
                ${v.isOrigin ? '<p class="tl-note"><i class="fas fa-seedling"></i> The very first public release of Neodyme.</p>' : ''}
                ${highlights.length ? `
                    <ul class="tl-highlights">
                        ${highlights.map(f => `
                            <li>
                                <span class="tl-hl-label">${f.label}</span>
                                <span class="tl-hl-text">${hasMore ? excerpt(f.text) : plain(f.text)}</span>
                            </li>`).join('')}
                    </ul>` : ''}
                ${count ? `
                    <div class="tl-foot">
                        <div class="tl-counts">${renderCounts(v)}</div>
                        ${hasMore ? `<button class="tl-toggle" type="button" data-toggle="${versionId(v)}" aria-expanded="false">Show all ${count} changes <i class="fas fa-chevron-down"></i></button>` : ''}
                    </div>` : ''}
                ${hasMore ? `<div class="tl-all" id="all-${versionId(v)}" hidden>${renderChanges(v)}</div>` : ''}
            </div>
        </article>`;
}

function renderTimeline() {
    const root = document.getElementById('timeline');
    const shown = VERSIONS.filter(matches);
    root.innerHTML = shown.length
        ? shown.map(renderItem).join('')
        : '<p class="vempty">No update matches your search.</p>';
}

function setOpen(id, open) {
    const body = document.getElementById('all-' + id);
    const button = document.querySelector(`[data-toggle="${id}"]`);
    if (!body || !button) return;
    body.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    const count = body.closest('.tl-item') ? VERSIONS.find(v => versionId(v) === id).features.length : 0;
    button.innerHTML = open
        ? 'Hide changes <i class="fas fa-chevron-up"></i>'
        : `Show all ${count} changes <i class="fas fa-chevron-down"></i>`;
}

document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
        setOpen(toggle.dataset.toggle, toggle.getAttribute('aria-expanded') !== 'true');
        return;
    }

    const copy = e.target.closest('[data-copy]');
    if (copy && navigator.clipboard) {
        const url = location.href.split('#')[0] + '#' + copy.dataset.copy;
        navigator.clipboard.writeText(url).then(() => {
            copy.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { copy.innerHTML = '<i class="fas fa-link"></i>'; }, 1500);
        }, () => {});
    }
});

function renderRoadmap() {
    const root = document.getElementById('roadmap-view');
    root.innerHTML = ROADMAP.map(track => `
        <section class="rm-track">
            <h2 class="rm-track-title">${track.track}</h2>
            <p class="rm-track-intro">${track.intro}</p>
            <div class="rm-grid">
                ${track.versions.map(v => `
                    <article class="rm-card">
                        <div class="rm-version">${v.version}</div>
                        <h3 class="rm-title">${v.title}</h3>
                        <ul class="rm-items">${v.items.map(item => `<li>${item}</li>`).join('')}</ul>
                    </article>`).join('')}
            </div>
        </section>`).join('') + '<p class="rm-note">Plans can change. Shipped versions are listed in the Changelog.</p>';
}

function showTab(name, { updateHash = true } = {}) {
    const roadmap = name === 'roadmap';
    document.getElementById('changelog-view').hidden = roadmap;
    document.getElementById('roadmap-view').hidden = !roadmap;
    document.querySelectorAll('.updates-tab').forEach(t => t.classList.toggle('updates-tab-active', t.dataset.tab === name));
    if (roadmap && !document.getElementById('roadmap-view').children.length) renderRoadmap();
    if (updateHash) history.replaceState(null, '', roadmap ? '#roadmap' : location.pathname);
}

document.querySelectorAll('.updates-tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

renderToolbar();
renderTimeline();

if (location.hash === '#roadmap') {
    showTab('roadmap', { updateHash: false });
} else if (location.hash.startsWith('#v-')) {
    const id = location.hash.slice(1);
    const target = document.getElementById(id);
    if (target) {
        setOpen(id, true);
        target.scrollIntoView({ block: 'start' });
        target.classList.add('tl-flash');
    }
}
