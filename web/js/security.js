const SECURITY_EVENTS = {
    'security.2fa_enabled': 'Two-factor authentication turned on',
    'security.2fa_disabled': 'Two-factor authentication turned off',
    'security.2fa_forced_disable': 'Two-factor authentication turned off by an administrator',
    'security.backup_codes_regenerated': 'New backup codes generated',
    'security.backup_code_used': 'A backup code was used to sign in',
    'security.link_added': 'A Discord account was linked',
    'security.link_removed': 'A Discord account was unlinked',
    'security.force_reset': 'Your sessions were ended and a password reset was started'
};

const state = { backupCodes: [], confirmAction: null };

const el = (id) => document.getElementById(id);

function show(id, visible) {
    el(id).style.display = visible ? '' : 'none';
}

function showPanel(name) {
    ['panel-password', 'panel-scan', 'panel-codes', 'panel-confirm'].forEach(id => show(id, id === name));
}

function notify(message, type = 'error') {
    const alert = el('alert');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${escHtml(message)}`;
    alert.style.display = 'block';
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function api(path, body) {
    const options = body === undefined
        ? { credentials: 'include' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = body === undefined ? await fetch(`${API}${path}`, options) : await secureFetch(`${API}${path}`, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

async function refreshStatus() {
    const { ok, data } = await api('/security/status');
    if (!ok) return;

    const pill = el('tfa-status');
    pill.textContent = data.enabled ? 'On' : 'Off';
    pill.className = `status-pill ${data.enabled ? 'on' : 'off'}`;

    show('staff-notice', data.staffPolicy && !data.enabled);
    showPanel(null);

    const actions = el('tfa-actions');
    if (data.enabled) {
        el('tfa-summary').textContent = `Two-factor authentication is on. You have ${data.backupCodesRemaining} backup code${data.backupCodesRemaining === 1 ? '' : 's'} left.`;
        actions.innerHTML = `
            <button class="btn btn-secondary" id="act-codes"><i class="fas fa-key"></i> New backup codes</button>
            <button class="btn btn-danger" id="act-disable"><i class="fas fa-power-off"></i> Turn off</button>`;
        el('act-codes').onclick = () => askConfirmation('Generate new backup codes', 'backup-codes');
        el('act-disable').onclick = () => askConfirmation('Turn off two-factor authentication', 'disable');
    } else {
        actions.innerHTML = '<button class="btn btn-primary" id="act-setup"><i class="fas fa-shield-alt"></i> Set up</button>';
        el('act-setup').onclick = () => {
            el('setup-password').value = '';
            showPanel('panel-password');
            el('setup-password').focus();
        };
    }
}

function askConfirmation(title, action) {
    state.confirmAction = action;
    el('confirm-title').textContent = title;
    el('confirm-password').value = '';
    el('confirm-code').value = '';
    showPanel('panel-confirm');
    el('confirm-password').focus();
}

function showBackupCodes(codes) {
    state.backupCodes = codes;
    el('codes-grid').innerHTML = codes.map(code => `<code>${escHtml(code)}</code>`).join('');
    showPanel('panel-codes');
}

function renderQr(uri) {
    const qr = qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    el('qr-box').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

function bind() {
    el('form-setup').addEventListener('submit', async (event) => {
        event.preventDefault();
        const { ok, data } = await api('/security/2fa/setup', { password: el('setup-password').value });
        if (!ok) return notify(data.message || 'Could not start the setup.');

        el('setup-password').value = '';
        el('secret-key').textContent = data.secret.match(/.{1,4}/g).join(' ');
        renderQr(data.uri);
        el('enable-code').value = '';
        showPanel('panel-scan');
        el('enable-code').focus();
    });

    el('form-enable').addEventListener('submit', async (event) => {
        event.preventDefault();
        const { ok, data } = await api('/security/2fa/enable', { code: el('enable-code').value });
        if (!ok) return notify(data.message || 'That code is not correct.');

        notify(data.message, 'success');
        showBackupCodes(data.backupCodes);
    });

    el('form-confirm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const action = state.confirmAction;
        const { ok, data } = await api(`/security/2fa/${action}`, {
            password: el('confirm-password').value,
            code: el('confirm-code').value
        });
        if (!ok) return notify(data.message || 'Could not confirm.');

        notify(data.message, 'success');
        if (action === 'backup-codes') {
            showBackupCodes(data.backupCodes);
        } else {
            await refreshStatus();
            loadLog();
        }
    });

    el('confirm-cancel').onclick = () => showPanel(null);

    el('codes-copy').onclick = async () => {
        try {
            await navigator.clipboard.writeText(state.backupCodes.join('\n'));
            notify('Backup codes copied.', 'success');
        } catch {
            notify('Could not copy. Select the codes and copy them by hand.');
        }
    };

    el('codes-download').onclick = () => {
        const blob = new Blob([`Neodyme backup codes\n\n${state.backupCodes.join('\n')}\n`], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'neodyme-backup-codes.txt';
        link.click();
        URL.revokeObjectURL(link.href);
    };

    el('codes-done').onclick = async () => {
        state.backupCodes = [];
        el('codes-grid').innerHTML = '';
        await refreshStatus();
        loadLog();
    };
}

async function loadLog() {
    const { ok, data } = await api('/security/log');
    const container = el('security-log');
    if (!ok || !data.events.length) {
        container.innerHTML = '<div class="card-text">No security events yet.</div>';
        return;
    }

    container.innerHTML = data.events.map(event => `
        <div class="log-row">
            <span>${escHtml(SECURITY_EVENTS[event.action] || event.action)}${event.ip ? ` <span class="log-time">from ${escHtml(event.ip)}</span>` : ''}</span>
            <span class="log-time">${escHtml(new Date(event.timestamp).toLocaleString())}</span>
        </div>`).join('');
}

const OAUTH_ERRORS = {
    taken: 'That Discord account is already linked to another account.',
    already_linked: 'A Discord account is already linked. Unlink it first.',
    denied: 'The Discord authorization was cancelled.',
    state: 'The Discord link expired. Please try again.',
    unavailable: 'Discord is not set up on this server.',
    failed: 'Discord could not be linked. Please try again.'
};

async function loadLinks() {
    const { ok, data } = await api('/security/links');
    if (!ok || !data.providers.discord) return;

    show('links-card', true);
    const link = data.links.find(l => l.provider === 'discord');
    const action = el('discord-action');

    el('discord-status').textContent = link ? `Discord: linked as ${link.username}` : 'Discord: not linked';
    action.textContent = link ? 'Unlink' : 'Link Discord';
    action.className = link ? 'btn btn-danger' : 'btn btn-primary';

    action.onclick = link ? unlinkDiscord : async () => {
        const result = await api('/security/links/discord/start', {});
        if (!result.ok) return notify(result.data.message || 'Could not start the link.');
        window.location.href = result.data.url;
    };
}

async function unlinkDiscord() {
    const password = prompt('Enter your password to unlink Discord:');
    if (!password) return;

    const { data: status } = await api('/security/status');
    const code = status.enabled ? prompt('Enter a code from your authenticator app (or a backup code):') : '';
    if (status.enabled && !code) return;

    const { ok, data } = await api('/security/links/discord/unlink', { password, code });
    if (!ok) return notify(data.message || 'Could not unlink Discord.');

    notify(data.message, 'success');
    loadLinks();
    loadLog();
}

function showOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('oauth_error') && !params.has('linked')) return;

    if (params.get('linked')) notify('Discord linked. You can now sign in with it.', 'success');
    else notify(OAUTH_ERRORS[params.get('oauth_error')] || OAUTH_ERRORS.failed);
    history.replaceState(null, '', window.location.pathname);
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) {
        window.location.href = '/login?redirect=/security';
        return;
    }

    bind();
    await refreshStatus();
    loadLog();
    loadLinks();
    showOAuthReturn();
});
