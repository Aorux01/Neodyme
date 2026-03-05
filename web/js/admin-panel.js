let monitorInterval = null;
let monitorRunning  = false;

const MAX_POINTS = 20;
const monitorData = {
    cpu_sys:  Array(MAX_POINTS).fill(0),  // system-wide CPU %
    cpu_proc: Array(MAX_POINTS).fill(0),  // node.js process CPU %
    ram_proc: Array(MAX_POINTS).fill(0),  // process heap as % of total system RAM
    ram_sys:  Array(MAX_POINTS).fill(0),  // all programs used as % of total system RAM
    players:  Array(MAX_POINTS).fill(0),
    labels:   Array(MAX_POINTS).fill('')
};

let chartCpu     = null;
let chartRam     = null;
let chartPlayers = null;

function buildCharts() {
    const commonScales = {
        x: { display: false },
        y: { min: 0, ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
    };

    const cpuCtx = document.getElementById('chart-cpu');
    if (cpuCtx && !chartCpu) {
        chartCpu = new Chart(cpuCtx, {
            type: 'line',
            data: {
                labels: monitorData.labels,
                datasets: [
                    {
                        label: 'System',
                        data: monitorData.cpu_sys,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139,92,246,0.1)',
                        fill: true, tension: 0.4
                    },
                    {
                        label: 'Process',
                        data: monitorData.cpu_proc,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderDash: [5, 3],
                        fill: false, tension: 0.4
                    }
                ]
            },
            options: {
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#aaa', font: { size: 11 }, boxWidth: 18, padding: 12 }
                    }
                },
                scales: { ...commonScales, y: { ...commonScales.y, max: 100 } },
                elements: { point: { radius: 0 } }
            }
        });
    }

    const ramCtx = document.getElementById('chart-ram');
    if (ramCtx && !chartRam) {
        chartRam = new Chart(ramCtx, {
            type: 'line',
            data: {
                labels: monitorData.labels,
                datasets: [
                    {
                        label: 'System',
                        data: monitorData.ram_sys,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        fill: true, tension: 0.4
                    },
                    {
                        label: 'Process',
                        data: monitorData.ram_proc,
                        borderColor: '#ef4444',
                        backgroundColor: 'transparent',
                        borderDash: [5, 3],
                        fill: false, tension: 0.4
                    }
                ]
            },
            options: {
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#aaa', font: { size: 11 }, boxWidth: 18, padding: 12 }
                    }
                },
                scales: { ...commonScales, y: { ...commonScales.y, max: 100 } },
                elements: { point: { radius: 0 } }
            }
        });
    }

    const playersCtx = document.getElementById('chart-players');
    if (playersCtx && !chartPlayers) {
        chartPlayers = new Chart(playersCtx, {
            type: 'line',
            data: {
                labels: monitorData.labels,
                datasets: [{
                    label: 'Active Players',
                    data: monitorData.players,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true, tension: 0.4
                }]
            },
            options: {
                animation: false,
                plugins: { legend: { display: false } },
                scales: commonScales,
                elements: { point: { radius: 0 } }
            }
        });
    }
}

function pushPoint(cpuSys, cpuProc, ramProc, ramSys, players) {
    const now = new Date().toLocaleTimeString();
    monitorData.cpu_sys.push(cpuSys);
    monitorData.cpu_proc.push(cpuProc);
    monitorData.ram_proc.push(ramProc);
    monitorData.ram_sys.push(ramSys);
    monitorData.players.push(players);
    monitorData.labels.push(now);

    if (monitorData.cpu_sys.length > MAX_POINTS) {
        monitorData.cpu_sys.shift();
        monitorData.cpu_proc.shift();
        monitorData.ram_proc.shift();
        monitorData.ram_sys.shift();
        monitorData.players.shift();
        monitorData.labels.shift();
    }

    if (chartCpu) {
        chartCpu.data.labels = monitorData.labels;
        chartCpu.data.datasets[0].data = monitorData.cpu_sys;
        chartCpu.data.datasets[1].data = monitorData.cpu_proc;
        chartCpu.update();
    }
    if (chartRam) {
        chartRam.data.labels = monitorData.labels;
        chartRam.data.datasets[0].data = monitorData.ram_sys;
        chartRam.data.datasets[1].data = monitorData.ram_proc;
        chartRam.update();
    }
    if (chartPlayers) {
        chartPlayers.data.labels = monitorData.labels;
        chartPlayers.data.datasets[0].data = monitorData.players;
        chartPlayers.update();
    }
}

