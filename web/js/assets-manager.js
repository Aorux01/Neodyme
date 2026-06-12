const ASSETS_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

let AM_state = {
    view: 'upload',
    folders: null,    // cache of GET /dev/assets/local
    onlineEntries: null,
};

function showAssetsView(view) {
    AM_state.view = view;
    document.querySelectorAll('.assets-nav-item').forEach(el => el.classList.toggle('active', el.dataset.assetsView === view));

    const body = document.getElementById('assets-view-body');
    if (!body) return;

    if (view === 'upload')      renderUploadView(body);
    else if (view === 'local')  renderLocalView(body);
    else if (view === 'online') renderOnlineView(body);
}

function renderUploadView(body) {
    body.innerHTML = `
        <header class="content-editor-header">
            <div>
                <h3><i class="fas fa-upload"></i> Upload image</h3>
                <p class="muted">Drop or pick a PNG, JPEG, WebP, or GIF (max 5 MB). The file lands in <code>public/images/uploaded-images/</code> and is registered in <code>assets-index.json</code>.</p>
            </div>
        </header>

        <div id="asset-dropzone" class="asset-dropzone">
            <i class="fas fa-cloud-upload-alt asset-dropzone-icon"></i>
            <p><strong>Drop an image here</strong> or click to choose</p>
            <p class="muted">PNG · JPG · WebP · GIF - up to 5 MB</p>
            <input type="file" id="asset-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">
        </div>

        <div id="asset-upload-result" class="asset-upload-result" style="display:none"></div>

        <div id="asset-recent" class="asset-recent" style="margin-top:1.5rem">
            <h4><i class="fas fa-history"></i> Recently uploaded</h4>
            <div id="asset-recent-grid" class="asset-grid"></div>
        </div>
    `;

    const dz = document.getElementById('asset-dropzone');
    const fi = document.getElementById('asset-file-input');
    dz.onclick = () => fi.click();
    fi.onchange = () => fi.files && fi.files[0] && uploadAssetFile(fi.files[0]);

    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); dz.classList.add('is-dragover');
    }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove('is-dragover');
    }));
    dz.addEventListener('drop', (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) uploadAssetFile(f);
    });

    loadRecentUploads();
}

