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
        const res  = await fetch('/neodyme/api/admin/live-stats', { credentials: 'include' });
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
    loadXmppClients();
    monitorInterval = setInterval(() => { fetchLiveStats(); loadXmppClients(); }, 3000);
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

// escHtml moved to common.js (shared helper)

async function loadConsoleLogs(outputId) {
    const id     = outputId || 'console-logs-output';
    const lines  = document.getElementById('logs-lines-select')?.value || 200;
    const filter = document.getElementById('logs-filter')?.value?.toLowerCase() || '';
    const output = document.getElementById(id);
    if (!output) return;

    try {
        const res  = await fetch(`/neodyme/api/admin/console-logs?lines=${lines}`, { credentials: 'include' });
        const data = await res.json();

        if (!res.ok) {
            output.innerHTML = `<span style="color:#ef4444;">Error: ${escHtml(apiError(data, 'Failed to load logs'))}</span>`;
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
        const res  = await fetch('/neodyme/api/admin/plugins', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load plugins'));

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
            <div class="plugin-row" style="background:var(--surface-2, #1b1726);border:1px solid var(--border-strong, rgba(255,255,255,0.14));border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:8px;">
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
        const res  = await secureFetch(`/neodyme/api/admin/plugins/${encodeURIComponent(name)}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        showAdminCmdResult(res.ok, apiError(data, res.ok ? 'Done.' : 'Action failed.'));
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
        const res  = await fetch(`/neodyme/api/dev/plugins/${encodeURIComponent(pluginName)}/files`, { credentials: 'include' });
        const data = await res.json();

        if (!res.ok || !data.files || data.files.length === 0) {
            showAdminCmdResult(false, apiError(data, `No JSON config files found for '${pluginName}'`));
            return;
        }

        const fileLinks = data.files.map(f => `
            <span onclick="loadPluginConfigFile('${escHtml(pluginName)}','${escHtml(f)}','${escHtml(panelId)}')"
                  style="cursor:pointer;color:#8b5cf6;font-size:13px;margin-right:12px;white-space:nowrap;">
                <i class="fas fa-file-code"></i> ${escHtml(f)}
            </span>`).join('');

        const div = document.createElement('div');
        div.id = panelId;
        div.style.cssText = 'background:var(--surface, #15121d);border:1px solid #444;border-radius:8px;padding:12px 16px;margin-bottom:8px;';
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
        const res  = await fetch(`/neodyme/api/dev/plugins/${encodeURIComponent(pluginName)}/files/${encodeURIComponent(fileName)}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) { showAdminCmdResult(false, apiError(data, 'Failed to load file.')); return; }

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
        const res     = await secureFetch(`/neodyme/api/dev/plugins/${encodeURIComponent(pluginName)}/files/${encodeURIComponent(fileName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await res.json();
        showAdminCmdResult(res.ok, apiError(data, res.ok ? 'Saved.' : 'Failed to save.'));
    } catch (err) {
        showAdminCmdResult(false, err.message.includes('JSON') ? 'Invalid JSON - check syntax' : err.message);
    }
}

async function loadServerProperties() {
    const editor = document.getElementById('server-properties-editor');
    if (!editor) return;
    editor.value = 'Loading...';
    try {
        const res  = await fetch('/neodyme/api/admin/server-properties', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load'));
        editor.value = data.content;
    } catch (err) {
        editor.value = `# Error loading server.properties: ${err.message}`;
    }
}

async function saveServerProperties() {
    const editor = document.getElementById('server-properties-editor');
    if (!editor) return;
    try {
        const res  = await secureFetch('/neodyme/api/admin/server-properties', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editor.value })
        });
        const data = await res.json();
        showAdminCmdResult(res.ok, apiError(data, res.ok ? 'Saved.' : 'Failed to save.'));
    } catch (err) {
        showAdminCmdResult(false, err.message);
    }
}

// ADMIN_COMMANDS contains ONLY level-3 admin-exclusive commands.
// Dev-level commands (reload, shop, backup, tokens...) live in the Dev panel.

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
        cat: 'Creator Codes', icon: 'fa-code', color: '#10b981', cmds: [
            { label: 'Add',    cmd: 'sac add',    args: [{id:'acmd-sac-user',ph:'username or accountId'},{id:'acmd-sac-code',ph:'code (3-16 chars)'}] },
            { label: 'Info',   cmd: 'sac info',   args: [{id:'acmd-sac-info',ph:'code'}] },
            { label: 'Delete', cmd: 'sac delete', args: [{id:'acmd-sac-del',ph:'code'}], danger: true },
            { label: 'List',   cmd: 'sac list' },
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

    showCmdToast(true, `Running: ${command}...`);

    try {
        const res  = await secureFetch('/neodyme/api/admin/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const data = await res.json();
        const ok   = res.ok && data.success !== false;
        showCmdToast(ok, data.message || (ok ? 'Done.' : 'Failed.'));
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
            const bg = danger ? 'rgba(239, 68, 68, 0.16)' : 'var(--surface-2, #1b1726)';
            const bc = danger ? 'rgba(239, 68, 68, 0.45)' : 'var(--border-strong, rgba(255,255,255,0.14))';
            const tc = danger ? '#fca5a5' : 'var(--text, #f4f2f8)';
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
            return `<div style="background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:8px;
                               padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:var(--muted, #a39fb3);font-size:12px;font-weight:600;white-space:nowrap;min-width:110px;">${escHtml(label)}</span>
                ${inputs}
                <button class="btn btn-sm ${btnClass}" onclick="${oc}" style="white-space:nowrap;">
                    <i class="fas fa-play"></i> Run
                </button>
            </div>`;
        }).join('');

        const simpleSection  = simple.length  > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:${complex.length > 0 ? '10px' : '0'};">${simpleButtons}</div>` : '';
        const complexSection = complex.length > 0 ? `<div style="display:flex;flex-direction:column;gap:6px;">${complexRows}</div>` : '';

        return `
        <div style="background:var(--surface, #15121d);border:1px solid var(--border, rgba(255,255,255,0.08));border-left:3px solid ${escHtml(iconColor)};border-radius:12px;padding:16px 18px;margin-bottom:12px;">
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

// Full admin tab router (handles audit / stats / settings / commands).
function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const target = document.getElementById(`admin-${tab}`);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${tab}'`)) btn.classList.add('active');
    });

    if (tab === 'users')    loadAdminUsers();
    if (tab === 'audit')    { auditCurrentPage = 1; loadAuditLog(); }
    if (tab === 'stats')    { loadAdminDetailedStats(); loadPlayerStatsChart('24h'); loadAdminWebSettings(); }
    if (tab === 'settings') loadAdminWebSettings();
    if (tab === 'permissions') loadPermissionUsers();
    if (tab === 'commands') loadAdminCommands();
    if (tab === 'whitelist') loadWhitelist();

    if (logsAutoRunning) toggleLogsAuto();
}

