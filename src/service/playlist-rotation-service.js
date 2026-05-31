const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const LoggerService = require('./logger/logger-service');

class PlaylistRotationService {
    static jobs = new Map();
    static initialized = false;

    static loadPlaylists() {
        const filePath = path.join(process.cwd(), 'config', 'playlists.json');
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            LoggerService.log('error', `PlaylistRotationService: failed to read playlists.json: ${err.message}`);
            return null;
        }
    }

    static savePlaylists(data) {
        const filePath = path.join(process.cwd(), 'config', 'playlists.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    static setEnabled(playlistName, enabled) {
        const data = this.loadPlaylists();
        if (!data) return false;
        const entry = data.playlists.find(p => p.name === playlistName);
        if (!entry) return false;
        entry.enabled = enabled;
        this.savePlaylists(data);
        LoggerService.log('info', `[PlaylistRotation] ${playlistName} set to enabled=${enabled}`);
        return true;
    }

    static buildCronExpression(rotation) {
        if (rotation.type === 'interval') {
            const h = parseInt(rotation.intervalHours, 10) || 6;
            return `0 */${h} * * *`;
        }
        if (rotation.type === 'scheduled') {
            const [hh, mm] = (rotation.scheduledTime || '00:00').split(':');
            return `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`;
        }
        return null;
    }

    static schedulePlaylist(playlist) {
        const { name, rotation } = playlist;
        if (!rotation || !rotation.enabled) return;

        const expr = this.buildCronExpression(rotation);
        if (!expr || !cron.validate(expr)) {
            LoggerService.log('warn', `[PlaylistRotation] Invalid cron for ${name}: ${expr}`);
            return;
        }

        if (this.jobs.has(name)) {
            this.jobs.get(name).stop();
            this.jobs.delete(name);
        }

        const job = cron.schedule(expr, () => {
            const data = this.loadPlaylists();
            if (!data) return;
            const entry = data.playlists.find(p => p.name === name);
            if (!entry) return;

            if (rotation.type === 'interval') {
                entry.enabled = !entry.enabled;
                this.savePlaylists(data);
                LoggerService.log('info', `[PlaylistRotation] ${name} toggled to enabled=${entry.enabled} (interval)`);
            } else if (rotation.type === 'scheduled') {
                entry.enabled = true;
                this.savePlaylists(data);
                LoggerService.log('info', `[PlaylistRotation] ${name} activated (scheduled)`);

                if (rotation.activeDurationHours && rotation.activeDurationHours > 0) {
                    const deactivateMs = rotation.activeDurationHours * 60 * 60 * 1000;
                    setTimeout(() => {
                        this.setEnabled(name, false);
                    }, deactivateMs);
                }
            }
        });

        this.jobs.set(name, job);
        LoggerService.log('info', `[PlaylistRotation] Scheduled ${name} with cron: ${expr}`);
    }

    static init() {
        this.stopAll();
        const data = this.loadPlaylists();
        if (!data || !Array.isArray(data.playlists)) return;

        for (const playlist of data.playlists) {
            this.schedulePlaylist(playlist);
        }

        this.initialized = true;
        LoggerService.log('info', `[PlaylistRotation] Initialized with ${this.jobs.size} active rotation(s)`);
    }

    static reload() {
        LoggerService.log('info', '[PlaylistRotation] Reloading rotations...');
        this.init();
    }

    static stopAll() {
        for (const [name, job] of this.jobs) {
            job.stop();
        }
        this.jobs.clear();
    }

    static getActiveJobs() {
        const data = this.loadPlaylists();
        if (!data) return [];
        return data.playlists.map(p => ({
            name: p.name,
            rotation: p.rotation || null,
            active: this.jobs.has(p.name)
        }));
    }
}

module.exports = PlaylistRotationService;
