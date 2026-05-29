// Neodyme - player dashboard logic (dashboard.html only).
// Staff logic lives in staff-panel.js / admin-panel.js on admin.html.
// Shared helpers (checkAuth, secureFetch, apiError, showAlert, escapeHtml, formatDate)
// come from common.js. All API calls target /neodyme/api/* (see `API` in common.js).

let currentUser = null;
let currentSection = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(user => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;
        updateUserInfo();
        loadUserRole(); // reveal the "Staff Panel" link if the user has staff access
    });
});

function updateUserInfo() {
    if (!currentUser) return;
    const displayName = currentUser.displayName || currentUser.username || currentUser.email;

    const set = (id, prop, value) => {
        const el = document.getElementById(id);
        if (el) el[prop] = value;
    };
    set('user-name', 'textContent', displayName);
    set('welcome-name', 'textContent', displayName);
    set('user-avatar', 'textContent', displayName.charAt(0).toUpperCase());
    set('profile-username', 'value', currentUser.username || '');
    set('profile-email', 'value', currentUser.email || '');
    set('profile-displayname', 'value', currentUser.displayName || '');
}

// --- User dropdown ---

function toggleDropdown() {
    document.getElementById('user-dropdown')?.classList.toggle('show');
}

document.addEventListener('click', (event) => {
    const userMenu = document.querySelector('.user-menu');
    if (userMenu && !userMenu.contains(event.target)) {
        document.getElementById('user-dropdown')?.classList.remove('show');
    }
});

// --- Profile / password / settings forms ---

document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('profile-username').value;
    const email = document.getElementById('profile-email').value;
    const displayName = document.getElementById('profile-displayname').value;

    try {
        const response = await secureFetch(`${API}/auth/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, displayName })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            updateUserInfo();
            showAlert('Profile updated successfully!', 'success');
        } else {
            showAlert(apiError(data, 'Failed to update profile'), 'error');
        }
    } catch (error) {
        console.error('Profile update error:', error);
        showAlert('An error occurred while updating your profile', 'error');
    }
});

document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
    }

    try {
        const response = await secureFetch(`${API}/auth/change-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await response.json();

        if (response.ok) {
            document.getElementById('password-form').reset();
            showAlert('Password changed successfully!', 'success');
        } else {
            showAlert(apiError(data, 'Failed to change password'), 'error');
        }
    } catch (error) {
        console.error('Password change error:', error);
        showAlert('An error occurred while changing your password', 'error');
    }
});

