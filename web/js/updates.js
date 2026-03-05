const VERSIONS = [
    {
        version: '1.2.4',
        title: 'Commands & Admin Panel',
        date: 'March 05, 2026',
        type: 'feature',
        latest: true,
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
            { label: 'V-Bucks Purchase Redesign', text: 'Multi-step flow with animated step indicator (Package → Payment → Review → Done); package cards now correctly display base amount + bonus breakdown before purchase' },
            { label: 'Creator Code - Purchase', text: 'Creator code input added to the V-Bucks purchase flow (step 2); code is validated live against the server; commission is credited to the creator on successful purchase; pre-filled from <code>?creator=</code> URL param or localStorage' },
            { label: 'Creator Code - Shop', text: '"Support a Creator" card added to the shop sidebar; code persists in localStorage and is automatically applied when visiting the V-Bucks purchase page' },
            { label: 'Creator Code - Validate API', text: 'New public endpoint <code>GET /api/creator-code/validate/:code</code> to check if a creator code is active without authentication' },
            { label: 'Shop UI', text: 'Rarity-coloured card accents and image backgrounds, item price display, owned badge, pill-shape filter buttons, and improved section styling' },
            { label: 'CSRF Fix', text: 'Fixed a token field mismatch (<code>data.token</code> → <code>data.csrfToken</code>) that caused all mutating operations (role change, plugin reload, file save) to return 403' },
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
            { label: 'EOS Connect', text: 'The server can now handle the EOS connection correctly' },
            { label: 'Server Architecture', text: 'The server architecture was reviewed and cleaned up' },
            { label: 'Admin Panel', text: 'The server now has an administrator panel' },
        ]
    },
    {
        version: '1.1.6',
        title: 'Security Hardening',
        date: 'January 15, 2026',
        type: 'security',
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
        version: '1.0.1 – 1.0.9',
        title: 'Early Hotfixes',
        date: 'Aug 28, 2024 – Sep 12, 2025',
        type: 'hotfix',
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
];

const TYPE_META = {
    feature:  { label: 'FEATURE',  cls: 'badge-feature'  },
    hotfix:   { label: 'HOTFIXES', cls: 'badge-hotfix'   },
    security: { label: 'SECURITY', cls: 'badge-security' },
    release:  { label: 'RELEASE',  cls: 'badge-release'  },
};

function renderList(activeIdx) {
    const list = document.getElementById('version-list');
    list.innerHTML = VERSIONS.map((v, i) => {
        const meta = TYPE_META[v.type] || TYPE_META.release;
        return `
            <button class="vbtn${i === activeIdx ? ' vbtn-active' : ''}" onclick="selectVersion(${i})" data-type="${v.type}">
                <span class="vbtn-ver">${v.version}</span>
                <span class="vbtn-badges">
                    ${v.latest ? '<span class="vbadge vbadge-latest">LATEST</span>' : ''}
                    <span class="vbadge ${meta.cls}">${meta.label}</span>
                </span>
                <span class="vbtn-date">${v.date}</span>
            </button>
        `;
    }).join('');
}

function renderDetail(v) {
    const meta = TYPE_META[v.type] || TYPE_META.release;
    const detail = document.getElementById('version-detail');
    detail.innerHTML = `
        <div class="vd-header" data-type="${v.type}">
            <div class="vd-header-top">
                <div>
                    <h2 class="vd-version">Version ${v.version}</h2>
                    <h3 class="vd-title">${v.title}</h3>
                </div>
                <div class="vd-badges">
                    ${v.latest ? '<span class="vbadge vbadge-latest">LATEST</span>' : ''}
                    <span class="vbadge ${meta.cls}">${meta.label}</span>
                </div>
            </div>
            <p class="vd-date"><i class="fas fa-calendar-alt"></i> ${v.date}</p>
            <p class="vd-summary">${v.summary}</p>
        </div>
        <ul class="vd-features">
            ${v.features.map(f => `
                <li class="vd-feature-item">
                    <span class="vd-feature-label">${f.label}</span>
                    <span class="vd-feature-text">${f.text}</span>
                </li>
            `).join('')}
        </ul>
        ${v.isOrigin ? `
        <div style="margin-top:32px;padding:20px 24px;background:rgba(255,255,255,0.03);border:1px solid #2a2a2a;border-radius:10px;text-align:center;">
            <p style="font-size:13px;color:#666;margin:0 0 6px;">
                <i class="fas fa-history" style="margin-right:6px;"></i>Beyond this point lies history.
            </p>
            <p style="font-size:12px;color:#444;margin:0;">
                Versions prior to 1.0.0 were internal beta builds: unstable, undocumented, and never publicly released.
                They were part of the journey, but not part of the changelog.
            </p>
        </div>` : ''}
    `;
}

function selectVersion(idx) {
    renderList(idx);
    renderDetail(VERSIONS[idx]);
}

// Init - select latest (index 0)
selectVersion(0);