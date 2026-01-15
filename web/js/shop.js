const API_ENDPOINT = '/api/shop';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const DOM = {
    dailyContainer: document.getElementById('daily-items'),
    featuredContainer: document.getElementById('featured-items'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    purchaseModal: document.getElementById('purchase-modal'),
};

let shopData = null;
let shopState = null;
let refreshTimerId = null;
let autoRefreshIntervalId = null;
let currentUser = null;
let userOwnedItems = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    currentUser = await checkAuth();
    await loadUserOwnedItems();
    await loadShopData();
    await loadVbucksBalance();
    setupEventListeners();
    startTimers();
}

function setupEventListeners() {
    DOM.filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            DOM.filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filterItems(this.dataset.filter);
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === DOM.purchaseModal) {
            closeModal('purchase-modal');
        }
    });
}

function startTimers() {
    updateRefreshTimer();
    refreshTimerId = setInterval(updateRefreshTimer, 1000);
    autoRefreshIntervalId = setInterval(() => {
        loadShopData();
        loadVbucksBalance();
        loadUserOwnedItems();
    }, REFRESH_INTERVAL_MS);
}

async function loadUserOwnedItems() {
    if (!currentUser) {
        userOwnedItems = [];
        return;
    }

    try {
        const response = await fetch('/api/user/purchases', {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            userOwnedItems = [];
            if (data.purchases && Array.isArray(data.purchases)) {
                data.purchases.forEach(purchase => {
                    if (purchase.lootResult && Array.isArray(purchase.lootResult)) {
                        purchase.lootResult.forEach(loot => {
                            if (loot.itemType) {
                                userOwnedItems.push(loot.itemType.toLowerCase());
                            }
                        });
                    }
                });
            }
        }
    } catch (error) {
        console.error('Failed to load owned items:', error);
        userOwnedItems = [];
    }
}

function isItemOwned(item) {
    if (!item.itemGrants || item.itemGrants.length === 0) return false;

    return item.itemGrants.some(grant => {
        const grantLower = (grant.templateId || grant).toLowerCase();
        return userOwnedItems.some(owned => owned === grantLower || grantLower.includes(owned) || owned.includes(grantLower));
    });
}

async function loadShopData() {
    try {
        showAlert('Loading shop data...', 'info');

        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            shopData = data;

            try {
                const stateResponse = await fetch('/api/shop/status');
                if (stateResponse.ok) {
                    const stateData = await stateResponse.json();
                    shopState = stateData;
                }
            } catch (e) {
                console.warn('Could not fetch shop state:', e);
            }

            displayShopItems(shopData.shop);
            updateShopInfo(shopData.metadata);

            setTimeout(() => {
                document.getElementById('alert').style.display = 'none';
            }, 2000);
        } else {
            throw new Error(data.message || 'Failed to load shop data');
        }
    } catch (error) {
        console.error('Error loading shop data:', error);
        showAlert('Failed to load shop data. Please try again later.', 'error');
        displayErrorState();
    }
}

function displayShopItems(shopSections) {
    if (!shopSections) {
        displayErrorState();
        return;
    }

    const dailyItems = [];
    const featuredItems = [];

    Object.entries(shopSections).forEach(([key, item]) => {
        if (key.startsWith('//')) return;

        const itemData = { key, ...item };

        if (key.startsWith('daily')) {
            dailyItems.push(itemData);
        } else if (key.startsWith('featured')) {
            featuredItems.push(itemData);
        }
    });

    displayItemsGrid(DOM.dailyContainer, dailyItems);
    displayItemsGrid(DOM.featuredContainer, featuredItems);
}