document.querySelector('.settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const language = document.getElementById('language').value;
    const region = document.getElementById('region').value;
    const showOnline = document.getElementById('show-online').checked;
    const allowFriendRequests = document.getElementById('allow-friend-requests').checked;
    const joinInProgress = document.getElementById('join-in-progress').checked;

    try {
        const response = await secureFetch(`${API}/user/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language, region,
                privacy: { showOnline, allowFriendRequests, joinInProgress }
            })
        });
        const data = await response.json();

        if (response.ok) {
            showAlert('Settings saved successfully!', 'success');
        } else {
            showAlert(apiError(data, 'Failed to save settings'), 'error');
        }
    } catch (error) {
        console.error('Settings update error:', error);
        showAlert('An error occurred while saving settings', 'error');
    }
});

// --- Delete account (requires password confirmation) ---

function confirmDeleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
    const password = prompt('Enter your password to permanently delete your account:');
    if (!password) return;
    deleteAccount(password);
}

async function deleteAccount(password) {
    try {
        const response = await secureFetch(`${API}/auth/account`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();

        if (response.ok) {
            showAlert('Account deleted successfully. Redirecting...', 'success');
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            showAlert(apiError(data, 'Failed to delete account'), 'error');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showAlert('An error occurred while deleting your account', 'error');
    }
}

// --- Friends ---

let _friendsData = { friends: [], incoming: [], outgoing: [] };

function showFriendsTab(tabName) {
    document.querySelectorAll('.friends-list').forEach(list => { list.style.display = 'none'; });
    document.querySelectorAll('.friends-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const list = document.getElementById('friends-' + tabName + '-list');
    if (list) list.style.display = 'block';
    if (event && event.target) event.target.classList.add('active');
}

async function loadFriends() {
    try {
        const response = await fetch(`${API}/user/friends`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(apiError(data));

        _friendsData = {
            friends: data.friends || [],
            incoming: data.incoming || [],
            outgoing: data.outgoing || []
        };
        renderFriends();
    } catch (error) {
        console.error('Failed to load friends:', error);
    }
}

function renderFriends() {
    const { friends, incoming, outgoing } = _friendsData;

    // Tab counts
    const allTab = document.querySelector('.friends-tabs .tab-btn:nth-child(2)');
    const pendingTab = document.querySelector('.friends-tabs .tab-btn:nth-child(3)');
    if (allTab) allTab.textContent = `All Friends (${friends.length})`;
    if (pendingTab) pendingTab.textContent = `Pending (${incoming.length + outgoing.length})`;

    const onlineEl = document.getElementById('friends-online');
    if (onlineEl) onlineEl.textContent = friends.filter(f => f.status === 'online').length;

    // Online list
    const online = friends.filter(f => f.status === 'online');
    renderFriendList('friends-online-list', online, 'No friends online',
        f => friendRow(f, true));

    // All friends
    renderFriendList('friends-all-list', friends, 'No friends added yet',
        f => friendRow(f, false));

    // Pending (incoming = can accept/reject; outgoing = sent)
    const pendingContainer = document.getElementById('friends-pending-list');
    if (pendingContainer) {
        if (incoming.length === 0 && outgoing.length === 0) {
            pendingContainer.innerHTML = emptyState('fa-clock', 'No pending friend requests');
        } else {
            let html = '';
            incoming.forEach(f => { html += pendingIncomingRow(f); });
            outgoing.forEach(f => { html += pendingOutgoingRow(f); });
            pendingContainer.innerHTML = html;
        }
    }
}

function emptyState(icon, text) {
    return `<div class="empty-state"><i class="fas ${icon}"></i><p>${text}</p></div>`;
}

function renderFriendList(containerId, list, emptyText, rowFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = list.length === 0
        ? emptyState('fa-users', emptyText)
        : list.map(rowFn).join('');
}

function friendRow(f, online) {
    return `
        <div class="friend-card">
            <div class="friend-avatar">${escapeHtml((f.displayName || '?').charAt(0).toUpperCase())}</div>
            <div class="friend-info">
                <span class="friend-name">${escapeHtml(f.displayName)}</span>
                <span class="friend-status ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeFriend('${f.accountId}', '${escapeHtml(f.displayName)}')">
                <i class="fas fa-user-minus"></i> Remove
            </button>
        </div>`;
}

function pendingIncomingRow(f) {
    return `
        <div class="friend-card">
            <div class="friend-avatar">${escapeHtml((f.displayName || '?').charAt(0).toUpperCase())}</div>
            <div class="friend-info">
                <span class="friend-name">${escapeHtml(f.displayName)}</span>
                <span class="friend-status">Wants to be your friend</span>
            </div>
            <button class="btn btn-sm btn-success" onclick="acceptFriend('${f.accountId}')"><i class="fas fa-check"></i> Accept</button>
            <button class="btn btn-sm btn-danger" onclick="rejectFriend('${f.accountId}')"><i class="fas fa-times"></i> Reject</button>
        </div>`;
}

function pendingOutgoingRow(f) {
    return `
        <div class="friend-card">
            <div class="friend-avatar">${escapeHtml((f.displayName || '?').charAt(0).toUpperCase())}</div>
            <div class="friend-info">
                <span class="friend-name">${escapeHtml(f.displayName)}</span>
                <span class="friend-status">Request sent</span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="rejectFriend('${f.accountId}')"><i class="fas fa-times"></i> Cancel</button>
        </div>`;
}

async function searchPlayers() {
    const query = document.getElementById('friend-search').value.trim();
    if (!query || query.length < 2) {
        showAlert('Please enter at least 2 characters to search', 'error');
        return;
    }

    try {
        const response = await fetch(`${API}/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(apiError(data));

        // Show results in the "all" tab area.
        document.querySelectorAll('.friends-list').forEach(list => { list.style.display = 'none'; });
        const container = document.getElementById('friends-all-list');
        container.style.display = 'block';

        if (!data.users || data.users.length === 0) {
            container.innerHTML = emptyState('fa-search', `No players found for "${escapeHtml(query)}"`);
            return;
        }

        const friendIds = new Set(_friendsData.friends.map(f => f.accountId));
        const outgoingIds = new Set(_friendsData.outgoing.map(f => f.accountId));

        container.innerHTML = data.users.map(u => {
            const already = friendIds.has(u.accountId);
            const sent = outgoingIds.has(u.accountId);
            const action = already
                ? '<span class="badge badge-success">Friend</span>'
                : sent
                    ? '<span class="badge badge-info">Request sent</span>'
                    : `<button class="btn btn-sm btn-primary" onclick="addFriend('${u.accountId}')"><i class="fas fa-user-plus"></i> Add</button>`;
            return `
                <div class="friend-card">
                    <div class="friend-avatar">${escapeHtml((u.displayName || '?').charAt(0).toUpperCase())}</div>
                    <div class="friend-info"><span class="friend-name">${escapeHtml(u.displayName)}</span></div>
                    ${action}
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Search error:', error);
        showAlert('Failed to search players', 'error');
    }
}

async function addFriend(accountId) {
    try {
        const response = await secureFetch(`${API}/user/friends/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Friend request sent!', 'success');
            await loadFriends();
        } else {
            showAlert(apiError(data, 'Failed to send friend request'), 'error');
        }
    } catch (error) {
        console.error('Add friend error:', error);
        showAlert('An error occurred', 'error');
    }
}

async function acceptFriend(accountId) {
    try {
        const response = await secureFetch(`${API}/user/friends/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Friend request accepted!', 'success');
            await loadFriends();
        } else {
            showAlert(apiError(data, 'Failed to accept request'), 'error');
        }
    } catch (error) {
        console.error('Accept friend error:', error);
        showAlert('An error occurred', 'error');
    }
}

async function rejectFriend(accountId) {
    try {
        const response = await secureFetch(`${API}/user/friends/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        const data = await response.json();
        if (response.ok) {
            await loadFriends();
        } else {
            showAlert(apiError(data, 'Failed to reject request'), 'error');
        }
    } catch (error) {
        console.error('Reject friend error:', error);
        showAlert('An error occurred', 'error');
    }
}

async function removeFriend(accountId, displayName) {
    if (!confirm(`Remove ${displayName} from your friends?`)) return;
    try {
        const response = await secureFetch(`${API}/user/friends/${accountId}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            showAlert('Friend removed', 'success');
            await loadFriends();
        } else {
            showAlert(apiError(data, 'Failed to remove friend'), 'error');
        }
    } catch (error) {
        console.error('Remove friend error:', error);
        showAlert('An error occurred', 'error');
    }
}

// --- Sessions ---

async function loadActiveSessions() {
    try {
        const response = await fetch(`${API}/sessions/active`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch sessions');
        const data = await response.json();
        displaySessions(data.sessions);
    } catch (error) {
        console.error('Failed to load sessions:', error);
        document.getElementById('sessions-list').innerHTML =
            '<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Failed to load sessions. Please try again.</div>';
    }
}

function displaySessions(sessions) {
    const sessionsList = document.getElementById('sessions-list');
    if (!sessions || sessions.length === 0) {
        sessionsList.innerHTML = '<div class="no-sessions"><i class="fas fa-info-circle"></i> No active sessions found</div>';
        return;
    }

    sessionsList.innerHTML = sessions.map(session => {
        const createdDate = new Date(session.createdAt);
        const lastActivityDate = session.lastActivity ? new Date(session.lastActivity) : null;
        const expiresDate = new Date(session.expiresAt);

        return `
            <div class="session-card ${session.isCurrent ? 'current-session' : ''}">
                <div class="session-header">
                    <div class="session-icon"><i class="fas fa-${session.isCurrent ? 'laptop' : 'mobile-alt'}"></i></div>
                    <div class="session-info">
                        <h4>${session.isCurrent ? 'Current Session' : 'Active Session'}</h4>
                        <p class="session-device">Device ID: ${session.deviceId || 'Unknown'}</p>
                    </div>
                    ${!session.isCurrent
                        ? `<button class="btn btn-sm btn-danger" onclick="terminateSession('${session.sessionId}')"><i class="fas fa-times"></i> Terminate</button>`
                        : '<span class="badge badge-success">Current</span>'}
                </div>
                <div class="session-details">
                    <div class="session-detail"><i class="fas fa-globe"></i><span>IP: ${session.ip || 'Unknown'} (Subnet: ${session.ipSubnet || 'Unknown'})</span></div>
                    <div class="session-detail"><i class="fas fa-clock"></i><span>Created: ${formatDate(createdDate)}</span></div>
                    ${lastActivityDate ? `<div class="session-detail"><i class="fas fa-heartbeat"></i><span>Last Activity: ${formatDate(lastActivityDate)}</span></div>` : ''}
                    <div class="session-detail"><i class="fas fa-hourglass-end"></i><span>Expires: ${formatDate(expiresDate)}</span></div>
                    ${session.hasRefreshToken ? '<div class="session-detail"><i class="fas fa-check-circle"></i><span>Has Refresh Token</span></div>' : ''}
                </div>
            </div>`;
    }).join('');
}

async function terminateSession(sessionId) {
    if (!confirm('Are you sure you want to terminate this session?')) return;
    try {
        const response = await secureFetch(`${API}/sessions/${sessionId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to terminate session');
        showAlert('Session terminated successfully', 'success');
        loadActiveSessions();
    } catch (error) {
        console.error('Failed to terminate session:', error);
        showAlert('Failed to terminate session. Please try again.', 'error');
    }
}

async function terminateAllSessions() {
    if (!confirm('This will log you out from ALL devices including this one. Are you sure?')) return;
    if (!confirm('You will need to log in again. Continue?')) return;
    try {
        const response = await secureFetch(`${API}/sessions/all`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to terminate all sessions');
        showAlert('All sessions terminated. Logging out...', 'success');
        setTimeout(() => { logout(); }, 2000);
    } catch (error) {
        console.error('Failed to terminate all sessions:', error);
        showAlert('Failed to terminate all sessions. Please try again.', 'error');
    }
}

// --- Staff link reveal ---

async function loadUserRole() {
    try {
        const response = await fetch(`${API}/user/role`, { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json();

        if (data.panels && (data.panels.moderation || data.panels.developer || data.panels.admin)) {
            const staffLink = document.getElementById('nav-staff-panel');
            const divider = document.getElementById('staff-divider');
            if (staffLink) staffLink.style.display = 'flex';
            if (divider) divider.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load user role:', error);
    }
}

// --- Creator code ---

async function loadCreatorCodeStatus() {
    try {
        const response = await fetch(`${API}/creator-code/me`, { credentials: 'include' });
        const data = await response.json();

        const statusEl = document.getElementById('creator-code-status');
        if (statusEl) statusEl.style.display = 'none';

        const show = (id, display) => {
            const el = document.getElementById(id);
            if (el) el.style.display = display;
        };

        if (data.hasCode && data.code) {
            show('creator-code-has-code', 'block');
            show('creator-code-pending', 'none');
            show('creator-code-request', 'none');
            document.getElementById('my-creator-code').textContent = data.code.code.toUpperCase();
            document.getElementById('creator-earnings').textContent = (data.code.totalEarnings || 0) + ' V-Bucks';
            document.getElementById('creator-uses').textContent = data.code.totalUses || 0;
        } else if (data.pendingRequest) {
            show('creator-code-has-code', 'none');
            show('creator-code-pending', 'block');
            show('creator-code-request', 'none');
            document.getElementById('pending-code-name').textContent = data.pendingRequest.requestedCode;
        } else {
            show('creator-code-has-code', 'none');
            show('creator-code-pending', 'none');
            show('creator-code-request', 'block');
        }
    } catch (error) {
        console.error('Failed to load creator code status:', error);
        const statusEl = document.getElementById('creator-code-status');
        if (statusEl) statusEl.innerHTML = '<div class="error-message">Failed to load creator code status</div>';
    }
}

document.getElementById('creator-code-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('creator-code-input').value.trim();
    const reason = document.getElementById('creator-code-reason').value.trim();
    if (!code) {
        showAlert('Please enter a creator code', 'error');
        return;
    }

    try {
        const response = await secureFetch(`${API}/creator-code/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, reason })
        });
        const data = await response.json();
        if (response.ok && data.success !== false) {
            showAlert('Creator code request submitted!', 'success');
            loadCreatorCodeStatus();
        } else {
            showAlert(apiError(data, 'Failed to submit request'), 'error');
        }
    } catch (error) {
        console.error('Creator code request error:', error);
        showAlert('An error occurred', 'error');
    }
});

async function deleteMyCreatorCode() {
    if (!confirm('Are you sure you want to delete your creator code? This action cannot be undone.')) return;
    try {
        const response = await secureFetch(`${API}/creator-code/me`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok && data.success !== false) {
            showAlert('Creator code deleted', 'success');
            loadCreatorCodeStatus();
        } else {
            showAlert(apiError(data, 'Failed to delete code'), 'error');
        }
    } catch (error) {
        console.error('Delete creator code error:', error);
        showAlert('An error occurred', 'error');
    }
}

// --- Support tickets ---

function showSupportTab(tabName) {
    document.querySelectorAll('.support-tab-content').forEach(tab => { tab.style.display = 'none'; });
    document.querySelectorAll('.support-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const target = document.getElementById('support-' + tabName);
    if (target) target.style.display = 'block';
    if (event && event.target) event.target.classList.add('active');

    if (tabName === 'my-tickets') loadMyTickets();
}

const TICKET_STATUS_CLASS = {
    open: 'badge-warning', in_progress: 'badge-info', resolved: 'badge-success', closed: 'badge-secondary'
};
const TICKET_PRIORITY_CLASS = { high: 'badge-danger', medium: 'badge-warning', low: 'badge-info' };

async function loadMyTickets() {
    try {
        const response = await fetch(`${API}/tickets/my`, { credentials: 'include' });
        const data = await response.json();
        const container = document.getElementById('my-tickets-list');

        if (!data.tickets || data.tickets.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>No tickets yet. Create one if you need help!</p></div>';
            return;
        }

        container.innerHTML = data.tickets.map(ticket => {
            const statusClass = TICKET_STATUS_CLASS[ticket.status] || 'badge-secondary';
            const priorityClass = TICKET_PRIORITY_CLASS[ticket.priority] || 'badge-info';
            return `
                <div class="ticket-card" onclick="viewPlayerTicket('${ticket.ticketId}')">
                    <div class="ticket-header">
                        <span class="ticket-subject">${escapeHtml(ticket.subject)}</span>
                        <span class="badge ${statusClass}">${ticket.status.replace('_', ' ')}</span>
                    </div>
                    <div class="ticket-meta">
                        <span><i class="fas fa-flag"></i> <span class="badge ${priorityClass}">${ticket.priority}</span></span>
                        <span><i class="fas fa-clock"></i> ${formatDate(new Date(ticket.createdAt))}</span>
                        <span><i class="fas fa-comments"></i> ${ticket.messages?.length || 0} messages</span>
                    </div>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Failed to load tickets:', error);
        document.getElementById('my-tickets-list').innerHTML = '<div class="error-message">Failed to load tickets</div>';
    }
}

async function viewPlayerTicket(ticketId) {
    try {
        const response = await fetch(`${API}/tickets/${ticketId}`, { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || data.success === false) {
            showAlert(apiError(data, 'Failed to load ticket'), 'error');
            return;
        }

        const ticket = data.ticket;
        document.querySelectorAll('.support-tab-content').forEach(tab => { tab.style.display = 'none'; });
        document.getElementById('support-ticket-detail').style.display = 'block';

        const statusClass = TICKET_STATUS_CLASS[ticket.status] || 'badge-secondary';

        let html = `
            <div class="ticket-detail-header">
                <h3>${escapeHtml(ticket.subject)}</h3>
                <span class="badge ${statusClass}">${ticket.status.replace('_', ' ')}</span>
            </div>
            <div class="ticket-detail-meta">
                <span><i class="fas fa-calendar"></i> Created: ${new Date(ticket.createdAt).toLocaleString()}</span>
                ${ticket.assignedToName ? `<span><i class="fas fa-user"></i> Assigned to: ${escapeHtml(ticket.assignedToName)}</span>` : ''}
            </div>
            <div class="ticket-messages">`;

        ticket.messages.forEach(msg => {
            const isStaff = msg.authorRole !== 'player';
            html += `
                <div class="ticket-message ${isStaff ? 'staff-message' : 'player-message'}">
                    <div class="message-header">
                        <strong>${escapeHtml(msg.authorName)}</strong>
                        ${isStaff ? '<span class="badge badge-info">Staff</span>' : ''}
                        <span class="message-time">${formatDate(new Date(msg.timestamp))}</span>
                    </div>
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                </div>`;
        });
        html += '</div>';

        if (ticket.status !== 'closed') {
            html += `
                <div class="ticket-reply-form">
                    <textarea id="player-ticket-reply" class="form-input" rows="3" placeholder="Type your reply..."></textarea>
                    <button class="btn btn-primary" onclick="replyToPlayerTicket('${ticketId}')"><i class="fas fa-paper-plane"></i> Send Reply</button>
                </div>`;
        } else {
            html += '<div class="alert alert-info"><i class="fas fa-lock"></i> This ticket is closed and cannot receive new messages.</div>';
        }

        document.getElementById('player-ticket-detail-content').innerHTML = html;
    } catch (error) {
        console.error('Failed to view ticket:', error);
        showAlert('Failed to load ticket details', 'error');
    }
}

async function replyToPlayerTicket(ticketId) {
    const content = document.getElementById('player-ticket-reply').value.trim();
    if (!content) {
        showAlert('Please enter a message', 'error');
        return;
    }
    try {
        const response = await secureFetch(`${API}/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await response.json();
        if (response.ok && data.success !== false) {
            showAlert('Reply sent!', 'success');
            viewPlayerTicket(ticketId);
        } else {
            showAlert(apiError(data, 'Failed to send reply'), 'error');
        }
    } catch (error) {
        console.error('Reply error:', error);
        showAlert('An error occurred', 'error');
    }
}

function backToMyTickets() {
    document.querySelectorAll('.support-tab-content').forEach(tab => { tab.style.display = 'none'; });
    document.getElementById('support-my-tickets').style.display = 'block';
    loadMyTickets();
}

document.getElementById('new-ticket-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('ticket-subject').value.trim();
    const priority = document.getElementById('ticket-priority').value;
    const message = document.getElementById('ticket-message').value.trim();

    if (subject.length < 5) {
        showAlert('Subject must be at least 5 characters', 'error');
        return;
    }
    if (message.length < 10) {
        showAlert('Message must be at least 10 characters', 'error');
        return;
    }

    try {
        const response = await secureFetch(`${API}/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, priority, message })
        });
        const data = await response.json();
        if (response.ok && data.success !== false) {
            showAlert('Ticket created successfully!', 'success');
            document.getElementById('new-ticket-form').reset();
            showSupportTab('my-tickets');
        } else {
            showAlert(apiError(data, 'Failed to create ticket'), 'error');
        }
    } catch (error) {
        console.error('Create ticket error:', error);
        showAlert('An error occurred', 'error');
    }
});

// --- Section router (player dashboard) ---

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const target = document.getElementById(sectionName + '-section');
    if (target) target.classList.add('active');
    const navLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (navLink) navLink.classList.add('active');

    document.getElementById('user-dropdown')?.classList.remove('show');
    currentSection = sectionName;

    if (sectionName === 'friends') loadFriends();
    else if (sectionName === 'sessions') loadActiveSessions();
    else if (sectionName === 'creator-code') loadCreatorCodeStatus();
    else if (sectionName === 'support') loadMyTickets();
}
