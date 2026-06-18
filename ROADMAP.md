# Neodyme - Roadmap & Features

> Complete list of implemented and planned features, sorted by priority.

---

## Priority 1 - Critical

### Authentication & Accounts
- [x] **Secure login system** - Full OAuth2 with JWT tokens
- [x] **Multi-account** - Multiple accounts support
- [x] **Token management** - Access tokens, refresh tokens, exchange codes
- [x] **Authentication service** - Auth middleware for all protected routes
- [ ] **2FA (Two-Factor Authentication)** - 2FA setup and verification on website

### MCP (Profile Service)
- [x] **QueryProfile** - Profile retrieval (athena, common_core, campaign, etc.)
- [x] **EquipBattleRoyaleCustomization** - Cosmetics equipment
- [x] **SetCosmeticLockerSlot** - Loadout configuration
- [x] **SetCosmeticLockerBanner** - Locker banners
- [x] **SetBattleRoyaleBanner** - Battle Royale banners
- [x] **MarkItemSeen** - Mark items as seen
- [x] **SetItemFavoriteStatus** - Item favorites
- [x] **SetItemFavoriteStatusBatch** - Batch favorites
- [x] **SetItemArchivedStatusBatch** - Batch archiving
- [x] **RefundMtxPurchase** - Purchase refunds
- [x] **RemoveGiftBox** - Gift box removal
- [x] **PurchaseCatalogEntry** - Shop purchases
- [x] **SetAffiliateName** - Creator code (SAC)
- [x] **ClientQuestLogin** - Quest login
- [x] **FortRerollDailyQuest** - Daily quest reroll
- [x] **UpdateQuestClientObjectives** - Quest objectives update
- [x] **MarkNewQuestNotificationSent** - New quest notifications
- [x] **AthenaPinQuest** - Quest pinning
- [x] **SetPartyAssistQuest** - Party assist quest
- [x] **ActiveLoadout** - Active loadout
- [x] **PutModularCosmeticLoadout** - Modular loadouts
- [x] **SetActiveArchetype** - Active archetype
- [x] **SetSeasonPassAutoClaim** - Battle Pass auto-claim
- [x] **CompanionName** - Companion name (Pet)
- [x] **LockInImmutableItem** - Immutable items
- [x] **UnlockRewardNode** - Reward unlocking
- [x] **DedicatedServer** - Dedicated server operations
- [x] **CopyCosmeticLoadout** - Cosmetic loadout preset copy/apply
- [x] **DeleteCosmeticLoadout** - Cosmetic loadout preset deletion
- [x] **RequestRestedStateIncrease** - Rested XP accumulation