function displayItemsGrid(containerElement, items) {
    if (!items || items.length === 0) {
        containerElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-store-slash"></i>
                <p>No items available in this section.</p>
            </div>
        `;
        return;
    }

    containerElement.innerHTML = items.map(createItemCard).join('');
}

function createItemCard(item) {
    const { key, price = 0 } = item;
    const itemName = getItemName(item);
    const itemType = getItemType(item);
    const itemRarity = getItemRarity(item);
    const itemImage = getItemImage(item);
    const category = key.startsWith('daily') ? 'daily' : 'featured';
    const owned = isItemOwned(item);

    return `
        <div class="shop-item ${owned ? 'owned' : ''}" data-category="${category}" data-rarity="${itemRarity.toLowerCase()}">
            ${owned ? '<div class="owned-badge"><i class="fas fa-check-circle"></i> OWNED</div>' : ''}
            <div class="item-image ${itemRarity}">
                ${itemImage ? `<img src="${itemImage}" alt="${itemName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
                <div class="item-placeholder" ${itemImage ? 'style="display:none;"' : ''}>
                    <i class="fas fa-image"></i>
                </div>
                <div class="item-overlay">
                    ${owned ? `
                        <button class="btn btn-secondary btn-small" disabled>
                            <i class="fas fa-check"></i>
                            Already Owned
                        </button>
                    ` : `
                        <button class="btn btn-primary btn-small" onclick="purchaseItem('${key}')">
                            <i class="fas fa-shopping-cart"></i>
                            ${price.toLocaleString()} V-Bucks
                        </button>
                    `}
                </div>
            </div>
            <div class="item-info">
                <h4 class="item-name">${itemName}</h4>
                <div class="item-meta">
                    <span class="item-type">${itemType}</span>
                    <span class="item-rarity ${itemRarity}">${itemRarity}</span>
                </div>
                <div class="item-price">
                    <i class="fas fa-coins"></i>
                    ${price.toLocaleString()} V-Bucks
                </div>
            </div>
        </div>
    `;
}

function getItemName(item) {
    if (item.meta && item.meta.name && item.meta.name !== 'Unknown') {
        return item.meta.name;
    }

    if (item.itemGrants && item.itemGrants.length > 0) {
        const grant = item.itemGrants[0];
        const parts = grant.split(':');
        const name = parts.length > 1 ? parts.pop() : grant;

        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    return item.key
        .replace(/(daily|featured)\s*/i, '')
        .replace(/_/g, ' ')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function getItemType(item) {
    if (item.meta && item.meta.type && item.meta.type !== 'Unknown') {
        return item.meta.type;
    }

    if (item.itemGrants && item.itemGrants.length > 0) {
        const grant = item.itemGrants[0];
        if (grant.includes('Character') || grant.includes('CID_')) return 'Outfit';
        if (grant.includes('Backpack') || grant.includes('BID_')) return 'Back Bling';
        if (grant.includes('Pickaxe') || grant.includes('Harvesting')) return 'Pickaxe';
        if (grant.includes('Glider')) return 'Glider';
        if (grant.includes('Dance') || grant.includes('EID_')) return 'Emote';
        if (grant.includes('Wrap')) return 'Wrap';
        if (grant.includes('MusicPack')) return 'Music';
        if (grant.includes('LoadingScreen')) return 'Loading Screen';
    }
    return 'Cosmetic';
}

function getItemRarity(item) {
    if (item.meta && item.meta.rarity && item.meta.rarity !== 'Unknown') {
        return item.meta.rarity;
    }

    const rarityMap = {
        'legendary': 'Legendary',
        'epic': 'Epic',
        'rare': 'Rare',
        'uncommon': 'Uncommon',
        'common': 'Common',
    };

    const itemKeyLower = item.key.toLowerCase();
    for (const [key, value] of Object.entries(rarityMap)) {
        if (itemKeyLower.includes(key)) {
            return value;
        }
    }

    const price = item.price || 0;
    if (price >= 2000) return 'Legendary';
    if (price >= 1500) return 'Epic';
    if (price >= 1200) return 'Rare';
    if (price >= 800) return 'Uncommon';
    return 'Common';
}

function getItemImage(item) {
    if (item.meta && item.meta.image) {
        return item.meta.image;
    }

    if (shopState && item.key) {
        const stateImage = shopState[item.key];
        if (stateImage && typeof stateImage === 'string' && stateImage.startsWith('http')) {
            return stateImage;
        }
    }

    return null;
}

async function loadVbucksBalance() {
    try {
        const user = await checkAuth();
        if (!user) {
            document.getElementById('vbucks-amount').textContent = '0';
            return;
        }

        const response = await fetch('/api/user/vbucks', {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('vbucks-amount').textContent = data.balance.toLocaleString();
        } else {
            document.getElementById('vbucks-amount').textContent = '0';
        }
    } catch (error) {
        console.error('Failed to load V-Bucks balance:', error);
        document.getElementById('vbucks-amount').textContent = '0';
    }
}

function filterItems(filter) {
    const items = document.querySelectorAll('.shop-item');

    items.forEach(item => {
        item.style.display = (filter === 'all' || item.dataset.category === filter) ? 'block' : 'none';
    });
}

function updateShopInfo(metadata) {
    if (!metadata) return;

    const lastRotation = metadata.lastRotation ? formatDate(metadata.lastRotation) : '--';
    const nextRotation = metadata.nextRotation ? formatDate(metadata.nextRotation) : '--';

    document.getElementById('last-rotation').textContent = lastRotation;
    document.getElementById('next-rotation').textContent = nextRotation;
    document.getElementById('total-items').textContent = metadata.totalItems || '--';

    document.getElementById('shop-status-text').textContent = 'SHOP STATUS: ONLINE';
}

function updateRefreshTimer() {
    const timerElement = document.getElementById('shop-refresh-timer');
    if (timerElement) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timerElement.textContent = `Refreshing in: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function formatDate(dateString) {
    if (!dateString) return '--';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Date formatting error:', error);
        return dateString;
    }
}

async function purchaseItem(itemKey) {
    if (!currentUser) {
        showAlert('Please sign in to purchase items.', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }

    const item = shopData?.shop?.[itemKey];

    if (!item) {
        showAlert('Item not found', 'error');
        return;
    }

    if (isItemOwned(item)) {
        showAlert('You already own this item!', 'error');
        return;
    }

    const itemName = getItemName(item);
    const itemPrice = item.price || 0;

    if (!confirm(`Purchase "${itemName}" for ${itemPrice.toLocaleString()} V-Bucks?`)) {
        return;
    }

    showAlert(`Purchasing ${itemName}...`, 'info');

    try {
        const response = await fetch('/api/purchase/item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ itemKey })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert(`Successfully purchased ${itemName}!`, 'success');
            await loadVbucksBalance();
            await loadUserOwnedItems();
            displayShopItems(shopData.shop);
        } else {
            if (data.message && (data.message.includes('already own') || data.message.includes('already owned'))) {
                showAlert('You already own this item!', 'error');
                await loadUserOwnedItems();
                displayShopItems(shopData.shop);
            } else {
                throw new Error(data.message || 'Purchase failed');
            }
        }
    } catch (error) {
        console.error('Purchase error:', error);
        showAlert(error.message || 'Failed to purchase item. Please try again.', 'error');
    }
}

function displayErrorState() {
    const containers = [DOM.dailyContainer, DOM.featuredContainer];

    containers.forEach(container => {
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Failed to load items</p>
                    <button class="btn btn-secondary" onclick="loadShopData()">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
        }
    });
}

function showAlert(message, type = 'info') {
    const alert = document.getElementById('alert');
    const alertMessage = document.getElementById('alert-message');

    if (!alert || !alertMessage) return;

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.style.display = 'flex';

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

function showPurchaseVbucks() {
    if (DOM.purchaseModal) {
        DOM.purchaseModal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

window.addEventListener('beforeunload', () => {
    if (refreshTimerId) clearInterval(refreshTimerId);
    if (autoRefreshIntervalId) clearInterval(autoRefreshIntervalId);
});

const ownedItemStyles = document.createElement('style');
ownedItemStyles.textContent = `
    .shop-item.owned {
        opacity: 0.7;
        position: relative;
    }
    .shop-item.owned .item-overlay {
        background: rgba(0, 0, 0, 0.7);
    }
    .owned-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #00cc44, #00aa33);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 2px 8px rgba(0, 204, 68, 0.4);
    }
    .item-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 200px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #555;
        font-size: 48px;
    }
    .item-price {
        margin-top: 8px;
        color: #ffd700;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .shop-item .item-image img {
        width: 100%;
        height: 200px;
        object-fit: cover;
    }
`;
document.head.appendChild(ownedItemStyles);