async function fetchLiveStats() {
    try {
        const res  = await fetch('/api/admin/live-stats', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        const cpuSysPct  = data.cpu.percent;
        const cpuProcPct = data.cpu.process ?? 0;
        const ramSysPct  = data.ram.percent;                                        // all programs % of total
        const ramProcPct = Math.min(100, Math.round((data.ram.heapUsed / data.ram.total) * 100)); // process heap % of total
        const ramUsedGB  = (data.ram.used     / 1073741824).toFixed(2);
        const ramTotalGB = (data.ram.total    / 1073741824).toFixed(2);
        const heapMB     = Math.round(data.ram.heapUsed / 1048576);
        const players    = data.players.active;
        const uptimeSec  = data.uptime;
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;

        const elCpu     = document.getElementById('monitor-cpu');
        const elRam     = document.getElementById('monitor-ram');
        const elRamProc = document.getElementById('monitor-ram-proc');
        const elPlayers = document.getElementById('monitor-players');
        const elUptime  = document.getElementById('monitor-uptime');

        if (elCpu)     elCpu.textContent     = `${cpuSysPct}%`;
        if (elRam)     elRam.textContent     = `${ramUsedGB} / ${ramTotalGB} GB (${ramSysPct}%)`;
        if (elRamProc) elRamProc.textContent = `Process heap: ${heapMB} MB (${ramProcPct}% of total)`;
        if (elPlayers) elPlayers.textContent = players;
        if (elUptime)  elUptime.textContent  = `${h}h ${m}m ${s}s`;

        pushPoint(cpuSysPct, cpuProcPct, ramProcPct, ramSysPct, players);
    } catch (_) {}
}

function startMonitor() {
    if (monitorRunning) {
        clearInterval(monitorInterval);
        monitorRunning = false;
        document.getElementById('monitor-toggle-btn').innerHTML = '<i class="fas fa-play"></i> Start';
        return;
    }
    buildCharts();
    monitorRunning = true;
    document.getElementById('monitor-toggle-btn').innerHTML = '<i class="fas fa-stop"></i> Stop';
    fetchLiveStats();
    monitorInterval = setInterval(fetchLiveStats, 3000);
}

let logsAutoInterval = null;
let logsAutoRunning  = false;

function stripAnsi(str) {
    // Remove real ANSI escape codes (\x1b[...m) and bare bracket codes ([32m etc.)
    return str
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\[\d+(?:;\d+)*m/g, '');
}

function colorizeLog(line) {
    const clean = stripAnsi(line);
    if (clean.includes('[ERROR]'))   return `<span style="color:#ef4444;">${escHtml(clean)}</span>`;
    if (clean.includes('[WARN]'))    return `<span style="color:#f59e0b;">${escHtml(clean)}</span>`;
    if (clean.includes('[SUCCESS]')) return `<span style="color:#10b981;">${escHtml(clean)}</span>`;
    if (clean.includes('[DEBUG]'))   return `<span style="color:#6b7280;">${escHtml(clean)}</span>`;
    return `<span style="color:#d4d4d4;">${escHtml(clean)}</span>`;
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadConsoleLogs(outputId) {
    const id     = outputId || 'console-logs-output';
    const lines  = document.getElementById('logs-lines-select')?.value || 200;
    const filter = document.getElementById('logs-filter')?.value?.toLowerCase() || '';
    const output = document.getElementById(id);
    if (!output) return;

    try {
        const res  = await fetch(`/api/admin/console-logs?lines=${lines}`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success) {
            output.innerHTML = `<span style="color:#ef4444;">Error: ${escHtml(data.error || 'Failed to load logs')}</span>`;
            return;
        }

        let logs = data.logs;
        if (filter) logs = logs.filter(l => stripAnsi(l).toLowerCase().includes(filter));

        output.innerHTML = logs.map(colorizeLog).join('\n') || '<span style="color:#666;">No logs found.</span>';
        output.scrollTop = output.scrollHeight;
    } catch (err) {
        output.innerHTML = `<span style="color:#ef4444;">Failed to fetch logs: ${escHtml(err.message)}</span>`;
    }
}

function toggleLogsAuto() {
    const btn = document.getElementById('logs-auto-btn');
    if (logsAutoRunning) {
        clearInterval(logsAutoInterval);
        logsAutoRunning = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Auto';
    } else {
        logsAutoRunning = true;
        btn.innerHTML = '<i class="fas fa-stop"></i> Stop Auto';
        loadConsoleLogs();
        logsAutoInterval = setInterval(loadConsoleLogs, 5000);
    }
}

async function loadAdminPlugins(containerId) {
    const id        = containerId || 'admin-plugins-list';
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res  = await fetch('/api/admin/plugins', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const loaded    = data.loaded;
        const installed = data.installed;

        if (installed.length === 0 && loaded.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-plug"></i><p>No plugins installed.</p></div>';
            return;
        }

        const rows = installed.map(name => {
            const isLoaded     = loaded.some(p => p.name.toLowerCase() === name.toLowerCase());
            const loadedPlugin = loaded.find(p => p.name.toLowerCase() === name.toLowerCase());
            const safeName     = escHtml(name);
            return `
            <div class="plugin-row" style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                <div style="flex:1;min-width:0;">
                    <strong style="color:#fff;">${safeName}</strong>
                    ${loadedPlugin ? `<span style="color:#666;font-size:12px;"> v${escHtml(loadedPlugin.version || '?')}</span>` : ''}
                    ${loadedPlugin?.description ? `<div style="color:#888;font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(loadedPlugin.description)}</div>` : ''}
                </div>
                <span style="color:${isLoaded ? '#10b981' : '#6b7280'};font-size:12px;font-weight:600;min-width:80px;text-align:right;">${isLoaded ? '● LOADED' : '○ UNLOADED'}</span>
                ${isLoaded
                    ? `<button class="btn btn-sm btn-secondary" onclick="adminPluginAction('${safeName}','reload','${id}')"><i class="fas fa-sync"></i> Reload</button>
                       <button class="btn btn-sm btn-danger"    onclick="adminPluginAction('${safeName}','unload','${id}')"><i class="fas fa-stop"></i> Unload</button>`
                    : `<button class="btn btn-sm btn-primary"   onclick="adminPluginAction('${safeName}','load','${id}')"><i class="fas fa-play"></i> Load</button>`}
                <button class="btn btn-sm btn-secondary" onclick="openPluginConfig('${safeName}','${id}')" title="Browse &amp; edit plugin config files">
                    <i class="fas fa-folder-open"></i> Config
                </button>
            </div>`;
        }).join('');

        container.innerHTML = rows;
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">${escHtml(err.message)}</p></div>`;
    }
}

async function adminPluginAction(name, action, containerId) {
    try {
        const csrf = await getCsrfToken();
        const res  = await fetch(`/api/admin/plugins/${encodeURIComponent(name)}/${action}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        showAdminCmdResult(data.success, data.message || data.error);
        await loadAdminPlugins(containerId);
    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

async function openPluginConfig(pluginName, containerId) {
    const id        = containerId || 'admin-plugins-list';
    const container = document.getElementById(id);
    if (!container) return;

    const panelId = `plugin-cfg-${pluginName}-${id}`;
    const existing = document.getElementById(panelId);
    if (existing) { existing.remove(); return; }

    try {
        const res  = await fetch(`/api/dev/plugins/${encodeURIComponent(pluginName)}/files`, { credentials: 'include' });
        const data = await res.json();

        if (!data.success || !data.files || data.files.length === 0) {
            showAdminCmdResult(false, data.error || `No JSON config files found for '${pluginName}'`);
            return;
        }

        const fileLinks = data.files.map(f => `
            <span onclick="loadPluginConfigFile('${escHtml(pluginName)}','${escHtml(f)}','${escHtml(panelId)}')"
                  style="cursor:pointer;color:#8b5cf6;font-size:13px;margin-right:12px;white-space:nowrap;">
                <i class="fas fa-file-code"></i> ${escHtml(f)}
            </span>`).join('');

        const div = document.createElement('div');
        div.id = panelId;
        div.style.cssText = 'background:#161616;border:1px solid #444;border-radius:8px;padding:12px 16px;margin-bottom:8px;';
        div.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <strong style="color:#8b5cf6;font-size:13px;"><i class="fas fa-folder-open"></i>&nbsp;${escHtml(pluginName)} - Config Files</strong>
                <button class="btn btn-sm btn-secondary" onclick="document.getElementById('${escHtml(panelId)}').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${fileLinks}</div>
            <div id="${escHtml(panelId)}-editor" style="display:none;margin-top:8px;">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                    <strong id="${escHtml(panelId)}-fname" style="color:#aaa;font-size:12px;font-family:monospace;"></strong>
                    <button class="btn btn-sm btn-primary"    onclick="savePluginConfigFile('${escHtml(pluginName)}','${escHtml(panelId)}')"><i class="fas fa-save"></i> Save</button>
                    <button class="btn btn-sm btn-secondary"  onclick="document.getElementById('${escHtml(panelId)}-editor').style.display='none'"><i class="fas fa-times"></i></button>
                </div>
                <textarea id="${escHtml(panelId)}-content" class="config-editor" style="height:200px;font-size:12px;font-family:monospace;"></textarea>
            </div>`;

        // Insert right after the row that contains this plugin
        const rows = container.querySelectorAll('.plugin-row');
        let inserted = false;
        rows.forEach(row => {
            if (!inserted && row.textContent.includes(pluginName)) {
                row.after(div);
                inserted = true;
            }
        });
        if (!inserted) container.appendChild(div);

    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

async function loadPluginConfigFile(pluginName, fileName, panelId) {
    try {
        const res  = await fetch(`/api/dev/plugins/${encodeURIComponent(pluginName)}/files/${encodeURIComponent(fileName)}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) { showAdminCmdResult(false, data.error); return; }

        const editorDiv = document.getElementById(`${panelId}-editor`);
        const fnameEl   = document.getElementById(`${panelId}-fname`);
        const contentEl = document.getElementById(`${panelId}-content`);

        fnameEl.textContent      = fileName;
        contentEl.value          = JSON.stringify(data.content, null, 2);
        contentEl.dataset.file   = fileName;
        editorDiv.style.display  = 'block';
    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

async function savePluginConfigFile(pluginName, panelId) {
    const contentEl = document.getElementById(`${panelId}-content`);
    if (!contentEl) return;
    const fileName = contentEl.dataset.file;
    try {
        const content = JSON.parse(contentEl.value);
        const csrf    = await getCsrfToken();
        const res     = await fetch(`/api/dev/plugins/${encodeURIComponent(pluginName)}/files/${encodeURIComponent(fileName)}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ content })
        });
        const data = await res.json();
        showAdminCmdResult(data.success, data.message || data.error);
    } catch (err) {
        showAdminCmdResult(false, err.message.includes('JSON') ? 'Invalid JSON - check syntax' : err.message);
    }
}

async function loadServerProperties() {
    const editor = document.getElementById('server-properties-editor');
    if (!editor) return;
    editor.value = 'Loading...';
    try {
        const res  = await fetch('/api/admin/server-properties', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        editor.value = data.content;
    } catch (err) {
        editor.value = `# Error loading server.properties: ${err.message}`;
    }
}

async function saveServerProperties() {
    const editor = document.getElementById('server-properties-editor');
    if (!editor) return;
    try {
        const csrf = await getCsrfToken();
        const res  = await fetch('/api/admin/server-properties', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ content: editor.value })
        });
        const data = await res.json();
        showAdminCmdResult(data.success, data.message || data.error);
    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

// ADMIN_COMMANDS contains ONLY level-3 admin-exclusive commands.
// Dev-level commands (reload, shop, backup, tokens…) live in the Dev panel.

const ADMIN_COMMANDS = [
    {
        cat: 'Account', icon: 'fa-user-shield', color: '#ec4899', cmds: [
            { label: 'Change Role', cmd: 'account role',   args: [{id:'acmd-role-id',ph:'accountId or name'},{id:'acmd-role-val',ph:'player|mod|dev|admin|owner'}] },
            { label: 'Delete',      cmd: 'account delete', args: [{id:'acmd-del-id',ph:'accountId'}], danger: true },
        ]
    },
    {
        cat: 'Bans', icon: 'fa-ban', color: '#ef4444', cmds: [
            { label: 'Ban',   cmd: 'ban add',    args: [{id:'acmd-ban-id',ph:'username'},{id:'acmd-ban-reason',ph:'reason'},{id:'acmd-ban-dur',ph:'duration: 2h, 7d, 1m (empty=perm)'}], danger: true },
            { label: 'Unban', cmd: 'ban remove', args: [{id:'acmd-unban-id',ph:'username'}] },
            { label: 'Info',  cmd: 'ban info',   args: [{id:'acmd-binfo-id',ph:'username'}] },
            { label: 'List',  cmd: 'ban list' },
        ]
    },
    {
        cat: 'Maintenance', icon: 'fa-tools', color: '#f59e0b', cmds: [
            { label: 'Enable',  cmd: 'maintenance on',  danger: true },
            { label: 'Disable', cmd: 'maintenance off' },
        ]
    },
    {
        cat: 'Broadcast', icon: 'fa-bullhorn', color: '#8b5cf6', cmds: [
            { label: 'Message', cmd: 'broadcast', args: [{id:'acmd-bc-msg',ph:'message to all players'}] },
        ]
    },
];

// Fixed-position toast - always visible regardless of scroll position
function showCmdToast(success, message) {
    let toast = document.getElementById('panel-cmd-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'panel-cmd-toast';
        Object.assign(toast.style, {
            position:     'fixed',
            bottom:       '24px',
            right:        '24px',
            maxWidth:     '480px',
            minWidth:     '220px',
            padding:      '14px 18px',
            borderRadius: '10px',
            fontFamily:   'monospace',
            fontSize:     '12px',
            whiteSpace:   'pre-wrap',
            zIndex:       '9999',
            boxShadow:    '0 6px 28px rgba(0,0,0,0.65)',
            transition:   'opacity 0.35s ease',
            lineHeight:   '1.55',
            wordBreak:    'break-word',
            opacity:      '0'
        });
        document.body.appendChild(toast);
    }
    clearTimeout(toast._timeout);
    toast.style.background = success ? '#052e16' : '#3b0808';
    toast.style.border     = `1px solid ${success ? '#10b981' : '#ef4444'}`;
    toast.style.color      = success ? '#86efac' : '#fca5a5';
    toast.style.opacity    = '1';
    toast.textContent      = stripAnsi(message);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 12000);
}

// Single runner for all panels - shows result as a viewport-fixed toast
async function runPanelCmd(baseCmd, argIds) {
    const args    = (argIds || []).map(id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; });
    const command = [baseCmd, ...args.filter(Boolean)].join(' ');

    showCmdToast(true, `Running: ${command}…`);

    try {
        const csrf = await getCsrfToken();
        const res  = await fetch('/api/admin/command', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ command })
        });
        const data = await res.json();
        const msg  = data.message || data.error || (data.success ? 'Done.' : 'Failed.');
        showCmdToast(data.success, msg);
    } catch (err) {
        showCmdToast(false, err.message);
    }
}