### Save the World MCP
- [x] **AssignHeroToLoadout** - Hero assignment
- [x] **AssignGadgetToLoadout** - Gadget assignment
- [x] **AssignTeamPerkToLoadout** - Team perk assignment
- [x] **AssignWorkerToSquad** - Survivor assignment
- [x] **AssignWorkerToSquadBatch** - Batch assignment
- [x] **UnassignAllSquads** - Squad unassignment
- [x] **SetActiveHeroLoadout** - Active hero loadout
- [x] **ClearHeroLoadout** - Loadout reset
- [x] **SetHeroCosmeticVariants** - Cosmetic variants
- [x] **SetHomebaseName** - Homebase name
- [x] **SetHomebaseBanner** - Homebase banner
- [x] **SetPinnedQuests** - Pinned quests
- [x] **UpgradeItem** - Item upgrade
- [x] **UpgradeItemBulk** - Bulk upgrade
- [x] **UpgradeItemRarity** - Rarity upgrade
- [x] **UpgradeAlteration** - Alteration upgrade
- [x] **UpgradeSlottedItem** - Slotted item upgrade
- [x] **PromoteItem** - Item promotion
- [x] **ConvertItem** - Item conversion
- [x] **ConvertSlottedItem** - Slotted item conversion
- [x] **TransmogItem** - Transmog
- [x] **RefundItem** - Refund
- [x] **RecycleItemBatch** - Batch recycling
- [x] **RespecUpgrades** - Upgrade reset
- [x] **RespecAlteration** - Alteration reset
- [x] **RespecResearch** - Research reset
- [x] **StorageTransfer** - Storage transfer
- [x] **ModifyQuickbar** - Quickbar modification
- [x] **PurchaseHomebaseNode** - Node purchase
- [x] **PurchaseOrUpgradeHomebaseNode** - Node purchase/upgrade
- [x] **PurchaseResearchStatUpgrade** - Research stat upgrade
- [x] **SlotItemInCollectionBook** - Collection book slot
- [x] **UnslotItemFromCollectionBook** - Collection book unslot
- [x] **ResearchItemFromCollectionBook** - Collection book research
- [x] **ClaimCollectionBookRewards** - Collection book rewards
- [x] **ActivateConsumable** - Consumable activation
- [x] **CraftWorldItem** - Item crafting
- [x] **DestroyWorldItems** - Item destruction
- [x] **DisassembleWorldItems** - Item disassembly
- [x] **IncrementNamedCounterStat** - Stat counters
- [x] **OpenCardPack** - Card pack opening
- [x] **PopulatePrerolledOffers** - Prerolled offers
- [x] **ClaimLoginReward** - Login rewards
- [x] **ClaimQuestReward** - Quest rewards
- [x] **StartExpedition** - Expedition start
- [x] **CollectExpedition** - Expedition collection
- [x] **AbandonExpedition** - Expedition abandon
- [x] **RefreshExpeditions** - Expedition refresh

---

## Priority 2 - High

### XMPP & Communication
- [x] **XMPP Server** - WebSocket XMPP server
- [x] **In-game chat** - Private messages and groupchat (MUC) between players
- [x] **Presence system** - Online/offline/away status, friend-filtered broadcasts
- [x] **Real-time notifications** - Friend notifications, invites, party events
- [x] **Vivox voice chat** - JWT token generation (HMAC-SHA256) for party voice channels

### Friends System
- [x] **Friend request sending** - Via API and XMPP
- [x] **Accept/Decline** - Request management
- [x] **Friend removal** - Remove from list
- [x] **Player blocking** - Block and unblock via API
- [x] **XMPP notifications** - Real-time alerts for friend actions
- [x] **Presence updates** - Status sync between friends

### Party System
- [x] **Party creation** - Private party creation
- [x] **Join party** - Join via ID
- [x] **Leave party** - Leave party
- [x] **Metadata updates** - Member and party meta
- [x] **Party configuration** - Joinability, max size, etc.
- [x] **Party deletion** - Party dissolution
- [x] **Auto promotion** - New captain if old one leaves
- [x] **Party invitations** - Full invite/decline/cancel flow with XMPP
- [x] **Leadership transfer** - Manual captain promotion with XMPP broadcast
- [x] **Party pings** - Ping notifications with XMPP
- [x] **Join intentions** - Join-request flow with friend cross-check
- [ ] **Member kick** - Kick by captain

### Matchmaking
- [x] **Ticket creation** - Signed matchmaking tickets
- [x] **Server assignment** - Game server connection
- [x] **Matchmaking sessions** - Session management
- [x] **Matchmaking stats** - Real-time stats
- [ ] **Queue system** - Waiting room queue
- [ ] **Skill-based matchmaking** - Level-based matchmaking

---

## Priority 3 - Medium

