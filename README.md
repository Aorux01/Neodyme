<p align="center">
  <img src="public/images/neodyme-public-service/favicon.ico" alt="Neodyme Logo" width="150" height="150">
</p>

<h1 align="center">Neodyme - Fortnite Backend</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.8-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/API-1.8-blueviolet.svg" alt="API Version">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/database-JSON%20%7C%20MongoDB-47A248?logo=mongodb&logoColor=white" alt="Database">
  <img src="https://img.shields.io/badge/Fortnite-S1--32-9146FF.svg" alt="Fortnite Seasons">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  <a href="https://discord.gg/gWpDVKR4nF"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

> **Note:** This backend is not affiliated with or endorsed by Epic Games, nor is it ready for production.

Neodyme is a fully-featured **Node.js** backend for Fortnite (s1-32), designed to provide a completely independent alternative to the official Epic Games servers. It supports most core systems of the game, from account management to matchmaking, social features, XMPP, shop, website and more.

### ⚠️ Still under development, may contain bugs ⚠️

**Latest version: 1.2.8**

**Latest API version: 1.8**

Join the **Discord** Server: https://discord.gg/gWpDVKR4nF

## Main Features

- ✅ **Secure login and authentication system**
- ✅ **Multi-account support**
- ✅ **Web interface**
- ✅ **Fully implemented MCP (profile service)**
- ✅ **Complete friends system:** friend requests, acceptance, removal
- ✅ **Token system and full XMPP support** (chat, presence, private parties)
- ✅ **Working matchmaking system**
- ✅ **Complete store/economy backend** (V-Bucks, cosmetics)
- ✅ **Cloudstorage system**
- ✅ **Customizable configuration** via `server.properties` and the `config/` directory
- ✅ **Automatic dependency installation**
- ✅ **Customizable events and tournament system**
- ✅ **Self-hosted backend with no proprietary dependencies**
- ✅ **Detailed logs and monitoring**
- ✅ **Custom command system** (Console Server, see the documentation)
- ✅ **Plugin system** to easily extend and customize the backend
- ✅ **Economics endpoints** (EXP, V-Bucks)
- ✅ **Database system** (JSON, MongoDB)

## To-Do List

### 📌 Major Upcoming Features
- [ ] 📂 Finish and expand the website (leaderboards, 2FA setup, player stats, etc.)
- 🔄 🧰 **Admin Panel** - core features done (BETA), ongoing: shop editor, live config, events manager
- [ ] 💾 Implement all remaining storage systems (**SQLite, MySQL, PostgreSQL**)
- [ ] 🔐 Finish **2FA setup**
- [ ] 📘 Complete the **public API**
- [ ] 🛡️ Implement **Ward** (AntiCheat)

### 📌 Secondary Features:
- [ ] 🎮 Add **Creative mode system**
- [ ] 🎯 Add **Game Modes manager** (available modes rotation, queues, etc.)
- [ ] 🏁 Implement **queue system** for matchmaking / waitingroom
- [ ] 🏆 Implement **leaderboard system**
- [ ] 👢 **Member kick** from party (captain only)

**[See more - Full Roadmap & Features](ROADMAP.md)**

## Plugins

Neodyme supports a powerful plugin system. See the [available plugins](https://github.com/Aorux01/Neodyme-Plugins) or create your own!

## Installation

1. Download the latest version of the backend.
2. Run **`install_packages.bat`** to install all dependencies (only required once).
3. Launch the server using **`start.bat`**.

## Development

- Backend built with **Node.js**
- **WebSocket** & **XMPP** support via `ws`
- **Express** for the web interface
- **JWT-based authentication**
- Modular **Plugin system** for easy expansion

## Additional Information

Neodyme is **100% open-source** and aims to provide a **community Fortnite backend alternative**.
It is in no way affiliated with or endorsed by Epic Games.

---

## Contributing

Contributions are **highly welcome**! Feel free to open issues or submit pull requests.

---

## Contact

- Discord: @aorux01
- Discord Server: https://discord.gg/gWpDVKR4nF

---

## License

MIT License