// Renders any array of command categories into the same unified HTML
function renderCmdSections(sections) {
    return sections.map(({ cat, icon, color, cmds }) => {
        const iconColor  = color || '#6b7280';
        const simple     = cmds.filter(c => !c.args || c.args.length === 0);
        const complex    = cmds.filter(c =>  c.args && c.args.length  >  0);

        const simpleButtons = simple.map(({ label, cmd, danger }) => {
            const bg = danger ? '#3b0808' : '#1e1e1e';
            const bc = danger ? '#7f1d1d' : '#2d2d2d';
            const tc = danger ? '#fca5a5' : '#c4c4c4';
            const oc = `runPanelCmd('${escHtml(cmd)}', [])`;
            return `<button onclick="${oc}"
                style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                       gap:6px;padding:12px 10px;min-width:90px;flex:1;max-width:150px;
                       background:${bg};border:1px solid ${bc};border-radius:9px;cursor:pointer;
                       font-family:inherit;font-size:11px;font-weight:600;color:${tc};transition:filter .15s;"
                onmouseover="this.style.filter='brightness(1.3)'" onmouseout="this.style.filter=''">
                <i class="fas fa-terminal" style="font-size:15px;color:${escHtml(iconColor)};opacity:0.7;"></i>
                <span>${escHtml(label)}</span>
            </button>`;
        }).join('');

        const complexRows = complex.map(({ label, cmd, args, danger }) => {
            const inputs   = (args || []).map(a =>
                `<input id="${a.id}" class="form-input" style="flex:1;min-width:130px;padding:5px 8px;font-size:12px;" placeholder="${escHtml(a.ph)}">`
            ).join('');
            const btnClass = danger ? 'btn-danger' : 'btn-primary';
            const oc       = `runPanelCmd('${escHtml(cmd)}', [${(args||[]).map(a => `'${a.id}'`).join(',')}])`;
            return `<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;
                               padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#999;font-size:12px;font-weight:600;white-space:nowrap;min-width:110px;">${escHtml(label)}</span>
                ${inputs}
                <button class="btn btn-sm ${btnClass}" onclick="${oc}" style="white-space:nowrap;">
                    <i class="fas fa-play"></i> Run
                </button>
            </div>`;
        }).join('');

        const simpleSection  = simple.length  > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${complex.length > 0 ? '10px' : '0'};">${simpleButtons}</div>` : '';
        const complexSection = complex.length > 0 ? `<div style="display:flex;flex-direction:column;gap:6px;">${complexRows}</div>` : '';

        return `
        <div style="background:#141414;border:1px solid #272727;border-left:3px solid ${escHtml(iconColor)};border-radius:12px;padding:16px 18px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                <i class="fas ${escHtml(icon)}" style="color:${escHtml(iconColor)};font-size:14px;"></i>
                <span style="color:#ccc;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${escHtml(cat)}</span>
            </div>
            ${simpleSection}${complexSection}
        </div>`;
    }).join('');
}