// ---- Whitelist management ----

function showWhitelistResult(success, message) {
    const el = document.getElementById('admin-whitelist-result');
    if (!el) return;
    el.className     = `alert ${success ? 'alert-success' : 'alert-danger'}`;
    el.style.display = 'block';
    el.textContent   = message;
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

async function loadWhitelist() {
    const list = document.getElementById('admin-whitelist-list');
    try {
        const res  = await fetch('/neodyme/api/admin/whitelist', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load whitelist'));

        const statusEl = document.getElementById('admin-whitelist-status');
        const on  = document.getElementById('btn-whitelist-on');
        const off = document.getElementById('btn-whitelist-off');
        if (statusEl) {
            statusEl.textContent = data.enabled ? 'Enabled' : 'Disabled';
            statusEl.style.color = data.enabled ? '#4ade80' : '#ef4444';
        }
        if (on && off) {
            on.className  = data.enabled ? 'btn btn-sm btn-success'   : 'btn btn-sm btn-secondary';
            off.className = data.enabled ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-danger';
        }

        if (!list) return;
        if (!data.entries || data.entries.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#666;padding:24px;font-size:13px;">The whitelist is empty.</div>';
            return;
        }

        list.innerHTML = data.entries.map(entry => {
            const name = entry.displayName
                ? escHtml(entry.displayName)
                : '<span style="color:#fbbf24;">&lt;unknown account&gt;</span>';
            return `<div class="user-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:8px;margin-bottom:6px;">
                <div>
                    <div style="font-weight:600;color:#ddd;">${name}</div>
                    <div style="font-size:11px;color:#777;font-family:monospace;">${escHtml(entry.accountId)}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeFromWhitelist('${escHtml(entry.accountId)}')">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>`;
        }).join('');
    } catch (err) {
        if (list) list.innerHTML = `<span style="color:#ef4444;font-size:13px;">Error: ${escHtml(err.message)}</span>`;
    }
}

async function setWhitelistEnabled(enabled) {
    try {
        const res  = await secureFetch('/neodyme/api/admin/whitelist/enabled', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        showWhitelistResult(res.ok, apiError(data, res.ok ? 'Saved.' : 'Failed to save.'));
        if (res.ok) loadWhitelist();
    } catch (err) {
        showWhitelistResult(false, err.message);
    }
}

async function addToWhitelist() {
    const input = document.getElementById('admin-whitelist-input');
    const query = (input?.value || '').trim();
    if (!query) {
        showWhitelistResult(false, 'Enter a displayName or accountId.');
        return;
    }
    try {
        const res  = await secureFetch('/neodyme/api/admin/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        showWhitelistResult(res.ok, apiError(data, res.ok ? 'Added.' : 'Failed to add.'));
        if (res.ok) {
            if (input) input.value = '';
            loadWhitelist();
        }
    } catch (err) {
        showWhitelistResult(false, err.message);
    }
}

async function removeFromWhitelist(accountId) {
    try {
        const res  = await secureFetch(`/neodyme/api/admin/whitelist/${encodeURIComponent(accountId)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        showWhitelistResult(res.ok, apiError(data, res.ok ? 'Removed.' : 'Failed to remove.'));
        if (res.ok) loadWhitelist();
    } catch (err) {
        showWhitelistResult(false, err.message);
    }
}

// ---- Email tab (Dev panel) ----

let emailTemplatesCache = [];
let emailVariablesCache = [];
let emailLayoutsCache = [];
let emailAutomationsCache = [];
let emailTriggersCache = [];
let emailEditingId = null;
let emailLayoutEditingId = null;
let emailCampaignPoll = null;

function showEmailResult(success, message) {
    const el = document.getElementById('email-result');
    if (!el) return;
    el.className     = `alert ${success ? 'alert-success' : 'alert-danger'}`;
    el.style.display = 'block';
    el.textContent   = message;
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function showEmailView(view) {
    document.querySelectorAll('#dev-email .email-view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#dev-email .admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    const target = document.getElementById(`email-view-${view}`);
    if (target) target.style.display = 'block';
    document.querySelectorAll('#dev-email .admin-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(`'${view}'`)) btn.classList.add('active');
    });
    if (view === 'send') populateSendTemplates();
    if (view === 'layouts') renderEmailLayoutList();
    if (view === 'automation') loadEmailAutomations();
}

async function initEmailTab() {
    await loadEmailStatus();
    await loadEmailLayouts();
    await loadEmailTemplates();
    showEmailView('templates');
}

async function loadEmailLayouts() {
    try {
        const res  = await fetch('/neodyme/api/dev/email/layouts', { credentials: 'include' });
        const data = await res.json();
        if (res.ok) emailLayoutsCache = data.layouts || [];
    } catch (_) {}
}

async function loadEmailStatus() {
    const banner = document.getElementById('email-smtp-banner');
    try {
        const res  = await fetch('/neodyme/api/dev/email/status', { credentials: 'include' });
        const data = await res.json();
        if (!banner) return;

        if (!data.configured) {
            banner.innerHTML = `<div class="alert alert-danger" style="margin:0;">
                <i class="fas fa-exclamation-triangle"></i> SMTP is not configured. Use the <code>/email create</code> console command to set it up before sending.
            </div>`;
            return;
        }
        const c = data.config || {};
        banner.innerHTML = `<div class="alert alert-success" style="margin:0;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <span><i class="fas fa-check-circle"></i> SMTP: <strong>${escHtml(c.host || '')}:${escHtml(String(c.port || ''))}</strong> as ${escHtml(c.user || '')}</span>
            <button class="btn btn-sm btn-secondary" onclick="verifyEmailConnection()"><i class="fas fa-plug"></i> Test connection</button>
        </div>`;
    } catch (_) {}
}

async function verifyEmailConnection() {
    try {
        const res  = await secureFetch('/neodyme/api/dev/email/verify', { method: 'POST' });
        const data = await res.json();
        showEmailResult(data.success, data.success ? 'SMTP connection OK.' : `Connection failed: ${data.error || 'unknown error'}`);
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

async function loadEmailTemplates() {
    try {
        const res  = await fetch('/neodyme/api/dev/email/templates', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load templates'));
        emailTemplatesCache = data.templates || [];
        emailVariablesCache = data.variables || [];
        renderEmailTemplateList();
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function renderEmailTemplateList() {
    const list = document.getElementById('email-template-list');
    if (!list) return;
    if (emailTemplatesCache.length === 0) {
        list.innerHTML = '<div style="color:#666;font-size:12px;padding:8px;">No templates.</div>';
        return;
    }
    list.innerHTML = emailTemplatesCache.map(t => {
        const active = t.id === emailEditingId ? ' active' : '';
        const badge = t.system ? ' <i class="fas fa-lock" style="font-size:10px;color:#fbbf24;" title="System template"></i>' : '';
        return `<button class="content-nav-item${active}" onclick="editEmailTemplate('${escHtml(t.id)}')">
            <i class="fas fa-file-alt"></i> ${escHtml(t.name || t.id)}${badge}
        </button>`;
    }).join('');
}

function newEmailTemplate() {
    emailEditingId = null;
    renderEmailTemplateEditor({ id: '', name: '', subject: '', heading: '', body: '', footerNote: '', system: false }, true);
    renderEmailTemplateList();
}

async function editEmailTemplate(id) {
    try {
        const res  = await fetch(`/neodyme/api/dev/email/templates/${encodeURIComponent(id)}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load template'));
        emailEditingId = id;
        renderEmailTemplateEditor(data.template, false);
        renderEmailTemplateList();
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function renderEmailTemplateEditor(t, isNew) {
    const editor = document.getElementById('email-template-editor');
    if (!editor) return;
    const vars = emailVariablesCache.map(v => `<code style="font-size:11px;margin-right:6px;">${escHtml(v)}</code>`).join('');

    const selectedLayout = t.layout || 'default';
    const layoutOptions = (emailLayoutsCache.length ? emailLayoutsCache : ['default']).map(id =>
        `<option value="${escHtml(id)}" ${id === selectedLayout ? 'selected' : ''}>${escHtml(id)}</option>`
    ).join('');

    editor.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;max-width:680px;">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <input id="tpl-id" class="form-input" placeholder="template-id" value="${escHtml(t.id || '')}" ${isNew ? '' : 'readonly'} style="max-width:200px;${isNew ? '' : 'opacity:.6;'}">
                <input id="tpl-name" class="form-input" placeholder="Display name" value="${escHtml(t.name || '')}" style="flex:1;min-width:160px;">
                ${t.system ? '<span style="font-size:11px;color:#fbbf24;"><i class="fas fa-lock"></i> system</span>' : ''}
            </div>
            <input id="tpl-subject" class="form-input" placeholder="Subject" value="${escHtml(t.subject || '')}">
            <input id="tpl-heading" class="form-input" placeholder="Heading (large title in the email)" value="${escHtml(t.heading || '')}">
            <textarea id="tpl-body" class="form-input" placeholder="Body" rows="6" style="resize:vertical;font-family:inherit;">${escHtml(t.body || '')}</textarea>
            <input id="tpl-footer" class="form-input" placeholder="Footer note" value="${escHtml(t.footerNote || '')}">
            <div style="display:flex;gap:8px;align-items:center;">
                <label style="font-size:13px;color:#aaa;white-space:nowrap;">HTML Layout</label>
                <select id="tpl-layout" class="form-input" style="max-width:220px;">${layoutOptions}</select>
            </div>
            <div style="font-size:12px;color:#888;">Variables: ${vars}</div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="saveEmailTemplate()"><i class="fas fa-save"></i> Save</button>
                <button class="btn btn-secondary" onclick="previewEmailTemplate()"><i class="fas fa-eye"></i> Preview</button>
                ${(!isNew && !t.system) ? `<button class="btn btn-danger" onclick="deleteEmailTemplate('${escHtml(t.id)}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
        </div>`;
}

async function saveEmailTemplate() {
    const id = (document.getElementById('tpl-id')?.value || '').trim();
    if (!id) { showEmailResult(false, 'Template id is required.'); return; }
    const payload = {
        name:       document.getElementById('tpl-name')?.value || '',
        subject:    document.getElementById('tpl-subject')?.value || '',
        heading:    document.getElementById('tpl-heading')?.value || '',
        body:       document.getElementById('tpl-body')?.value || '',
        footerNote: document.getElementById('tpl-footer')?.value || '',
        layout:     document.getElementById('tpl-layout')?.value || 'default'
    };
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/templates/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Template saved.' : 'Failed to save.'));
        if (res.ok) { emailEditingId = id; await loadEmailTemplates(); editEmailTemplate(id); }
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

async function deleteEmailTemplate(id) {
    if (!confirm(`Delete template "${id}"? This cannot be undone.`)) return;
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Template deleted.' : 'Failed to delete.'));
        if (res.ok) {
            emailEditingId = null;
            document.getElementById('email-template-editor').innerHTML = '<div style="text-align:center;color:#666;padding:40px 20px;font-size:13px;">Select a template to edit, or create a new one.</div>';
            await loadEmailTemplates();
        }
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

// Preview the template currently open in the editor (uses unsaved field values).
async function previewEmailTemplate() {
    const overrides = {
        subject:    document.getElementById('tpl-subject')?.value || '',
        heading:    document.getElementById('tpl-heading')?.value || '',
        body:       document.getElementById('tpl-body')?.value || '',
        footerNote: document.getElementById('tpl-footer')?.value || '',
        layout:     document.getElementById('tpl-layout')?.value || 'default'
    };
    try {
        const res  = await secureFetch('/neodyme/api/dev/email/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: overrides })
        });
        const data = await res.json();
        if (!res.ok) { showEmailResult(false, apiError(data, 'Preview failed.')); return; }
        openEmailPreview(data.subject, data.html);
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function openEmailPreview(subject, html) {
    const modal = document.getElementById('email-preview-modal');
    const frame = document.getElementById('email-preview-frame');
    const subj  = document.getElementById('email-preview-subject');
    if (subj) subj.textContent = subject || '';
    if (frame) frame.srcdoc = html || '';
    if (modal) modal.style.display = 'flex';
}

function closeEmailPreview() {
    const modal = document.getElementById('email-preview-modal');
    const frame = document.getElementById('email-preview-frame');
    if (frame) frame.srcdoc = '';
    if (modal) modal.style.display = 'none';
}

// ---- HTML layouts CRUD ----

function renderEmailLayoutList() {
    const list = document.getElementById('email-layout-list');
    if (!list) return;
    if (emailLayoutsCache.length === 0) {
        list.innerHTML = '<div style="color:#666;font-size:12px;padding:8px;">No layouts.</div>';
        return;
    }
    list.innerHTML = emailLayoutsCache.map(id => {
        const active = id === emailLayoutEditingId ? ' active' : '';
        const badge = id === 'default' ? ' <i class="fas fa-lock" style="font-size:10px;color:#fbbf24;" title="Default layout"></i>' : '';
        return `<button class="content-nav-item${active}" onclick="editEmailLayout('${escHtml(id)}')">
            <i class="fas fa-code"></i> ${escHtml(id)}${badge}
        </button>`;
    }).join('');
}

function newEmailLayout() {
    emailLayoutEditingId = null;
    renderEmailLayoutEditor({ id: '', html: '', isDefault: false }, true);
    renderEmailLayoutList();
}

async function editEmailLayout(id) {
    try {
        const res  = await fetch(`/neodyme/api/dev/email/layouts/${encodeURIComponent(id)}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load layout'));
        emailLayoutEditingId = id;
        renderEmailLayoutEditor(data.layout, false);
        renderEmailLayoutList();
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function renderEmailLayoutEditor(layout, isNew) {
    const editor = document.getElementById('email-layout-editor');
    if (!editor) return;
    editor.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <input id="layout-id" class="form-input" placeholder="layout-id" value="${escHtml(layout.id || '')}" ${isNew ? '' : 'readonly'} style="max-width:220px;${isNew ? '' : 'opacity:.6;'}">
                ${layout.isDefault ? '<span style="font-size:11px;color:#fbbf24;"><i class="fas fa-lock"></i> default</span>' : ''}
            </div>
            <p style="font-size:12px;color:#888;margin:0;">Slots filled at render: <code>{{subject}}</code> <code>{{serverName}}</code> <code>{{heading}}</code> <code>{{body}}</code> <code>{{footerNote}}</code></p>
            <textarea id="layout-html" class="form-input" rows="16" style="resize:vertical;font-family:monospace;font-size:12px;white-space:pre;">${escHtml(layout.html || '')}</textarea>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="saveEmailLayout()"><i class="fas fa-save"></i> Save</button>
                <button class="btn btn-secondary" onclick="previewEmailLayout()"><i class="fas fa-eye"></i> Preview</button>
                ${(!isNew && !layout.isDefault) ? `<button class="btn btn-danger" onclick="deleteEmailLayout('${escHtml(layout.id)}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
        </div>`;
}

async function saveEmailLayout() {
    const id   = (document.getElementById('layout-id')?.value || '').trim();
    const html = document.getElementById('layout-html')?.value || '';
    if (!id) { showEmailResult(false, 'Layout id is required.'); return; }
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/layouts/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html })
        });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Layout saved.' : 'Failed to save.'));
        if (res.ok) { emailLayoutEditingId = id; await loadEmailLayouts(); renderEmailLayoutList(); editEmailLayout(id); }
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

async function deleteEmailLayout(id) {
    if (!confirm(`Delete layout "${id}"? Templates using it will fall back to "default".`)) return;
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/layouts/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Layout deleted.' : 'Failed to delete.'));
        if (res.ok) {
            emailLayoutEditingId = null;
            document.getElementById('email-layout-editor').innerHTML = '<div style="text-align:center;color:#666;padding:40px 20px;font-size:13px;">Select a layout to edit, or create a new one.</div>';
            await loadEmailLayouts();
            renderEmailLayoutList();
        }
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

// Preview a layout with sample content (wrapped via an ad-hoc template).
async function previewEmailLayout() {
    const html = document.getElementById('layout-html')?.value || '';
    // Render sample content through this raw layout by interpolating client-side
    // would duplicate server logic; instead, temporarily save is avoided by
    // sending an ad-hoc template whose html field is the layout with sample slots.
    const sample = html
        .replace(/\{\{\s*heading\s*\}\}/g, 'Sample heading')
        .replace(/\{\{\s*body\s*\}\}/g, 'This is sample body text to preview the layout.')
        .replace(/\{\{\s*footerNote\s*\}\}/g, 'Sample footer note.');
    try {
        const res  = await secureFetch('/neodyme/api/dev/email/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: { subject: 'Layout preview', html: sample } })
        });
        const data = await res.json();
        if (!res.ok) { showEmailResult(false, apiError(data, 'Preview failed.')); return; }
        openEmailPreview(data.subject, data.html);
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

// ---- Email automation rules ----

async function loadEmailAutomations() {
    const list = document.getElementById('email-automation-list');
    try {
        const res  = await fetch('/neodyme/api/dev/email/automations', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed to load automations'));
        emailAutomationsCache = data.rules || [];
        emailTriggersCache = data.triggers || [];
        renderEmailAutomationList();
    } catch (err) {
        if (list) list.innerHTML = `<span style="color:#ef4444;font-size:13px;">Error: ${escHtml(err.message)}</span>`;
    }
}

function renderEmailAutomationList() {
    const list = document.getElementById('email-automation-list');
    if (!list) return;
    if (emailAutomationsCache.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#666;padding:24px;font-size:13px;">No automation rules.</div>';
        return;
    }
    list.innerHTML = emailAutomationsCache.map(r => {
        const status = r.enabled
            ? '<span style="color:#4ade80;font-size:12px;"><i class="fas fa-circle" style="font-size:8px;"></i> enabled</span>'
            : '<span style="color:#777;font-size:12px;"><i class="fas fa-circle" style="font-size:8px;"></i> disabled</span>';
        const cronInfo = r.trigger === 'cron' ? ` <code style="font-size:11px;">${escHtml(r.cron || '')}</code>` : '';
        return `<div class="user-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:8px;margin-bottom:6px;">
            <div>
                <div style="font-weight:600;color:#ddd;">${escHtml(r.name || r.id)} ${status}</div>
                <div style="font-size:11px;color:#888;">on <code style="font-size:11px;">${escHtml(r.trigger)}</code>${cronInfo} &rarr; template <code style="font-size:11px;">${escHtml(r.templateId)}</code></div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-sm btn-secondary" onclick="editEmailAutomation('${escHtml(r.id)}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteEmailAutomation('${escHtml(r.id)}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function newEmailAutomation() {
    renderEmailAutomationEditor({ id: '', name: '', trigger: 'account.created', templateId: '', enabled: false, cron: '', selection: { roleLevels: [0], verifiedOnly: true } }, true);
}

function editEmailAutomation(id) {
    const rule = emailAutomationsCache.find(r => r.id === id);
    if (rule) renderEmailAutomationEditor(rule, false);
}

function renderEmailAutomationEditor(r, isNew) {
    const editor = document.getElementById('email-automation-editor');
    if (!editor) return;

    const triggerOptions = (emailTriggersCache.length ? emailTriggersCache : ['account.created', 'maintenance.on', 'maintenance.off', 'cron'])
        .map(t => `<option value="${escHtml(t)}" ${t === r.trigger ? 'selected' : ''}>${escHtml(t)}</option>`).join('');
    const templateOptions = emailTemplatesCache.map(t =>
        `<option value="${escHtml(t.id)}" ${t.id === r.templateId ? 'selected' : ''}>${escHtml(t.name || t.id)}</option>`).join('');
    const sel = r.selection || {};
    const roleChecks = [['0','Players'],['1','Moderators'],['2','Developers'],['3','Admins'],['4','Owners']].map(([v,label]) =>
        `<label style="font-weight:400;font-size:13px;"><input type="checkbox" class="auto-role-cb" value="${v}" ${(sel.roleLevels||[]).includes(Number(v)) ? 'checked' : ''}> ${label}</label>`).join(' ');

    editor.innerHTML = `
        <div class="config-category" style="display:flex;flex-direction:column;gap:12px;max-width:680px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <input id="auto-id" class="form-input" placeholder="rule-id" value="${escHtml(r.id || '')}" ${isNew ? '' : 'readonly'} style="max-width:200px;${isNew ? '' : 'opacity:.6;'}">
                <input id="auto-name" class="form-input" placeholder="Rule name" value="${escHtml(r.name || '')}" style="flex:1;min-width:160px;">
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <label style="font-size:13px;color:#aaa;">Trigger</label>
                <select id="auto-trigger" class="form-input" style="max-width:200px;" onchange="onAutoTriggerChange()">${triggerOptions}</select>
                <label style="font-size:13px;color:#aaa;">Template</label>
                <select id="auto-template" class="form-input" style="max-width:200px;">${templateOptions}</select>
            </div>
            <div id="auto-cron-row" style="display:${r.trigger === 'cron' ? 'flex' : 'none'};gap:10px;align-items:center;">
                <label style="font-size:13px;color:#aaa;">Cron</label>
                <input id="auto-cron" class="form-input" placeholder="0 9 * * 1  (every Monday 9am)" value="${escHtml(r.cron || '')}" style="max-width:260px;">
            </div>
            <div id="auto-selection-row" style="display:${r.trigger === 'account.created' ? 'none' : 'block'};">
                <div style="font-size:13px;color:#aaa;margin-bottom:6px;">Recipients (roles)</div>
                <div style="display:flex;flex-wrap:wrap;gap:12px;">${roleChecks}</div>
                <label style="font-weight:400;font-size:13px;display:block;margin-top:8px;"><input type="checkbox" id="auto-verified" ${sel.verifiedOnly ? 'checked' : ''}> Verified emails only</label>
            </div>
            <label style="font-weight:400;font-size:13px;"><input type="checkbox" id="auto-enabled" ${r.enabled ? 'checked' : ''}> Enabled</label>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="saveEmailAutomation()"><i class="fas fa-save"></i> Save</button>
            </div>
        </div>`;
}

function onAutoTriggerChange() {
    const trigger = document.getElementById('auto-trigger')?.value;
    document.getElementById('auto-cron-row').style.display = trigger === 'cron' ? 'flex' : 'none';
    document.getElementById('auto-selection-row').style.display = trigger === 'account.created' ? 'none' : 'block';
}

async function saveEmailAutomation() {
    const id = (document.getElementById('auto-id')?.value || '').trim();
    if (!id) { showEmailResult(false, 'Rule id is required.'); return; }
    const trigger = document.getElementById('auto-trigger')?.value;
    const payload = {
        name: document.getElementById('auto-name')?.value || '',
        trigger,
        templateId: document.getElementById('auto-template')?.value || '',
        enabled: document.getElementById('auto-enabled')?.checked === true,
        cron: document.getElementById('auto-cron')?.value || '',
        selection: {
            roleLevels: [...document.querySelectorAll('.auto-role-cb:checked')].map(cb => parseInt(cb.value, 10)),
            accountIds: [],
            verifiedOnly: document.getElementById('auto-verified')?.checked === true
        }
    };
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/automations/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Automation saved.' : 'Failed to save.'));
        if (res.ok) { document.getElementById('email-automation-editor').innerHTML = ''; loadEmailAutomations(); }
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

async function deleteEmailAutomation(id) {
    if (!confirm(`Delete automation "${id}"?`)) return;
    try {
        const res  = await secureFetch(`/neodyme/api/dev/email/automations/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        showEmailResult(res.ok, apiError(data, res.ok ? 'Automation deleted.' : 'Failed to delete.'));
        if (res.ok) loadEmailAutomations();
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function populateSendTemplates() {
    const sel = document.getElementById('email-send-template');
    if (!sel) return;
    sel.innerHTML = emailTemplatesCache.map(t =>
        `<option value="${escHtml(t.id)}">${escHtml(t.name || t.id)}</option>`
    ).join('');
}

function collectSendSelection() {
    const roleLevels = [...document.querySelectorAll('.email-role-cb:checked')].map(cb => parseInt(cb.value, 10));
    const accountIds = (document.getElementById('email-send-accounts')?.value || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    const verifiedOnly = document.getElementById('email-send-verified')?.checked === true;
    return { roleLevels, accountIds, verifiedOnly };
}

async function previewEmailCount() {
    const sel = collectSendSelection();
    if (sel.roleLevels.length === 0 && sel.accountIds.length === 0) {
        document.getElementById('email-send-count').textContent = 'Select at least one role or account.';
        return;
    }
    try {
        const res  = await secureFetch('/neodyme/api/dev/email/preview-count', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sel)
        });
        const data = await res.json();
        const el = document.getElementById('email-send-count');
        if (res.ok) el.textContent = `${data.count} recipient(s) match.`;
        else el.textContent = apiError(data, 'Failed to count.');
    } catch (err) {
        document.getElementById('email-send-count').textContent = err.message;
    }
}

async function confirmSendCampaign() {
    const templateId = document.getElementById('email-send-template')?.value;
    const sel = collectSendSelection();
    if (!templateId) { showEmailResult(false, 'Pick a template.'); return; }
    if (sel.roleLevels.length === 0 && sel.accountIds.length === 0) {
        showEmailResult(false, 'Select at least one role or account.');
        return;
    }

    // Resolve the exact count first so the confirmation is honest.
    let count = '?';
    try {
        const pre  = await secureFetch('/neodyme/api/dev/email/preview-count', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sel)
        });
        const pdata = await pre.json();
        if (pre.ok) count = pdata.count;
    } catch (_) {}

    if (count === 0) { showEmailResult(false, 'No recipients match the selection.'); return; }
    if (!confirm(`Send "${templateId}" to ${count} recipient(s)? This cannot be undone.`)) return;

    try {
        const res  = await secureFetch('/neodyme/api/dev/email/campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId, ...sel })
        });
        const data = await res.json();
        if (!res.ok) { showEmailResult(false, apiError(data, 'Failed to start.')); return; }
        showEmailResult(true, `Sending to ${data.job.total} recipient(s)...`);
        trackCampaign(data.job.id);
    } catch (err) {
        showEmailResult(false, err.message);
    }
}

function trackCampaign(jobId) {
    const progress = document.getElementById('email-campaign-progress');
    const bar      = document.getElementById('email-progress-bar');
    const label    = document.getElementById('email-progress-label');
    const stats    = document.getElementById('email-progress-stats');
    if (progress) progress.style.display = 'block';
    if (emailCampaignPoll) clearInterval(emailCampaignPoll);

    emailCampaignPoll = setInterval(async () => {
        try {
            const res  = await fetch(`/neodyme/api/dev/email/campaign/${encodeURIComponent(jobId)}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok || !data.job) return;
            const j = data.job;
            const done = j.sent + j.failed;
            const pct  = j.total ? Math.round((done / j.total) * 100) : 0;
            if (bar)   bar.style.width = pct + '%';
            if (stats) stats.textContent = `${done}/${j.total} (${j.sent} sent, ${j.failed} failed)`;
            if (label) label.textContent = j.status === 'running' ? 'Sending...' : `Finished (${j.status})`;

            if (j.status !== 'running') {
                clearInterval(emailCampaignPoll);
                emailCampaignPoll = null;
                showEmailResult(j.failed === 0, `Campaign ${j.status}: ${j.sent} sent, ${j.failed} failed.`);
            }
        } catch (_) {}
    }, 1500);
}

// Full dev tab router (handles overview / config / stats / logs / plugins / commands / system / monitor).
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
    if (tab === 'content')   { if (typeof resetContentEditor === 'function') resetContentEditor(); }
    if (tab === 'assets')    { if (typeof showAssetsView === 'function') showAssetsView('upload'); }
    if (tab === 'shop')      { if (typeof shopEditorInit === 'function') shopEditorInit(); }
    if (tab === 'email')     { if (typeof initEmailTab    === 'function') initEmailTab();    }
    if (tab === 'stats')     { if (typeof loadDevStats    === 'function') loadDevStats();    }
    if (tab === 'logs')      loadConsoleLogs('dev-logs-output');
    if (tab === 'plugins')   loadAdminPlugins('dev-plugins-list');
    if (tab === 'commands')  loadDevCommands();
    if (tab === 'system')  { loadSystemTests(); loadSystemChart(24); }
    if (tab === 'monitor')   { buildCharts(); loadXmppClients(); }

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
        const res  = await fetch('/neodyme/api/dev/config', { credentials: 'include' });
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
        const res  = await secureFetch(`/neodyme/api/dev/config/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        const data = await res.json();
        showAdminCmdResult(res.ok, apiError(data, res.ok ? 'Saved' : 'Failed to save'));
        if (res.ok) loadAdminWebSettings();
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
            { label: 'Dry Run JSON->Mongo',   cmd: 'data migrate json mongodb --dry-run', args: [] },
            { label: 'Migrate JSON->Mongo',   cmd: 'data migrate json mongodb --confirm', args: [{id:'dcmd-mongo-uri',ph:'--uri=mongodb://host:port/db'}] },
            { label: 'Migrate Mongo->JSON',   cmd: 'data migrate mongodb json --confirm', args: [{id:'dcmd-mongo-uri2',ph:'--uri=mongodb://host:port/db (opt.)'}] },
            { label: 'Migrate+Switch J->M',   cmd: 'data migrate json mongodb --confirm --switch', args: [{id:'dcmd-mongo-uri3',ph:'--uri=mongodb://host:port/db'}], danger: false },
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

function renderCheckRow(c) {
    const color = STATUS_COLORS[c.status] || '#888';
    const icon  = STATUS_ICONS[c.status]  || 'fa-question-circle';
    const label = STATUS_LABELS[c.status]  || c.status;
    const ms    = c.status === 'disabled' ? 'N/A' : `${c.ms}ms`;
    return `<div style="display:flex;align-items:center;gap:12px;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:8px;padding:12px 16px;margin-bottom:6px;">
        <i class="fas ${icon}" style="font-size:18px;color:${color};min-width:20px;text-align:center;"></i>
        <div style="flex:1;min-width:0;">
            <strong style="color:#fff;font-size:14px;">${escHtml(c.name)}</strong>
            <span style="color:#888;font-size:12px;margin-left:8px;">${escHtml(c.message || '')}</span>
        </div>
        <span style="color:#666;font-size:11px;min-width:36px;text-align:right;">${ms}</span>
        <span style="color:${color};font-size:12px;font-weight:600;min-width:90px;text-align:right;">${label}</span>
    </div>`;
}

function populateFunctionalGroups(groups) {
    const select = document.getElementById('system-functional-group');
    if (!select) return;
    const current = select.value;
    const options = groups.filter(g => g.functional > 0)
        .map(g => `<option value="${escHtml(g.name)}">${escHtml(g.name)} (${g.functional})</option>`);
    select.innerHTML = `<option value="">All groups</option>${options.join('')}`;
    select.value = current;
}

async function runFunctionalTests() {
    const btn    = document.getElementById('system-functional-btn');
    const listEl = document.getElementById('system-functional-list');
    const group  = (document.getElementById('system-functional-group') || {}).value || '';
    if (!btn || !listEl) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
    listEl.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Running functional tests on throwaway accounts...</div>';

    try {
        const res  = await secureFetch('/neodyme/api/dev/system/tests/functional', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Functional tests failed'));

        const { results, summary } = data;
        const color = summary.failing === 0 ? '#10b981' : '#ef4444';
        listEl.innerHTML = `<div style="color:${color};font-size:13px;font-weight:600;margin-bottom:8px;">
                ${summary.passing}/${summary.total} passed${summary.failing ? `, ${summary.failing} failed` : ''}${summary.degraded ? `, ${summary.degraded} with warnings` : ''}
            </div>${results.map(renderCheckRow).join('')}`;
    } catch (err) {
        listEl.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">${escHtml(err.message)}</p></div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-vial"></i> Run functional tests';
    }
}

async function loadSystemTests() {
    const checksEl = document.getElementById('system-checks-list');
    if (!checksEl) return;

    try {
        const res  = await fetch('/neodyme/api/dev/system/tests', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Failed'));

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

        checksEl.innerHTML = checks.map(renderCheckRow).join('');
        populateFunctionalGroups(data.groups || []);

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

async function loadXmppClients() {
    const container = document.getElementById('xmpp-clients-list');
    if (!container) return;

    try {
        const res  = await fetch('/neodyme/api/admin/xmpp-clients', { credentials: 'include' });
        const data = await res.json();

        if (!res.ok) {
            container.innerHTML = `<span style="color:#ef4444;font-size:13px;">Error: ${escHtml(apiError(data, 'Failed to load'))}</span>`;
            return;
        }

        if (data.count === 0) {
            container.innerHTML = '<span style="color:#6b7280;font-size:13px;">No players connected via XMPP.</span>';
            return;
        }

        const mucMap = {};
        (data.mucs || []).forEach(m => { mucMap[m.name] = m.members; });

        const rows = data.clients.map(c => {
            const statusDot  = c.away
                ? '<span style="color:#f59e0b;" title="Away">&#9679;</span>'
                : '<span style="color:#10b981;" title="Online">&#9679;</span>';
            const mucsLabel  = c.joinedMUCs && c.joinedMUCs.length > 0
                ? c.joinedMUCs.map(r => `<span style="font-size:10px;background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);border-radius:4px;padding:1px 6px;">${escHtml(r)}</span>`).join(' ')
                : '<span style="color:#444;font-size:11px;">-</span>';

            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:7px;margin-bottom:5px;">
                <span style="font-size:14px;">${statusDot}</span>
                <div style="flex:1;min-width:0;">
                    <span style="color:#e5e5e5;font-size:13px;font-weight:600;">${escHtml(c.displayName)}</span>
                    <span style="color:#555;font-size:11px;margin-left:8px;font-family:monospace;">${escHtml(c.accountId)}</span>
                    <div style="margin-top:3px;">${mucsLabel}</div>
                </div>
            </div>`;
        }).join('');

        const mucSummary = data.mucs && data.mucs.length > 0
            ? `<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;">${data.mucs.map(m =>
                `<span style="font-size:11px;color:#888;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:5px;padding:2px 8px;">
                    ${escHtml(m.name)}: ${m.members} member${m.members !== 1 ? 's' : ''}
                </span>`).join('')}</div>`
            : '';

        container.innerHTML = mucSummary + rows;
    } catch (err) {
        container.innerHTML = `<span style="color:#ef4444;font-size:13px;">${escHtml(err.message)}</span>`;
    }
}

async function loadSystemChart(hours) {
    // Highlight active range button
    [24, 48, 72].forEach(h => {
        const b = document.getElementById(`sys-chart-${h}`);
        if (b) b.style.opacity = h === hours ? '1' : '0.5';
    });

    try {
        const res  = await fetch(`/neodyme/api/dev/system/history?hours=${hours}`, { credentials: 'include' });
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


// ---- Permissions tab (particular authorizations per account) ----

let permUserId = null;

async function loadPermissionUsers() {
    const list = document.getElementById('perm-users');
    if (!list) return;

    list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    const search = document.getElementById('perm-search').value.trim();

    try {
        const res = await fetch(`${API}/admin/permissions/users?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Could not load accounts'));

        if (!data.users.length) {
            list.innerHTML = '<div class="empty-state"><p>No account found.</p></div>';
            return;
        }

        list.innerHTML = data.users.map(user => `
            <div style="display:flex;align-items:center;gap:12px;background:var(--surface-2, #1b1726);border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:8px;padding:10px 14px;margin-bottom:6px;">
                <div style="flex:1;min-width:0;">
                    <strong style="color:#fff;">${escHtml(user.displayName)}</strong>
                    <span style="color:#888;font-size:12px;margin-left:8px;">${escHtml(user.role)}</span>
                </div>
                <span style="font-size:12px;color:#10b981;">${user.grants.length ? `+${user.grants.length} allowed` : ''}</span>
                <span style="font-size:12px;color:#ef4444;">${user.denies.length ? `-${user.denies.length} denied` : ''}</span>
                <button class="btn btn-sm btn-secondary" data-id="${escHtml(user.accountId)}" onclick="openPermissionEditor(this.dataset.id)"><i class="fas fa-user-lock"></i> Edit</button>
            </div>`).join('');
    } catch (err) {
        list.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">${escHtml(err.message)}</p></div>`;
    }
}

function permissionState(cap) {
    return cap.granted ? 'allow' : (cap.denied ? 'deny' : 'default');
}

async function openPermissionEditor(accountId) {
    const editor = document.getElementById('perm-editor');
    permUserId = accountId;
    editor.style.display = 'block';
    editor.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch(`${API}/admin/permissions/users/${encodeURIComponent(accountId)}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(apiError(data, 'Could not load this account'));
        renderPermissionEditor(data.user);
    } catch (err) {
        editor.innerHTML = `<div class="empty-state"><p style="color:#ef4444;">${escHtml(err.message)}</p></div>`;
    }
}

function renderPermissionEditor(user) {
    const editor = document.getElementById('perm-editor');
    const isOwner = user.roleLevel >= 4;
    const groups = { moderation: 'Moderation', developer: 'Developer', admin: 'Admin' };

    const sections = Object.entries(groups).map(([group, title]) => {
        const rows = user.capabilities.filter(c => c.group === group).map(cap => `
            <tr data-cap="${escHtml(cap.id)}" data-byrole="${cap.byRole}">
                <td style="padding:8px 10px;">${escHtml(cap.label)}<div style="color:#666;font-size:11px;">${escHtml(cap.id)}</div></td>
                <td style="padding:8px 10px;text-align:center;color:${cap.byRole ? '#10b981' : '#888'};">${cap.byRole ? 'Yes' : 'No'}</td>
                <td style="padding:8px 10px;">
                    <select class="form-input" style="width:auto;padding:4px 8px;font-size:12px;" ${isOwner ? 'disabled' : ''} onchange="updatePermissionRow(this)">
                        <option value="default" ${permissionState(cap) === 'default' ? 'selected' : ''}>Role default</option>
                        <option value="allow" ${permissionState(cap) === 'allow' ? 'selected' : ''}>Allow</option>
                        <option value="deny" ${permissionState(cap) === 'deny' ? 'selected' : ''}>Deny</option>
                    </select>
                </td>
                <td class="perm-effective" style="padding:8px 10px;text-align:center;font-weight:600;color:${cap.allowed ? '#10b981' : '#ef4444'};">${cap.allowed ? 'Can' : 'Cannot'}</td>
            </tr>`).join('');

        return `<h4 style="color:#aaa;font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:1px;">${title}</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead><tr style="color:#888;text-align:left;"><th style="padding:6px 10px;">Permission</th><th style="padding:6px 10px;text-align:center;">By role</th><th style="padding:6px 10px;">Adjustment</th><th style="padding:6px 10px;text-align:center;">Result</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }).join('');

    editor.innerHTML = `
        <div style="background:var(--surface-2, #1b1726);border:1px solid var(--border-strong, rgba(255,255,255,0.14));border-radius:10px;padding:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0;color:#fff;">${escHtml(user.displayName)}</h3>
                    <div style="color:#888;font-size:12px;margin-top:2px;">Role: ${escHtml(user.role)}${isOwner ? ' (owners always have every permission)' : ''}</div>
                </div>
                <div style="display:flex;gap:8px;">
                    ${isOwner ? '' : `<button class="btn btn-primary" onclick="savePermissions()"><i class="fas fa-save"></i> Save</button>
                    <button class="btn btn-secondary" onclick="resetPermissions()"><i class="fas fa-undo"></i> Back to role default</button>`}
                    <button class="btn btn-secondary" onclick="closePermissionEditor()">Close</button>
                </div>
            </div>
            <div id="perm-result" class="alert" style="display:none;margin-top:12px;"></div>
            ${sections}
        </div>`;
}

function updatePermissionRow(select) {
    const row = select.closest('tr');
    const byRole = row.dataset.byrole === 'true';
    const allowed = select.value === 'allow' || (select.value === 'default' && byRole);
    const cell = row.querySelector('.perm-effective');
    cell.textContent = allowed ? 'Can' : 'Cannot';
    cell.style.color = allowed ? '#10b981' : '#ef4444';
}

function showPermissionResult(ok, message) {
    const el = document.getElementById('perm-result');
    if (!el) return;
    el.className = `alert ${ok ? 'alert-success' : 'alert-danger'}`;
    el.style.display = 'block';
    el.textContent = message;
}

async function sendPermissionChange(method, body) {
    const res = await secureFetch(`${API}/admin/permissions/users/${encodeURIComponent(permUserId)}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(apiError(data, 'Could not save'));

    renderPermissionEditor(data.user);
    showPermissionResult(true, data.message);
    loadPermissionUsers();
}

async function savePermissions() {
    const grants = [];
    const denies = [];
    document.querySelectorAll('#perm-editor tr[data-cap]').forEach(row => {
        const value = row.querySelector('select').value;
        if (value === 'allow') grants.push(row.dataset.cap);
        if (value === 'deny') denies.push(row.dataset.cap);
    });

    try {
        await sendPermissionChange('PUT', { grants, denies });
    } catch (err) {
        showPermissionResult(false, err.message);
    }
}

async function resetPermissions() {
    if (!confirm('Remove every adjustment on this account?')) return;
    try {
        await sendPermissionChange('DELETE');
    } catch (err) {
        showPermissionResult(false, err.message);
    }
}

function closePermissionEditor() {
    permUserId = null;
    const editor = document.getElementById('perm-editor');
    editor.style.display = 'none';
    editor.innerHTML = '';
}
