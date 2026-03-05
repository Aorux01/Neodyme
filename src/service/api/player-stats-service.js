const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const LoggerService = require('../logger/logger-service');

const STATS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'stats-history.json');
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

class PlayerStatsService {
    /** @type {Array<{t:number,a:number,c:number,s:number,sys?:number,sysTotal?:number}>} */
    static points  = [];
    static _loaded = false;


    static async load() {
        if (this._loaded) return;
        this._loaded = true;

        const dir = path.dirname(STATS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (!fs.existsSync(STATS_FILE)) {
            this.points = [];
            return;
        }
        try {
            const raw  = await fsPromises.readFile(STATS_FILE, 'utf8');
            const data = JSON.parse(raw);
            this.points = Array.isArray(data.points) ? data.points : [];
            this._prune();
        } catch (err) {
            LoggerService.log('warn', `PlayerStatsService: failed to load history - ${err.message}`);
            this.points = [];
        }
    }

    static async save() {
        try {
            const tmp = STATS_FILE + '.tmp';
            await fsPromises.writeFile(tmp, JSON.stringify({ points: this.points }), 'utf8');
            await fsPromises.rename(tmp, STATS_FILE);
        } catch (err) {
            LoggerService.log('error', `PlayerStatsService: failed to save history - ${err.message}`);
        }
    }

    static _prune() {
        const cutoff = Date.now() - MAX_AGE_MS;
        this.points = this.points.filter(p => p.t >= cutoff);
    }

    /**
     * Record a stat snapshot.
     * @param {number} activePlayers  accounts active in last 5 min
     * @param {number} totalAccounts
     * @param {number} activeSessions
     * @param {object} [sys]          optional { passing, total } from system check
     */
    static async record(activePlayers, totalAccounts, activeSessions, sys) {
        await this.load();
        const point = { t: Date.now(), a: activePlayers, c: totalAccounts, s: activeSessions };
        if (sys) { point.sys = sys.passing; point.sysTotal = sys.total; }
        this.points.push(point);
        this._prune();
        await this.save();
    }

    /**
     * @param {number} hours  0 = all data
     * @returns {Array}
     */
    static async getPlayerRange(hours) {
        await this.load();
        if (hours === 0) return this.points;
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.points.filter(p => p.t >= cutoff);
    }

    /**
     * Returns system health history for the chart.
     * @param {number} hours
     * @returns {Array<{t:number, pct:number}>}
     */
    static async getSystemHistory(hours) {
        await this.load();
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return this.points
            .filter(p => p.t >= cutoff && p.sysTotal != null)
            .map(p => ({ t: p.t, pct: Math.round((p.sys / p.sysTotal) * 100) }));
    }
}

module.exports = PlayerStatsService;