// Admin: ONLY ADMIN_COMMANDS (level-3 exclusive).
// Dev-level commands are accessible from the Dev panel.
function loadAdminCommands() {
    const container = document.getElementById('admin-commands-list');
    if (!container) return;
    container.innerHTML = renderCmdSections(ADMIN_COMMANDS);
}

function showAdminCmdResult(success, message) {
    const el = document.getElementById('admin-cmd-result');
    if (!el) return;
    el.className          = `alert ${success ? 'alert-success' : 'alert-danger'}`;
    el.style.display      = 'block';
    el.style.whiteSpace   = 'pre-wrap';
    el.style.fontFamily   = 'monospace';
    el.style.fontSize     = '12px';
    el.textContent        = message;
    setTimeout(() => { el.style.display = 'none'; }, 8000);
}

async function getCsrfToken() {
    try {
        const res  = await fetch('/api/auth/csrf-token', { credentials: 'include' });
        const data = await res.json();
        return data.csrfToken || '';
    } catch (_) { return ''; }
}

const _origShowAdminTab = typeof showAdminTab === 'function' ? showAdminTab : null;

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const target = document.getElementById(`admin-${tab}`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${tab}'`)) btn.classList.add('active');
    });

    if (tab === 'audit')    { auditCurrentPage = 1; loadAuditLog(); }
    if (tab === 'stats')    loadAdminWebSettings();
    if (tab === 'settings') loadAdminWebSettings();
    if (tab === 'commands') loadAdminCommands();

    if (logsAutoRunning) toggleLogsAuto();
}

