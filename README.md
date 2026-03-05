<p align="center">
  <img src="public/images/neodyme-public-service/favicon.ico" alt="Neodyme Logo" width="150" height="150">
</p>

# Neodyme - Fortnite Backend

> ⚠️ **Note:** This backend is not affiliated with or endorsed by Epic Games, nor is it ready for production.

Neodyme is a fully-featured **Node.js** backend for Fortnite (s1-32), designed to provide a completely independent alternative to the official Epic Games servers. It supports most core systems of the game, from account management to matchmaking, social features, XMPP, shop, website and more.

### ⚠️ Still under development, may contain bugs ⚠️

**Latest version: 1.2.4**

**Latest API version: 1.6**

## [NEW]
Join the **Discord** Server: https://discord.gg/gWpDVKR4nF

## 🎉 Main Features

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

## 🚧 To-Do List

### 📌 Major Upcoming Features
- [ ] ☁️ Full **party system**
- [ ] 📂 Finish and expand the website (leaderboards, 2FA setup, player stats, etc.)
- [ ] ⚙️ Complete configuration implementation and management
- [ ] 🧰 Create a full **Admin Panel** (moderation tools, real-time view, tokens, moderation, stats server, etc.)
- [ ] 🧾 Add more commands (SAC, moderation, server control, etc.)
- [ ] 💾 Implement all remaining storage systems (**SQLite, MySQL, PostgreSQL**)
- [ ] 🔐 Finish **2FA setup**
- [ ] 📘 Complete the **public API**

### 📌 Secondary Features:
- [ ] 🎮 Add **Creative mode system**
- [ ] 🎯 Add **Game Modes manager** (available modes rotation, queues, etc.)
- [ ] 📡 Integrate **Vivox voice chat**
- [ ] 🏁 Implement **queue system** for matchmaking / waitingroom
- [ ] 🏆 Implement **leaderboard system**

👉 **[See more - Full Roadmap & Features](ROADMAP.md)**

## 🔌 Plugins

Neodyme supports a powerful plugin system. See the [available plugins](https://github.com/Aorux01/Neodyme-Plugins) or create your own!

## 📁 Installation

1. Download the latest version of the backend.
2. Run **`install_packages.bat`** to install all dependencies (only required once).
3. Launch the server using **`start.bat`**.

## 💻 Development

- Backend built with **Node.js**
- **WebSocket** & **XMPP** support via `ws`
- **Express** for the web interface
- **JWT-based authentication**
- Modular **Plugin system** for easy expansion

## 📜 Additional Information

Neodyme is **100% open-source** and aims to provide a **community Fortnite backend alternative**.
It is in no way affiliated with or endorsed by Epic Games.

---

## 🤝 Contributing

Contributions are **highly welcome**! Feel free to open issues or submit pull requests.

---

## 📢 Contact

- Discord: @aorux01
- Discord Server: https://discord.gg/gWpDVKR4nF

---

## 📌 License

MIT License
