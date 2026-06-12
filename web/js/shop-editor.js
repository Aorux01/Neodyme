const SE_state = {
    slots: null,           // [{slot, category, index, entry, displayName, tileSize}]
    categories: null,
    cosmeticsCache: null,  // last search result
};

async function shopEditorInit() {
    const grid = document.getElementById('shop-editor-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Loading shop layout...</div>`;
    try {
        const res = await fetch('/neodyme/api/dev/shop/layout', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) {
            grid.innerHTML = `<p class="content-editor-error">${apiError(data, 'Failed to load shop layout.')}</p>`;
            return;
        }
        SE_state.slots = data.slots;
        SE_state.categories = data.categories;
        renderShopGrid();
    } catch (err) {
        grid.innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

function renderShopGrid() {
    const grid = document.getElementById('shop-editor-grid');
    if (!grid || !SE_state.slots) return;

    const byCategory = {};
    for (const s of SE_state.slots) {
        if (!byCategory[s.category]) byCategory[s.category] = [];
        byCategory[s.category].push(s);
    }

    grid.innerHTML = Object.entries(byCategory).map(([cat, slots]) => `
        <section class="shop-category">
            <h4><i class="fas fa-store"></i> ${escapeHtmlSE(slots[0].displayName || cat)} <span class="muted">(${slots.length} slots)</span></h4>
            <div class="shop-slot-grid">
                ${slots.map(renderSlotCard).join('')}
            </div>
        </section>
    `).join('');

    grid.querySelectorAll('.shop-slot-card').forEach(card => {
        const slot = card.dataset.slot;
        card.querySelectorAll('[data-act]').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const act = btn.dataset.act;
                if (act === 'pick')      openCosmeticPicker(slot);
                else if (act === 'random') randomizeSlot(slot);
                else if (act === 'clear')  clearSlot(slot);
                else if (act === 'edit')   editSlotEntry(slot);
            };
        });
    });
}

function renderSlotCard(s) {
    const entry = s.entry;
    const grant = entry && entry.itemGrants && entry.itemGrants[0] || '';
    const cid = grant.split(':')[1] || '';
    const filled = !!entry;
    return `
        <div class="shop-slot-card ${filled ? 'is-filled' : 'is-empty'}" data-slot="${escapeAttrSE(s.slot)}">
            <div class="shop-slot-thumb">
                ${cid ? `<img src="https://fortnite-api.com/images/cosmetics/br/${escapeAttrSE(cid)}/icon.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
                <div class="shop-slot-placeholder" ${cid ? 'style="display:none"' : ''}>
                    <i class="fas fa-${filled ? 'box' : 'plus-circle'}"></i>
                </div>
            </div>
            <div class="shop-slot-info">
                <div class="shop-slot-label">${escapeHtmlSE(s.slot)}</div>
                <div class="shop-slot-cid" title="${escapeAttrSE(grant)}">${escapeHtmlSE(cid || '(empty)')}</div>
                <div class="shop-slot-price">${entry ? `${entry.price} <i class="fas fa-coins"></i>` : ''}</div>
            </div>
            <div class="shop-slot-actions">
                <button class="btn btn-sm btn-primary" data-act="pick" title="Pick a cosmetic"><i class="fas fa-search"></i></button>
                <button class="btn btn-sm btn-secondary" data-act="random" title="Random pick"><i class="fas fa-dice"></i></button>
                ${filled ? `<button class="btn btn-sm btn-secondary" data-act="edit" title="Edit price/grant"><i class="fas fa-pen"></i></button>` : ''}
                ${filled ? `<button class="btn btn-sm btn-danger" data-act="clear" title="Clear slot"><i class="fas fa-eraser"></i></button>` : ''}
            </div>
        </div>`;
}

async function randomizeSlot(slot) {
    try {
        const res = await secureFetch(`/neodyme/api/dev/shop/randomize/${encodeURIComponent(slot)}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.success) { showAlert(apiError(data, 'Randomize failed.'), 'error'); return; }
        showAlert(`${slot}: ${data.picked.name} (${data.picked.rarity})`, 'success');
        await shopEditorInit();
    } catch (err) { showAlert(err.message, 'error'); }
}