const _origShowDevTab = typeof showDevTab === 'function' ? showDevTab : null;

function showDevTab(tab) {
    document.querySelectorAll('.dev-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.dev-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const target = document.getElementById(`dev-${tab}`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.dev-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${tab}'`)) btn.classList.add('active');
    });

    if (tab === 'overview')  { if (typeof loadDevOverview === 'function') loadDevOverview(); }
    if (tab === 'config')    { if (typeof loadDevConfig   === 'function') loadDevConfig();   }
    if (tab === 'stats')     { if (typeof loadDevStats    === 'function') loadDevStats();    }
    if (tab === 'logs')      loadConsoleLogs('dev-logs-output');
    if (tab === 'plugins')   loadAdminPlugins('dev-plugins-list');
    if (tab === 'commands')  loadDevCommands();
    if (tab === 'system')  { loadSystemTests(); loadSystemChart(24); }
    if (tab === 'monitor')   buildCharts();

    if (tab !== 'system' && systemAutoRunning) toggleSystemAutoRefresh();
    if (tab !== 'monitor' && monitorRunning)   startMonitor();
}

// Stop monitor / auto-refresh when leaving section
const _origShowSection = typeof showSection === 'function' ? showSection : null;
if (_origShowSection) {
    window.showSection = function(section) {
        if (section !== 'dev' && monitorRunning)     startMonitor();
        if (section !== 'dev' && logsAutoRunning)    toggleLogsAuto();
        if (section !== 'dev' && systemAutoRunning)  toggleSystemAutoRefresh();
        _origShowSection(section);
    };
}

async function loadAdminWebSettings() {
    try {
        const res  = await fetch('/api/dev/config', { credentials: 'include' });
        const data = await res.json();
        if (!data.config) return;
        const rl  = data.config.rateLimiting || {};
        const sec = data.config.serverSecurity || {};
        const el  = (id, val) => { const e = document.getElementById(id); if (e && val != null) e.value = val; };
        el('admin-max-login',   rl.authMaxAttempts);
        el('admin-lockout-min', rl.authWindowMinutes);

        const setToggle = (key, val) => {
            const on  = document.getElementById(`btn-${key}-on`);
            const off = document.getElementById(`btn-${key}-off`);
            if (!on || !off) return;
            if (val) {
                on.className  = 'btn btn-sm btn-success';
                off.className = 'btn btn-sm btn-secondary';
            } else {
                on.className  = 'btn btn-sm btn-secondary';
                off.className = 'btn btn-sm btn-danger';
            }
        };
        setToggle('rateLimiting',      rl.rateLimiting);
        setToggle('corsEnable',        sec.corsEnable);
        setToggle('helmetEnable',      sec.helmetEnable);
        setToggle('compressionEnable', sec.compressionEnable);
        setToggle('trustProxy',        sec.trustProxy);
    } catch (_) {}
}

async function saveAdminWebSetting(key, valueOrInputId, castFn) {
    try {
        let value;
        if (typeof valueOrInputId === 'string') {
            const el = document.getElementById(valueOrInputId);
            value = castFn ? castFn(el?.value) : el?.value;
        } else {
            value = valueOrInputId;
        }
        const csrf = await getCsrfToken();
        const res  = await fetch(`/api/dev/config/${encodeURIComponent(key)}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ value })
        });
        const data = await res.json();
        showAdminCmdResult(data.success, data.message || (data.success ? 'Saved' : data.error));
        if (data.success) loadAdminWebSettings();
    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