async function loadRecentUploads() {
    const grid = document.getElementById('asset-recent-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
    try {
        const res = await fetch('/neodyme/api/dev/assets/local', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) { grid.innerHTML = `<p class="muted">${apiError(data, 'Failed to load.')}</p>`; return; }
        AM_state.folders = data.folders || {};
        const uploaded = AM_state.folders['uploaded-images'] || [];
        if (uploaded.length === 0) {
            grid.innerHTML = `<p class="muted">No uploads yet.</p>`;
            return;
        }
        grid.innerHTML = uploaded.slice(0, 12).map(renderAssetCard).join('');
        wireAssetCardActions(grid);
    } catch (err) {
        grid.innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

async function uploadAssetFile(file) {
    const resultEl = document.getElementById('asset-upload-result');
    if (!resultEl) return;

    if (file.size > ASSETS_MAX_UPLOAD_BYTES) {
        resultEl.style.display = '';
        resultEl.className = 'asset-upload-result is-error';
        resultEl.textContent = `File too large (${formatBytes(file.size)}). Max 5 MB.`;
        return;
    }

    resultEl.style.display = '';
    resultEl.className = 'asset-upload-result is-pending';
    resultEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading ${escapeHtmlAM(file.name)}...`;

    const form = new FormData();
    form.append('file', file);

    try {
        const res = await secureFetch('/neodyme/api/dev/assets/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok || !data.success) {
            resultEl.className = 'asset-upload-result is-error';
            resultEl.textContent = apiError(data, 'Upload failed.');
            return;
        }
        resultEl.className = 'asset-upload-result is-ok';
        resultEl.innerHTML = `
            <div class="upload-success-card">
                <img src="${escapeAttrAM(data.file.url)}" alt="">
                <div>
                    <p><strong>Uploaded</strong> - ${formatBytes(data.file.size)}</p>
                    <p class="muted">${escapeHtmlAM(data.file.path)}</p>
                    <div class="upload-success-actions">
                        <input type="text" class="form-input" value="${escapeAttrAM(data.file.url)}" readonly id="upload-url-out">
                        <button class="btn btn-sm btn-primary" onclick="copyToClipboard('${escapeAttrAM(data.file.url)}', this)"><i class="fas fa-copy"></i> Copy URL</button>
                    </div>
                </div>
            </div>
        `;
        AM_state.folders = null;
        loadRecentUploads();
    } catch (err) {
        resultEl.className = 'asset-upload-result is-error';
        resultEl.textContent = err.message;
    }
}

async function renderLocalView(body) {
    body.innerHTML = `
        <header class="content-editor-header">
            <div>
                <h3><i class="fas fa-hdd"></i> Browse local images</h3>
                <p class="muted">Files physically present under <code>public/images/</code>, grouped by folder.</p>
            </div>
            <div class="content-editor-actions">
                <button class="btn btn-secondary" onclick="showAssetsView('local')"><i class="fas fa-sync"></i> Refresh</button>
            </div>
        </header>
        <div id="assets-local-body"><div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>
    `;

    try {
        const res = await fetch('/neodyme/api/dev/assets/local', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) {
            document.getElementById('assets-local-body').innerHTML = `<p class="content-editor-error">${apiError(data, 'Failed to load.')}</p>`;
            return;
        }
        AM_state.folders = data.folders || {};
        const folders = Object.keys(AM_state.folders).sort();
        if (folders.length === 0) {
            document.getElementById('assets-local-body').innerHTML = `<p class="muted">No local images.</p>`;
            return;
        }
        document.getElementById('assets-local-body').innerHTML = folders.map(folder => {
            const files = AM_state.folders[folder] || [];
            return `
                <details class="asset-folder" ${folder === 'uploaded-images' ? 'open' : ''}>
                    <summary>
                        <i class="fas fa-folder"></i> <strong>${escapeHtmlAM(folder)}</strong>
                        <span class="muted">(${files.length} file${files.length>1?'s':''})</span>
                    </summary>
                    <div class="asset-grid">${files.map(renderAssetCard).join('')}</div>
                </details>`;
        }).join('');
        wireAssetCardActions(document.getElementById('assets-local-body'));
    } catch (err) {
        document.getElementById('assets-local-body').innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

async function renderOnlineView(body) {
    body.innerHTML = `
        <header class="content-editor-header">
            <div>
                <h3><i class="fas fa-globe"></i> Browse online assets</h3>
                <p class="muted">Entries in <code>assets-index.json</code> with a CDN URL that are not present on disk. Served by 302 redirect in online mode.</p>
            </div>
            <div class="content-editor-actions">
                <button class="btn btn-secondary" onclick="showAssetsView('online')"><i class="fas fa-sync"></i> Refresh</button>
            </div>
        </header>
        <div id="assets-online-body"><div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>
    `;

    try {
        const res = await fetch('/neodyme/api/dev/assets/online', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) {
            document.getElementById('assets-online-body').innerHTML = `<p class="content-editor-error">${apiError(data, 'Failed to load.')}</p>`;
            return;
        }
        AM_state.onlineEntries = data.entries || [];
        if (AM_state.onlineEntries.length === 0) {
            document.getElementById('assets-online-body').innerHTML = `<p class="muted">No online-only assets.</p>`;
            return;
        }
        document.getElementById('assets-online-body').innerHTML = `
            <div class="asset-grid">${AM_state.onlineEntries.map(renderOnlineCard).join('')}</div>
        `;
        wireAssetCardActions(document.getElementById('assets-online-body'));
    } catch (err) {
        document.getElementById('assets-online-body').innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

function renderAssetCard(file) {
    const isUploaded = file.path.startsWith('images/uploaded-images/');
    return `
        <div class="asset-card" data-url="${escapeAttrAM(file.url)}" data-path="${escapeAttrAM(file.path)}">
            <div class="asset-thumb"><img src="${escapeAttrAM(file.url)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('broken');this.parentElement.title='Image not loading: '+this.src"></div>
            <div class="asset-meta">
                <div class="asset-path" title="${escapeAttrAM(file.path)}">${escapeHtmlAM(file.path.split('/').pop())}</div>
                <div class="asset-info muted">${formatBytes(file.size)} · ${file.ext || ''}</div>
                <div class="asset-actions">
                    <button class="btn btn-sm btn-secondary" data-act="copy" title="Copy URL"><i class="fas fa-copy"></i></button>
                    ${isUploaded ? `<button class="btn btn-sm btn-danger" data-act="delete" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
        </div>`;
}

function renderOnlineCard(entry) {
    return `
        <div class="asset-card" data-url="${escapeAttrAM(entry.cdn)}" data-path="${escapeAttrAM(entry.path)}">
            <div class="asset-thumb"><img src="${escapeAttrAM(entry.cdn)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('broken');this.parentElement.title='Image not loading: '+this.src"></div>
            <div class="asset-meta">
                <div class="asset-path" title="${escapeAttrAM(entry.path)}">${escapeHtmlAM(entry.path.split('/').pop())}</div>
                <div class="asset-info muted">${entry.size ? formatBytes(entry.size) : 'remote'} · ${(entry.tags || []).join(', ')}</div>
                <div class="asset-actions">
                    <button class="btn btn-sm btn-secondary" data-act="copy" title="Copy CDN URL"><i class="fas fa-copy"></i></button>
                </div>
            </div>
        </div>`;
}

function wireAssetCardActions(container) {
    container.querySelectorAll('.asset-card').forEach(card => {
        const url  = card.dataset.url;
        const path = card.dataset.path;
        card.querySelectorAll('[data-act]').forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                const act = btn.dataset.act;
                if (act === 'copy') copyToClipboard(url, btn);
                else if (act === 'delete') {
                    if (!confirm(`Delete this image?\n\n${path}\n\nThe file will be removed from disk and from assets-index.json.`)) return;
                    const fname = path.split('/').pop();
                    try {
                        const res = await secureFetch(`/neodyme/api/dev/assets/uploaded/${encodeURIComponent(fname)}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!res.ok || !data.success) {
                            if (typeof showAlert === 'function') showAlert(apiError(data, 'Delete failed.'), 'error');
                            return;
                        }
                        card.remove();
                        AM_state.folders = null;
                        if (typeof showAlert === 'function') showAlert('Deleted.', 'success');
                    } catch (err) {
                        if (typeof showAlert === 'function') showAlert(err.message, 'error');
                    }
                }
            };
        });
    });
}

function openImagePicker(onPick) {
    const overlay = document.createElement('div');
    overlay.className = 'image-picker-overlay';
    overlay.innerHTML = `
        <div class="image-picker-modal">
            <header>
                <h3><i class="fas fa-images"></i> Pick an image</h3>
                <input type="text" id="ip-search" class="form-input" placeholder="Filter by filename...">
                <button class="btn btn-secondary" id="ip-close" title="Close"><i class="fas fa-times"></i></button>
            </header>
            <div class="image-picker-body" id="ip-body">
                <div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>
            </div>
            <footer>
                <button class="btn btn-secondary" id="ip-upload-here"><i class="fas fa-upload"></i> Upload new...</button>
                <input type="file" id="ip-file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">
                <button class="btn btn-secondary" id="ip-cancel">Cancel</button>
            </footer>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#ip-close').onclick   = close;
    overlay.querySelector('#ip-cancel').onclick  = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const fileInput = overlay.querySelector('#ip-file');
    overlay.querySelector('#ip-upload-here').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const body = overlay.querySelector('#ip-body');
        body.innerHTML = `<div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Uploading...</div>`;
        const form = new FormData();
        form.append('file', f);
        try {
            const res = await secureFetch('/neodyme/api/dev/assets/upload', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok || !data.success) {
                body.innerHTML = `<p class="content-editor-error">${apiError(data, 'Upload failed.')}</p>`;
                return;
            }
            if (typeof onPick === 'function') onPick(data.file.url);
            close();
        } catch (err) {
            body.innerHTML = `<p class="content-editor-error">${err.message}</p>`;
        }
    };

    loadImagePickerGrid(overlay, onPick);

    overlay.querySelector('#ip-search').oninput = (e) => filterImagePicker(overlay, e.target.value);
}

async function loadImagePickerGrid(overlay, onPick) {
    const body = overlay.querySelector('#ip-body');
    try {
        const res = await fetch('/neodyme/api/dev/assets/local', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) { body.innerHTML = `<p class="content-editor-error">${apiError(data, 'Failed to load.')}</p>`; return; }
        const folders = data.folders || {};
        const folderNames = Object.keys(folders).sort();
        if (folderNames.length === 0) {
            body.innerHTML = `<p class="muted">No local images. Use the Upload button to add one.</p>`;
            return;
        }
        body.innerHTML = folderNames.map(folder => {
            const files = folders[folder] || [];
            return `
                <details class="asset-folder" ${folder === 'uploaded-images' ? 'open' : ''}>
                    <summary><i class="fas fa-folder"></i> <strong>${escapeHtmlAM(folder)}</strong> <span class="muted">(${files.length})</span></summary>
                    <div class="asset-grid">${files.map(f => `
                        <div class="asset-card asset-card-picker" data-url="${escapeAttrAM(f.url)}" data-name="${escapeAttrAM(f.path.split('/').pop().toLowerCase())}">
                            <div class="asset-thumb"><img src="${escapeAttrAM(f.url)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('broken');this.parentElement.title='Image not loading: '+this.src"></div>
                            <div class="asset-meta">
                                <div class="asset-path" title="${escapeAttrAM(f.path)}">${escapeHtmlAM(f.path.split('/').pop())}</div>
                                <div class="asset-info muted">${formatBytes(f.size)}</div>
                            </div>
                        </div>`).join('')}</div>
                </details>`;
        }).join('');
        body.querySelectorAll('.asset-card-picker').forEach(card => {
            card.onclick = () => {
                if (typeof onPick === 'function') onPick(card.dataset.url);
                overlay.remove();
            };
        });
    } catch (err) {
        body.innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

function filterImagePicker(overlay, query) {
    const q = (query || '').trim().toLowerCase();
    overlay.querySelectorAll('.asset-card-picker').forEach(card => {
        if (!q) { card.style.display = ''; return; }
        const name = card.dataset.name || '';
        card.style.display = name.includes(q) ? '' : 'none';
    });
}

function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function copyToClipboard(text, btn) {
    const cb = navigator.clipboard;
    const done = () => {
        if (!btn) return;
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = old; }, 1200);
    };
    if (cb && cb.writeText) cb.writeText(text).then(done);
    else {
        const tmp = document.createElement('textarea');
        tmp.value = text; document.body.appendChild(tmp); tmp.select();
        try { document.execCommand('copy'); done(); } catch (_) {}
        tmp.remove();
    }
}

function escapeHtmlAM(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttrAM(s) { return escapeHtmlAM(s); }

window.showAssetsView   = showAssetsView;
window.openImagePicker  = openImagePicker;
window.copyToClipboard  = copyToClipboard;
