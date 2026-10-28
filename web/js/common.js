const API = '/neodyme/api';

// --- Server status (footer/header dot) ---

async function checkServerStatus() {
    try {
        const response = await fetch(`${API}/status`, { credentials: 'include' });
        const data = await response.json();

        document.querySelectorAll('.server-status').forEach(element => {
            const statusDot = element.querySelector('.status-dot');
            const statusText = element.querySelector('span');
            if (data.online) {
                if (statusDot) statusDot.style.background = '#4CAF50';
                if (statusText) statusText.textContent = 'SERVER STATUS: ONLINE';
            } else {
                if (statusDot) statusDot.style.background = '#f44336';
                if (statusText) statusText.textContent = 'SERVER STATUS: OFFLINE';
            }
        });
    } catch {
        // Status is non-critical; stay silent if unreachable.
    }
}

// --- Alerts / loading ---

function showAlert(message, type = 'info', elementId = 'alert') {
    const alert = document.getElementById(elementId);
    if (!alert) return;

    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 5000);
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner"></div> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.getAttribute('data-original-text');
    }
}

// --- Auth ---

async function checkAuth() {
    try {
        const response = await fetch(`${API}/auth/verify`, { credentials: 'include' });
        if (!response.ok) throw new Error('Not authenticated');

        const data = await response.json();
        if (data.user) {
            sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
        }
        return data.user;
    } catch {
        sessionStorage.removeItem('neodyme_user');
        if (/^\/(dashboard|account)/.test(window.location.pathname)) {
            window.location.href = '/login';
        }
        return null;
    }
}

// Single logout used everywhere (header's handleLogout delegates to this).
async function logout() {
    try {
        await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
        // Logout is best-effort; clear local state regardless.
    }
    sessionStorage.removeItem('neodyme_user');
    window.location.href = '/login';
}

function getStoredUser() {
    try {
        return JSON.parse(sessionStorage.getItem('neodyme_user'));
    } catch {
        return null;
    }
}

// --- CSRF + secure fetch ---
// One CSRF token per mutating request: fetched fresh, then discarded (single-use
// on the server). This is the only authenticated-mutation path on the frontend.

let csrfToken = null;

async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
        const response = await fetch(`${API}/auth/csrf-token`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrfToken;
            return csrfToken;
        }
    } catch {
        // fall through
    }
    return null;
}

async function secureFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const token = await getCsrfToken();
        if (token) {
            options.headers = { ...options.headers, 'X-CSRF-Token': token };
        }
        csrfToken = null; // consumed server-side; force a fresh one next time
    }

    options.credentials = 'include';
    return fetch(url, options);
}

// Pulls the human-readable message from a unified API response, with a fallback.
// The backend shape is { success, error: MACHINE_CODE, message: 'human text' };
// always display `message`, never the machine `error` code.
function apiError(data, fallback = 'Something went wrong.') {
    return (data && data.message) || fallback;
}

// --- Formatting / escaping ---

// Escape via DOM textContent (handles all entities). Returns '' for falsy input.
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Lightweight escape for the 3 dangerous chars (console log colorizing, etc.).
// Game content points at the Epic CDN host, which only resolves from the game
// (through the host redirection). The website shows those images from this server.
const GAME_ASSET_HOST = 'fortnite-public-service-prod11.ol.epicgames.com';

function siteAssetUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.hostname === GAME_ASSET_HOST) return window.location.origin + parsed.pathname + parsed.search;
    } catch {
        // not a valid address, shown as is
    }
    return url;
}

function markImageBroken(img) {
    const name = decodeURIComponent((img.src.split('?')[0].split('/').pop()) || 'image');
    img.parentElement.classList.add('broken');
    img.parentElement.title = `Could not load ${name} from ${new URL(img.src).host}`;
}

function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Relative date formatter ("Just now", "3 minutes ago", ...).
function formatDate(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Seconds -> "Xh Ym".
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

document.addEventListener('DOMContentLoaded', () => {
    checkServerStatus();
    setInterval(checkServerStatus, 30000);
});