const DEV_COMMANDS = [
    {
        cat: 'Server', icon: 'fa-server', color: '#3b82f6', cmds: [
            { label: 'Reload All',        cmd: 'reload' },
            { label: 'Reload Config',     cmd: 'reload config' },
            { label: 'Reload Plugins',    cmd: 'reload plugins' },
            { label: 'Reload Shop',       cmd: 'reload shop' },
            { label: 'Diagnostic',        cmd: 'diagnostic' },
        ]
    },
    {
        cat: 'Shop', icon: 'fa-store', color: '#10b981', cmds: [
            { label: 'Rotate',   cmd: 'shop rotate' },
            { label: 'Info',     cmd: 'shop info' },
            { label: 'Status',   cmd: 'shop status' },
        ]
    },
    {
        cat: 'Tokens', icon: 'fa-key', color: '#f59e0b', cmds: [
            { label: 'Stats',    cmd: 'tokens stats' },
            { label: 'Cleanup',  cmd: 'tokens cleanup' },
            { label: 'Revoke',   cmd: 'tokens revoke', args: [{id:'dcmd-tok-id',ph:'accountId'}] },
        ]
    },
    {
        cat: 'Plugins', icon: 'fa-plug', color: '#8b5cf6', cmds: [
            { label: 'List',       cmd: 'plugins list' },
            { label: 'Store',      cmd: 'plugins store' },
            { label: 'Info',       cmd: 'plugins info', args: [{id:'dcmd-pl-name',ph:'plugin name'}] },
        ]
    },
    {
        cat: 'Backup', icon: 'fa-save', color: '#06b6d4', cmds: [
            { label: 'Create',   cmd: 'backup create' },
            { label: 'List',     cmd: 'backup list' },
            { label: 'Restore',  cmd: 'backup restore', args: [{id:'dcmd-bk-id',ph:'backup id'}], danger: true },
        ]
    },
    {
        cat: 'Data', icon: 'fa-database', color: '#ec4899', cmds: [
            { label: 'Dry Run JSON→Mongo',   cmd: 'data migrate json mongodb --dry-run', args: [] },
            { label: 'Migrate JSON→Mongo',   cmd: 'data migrate json mongodb --confirm', args: [{id:'dcmd-mongo-uri',ph:'--uri=mongodb://host:port/db'}] },
            { label: 'Migrate Mongo→JSON',   cmd: 'data migrate mongodb json --confirm', args: [{id:'dcmd-mongo-uri2',ph:'--uri=mongodb://host:port/db (opt.)'}] },
            { label: 'Migrate+Switch J→M',   cmd: 'data migrate json mongodb --confirm --switch', args: [{id:'dcmd-mongo-uri3',ph:'--uri=mongodb://host:port/db'}], danger: false },
        ]
    },
    {
        cat: 'Testing', icon: 'fa-flask', color: '#84cc16', cmds: [
            { label: 'All',       cmd: 'test all' },
            { label: 'Account',   cmd: 'test account' },
            { label: 'Server',    cmd: 'test server' },
            { label: 'Database',  cmd: 'test database' },
            { label: 'Plugins',   cmd: 'test plugins' },
        ]
    },
];

