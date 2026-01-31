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
- [ ] **In-game chat** - Private messages between players
- [x] **Presence system** - Online/offline/away status
- [x] **Real-time notifications** - Friend notifications, invites, etc.
- [ ] **Vivox integration** - In-game voice chat

### Friends System
- [x] **Friend request sending** - Via API and XMPP
- [x] **Accept/Decline** - Request management
- [x] **Friend removal** - Remove from list
- [x] **Player blocking** - Block system
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
- [ ] **Party invitations** - Full invitation system
- [ ] **Member kick** - Kick by captain
- [ ] **Leadership transfer** - Manual captain change
- [ ] **Party pings** - Ping notifications

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
- [ ] **Purchase history** - Transaction list
- [ ] **Gifting system** - Gifting between players
- [ ] **Dynamic bundles** - Promotional packs

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
- [ ] **ClientSettings** - Client settings

---

## Priority 4 - Low

### Admin Panel
- [x] **Admin dashboard** - Server overview
- [x] **Account management** - Users CRUD
- [x] **Moderation** - Ban, tickets
- [ ] **Tokens management** - Active tokens management
- [ ] **Server statistics** - Precise real-time stats
- [ ] **Logs viewer** - Logs visualization
- [ ] **Shop editor** - Integrated shop editor
- [ ] **Live configuration** - Modify without restart
- [ ] **Game modes** - Manage game servers and game modes
- [ ] **Events** - Manage in-game events
- [ ] **Announcements** - Broadcast system

### Console Commands
- [x] **Command system** - Base architecture
- [ ] **SAC commands** - Creator codes management
- [x] **Moderation commands** - Ban, unban
- [x] **Server commands** - Restart, status, reload, stop
- [ ] **Player commands** - Give items, V-Bucks, XP
- [x] **Shop commands** - Manual rotation, featured items
- [x] **Debug commands** - Logs, profiling

### Database
- [x] **JSON Database** - Local file storage
- [x] **MongoDB** - NoSQL database
- [ ] **SQLite** - Local SQL database
- [ ] **MySQL** - Network SQL database
- [ ] **PostgreSQL** - Advanced SQL database
- [ ] **Migration tools** - Database migration tools
- [x] **Automatic backup** - Scheduled backups

### Public API
- [x] **Base API** - Main endpoints
- [ ] **API documentation** - Swagger/OpenAPI
- [ ] **Advanced rate limiting** - Per-endpoint quotas
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
- [ ] **Report system** - Player reporting
- [ ] **Appeal system** - Ban appeals
- [ ] **Newsletter** - Automated emails
- [ ] **Push notifications** - Mobile notifications
- [ ] **Animation** - Animations and videos
- [ ] **EXP, V-BUCKS** - Game server connection

---

## Legend

- [x] = Implemented and functional
- [ ] = To do / In development

---

*Last updated: v1.2.0*