### Shop & Economy
- [x] **Dynamic storefront** - Shop with item rotation
- [x] **Cosmetics purchase** - Via V-Bucks
- [x] **V-Bucks management** - Add, remove, balance
- [x] **Experience service (XP)** - XP gain and management
- [x] **Creator codes (SAC)** - Support-A-Creator
- [x] **Shop configuration** - `config/shop.json`
- [x] **Gift eligibility** - Validates offer, friendship, and ownership before gifting
- [x] **Historical shop rotation** - Date-based cosmetic rotation via fortnite-api.com
- [x] **Shop image generation** - Server-side SVG with rarity gradients, zero native deps
- [ ] **Purchase history** - Transaction list
- [ ] **Gifting system** - Full gift sending between players
- [ ] **Dynamic bundles** - Promotional packs
- [ ] **SAC command management** - Add/list/delete creator codes from console

### Website
- [x] **Homepage** - Landing page
- [x] **Login/Register** - Web authentication
- [x] **Dashboard** - User panel
- [x] **Web shop** - Shop display
- [x] **Purchase page** - Purchase flow
- [x] **Updates page** - Patch notes
- [ ] **Leaderboards** - Player rankings
- [ ] **Player profile** - Profile page with stats
- [ ] **2FA configuration** - Setup from website
- [ ] **Match history** - Match history
- [ ] **Friends management** - Web interface for friends

### CloudStorage
- [x] **System storage** - Server files (hotfixes, etc.)
- [x] **User storage** - Per-account files
- [x] **Upload/Download** - File management
- [x] **ClientSettings** - Client settings persisted (JSON filesystem + MongoDB binary)

### Asset Pipeline
- [x] **Online / Local modes** - Serve `/images/*` via CDN redirect (online) or local files (local)
- [x] **First-launch prompt** - Ask online/local on initial boot, persisted to `server.properties`
- [x] **`content/assets-index.json`** - Path-to-CDN mapping, hot-reloaded on change
- [x] **Asset middleware** - Resolves static / redirect / 404 before `express.static`, with path-traversal protection
- [x] **`/assets` commands** - status, mode, list, info, diagnose, install, uninstall, clean, verify, reload, refresh
- [x] **Auto-download on mode switch** - Downloads missing assets from the Plugins repo when switching to local
- [x] **Integrity validation** - Post-download size check + `/assets verify` (missing, zero-byte, mismatch, orphans)

### Internationalization
- [x] **13-language support** - ar, en, de, es, es-419, fr, it, ja, ko, pl, pt-BR, ru, tr
- [x] **Per-client language** - Resolved from each request's `Accept-Language` header
- [x] **Full content coverage** - 100% across all localized `content/` files (motd, content-pages, catalog, season-passes, world-stw, discovery, radio-stations)

---

## Priority 4 - Low

### Admin Panel (BETA)
- [x] **Admin dashboard** - Server overview
- [x] **Account management** - Users CRUD
- [x] **Moderation** - Ban, unban, tickets, player reports
- [x] **Tokens management** - Active tokens view and revocation
- [x] **Server statistics** - Real-time CPU, RAM, active players (live monitor)
- [x] **Logs viewer** - Console logs in Dev panel
- [x] **Plugin manager** - Browse, install, update, configure plugins
- [x] **Shop controls** - Manual rotation, date-based rotation, featured items
- [x] **Security settings** - Rate limiting, CORS, Helmet, Trust Proxy toggles
- [x] **XMPP monitor** - Real-time connected clients widget
- [x] **Content Editor** - Typed editors for 17 in-game content sections (MOTD, login message, emergency notices v1/v2, BR/Creative/STW news, lobby, special offer video, subgame select/info, BP about, creative ads/features, athena/survival messages) with i18n toggle per field, 13-locale switcher, list reorder/duplicate/delete, and Reset-from-GitHub
- [x] **Assets Manager** - Upload (drag-and-drop, magic-byte validation, 5MB max), Browse local (grid by folder, copy URL, delete uploads), Browse online (CDN-only entries from assets-index.json). Uploads land in `public/images/uploaded-images/` with full metadata in `assets-index.json` and `alwaysLocal` enforcement
- [x] **Shop Editor (BETA)** - Hand-pick each slot of `data/shop.json` via a slot grid backed by `config/shop.json`. Searchable cosmetic picker from fortnite-api.com (rarity-coloured), single-slot random reroll, bulk "Randomize all empty", inline price/grant edit, slot clear
- [ ] **Shop Editor (full)** - Drag-and-drop between slots, full preview with rendering by chapter, prices/rarity/sections matrix
- [ ] **Game Modes Manager UI** - Frontend on top of `config/playlists.json` (enable, rotation, minBuild)
- [ ] **Lobby Background Manager** - Pick lobby tile/banner per season via `content/pages/lobby-backgrounds.json` (replaces the per-season switch in `page-service.js`)
- [ ] **Radio Stations Editor** - Manage `content/pages/radio-stations.json` with Assets integration for logos
- [ ] **Tournament Information Editor** - Full editor for `content-pages.json[tournamentinformation]` (colours, images, prizes, brackets)
- [ ] **Live configuration** - Modify server.properties without restart
- [ ] **Events** - Manage in-game events
- [ ] **Announcements** - Broadcast system