// Dev: DEV_COMMANDS only
function loadDevCommands() {
    const container = document.getElementById('dev-commands-list');
    if (!container) return;
    container.innerHTML = renderCmdSections(DEV_COMMANDS);
}

const MOD_COMMANDS = [
    {
        cat: 'Bans', icon: 'fa-ban', color: '#ef4444', cmds: [
            { label: 'Ban',   cmd: 'ban add',    args: [{id:'mcmd-ban-id',ph:'username'},{id:'mcmd-ban-reason',ph:'reason'},{id:'mcmd-ban-dur',ph:'duration: 2h, 7d, 1m (empty=perm)'}], danger: true },
            { label: 'Unban', cmd: 'ban remove', args: [{id:'mcmd-unban-id',ph:'username'}] },
            { label: 'Info',  cmd: 'ban info',   args: [{id:'mcmd-bi-id',ph:'username'}] },
            { label: 'List',  cmd: 'ban list' },
        ]
    },
    {
        cat: 'Players', icon: 'fa-user', color: '#8b5cf6', cmds: [
            { label: 'Info',   cmd: 'account info', args: [{id:'mcmd-acc-id',ph:'username or accountId'}] },
            { label: 'Unlock', cmd: 'unlock',       args: [{id:'mcmd-unlock-id',ph:'username'}] },
        ]
    },
];

