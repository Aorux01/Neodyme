const ROADMAP = [
    {
        track: 'Platform',
        intro: 'Everything around the game: accounts, website, staff tools, content, storage and integrations.',
        versions: [
            { version: '1.3.0', title: 'Account Complete', items: ['Self-service unlock', 'Support center upgrades', 'Creator code page', 'Notifications center', 'Block list on the website'] },
            { version: '1.3.1', title: 'Panel Rebuild', items: ['Panels grouped by category', 'Audit log v2', 'Ticket and report workflows', 'Staff dashboard'] },
            { version: '1.3.2', title: 'Content Studio', items: ['Content history', 'Validation and preview', 'Media assets: videos, audio, manifests, fonts', 'Missing translations report'] },
            { version: '1.3.3', title: 'Game Bridge & Tracker', items: ['Game server registry', 'Bridge simulator', 'Admin player inspector', 'Tracker widgets'] },
            { version: '1.3.4', title: 'Storage & Reliability', items: ['Adapter conformance suite', 'Backups per adapter', 'Versioned migrations', 'Crash recovery'] },
            { version: '1.3.5', title: 'Public API & Integrations', items: ['Public read API', 'Discord webhook templates', 'Plugin generator', 'Request tracing'] },
            { version: '1.3.6', title: 'Translations & Onboarding', items: ['Right-to-left layout', 'Translated emails', 'First-launch setup wizard', 'In-panel help'] },
            { version: '1.3.7', title: 'Economy & Shop', items: ['Shop scheduling', 'Redeem codes', 'Refund workflow', 'Economy ledger'] },
            { version: '1.4.0', title: 'Platform Release Candidate', items: ['Security review', 'Load tests', 'Plugin API freeze', 'Upgrade guides'] }
        ]
    },
    {
        track: 'Game',
        intro: 'Routes and data the Fortnite client expects, built and tested against simulated clients.',
        versions: [
            { version: '1.4.1', title: 'Matchmaking & Party', items: ['Regions and buckets', 'Party-aware matchmaking', 'Backfill', 'Recent players'] },
            { version: '1.4.2', title: 'Social Parity & Launcher', items: ['Friends and presence parity', 'XMPP robustness', 'Launcher update channels'] },
            { version: '1.4.3', title: 'Stats, Arena & Ranked', items: ['Stats parity', 'Season administration', 'Anti-abuse on stats'] },
            { version: '1.4.4', title: 'Tournaments & Events', items: ['Registration', 'Live standings pages', 'Event templates'] },
            { version: '1.4.5', title: 'Game Modes & Creative', items: ['Playlist rotation calendar', 'Island publishing workflow', 'Game mode templates'] },
            { version: '1.4.6', title: 'Progression & MCP Parity', items: ['Quests parity', 'MCP gaps closed', 'Challenge generator'] },
            { version: '1.4.7', title: 'Ward AntiCheat', items: ['Shadow mode', 'Ban integration', 'Ward panel'] },
            { version: '1.4.8', title: 'Replay & Notifications', items: ['Replay storage', 'Replay viewer', 'Notification preferences'] },
            { version: '1.4.9', title: 'New Fortnite Endpoints', items: ['Endpoint matrix by season', 'Client-version-aware responses', 'Graceful fallbacks'] },
            { version: '1.5.0', title: 'Neodyme Complete', items: ['Full security review', 'Complete documentation', 'Compatibility matrix', 'Plugin API v2'] }
        ]
    }
];