### Console Commands
- [x] **Command system** - Base architecture with role-based access
- [ ] **SAC commands** - Creator code add/list/delete management
- [x] **Moderation commands** - Ban, unban, lookup
- [x] **Server commands** - Restart, status, reload, stop, diagnostic
- [x] **Data commands** - Migrate JSON↔MongoDB with --dry-run
- [x] **Test commands** - Full system test suite
- [ ] **Player commands** - Give items, V-Bucks, XP
- [x] **Shop commands** - Manual rotation, featured items, date-based rotation
- [x] **Debug commands** - Logs, profiling, token management

### Database
- [x] **JSON Database** - Local file storage
- [x] **MongoDB** - NoSQL database
- [ ] **SQLite** - Local SQL database
- [ ] **MySQL** - Network SQL database
- [ ] **PostgreSQL** - Advanced SQL database
- [x] **Migration tools** - `/data migrate` JSON↔MongoDB with --dry-run
- [x] **Automatic backup** - Scheduled backups

### Public API
- [x] **Base API** - Main endpoints
- [ ] **API documentation** - Swagger/OpenAPI
- [ ] **Advanced rate limiting** - Per-endpoint quotas
- [x] **Condensed rate-limit logs** - Aggregate repeated hits into one line per IP+route (configurable)
- [ ] **API Keys** - External authentication
- [ ] **Webhooks** - Outgoing notifications
- [x] **API versioning** - Version management

---

## Priority 5 - Future

### Game Modes
- [ ] **Creative mode** - Creative mode support
- [ ] **Game modes manager** - Mode rotation
- [ ] **LTMs** - Limited Time Modes
- [ ] **Custom playlists** - Custom playlists
- [ ] **Player** - Player saves (favorites, history)

### Tournaments & Events
- [ ] **Events system** - Basic events and tournaments
- [ ] **Timeline** - Event configuration
- [ ] **Brackets** - Tournament system
- [ ] **Automatic rewards** - Prize distribution
- [ ] **Tournament leaderboards** - Specific rankings

### Leaderboards
- [ ] **Global leaderboard** - All players
- [ ] **Regional leaderboard** - By geographic zone
- [ ] **Mode leaderboard** - Solo, Duo, Squad
- [ ] **Historical stats** - Progress over time
- [ ] **Achievements** - Achievement system

### Advanced Features
- [ ] **Replay system** - Match recording
- [x] **Report system** - In-game toxicity reports with mod panel integration
- [ ] **Appeal system** - Ban appeals
- [ ] **Newsletter** - Automated emails
- [ ] **Push notifications** - Mobile notifications
- [ ] **Animation** - Animations and videos
- [ ] **EXP, V-BUCKS** - Game server connection
- [ ] **Ward Service** - Anti cheat (planned for 1.3.0)

---

## Legend

- [x] = Implemented and functional
- [ ] = To do / In development

---

*Last updated: v1.2.7*