// Mod: MOD_COMMANDS only
function loadModCommands() {
    const container = document.getElementById('mod-commands-list');
    if (!container) return;
    container.innerHTML = renderCmdSections(MOD_COMMANDS);
}

let systemAutoRunning  = false;
let systemAutoInterval = null;
let chartSystemHealth  = null;

const STATUS_COLORS = { ok: '#10b981', degraded: '#f59e0b', error: '#ef4444', disabled: '#6b7280' };
const STATUS_ICONS  = { ok: 'fa-check-circle', degraded: 'fa-exclamation-circle', error: 'fa-times-circle', disabled: 'fa-circle' };
const STATUS_LABELS = { ok: 'Operational', degraded: 'Degraded', error: 'Outage', disabled: 'Disabled' };

async function loadSystemTests() {
    const checksEl = document.getElementById('system-checks-list');
    if (!checksEl) return;

    try {
        const res  = await fetch('/api/dev/system/tests', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed');

        const { checks, summary } = data;

        // Update banner
        const textEl = document.getElementById('system-status-text');
        const subEl  = document.getElementById('system-status-sub');
        const iconEl = document.getElementById('system-status-icon');
        const passing = summary.passing;
        const active  = summary.total - summary.disabled;

        if (textEl) {
            if (summary.failing === 0) {
                textEl.textContent = 'ALL SYSTEMS OPERATIONAL';
                textEl.style.color = '#10b981';
            } else {
                textEl.textContent = `${passing}/${active} SYSTEMS OPERATIONAL`;
                textEl.style.color = summary.failing > 2 ? '#ef4444' : '#f59e0b';
            }
        }
        if (subEl)  subEl.textContent  = `Last checked ${new Date().toLocaleTimeString()} · ${summary.total} services`;
        if (iconEl) {
            iconEl.className = `fas ${summary.failing === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle'}`;
            iconEl.style.color = summary.failing === 0 ? '#10b981' : (summary.failing > 2 ? '#ef4444' : '#f59e0b');
        }

        // Render rows
        checksEl.innerHTML = checks.map(c => {
            const color = STATUS_COLORS[c.status] || '#888';
            const icon  = STATUS_ICONS[c.status]  || 'fa-question-circle';
            const label = STATUS_LABELS[c.status]  || c.status;
            const ms    = c.status === 'disabled' ? 'N/A' : `${c.ms}ms`;
            return `<div style="display:flex;align-items:center;gap:12px;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;margin-bottom:6px;">
                <i class="fas ${icon}" style="font-size:18px;color:${color};min-width:20px;text-align:center;"></i>
                <div style="flex:1;min-width:0;">
                    <strong style="color:#fff;font-size:14px;">${escHtml(c.name)}</strong>
                    <span style="color:#888;font-size:12px;margin-left:8px;">${escHtml(c.message || '')}</span>
                </div>
                <span style="color:#666;font-size:11px;min-width:36px;text-align:right;">${ms}</span>
                <span style="color:${color};font-size:12px;font-weight:600;min-width:90px;text-align:right;">${label}</span>
            </div>`;
        }).join('');

    } catch (err) {
        checksEl.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">${escHtml(err.message)}</p></div>`;
    }
}

function toggleSystemAutoRefresh() {
    const btn = document.getElementById('system-auto-btn');
    if (systemAutoRunning) {
        clearInterval(systemAutoInterval);
        systemAutoRunning = false;
        if (btn) btn.innerHTML = '<i class="fas fa-play"></i> Auto 5m';
    } else {
        systemAutoRunning = true;
        if (btn) btn.innerHTML = '<i class="fas fa-stop"></i> Stop Auto';
        loadSystemTests();
        systemAutoInterval = setInterval(loadSystemTests, 5 * 60 * 1000);
    }
}

async function loadSystemChart(hours) {
    // Highlight active range button
    [24, 48, 72].forEach(h => {
        const b = document.getElementById(`sys-chart-${h}`);
        if (b) b.style.opacity = h === hours ? '1' : '0.5';
    });

    try {
        const res  = await fetch(`/api/dev/system/history?hours=${hours}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        const ctx = document.getElementById('chart-system-health');
        if (!ctx) return;

        const pts    = data.history || [];
        const labels = pts.map(p => new Date(p.t).toLocaleTimeString());
        const values = pts.map(p => p.pct);

        if (chartSystemHealth) chartSystemHealth.destroy();
        chartSystemHealth = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '% Systems OK',
                    data: values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { min: 0, max: 100, ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
                },
                elements: { point: { radius: 0 } }
            }
        });
    } catch (_) {}
}
