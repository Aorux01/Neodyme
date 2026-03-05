const LABELS = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage' };
const ICONS = { operational: 'fa-check-circle', degraded: 'fa-exclamation-triangle', outage: 'fa-times-circle' };
const SERVICE_ICONS = {
    server: 'fa-server', auth: 'fa-key', accounts: 'fa-user-circle',
    friends: 'fa-user-friends', xmpp: 'fa-comments', matchmaking: 'fa-gamepad',
    shop: 'fa-store', database: 'fa-database'
};

async function fetchStatus() {
    document.getElementById('refresh-spin').classList.add('fa-spin');
    try {
        const res  = await fetch('/api/public/status');
        const data = await res.json();

        // Banner
        const banner  = document.getElementById('status-banner');
        const overall = data.overall || 'degraded';
        banner.className = `status-banner ${overall}`;

        const icon  = document.getElementById('banner-icon');
        icon.className = `fas ${ICONS[overall] || 'fa-question-circle'}`;

        const title = document.getElementById('banner-title');
        const { operational = 0, total = 0 } = data.summary || {};
        if (overall === 'operational') {
            title.textContent = 'All Systems Operational';
        } else {
            title.textContent = `${operational} / ${total} Systems Operational`;
        }

        const sub = document.getElementById('banner-sub');
        sub.textContent = overall === 'operational'
            ? 'All services are running normally.'
            : overall === 'degraded'
            ? 'Some services are experiencing issues.'
            : 'Major outage detected.';

        // Services
        const list     = document.getElementById('services-list');
        const services = data.services || {};
        list.innerHTML = Object.entries(services).map(([id, svc]) => {
            const s    = svc.status || 'outage';
            const faIcon = SERVICE_ICONS[id] || 'fa-circle';
            return `<div class="service-row">
                <div class="service-dot ${s}"></div>
                <div class="service-name"><i class="fas ${faIcon}" style="color:#555;margin-right:8px;font-size:13px;"></i>${svc.label || id}</div>
                <div class="service-status ${s}">${LABELS[s] || s}</div>
            </div>`;
        }).join('') || '<div class="service-row" style="color:#666;">No service data available.</div>';

        // Checked at
        if (data.checkedAt) {
            document.getElementById('checked-at').textContent =
                `Last checked: ${new Date(data.checkedAt).toLocaleString()}`;
        }
    } catch (_) {
        document.getElementById('banner-title').textContent = 'Unable to reach server';
        document.getElementById('status-banner').className  = 'status-banner outage';
        document.getElementById('banner-icon').className    = 'fas fa-times-circle';
    }
    document.getElementById('refresh-spin').classList.remove('fa-spin');
}

fetchStatus();
setInterval(fetchStatus, 60_000);