async function clearSlot(slot) {
    if (!confirm(`Clear ${slot}? The next auto-rotation will fill it back.`)) return;
    try {
        const res = await secureFetch(`/neodyme/api/dev/shop/slot/${encodeURIComponent(slot)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) { showAlert(apiError(data, 'Clear failed.'), 'error'); return; }
        showAlert(`Slot ${slot} cleared.`, 'success');
        await shopEditorInit();
    } catch (err) { showAlert(err.message, 'error'); }
}

function editSlotEntry(slot) {
    const s = SE_state.slots.find(x => x.slot === slot);
    if (!s || !s.entry) return;
    const grant = (s.entry.itemGrants && s.entry.itemGrants[0]) || '';
    const newGrant = prompt('Item grant (format: AthenaCharacter:CID_xxx):', grant);
    if (newGrant === null) return;
    if (!/^[A-Za-z]+:[A-Za-z0-9_-]+$/.test(newGrant.trim())) { showAlert('Invalid grant format.', 'error'); return; }
    const newPriceStr = prompt('Price (V-Bucks):', String(s.entry.price || 1500));
    if (newPriceStr === null) return;
    const newPrice = parseInt(newPriceStr, 10);
    if (!Number.isFinite(newPrice) || newPrice < 0) { showAlert('Price must be a non-negative integer.', 'error'); return; }
    submitSlot(slot, [newGrant.trim()], newPrice);
}

async function submitSlot(slot, itemGrants, price) {
    try {
        const res = await secureFetch(`/neodyme/api/dev/shop/slot/${encodeURIComponent(slot)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemGrants, price })
        });
        const data = await res.json();
        if (!res.ok || !data.success) { showAlert(apiError(data, 'Update failed.'), 'error'); return; }
        showAlert(`Slot ${slot} updated.`, 'success');
        await shopEditorInit();
    } catch (err) { showAlert(err.message, 'error'); }
}

async function shopEditorRandomizeAll() {
    const empty = (SE_state.slots || []).filter(s => !s.entry);
    if (empty.length === 0) { showAlert('No empty slot to randomize.', 'info'); return; }
    if (!confirm(`Randomize ${empty.length} empty slot(s)?`)) return;
    for (const s of empty) {
        try {
            await secureFetch(`/neodyme/api/dev/shop/randomize/${encodeURIComponent(s.slot)}`, { method: 'POST' });
        } catch (_) {}
    }
    showAlert(`${empty.length} slot(s) randomized.`, 'success');
    await shopEditorInit();
}

function shopEditorRefresh() { shopEditorInit(); }

function openCosmeticPicker(slot) {
    const overlay = document.createElement('div');
    overlay.className = 'image-picker-overlay';
    overlay.innerHTML = `
        <div class="image-picker-modal cosmetic-picker-modal">
            <header>
                <h3><i class="fas fa-search"></i> Pick a cosmetic for <code>${escapeHtmlSE(slot)}</code></h3>
                <input type="text" id="cp-search" class="form-input" placeholder="Search by name or CID (e.g. 'CID_001' or 'rare')...">
                <button class="btn btn-secondary" id="cp-close"><i class="fas fa-times"></i></button>
            </header>
            <div class="image-picker-body" id="cp-body">
                <p class="muted" style="padding:1rem">Type to search the cosmetic catalog.</p>
            </div>
            <footer>
                <button class="btn btn-secondary" id="cp-cancel">Cancel</button>
            </footer>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#cp-close').onclick  = close;
    overlay.querySelector('#cp-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const input = overlay.querySelector('#cp-search');
    input.focus();
    let timer = null;
    input.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => searchCosmetics(input.value, overlay, slot), 250);
    };
    // initial load - show 60 items (no filter)
    searchCosmetics('', overlay, slot);
}

async function searchCosmetics(query, overlay, slot) {
    const body = overlay.querySelector('#cp-body');
    body.innerHTML = `<div class="asset-grid-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
    try {
        const url = `/neodyme/api/dev/shop/cosmetics?limit=80&q=${encodeURIComponent(query || '')}`;
        const res = await fetch(url, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) { body.innerHTML = `<p class="content-editor-error">${apiError(data, 'Search failed.')}</p>`; return; }
        if (data.items.length === 0) { body.innerHTML = `<p class="muted" style="padding:1rem">No match.</p>`; return; }
        body.innerHTML = `
            <p class="muted" style="margin:0 0 0.5rem">${data.returned} / ${data.total} results</p>
            <div class="cosmetic-grid">${data.items.map(renderCosmeticCard).join('')}</div>
        `;
        body.querySelectorAll('.cosmetic-card').forEach(card => {
            card.onclick = () => pickCosmetic(card.dataset, slot, overlay);
        });
    } catch (err) {
        body.innerHTML = `<p class="content-editor-error">${err.message}</p>`;
    }
}

function renderCosmeticCard(item) {
    const rarity = (item.rarity || 'common').toLowerCase();
    return `
        <div class="cosmetic-card rarity-${escapeAttrSE(rarity)}"
            data-id="${escapeAttrSE(item.id)}"
            data-name="${escapeAttrSE(item.name || '')}"
            data-type="${escapeAttrSE(item.type || '')}"
            data-rarity="${escapeAttrSE(rarity)}"
            data-image="${escapeAttrSE(item.image || '')}"
            title="${escapeAttrSE(item.id)} · ${escapeAttrSE(item.type || '')} · ${escapeAttrSE(rarity)}">
            <div class="cosmetic-thumb">${item.image ? `<img src="${escapeAttrSE(item.image)}" alt="" loading="lazy">` : ''}</div>
            <div class="cosmetic-meta">
                <div class="cosmetic-name">${escapeHtmlSE(item.name || item.id)}</div>
                <div class="cosmetic-info muted">${escapeHtmlSE(item.type || '')} · S${item.backendValue || '?'}</div>
            </div>
        </div>`;
}

function pickCosmetic(d, slot, overlay) {
    // type prefix mapping matches the backend; price defaults from rarity
    const TYPE_PREFIX = {
        outfit: 'AthenaCharacter', backpack: 'AthenaBackpack', pickaxe: 'AthenaPickaxe',
        glider: 'AthenaGlider', emote: 'AthenaDance', wrap: 'AthenaItemWrap',
        contrail: 'AthenaSkyDiveContrail', music: 'AthenaMusicPack',
        loadingscreen: 'AthenaLoadingScreen', spray: 'AthenaDance', toy: 'AthenaDance', emoji: 'AthenaDance'
    };
    const prefix = TYPE_PREFIX[(d.type || '').toLowerCase()] || 'AthenaCharacter';
    const priceTable = { legendary: 2000, epic: 1500, rare: 1200, uncommon: 800, common: 200 };
    const suggested = priceTable[d.rarity] || 1500;
    const priceStr = prompt(`Price for ${d.name || d.id} (V-Bucks):`, String(suggested));
    if (priceStr === null) return;
    const price = parseInt(priceStr, 10);
    if (!Number.isFinite(price) || price < 0) { showAlert('Invalid price.', 'error'); return; }
    overlay.remove();
    submitSlot(slot, [`${prefix}:${d.id}`], price);
}

function escapeHtmlSE(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttrSE(s) { return escapeHtmlSE(s); }

window.shopEditorInit          = shopEditorInit;
window.shopEditorRefresh       = shopEditorRefresh;
window.shopEditorRandomizeAll  = shopEditorRandomizeAll;
