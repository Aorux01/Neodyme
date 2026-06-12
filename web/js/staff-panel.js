// Neodyme Staff Panel JS
// Moderation / Developer / Admin logic. Loaded only on admin.html (with admin-panel.js + Chart.js).
// Shared helpers (escapeHtml, escHtml, formatDate, formatUptime, getCsrfToken, showAlert) live in common.js.

let userRole = null;

let userRoleLevel = 0;


async function loadModerationData() {
    loadPendingRequests();
    loadModStats();
}


async function loadPendingRequests() {
    try {
        const response = await fetch('/neodyme/api/mod/creator-codes/requests', { credentials: 'include' });
        const data = await response.json();

        const container = document.getElementById('pending-requests-list');

        if (!data.requests || data.requests.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No pending requests</p></div>';
            return;
        }

        let html = '';
        data.requests.forEach(req => {
            html += `
                <div class="request-card">
                    <div class="request-info">
                        <strong>${req.displayName}</strong> wants code: <code>${req.requestedCode}</code>
                        <p class="request-reason">${req.reason || 'No reason provided'}</p>
                        <small>Requested: ${new Date(req.createdAt).toLocaleString()}</small>
                    </div>
                    <div class="request-actions">
                        <button class="btn btn-success btn-sm" onclick="approveRequest('${req.id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="rejectRequest('${req.id}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load pending requests:', error);
    }
}


async function loadAllCodes() {
    try {
        const response = await fetch('/neodyme/api/mod/creator-codes', { credentials: 'include' });
        const data = await response.json();

        const container = document.getElementById('all-codes-list');

        if (!data.codes || data.codes.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>No creator codes yet</p></div>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Code</th><th>Owner</th><th>Earnings</th><th>Uses</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

        data.codes.forEach(code => {
            html += `
                <tr>
                    <td><code>${code.code}</code></td>
                    <td>${code.displayName}</td>
                    <td>${code.totalEarnings} V-Bucks</td>
                    <td>${code.totalUses}</td>
                    <td><span class="badge ${code.isActive ? 'badge-success' : 'badge-danger'}">${code.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn btn-sm ${code.isActive ? 'btn-warning' : 'btn-success'}" onclick="toggleCode('${code.code}', ${!code.isActive})">
                            <i class="fas fa-${code.isActive ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCode('${code.code}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load codes:', error);
    }
}


async function loadModStats() {
    try {
        const response = await fetch('/neodyme/api/mod/creator-codes/stats', { credentials: 'include' });
        const data = await response.json();

        if (data.stats) {
            document.getElementById('mod-active-codes').textContent = data.stats.activeCodes || 0;
            document.getElementById('mod-pending-count').textContent = data.stats.pendingRequests || 0;
            document.getElementById('mod-total-earnings').textContent = (data.stats.totalEarnings || 0) + ' V-Bucks';
            document.getElementById('mod-commission-rate').textContent = (data.stats.commissionPercent || 1) + '%';
        }
    } catch (error) {
        console.error('Failed to load mod stats:', error);
    }
}


async function approveRequest(requestId) {
    const note = prompt('Add a note (optional):');

    try {
        const response = await secureFetch(`/neodyme/api/mod/creator-codes/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Request approved!', 'success');
            loadPendingRequests();
        } else {
            showAlert(apiError(data, 'Failed to approve'), 'error');
        }
    } catch (error) {
        console.error('Approve error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function rejectRequest(requestId) {
    const note = prompt('Reason for rejection (optional):');

    try {
        const response = await secureFetch(`/neodyme/api/mod/creator-codes/reject/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Request rejected', 'success');
            loadPendingRequests();
        } else {
            showAlert(apiError(data, 'Failed to reject'), 'error');
        }
    } catch (error) {
        console.error('Reject error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function toggleCode(code, isActive) {
    try {
        const response = await secureFetch(`/neodyme/api/mod/creator-codes/${code}/toggle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`Code ${isActive ? 'activated' : 'deactivated'}`, 'success');
            loadAllCodes();
        } else {
            showAlert(apiError(data, 'Failed to toggle code'), 'error');
        }
    } catch (error) {
        console.error('Toggle code error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function deleteCode(code) {
    if (!confirm(`Are you sure you want to delete the code "${code}"?`)) return;

    try {
        const response = await secureFetch(`/neodyme/api/mod/creator-codes/${code}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showAlert('Code deleted', 'success');
            loadAllCodes();
        } else {
            showAlert(apiError(data, 'Failed to delete code'), 'error');
        }
    } catch (error) {
        console.error('Delete code error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function loadDeveloperData() {
    try {
        const response = await fetch('/neodyme/neodyme/api/status', { credentials: 'include' });
        const data = await response.json();

        document.getElementById('dev-server-status').textContent = data.online ? 'Online' : 'Offline';
        document.getElementById('dev-uptime').textContent = formatUptime(data.uptime || 0);
    } catch (error) {
        console.error('Failed to load developer data:', error);
    }
}

// formatUptime moved to common.js (shared with staff panel)


async function forceShopRotation() {
    if (!confirm('Force shop rotation now?')) return;

    try {
        const response = await secureFetch('/neodyme/api/shop/rotate', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showAlert('Shop rotated successfully!', 'success');
        } else {
            showAlert(apiError(data, 'Failed to rotate shop'), 'error');
        }
    } catch (error) {
        console.error('Shop rotation error:', error);
        showAlert('An error occurred', 'error');
    }
}


function refreshServerStatus() {
    loadDeveloperData();
    showAlert('Server status refreshed', 'info');
}


async function loadAdminData() {
    loadAdminUsers();
    loadAdminStats();
}


async function loadAdminUsers() {
    try {
        const response = await fetch('/neodyme/api/admin/users', { credentials: 'include' });
        const data = await response.json();

        const container = document.getElementById('admin-users-list');

        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No users found</p></div>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Display Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

        data.users.forEach(user => {
            html += `
                <tr>
                    <td>${user.displayName}</td>
                    <td>${user.email}</td>
                    <td>
                        <select class="form-input form-input-sm" onchange="updateUserRole('${user.accountId}', this.value)">
                            <option value="player" ${user.role === 'player' ? 'selected' : ''}>Player</option>
                            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                            <option value="developer" ${user.role === 'developer' ? 'selected' : ''}>Developer</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>Owner</option>
                            <option value="server" ${user.role === 'server' ? 'selected' : ''}>Server</option>
                        </select>
                    </td>
                    <td><span class="badge ${user.banned ? 'badge-danger' : 'badge-success'}">${user.banned ? 'Banned' : 'Active'}</span></td>
                    <td>
                        <button class="btn btn-sm ${user.banned ? 'btn-success' : 'btn-danger'}" onclick="toggleBan('${user.accountId}', ${!user.banned})">
                            <i class="fas fa-${user.banned ? 'unlock' : 'ban'}"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load admin users:', error);
    }
}


async function loadAdminStats() {
    try {
        const response = await fetch('/neodyme/api/admin/stats', { credentials: 'include' });
        const data = await response.json();

        if (data.stats) {
            document.getElementById('admin-total-users').textContent = data.stats.totalUsers || 0;
            document.getElementById('admin-banned-users').textContent = data.stats.bannedUsers || 0;
            document.getElementById('admin-admin-count').textContent = data.stats.admins || 0;
            document.getElementById('admin-mod-count').textContent = data.stats.moderators || 0;
        }
    } catch (error) {
        console.error('Failed to load admin stats:', error);
    }
}


async function searchAdminUsers() {
    const query = document.getElementById('admin-user-search').value.trim();
    loadAdminUsers();
}


async function updateUserRole(accountId, role) {
    try {
        const response = await secureFetch(`/neodyme/api/admin/users/${accountId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('User role updated', 'success');
        } else {
            showAlert(apiError(data, 'Failed to update role'), 'error');
            loadAdminUsers();
        }
    } catch (error) {
        console.error('Update role error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function toggleBan(accountId, banned) {
    const reason = banned ? prompt('Ban reason (optional):') : null;

    try {
        const response = await secureFetch(`/neodyme/api/admin/users/${accountId}/ban`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banned, reason })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`User ${banned ? 'banned' : 'unbanned'}`, 'success');
            loadAdminUsers();
            loadAdminStats();
        } else {
            showAlert(apiError(data, 'Failed to update ban status'), 'error');
        }
    } catch (error) {
        console.error('Toggle ban error:', error);
        showAlert('An error occurred', 'error');
    }
}

document.getElementById('admin-settings-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const percent = parseInt(document.getElementById('admin-commission').value);

    try {
        const response = await secureFetch('/neodyme/api/admin/creator-codes/commission', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percent })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(data.message || 'Settings saved', 'success');
        } else {
            showAlert(apiError(data, 'Failed to save settings'), 'error');
        }
    } catch (error) {
        console.error('Admin settings error:', error);
        showAlert('An error occurred', 'error');
    }
});

// Note: the staff nav reveal + access gate is handled by the inline staffGate() in admin.html.

async function loadModPlayers() {
    try {
        const search = document.getElementById('mod-player-search')?.value || '';
        const filter = document.getElementById('mod-player-filter')?.value || '';

        let url = '/neodyme/api/mod/players?';
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (filter === 'banned') url += 'banned=true&';
        else if (filter === 'active') url += 'banned=false&';

        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json();

        const container = document.getElementById('mod-players-list');

        if (!data.players || data.players.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No players found</p></div>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Display Name</th><th>Email</th><th>Created</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

        data.players.forEach(player => {
            html += `
                <tr>
                    <td>${escapeHtml(player.displayName)}</td>
                    <td>${escapeHtml(player.email)}</td>
                    <td>${new Date(player.created).toLocaleDateString()}</td>
                    <td>${player.lastLogin ? new Date(player.lastLogin).toLocaleDateString() : 'Never'}</td>
                    <td><span class="badge ${player.banned ? 'badge-danger' : 'badge-success'}">${player.banned ? 'Banned' : 'Active'}</span></td>
                    <td>
                        ${player.banned ? `
                            <button class="btn btn-sm btn-success" onclick="unbanPlayer('${player.accountId}', '${escapeHtml(player.displayName)}')">
                                <i class="fas fa-unlock"></i> Unban
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-danger" onclick="banPlayer('${player.accountId}', '${escapeHtml(player.displayName)}')">
                                <i class="fas fa-ban"></i> Ban
                            </button>
                        `}
                        <button class="btn btn-sm btn-secondary" onclick="viewBanHistory('${player.accountId}', '${escapeHtml(player.displayName)}')">
                            <i class="fas fa-history"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load players:', error);
        document.getElementById('mod-players-list').innerHTML = '<div class="error-message">Failed to load players</div>';
    }
}


function searchModPlayers() {
    loadModPlayers();
}


async function banPlayer(accountId, displayName) {
    const reason = prompt(`Ban reason for ${displayName}:`);
    if (reason === null) return;
    if (!reason || reason.length < 3) {
        showAlert('Please provide a ban reason (at least 3 characters)', 'error');
        return;
    }

    const durationStr = prompt('Ban duration in hours (leave empty for permanent):');
    const duration = durationStr ? parseInt(durationStr) : null;

    try {
        const response = await secureFetch(`/neodyme/api/mod/players/${accountId}/ban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason, duration })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(data.message || 'Player banned', 'success');
            loadModPlayers();
        } else {
            showAlert(apiError(data, 'Failed to ban player'), 'error');
        }
    } catch (error) {
        console.error('Ban error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function unbanPlayer(accountId, displayName) {
    if (!confirm(`Unban ${displayName}?`)) return;

    try {
        const response = await secureFetch(`/neodyme/api/mod/players/${accountId}/unban`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showAlert(data.message || 'Player unbanned', 'success');
            loadModPlayers();
        } else {
            showAlert(apiError(data, 'Failed to unban player'), 'error');
        }
    } catch (error) {
        console.error('Unban error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function viewBanHistory(accountId, displayName) {
    try {
        const response = await fetch(`/neodyme/api/mod/players/${accountId}/bans`, { credentials: 'include' });
        const data = await response.json();

        if (!data.history || data.history.length === 0) {
            showAlert(`${displayName} has no ban history`, 'info');
            return;
        }

        let message = `Ban history for ${displayName}:\n\n`;
        data.history.forEach(entry => {
            message += `${entry.action === 'ban_user' ? 'BANNED' : 'UNBANNED'} by ${entry.performedByName} on ${new Date(entry.timestamp).toLocaleString()}\n`;
            if (entry.details?.reason) message += `Reason: ${entry.details.reason}\n`;
            message += '\n';
        });

        alert(message);
    } catch (error) {
        console.error('Failed to load ban history:', error);
        showAlert('Failed to load ban history', 'error');
    }
}


async function loadModTickets() {
    try {
        const status = document.getElementById('mod-ticket-status')?.value || '';
        const priority = document.getElementById('mod-ticket-priority')?.value || '';

        let url = '/neodyme/api/mod/tickets?';
        if (status) url += `status=${status}&`;
        if (priority) url += `priority=${priority}&`;

        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json();

        const container = document.getElementById('mod-tickets-list');

        // Update badge
        const openCount = data.tickets?.filter(t => t.status === 'open' || t.status === 'in_progress').length || 0;
        const badge = document.getElementById('mod-tickets-badge');
        if (openCount > 0) {
            badge.textContent = openCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }

        if (!data.tickets || data.tickets.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><p>No tickets found</p></div>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Subject</th><th>Player</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Updated</th><th>Actions</th></tr></thead><tbody>';

        data.tickets.forEach(ticket => {
            const statusClass = {
                'open': 'badge-warning',
                'in_progress': 'badge-info',
                'resolved': 'badge-success',
                'closed': 'badge-secondary'
            }[ticket.status] || 'badge-secondary';

            const priorityClass = {
                'high': 'badge-danger',
                'medium': 'badge-warning',
                'low': 'badge-info'
            }[ticket.priority] || 'badge-info';

            html += `
                <tr>
                    <td>${escapeHtml(ticket.subject)}</td>
                    <td>${escapeHtml(ticket.playerDisplayName)}</td>
                    <td><span class="badge ${priorityClass}">${ticket.priority}</span></td>
                    <td><span class="badge ${statusClass}">${ticket.status.replace('_', ' ')}</span></td>
                    <td>${ticket.assignedToName || '<em>Unassigned</em>'}</td>
                    <td>${formatDate(new Date(ticket.updatedAt))}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewModTicket('${ticket.ticketId}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${!ticket.assignedTo ? `
                            <button class="btn btn-sm btn-success" onclick="assignTicket('${ticket.ticketId}')">
                                <i class="fas fa-hand-paper"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load tickets:', error);
        document.getElementById('mod-tickets-list').innerHTML = '<div class="error-message">Failed to load tickets</div>';
    }
}


async function viewModTicket(ticketId) {
    try {
        const response = await fetch(`/neodyme/api/tickets/${ticketId}`, { credentials: 'include' });
        const data = await response.json();

        if (!data.success) {
            showAlert(apiError(data, 'Failed to load ticket'), 'error');
            return;
        }

        const ticket = data.ticket;
        document.querySelectorAll('.mod-tab-content').forEach(tab => tab.style.display = 'none');
        document.getElementById('mod-ticket-detail').style.display = 'block';

        const statusClass = {
            'open': 'badge-warning',
            'in_progress': 'badge-info',
            'resolved': 'badge-success',
            'closed': 'badge-secondary'
        }[ticket.status] || 'badge-secondary';

        let html = `
            <div class="ticket-detail-header">
                <h3>${escapeHtml(ticket.subject)}</h3>
                <div class="ticket-detail-badges">
                    <span class="badge ${statusClass}">${ticket.status.replace('_', ' ')}</span>
                    <span class="badge badge-info">${ticket.priority} priority</span>
                </div>
            </div>
            <div class="ticket-detail-meta">
                <span><i class="fas fa-user"></i> From: ${escapeHtml(ticket.playerDisplayName)}</span>
                <span><i class="fas fa-calendar"></i> Created: ${new Date(ticket.createdAt).toLocaleString()}</span>
                ${ticket.assignedToName ? `<span><i class="fas fa-user-check"></i> Assigned to: ${ticket.assignedToName}</span>` : ''}
            </div>
            <div class="ticket-actions-bar">
                ${!ticket.assignedTo ? `<button class="btn btn-success" onclick="assignTicket('${ticketId}')"><i class="fas fa-hand-paper"></i> Assign to Me</button>` : ''}
                ${ticket.assignedTo ? `<button class="btn btn-warning" onclick="unassignTicket('${ticketId}')"><i class="fas fa-hand-rock"></i> Unassign</button>` : ''}
                <select id="ticket-status-select" class="form-input" style="width: auto;" onchange="updateTicketStatus('${ticketId}', this.value)">
                    <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                    <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
                <select id="ticket-priority-select" class="form-input" style="width: auto;" onchange="updateTicketPriority('${ticketId}', this.value)">
                    <option value="low" ${ticket.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${ticket.priority === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${ticket.priority === 'high' ? 'selected' : ''}>High</option>
                </select>
            </div>
            <div class="ticket-messages">
        `;

        ticket.messages.forEach(msg => {
            const isStaff = msg.authorRole !== 'player';
            html += `
                <div class="ticket-message ${isStaff ? 'staff-message' : 'player-message'}">
                    <div class="message-header">
                        <strong>${escapeHtml(msg.authorName)}</strong>
                        ${isStaff ? '<span class="badge badge-info">Staff</span>' : '<span class="badge badge-secondary">Player</span>'}
                        <span class="message-time">${formatDate(new Date(msg.timestamp))}</span>
                    </div>
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                </div>
            `;
        });

        html += '</div>';

        if (ticket.status !== 'closed') {
            html += `
                <div class="ticket-reply-form">
                    <textarea id="mod-ticket-reply" class="form-input" rows="3" placeholder="Type your reply..."></textarea>
                    <button class="btn btn-primary" onclick="replyToModTicket('${ticketId}')">
                        <i class="fas fa-paper-plane"></i> Send Reply
                    </button>
                </div>
            `;
        }

        document.getElementById('ticket-detail-content').innerHTML = html;
    } catch (error) {
        console.error('Failed to view ticket:', error);
        showAlert('Failed to load ticket details', 'error');
    }
}


async function assignTicket(ticketId) {
    try {
        const response = await secureFetch(`/neodyme/api/mod/tickets/${ticketId}/assign`, {
            method: 'PUT'
        });
        const data = await response.json();

        if (data.success) {
            showAlert('Ticket assigned to you', 'success');
            viewModTicket(ticketId);
        } else {
            showAlert(apiError(data, 'Failed to assign ticket'), 'error');
        }
    } catch (error) {
        console.error('Assign error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function unassignTicket(ticketId) {
    try {
        const response = await secureFetch(`/neodyme/api/mod/tickets/${ticketId}/unassign`, {
            method: 'PUT'
        });
        const data = await response.json();

        if (data.success) {
            showAlert('Ticket unassigned', 'success');
            viewModTicket(ticketId);
        } else {
            showAlert(apiError(data, 'Failed to unassign ticket'), 'error');
        }
    } catch (error) {
        console.error('Unassign error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function updateTicketStatus(ticketId, status) {
    try {
        const response = await secureFetch(`/neodyme/api/mod/tickets/${ticketId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await response.json();

        if (data.success) {
            showAlert(`Ticket ${status.replace('_', ' ')}`, 'success');
            viewModTicket(ticketId);
        } else {
            showAlert(apiError(data, 'Failed to update status'), 'error');
        }
    } catch (error) {
        console.error('Update status error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function updateTicketPriority(ticketId, priority) {
    try {
        const response = await secureFetch(`/neodyme/api/mod/tickets/${ticketId}/priority`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority })
        });
        const data = await response.json();

        if (data.success) {
            showAlert('Priority updated', 'success');
        } else {
            showAlert(apiError(data, 'Failed to update priority'), 'error');
        }
    } catch (error) {
        console.error('Update priority error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function replyToModTicket(ticketId) {
    const content = document.getElementById('mod-ticket-reply').value.trim();
    if (!content) {
        showAlert('Please enter a message', 'error');
        return;
    }

    try {
        const response = await secureFetch(`/neodyme/api/mod/tickets/${ticketId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Reply sent!', 'success');
            viewModTicket(ticketId);
        } else {
            showAlert(apiError(data, 'Failed to send reply'), 'error');
        }
    } catch (error) {
        console.error('Reply error:', error);
        showAlert('An error occurred', 'error');
    }
}


function backToTicketsList() {
    document.querySelectorAll('.mod-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('mod-tickets').style.display = 'block';
    loadModTickets();
}

// showDevTab and showAdminTab are defined in admin-panel.js (loaded after this file),
// which provides the complete routers including logs/plugins/monitor/system tabs.


async function loadDevOverview() {
    try {
        const response = await fetch('/neodyme/api/dev/stats/server', { credentials: 'include' });
        const data = await response.json();

        if (data.stats) {
            document.getElementById('dev-server-status').textContent = 'Online';
            document.getElementById('dev-uptime').textContent = data.stats.uptimeFormatted || formatUptime(data.stats.uptime);
            document.getElementById('dev-memory').textContent = (data.stats.memory?.heapUsed || 0) + ' MB';
            document.getElementById('dev-version').textContent = data.stats.version || '1.0.0';
        }
    } catch (error) {
        console.error('Failed to load dev overview:', error);
    }
}


async function loadDevConfig() {
    try {
        const response = await fetch('/neodyme/api/dev/config', { credentials: 'include' });
        const data = await response.json();

        if (data.config) {
            // Debug
            setCheckbox('cfg-globalDebug', data.config.debug?.globalDebug);
            setCheckbox('cfg-debug', data.config.debug?.debug);
            setCheckbox('cfg-debugRequests', data.config.debug?.debugRequests);
            setCheckbox('cfg-debugResponses', data.config.debug?.debugResponses);
            setCheckbox('cfg-debugIps', data.config.debug?.debugIps);
            setCheckbox('cfg-databaseLogging', data.config.debug?.databaseLogging);

            // Maintenance
            setCheckbox('cfg-maintenanceMode', data.config.maintenance?.maintenanceMode);
            setValue('cfg-maintenanceMessage', data.config.maintenance?.maintenanceMessage || '');
            setValue('cfg-maintenanceEstimatedDowntime', data.config.maintenance?.maintenanceEstimatedDowntime || '');

            // Rate Limiting
            setCheckbox('cfg-rateLimiting', data.config.rateLimiting?.rateLimiting);
            setValue('cfg-maxRequestsPerMinute', data.config.rateLimiting?.maxRequestsPerMinute || 125);
            setValue('cfg-rateLimitWindowMinutes', data.config.rateLimiting?.rateLimitWindowMinutes || 1);
            setValue('cfg-authMaxAttempts', data.config.rateLimiting?.authMaxAttempts || 5);
            setValue('cfg-authWindowMinutes', data.config.rateLimiting?.authWindowMinutes || 15);
            setCheckbox('cfg-authSkipSuccessfulRequests', data.config.rateLimiting?.authSkipSuccessfulRequests);
            setValue('cfg-expensiveMaxRequests', data.config.rateLimiting?.expensiveMaxRequests || 10);
            setValue('cfg-expensiveWindowMinutes', data.config.rateLimiting?.expensiveWindowMinutes || 5);

            // Features
            setCheckbox('cfg-plugins', data.config.features?.plugins);
            setCheckbox('cfg-autoShopRotation', data.config.features?.autoShopRotation);
            setCheckbox('cfg-xmppEnable', data.config.features?.xmppEnable);
            setValue('cfg-xmppPort', data.config.features?.xmppPort || 80);
            setValue('cfg-xmppDomain', data.config.features?.xmppDomain || '');

            // Events
            setCheckbox('cfg-bEnableAllEvents', data.config.events?.bEnableAllEvents);
            setCheckbox('cfg-bAllSTWEventsActivated', data.config.events?.bAllSTWEventsActivated);
            setCheckbox('cfg-bEnableGeodeEvent', data.config.events?.bEnableGeodeEvent);
            setValue('cfg-geodeEventStartDate', data.config.events?.geodeEventStartDate || '');
            setCheckbox('cfg-bEnableCrackInTheSky', data.config.events?.bEnableCrackInTheSky);
            setCheckbox('cfg-bEnableS4OddityPrecursor', data.config.events?.bEnableS4OddityPrecursor);
            setCheckbox('cfg-bEnableS4OddityExecution', data.config.events?.bEnableS4OddityExecution);
            setValue('cfg-S4OddityEventStartDate', data.config.events?.S4OddityEventStartDate || '');
            setValue('cfg-S4OddityEventsInterval', data.config.events?.S4OddityEventsInterval ?? 0);
            setCheckbox('cfg-bEnableS5OddityPrecursor', data.config.events?.bEnableS5OddityPrecursor);
            setValue('cfg-S5OddityPrecursorDate', data.config.events?.S5OddityPrecursorDate || '');
            setCheckbox('cfg-bEnableS5OddityExecution', data.config.events?.bEnableS5OddityExecution);
            setValue('cfg-S5OddityExecutionDate', data.config.events?.S5OddityExecutionDate || '');
            setCheckbox('cfg-bEnableCubeLightning', data.config.events?.bEnableCubeLightning);
            setValue('cfg-cubeSpawnDate', data.config.events?.cubeSpawnDate || '');
            setCheckbox('cfg-bEnableBlockbusterRiskyEvent', data.config.events?.bEnableBlockbusterRiskyEvent);
            setCheckbox('cfg-bEnableCubeLake', data.config.events?.bEnableCubeLake);
            setValue('cfg-cubeLakeDate', data.config.events?.cubeLakeDate || '');

            // Database
            setCheckbox('cfg-databaseBackup', data.config.database?.databaseBackup);
            setValue('cfg-databaseBackupInterval', data.config.database?.databaseBackupInterval || 60);
            setValue('cfg-databaseBackupExpiryDays', data.config.database?.databaseBackupExpiryDays ?? 7);
            setCheckbox('cfg-performInitialBackup', data.config.database?.performInitialBackup);
            setCheckbox('cfg-getJsonSpacing', data.config.database?.getJsonSpacing);

            // Game Defaults
            setCheckbox('cfg-bGrantFoundersPacks', data.config.gameDefaults?.bGrantFoundersPacks);
            setCheckbox('cfg-bCompletedSeasonalQuests', data.config.gameDefaults?.bCompletedSeasonalQuests);

            // Game Server
            setValue('cfg-gameServerHeartbeatInterval', data.config.gameServer?.gameServerHeartbeatInterval || 30);
            setValue('cfg-gameServerTimeout', data.config.gameServer?.gameServerTimeout || 120);

            // Tokens & Auth
            setValue('cfg-accessTokenExpiryHours', data.config.tokens?.accessTokenExpiryHours || 8);
            setValue('cfg-refreshTokenExpiryDays', data.config.tokens?.refreshTokenExpiryDays || 30);
            setValue('cfg-bcryptWorkFactor', data.config.tokens?.bcryptWorkFactor || 12);
            setValue('cfg-passwordMinLength', data.config.tokens?.passwordMinLength || 8);
            setValue('cfg-authTimingDelayMin', data.config.tokens?.authTimingDelayMin || 50);
            setValue('cfg-authTimingDelayMax', data.config.tokens?.authTimingDelayMax || 200);
            setCheckbox('cfg-tokenEncryptionEnabled', data.config.tokens?.tokenEncryptionEnabled);

            // Creator Code
            setValue('cfg-creatorCodeCommissionPercent', data.config.creatorCode?.creatorCodeCommissionPercent ?? 1);

            // Server Security
            setCheckbox('cfg-corsEnable', data.config.serverSecurity?.corsEnable);
            setCheckbox('cfg-compressionEnable', data.config.serverSecurity?.compressionEnable);
            setCheckbox('cfg-helmetEnable', data.config.serverSecurity?.helmetEnable);
            setCheckbox('cfg-trustProxy', data.config.serverSecurity?.trustProxy);

            // SSL
            if (data.config.ssl) {
                setValue('cfg-protocol', data.config.ssl.protocol || 'http');
                setValue('cfg-sslCertPath', data.config.ssl.sslCertPath || 'config/ssl/cert.pem');
                setValue('cfg-sslKeyPath', data.config.ssl.sslKeyPath || 'config/ssl/key.pem');
                setCheckbox('cfg-secureCookies', data.config.ssl.secureCookies);
            }
        }

        // Load SSL status info
        try {
            const sslResponse = await fetch('/neodyme/api/dev/ssl/status', { credentials: 'include' });
            const sslData = await sslResponse.json();
            if (sslData.ssl) {
                const statusEl = document.getElementById('ssl-status-info');
                if (statusEl) {
                    const isHttps = sslData.ssl.httpsActive;
                    const certOk = sslData.ssl.certificate.exists;
                    const keyOk = sslData.ssl.key.exists;

                    let statusHtml = '<small class="form-hint"><i class="fas fa-info-circle"></i> Changing protocol requires a server restart.</small>';
                    if (isHttps) {
                        statusHtml += '<br><small class="form-hint" style="color: #4CAF50;"><i class="fas fa-check-circle"></i> HTTPS is active. Secure cookies: ' + (sslData.ssl.secureCookies ? 'enabled' : 'disabled') + '.</small>';
                    }
                    if (!certOk || !keyOk) {
                        statusHtml += '<br><small class="form-hint" style="color: #f44336;"><i class="fas fa-exclamation-triangle"></i> ' + (!certOk ? 'Certificate file not found. ' : '') + (!keyOk ? 'Key file not found.' : '') + '</small>';
                    } else {
                        statusHtml += '<br><small class="form-hint" style="color: #4CAF50;"><i class="fas fa-check-circle"></i> Certificate and key files found.</small>';
                    }
                    statusEl.innerHTML = statusHtml;
                }
            }
        } catch (e) {
            console.error('Failed to load SSL status:', e);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}


function setCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}


function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}


async function updateConfig(key, value) {
    try {
        const response = await secureFetch(`/neodyme/api/dev/config/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`${key} updated`, 'success');
        } else {
            showAlert(apiError(data, 'Failed to update config'), 'error');
        }
    } catch (error) {
        console.error('Update config error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function toggleMaintenance() {
    try {
        const response = await fetch('/neodyme/api/dev/config', { credentials: 'include' });
        const data = await response.json();
        const currentMode = data.config?.maintenance?.maintenanceMode || false;

        await updateConfig('maintenanceMode', !currentMode);
        loadDevConfig();
    } catch (error) {
        console.error('Toggle maintenance error:', error);
    }
}


let currentEditingFile = null;


async function loadConfigFile(fileName) {
    try {
        const response = await fetch(`/neodyme/api/dev/config/files/${fileName}`, { credentials: 'include' });
        const data = await response.json();

        if (data.success) {
            currentEditingFile = fileName;
            document.getElementById('editing-filename').textContent = fileName;
            document.getElementById('config-file-content').value = JSON.stringify(data.content, null, 2);
            document.getElementById('config-file-editor').style.display = 'block';
        } else {
            showAlert(apiError(data, 'Failed to load file'), 'error');
        }
    } catch (error) {
        console.error('Load config file error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function saveConfigFile() {
    if (!currentEditingFile) return;

    try {
        const contentStr = document.getElementById('config-file-content').value;
        const content = JSON.parse(contentStr);

        const response = await secureFetch(`/neodyme/api/dev/config/files/${currentEditingFile}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('File saved successfully!', 'success');
        } else {
            showAlert(apiError(data, 'Failed to save file'), 'error');
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            showAlert('Invalid JSON syntax', 'error');
        } else {
            console.error('Save config file error:', error);
            showAlert('An error occurred', 'error');
        }
    }
}


function closeConfigEditor() {
    document.getElementById('config-file-editor').style.display = 'none';
    currentEditingFile = null;
}


let currentEditingIniFile = null;


async function loadIniFile(fileName) {
    try {
        const response = await fetch(`/neodyme/api/dev/ini-files/${fileName}`, { credentials: 'include' });
        const data = await response.json();

        if (data.success) {
            currentEditingIniFile = fileName;
            document.getElementById('editing-ini-filename').textContent = fileName;
            document.getElementById('ini-file-content').value = data.content;
            document.getElementById('ini-file-editor').style.display = 'block';
            document.getElementById('config-file-editor').style.display = 'none';
        } else {
            showAlert(apiError(data, 'Failed to load file'), 'error');
        }
    } catch (error) {
        console.error('Load INI file error:', error);
        showAlert('An error occurred', 'error');
    }
}


async function saveIniFile() {
    if (!currentEditingIniFile) return;

    try {
        const content = document.getElementById('ini-file-content').value;

        const response = await secureFetch(`/neodyme/api/dev/ini-files/${currentEditingIniFile}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`${currentEditingIniFile} saved successfully`, 'success');
        } else {
            showAlert(apiError(data, 'Failed to save file'), 'error');
        }
    } catch (error) {
        console.error('Save INI file error:', error);
        showAlert('An error occurred', 'error');
    }
}


function closeIniEditor() {
    document.getElementById('ini-file-editor').style.display = 'none';
    currentEditingIniFile = null;
}


async function loadDevStats() {
    try {
        const [serverRes, dbRes] = await Promise.all([
            fetch('/neodyme/api/dev/stats/server', { credentials: 'include' }),
            fetch('/neodyme/api/dev/stats/database', { credentials: 'include' })
        ]);

        const serverData = await serverRes.json();
        const dbData = await dbRes.json();

        if (serverData.stats) {
            document.getElementById('dev-node-version').textContent = serverData.stats.nodeVersion || '-';
            document.getElementById('dev-platform').textContent = serverData.stats.platform || '-';
            document.getElementById('dev-system-ram').textContent = (serverData.stats.system?.totalMem || 0) + ' MB';
            document.getElementById('dev-cpus').textContent = serverData.stats.system?.cpus || '-';
        }

        if (dbData.stats) {
            document.getElementById('dev-db-type').textContent = dbData.stats.type || 'JSON';
            document.getElementById('dev-db-users').textContent = dbData.stats.totalUsers || 0;
            document.getElementById('dev-db-backup').textContent = dbData.stats.backupEnabled ? 'Enabled' : 'Disabled';
        }
    } catch (error) {
        console.error('Failed to load dev stats:', error);
    }
}


let auditCurrentPage = 1;

const AUDIT_META = {
    ban_user:           { icon: 'fa-ban',              color: '#ef4444', label: 'Ban User' },
    unban_user:         { icon: 'fa-user-check',       color: '#10b981', label: 'Unban User' },
    change_role:        { icon: 'fa-crown',             color: '#f59e0b', label: 'Change Role' },
    update_config:      { icon: 'fa-sliders-h',         color: '#8b5cf6', label: 'Update Config' },
    update_config_file: { icon: 'fa-file-alt',          color: '#8b5cf6', label: 'Update File' },
    close_ticket:       { icon: 'fa-ticket-alt',        color: '#6b7280', label: 'Close Ticket' },
    delete_ticket:      { icon: 'fa-trash-alt',         color: '#ef4444', label: 'Delete Ticket' },
    assign_ticket:      { icon: 'fa-user-tag',          color: '#3b82f6', label: 'Assign Ticket' },
    approve_code:       { icon: 'fa-check-circle',      color: '#10b981', label: 'Approve Code' },
    reject_code:        { icon: 'fa-times-circle',      color: '#ef4444', label: 'Reject Code' },
    delete_code:        { icon: 'fa-trash',             color: '#ef4444', label: 'Delete Code' },
    toggle_code:        { icon: 'fa-toggle-on',         color: '#f59e0b', label: 'Toggle Code' },
    force_shop_rotation:{ icon: 'fa-random',            color: '#3b82f6', label: 'Shop Rotation' },
    toggle_maintenance: { icon: 'fa-tools',             color: '#f59e0b', label: 'Maintenance' },
    update_content:     { icon: 'fa-newspaper',         color: '#8b5cf6', label: 'Edit Content' },
    reset_content:      { icon: 'fa-cloud-download-alt',color: '#ef4444', label: 'Reset Content' },
    upload_asset:       { icon: 'fa-upload',            color: '#3b82f6', label: 'Upload Asset' },
    delete_asset:       { icon: 'fa-trash',             color: '#ef4444', label: 'Delete Asset' },
    update_shop_slot:   { icon: 'fa-shopping-cart',     color: '#3b82f6', label: 'Edit Shop Slot' },
    clear_shop_slot:    { icon: 'fa-eraser',            color: '#ef4444', label: 'Clear Shop Slot' },
    randomize_shop_slot:{ icon: 'fa-dice',              color: '#10b981', label: 'Randomize Slot' },
};


function auditActionMeta(action) {
    return AUDIT_META[action?.toLowerCase()] || { icon: 'fa-circle', color: '#6b7280', label: action };
}


function auditBadgeColor(action) {
    const c = auditActionMeta(action).color;
    const bg = c + '22';
    return `background:${bg};border:1px solid ${c}55;color:${c};`;
}


// Audit detail formatting. The legacy version only rendered a handful of
// hand-picked fields and showed "-" for everything else. This version walks
// the whole `details` payload, pairs old/new values together (diff style),
// pretty-prints arrays and nested objects, and skips fields we already
// surface in the row header (action label, performedByName, target).
const AUDIT_FIELD_LABELS = {
    targetUserName: 'Target user',
    reason: 'Reason',
    duration: 'Duration',
    note: 'Note',
    configKey: 'Config key',
    oldValue: 'Was', newValue: 'Now',
    oldRole: 'Was role', newRole: 'Now role',
    fileName: 'File', filename: 'File',
    scope: 'Scope', section: 'Section',
    entryCount: 'Entries', i18nLeaves: 'i18n fields', contentIds: 'Content IDs',
    scopes: 'Scopes', results: 'Per-file result',
    path: 'Path', url: 'Public URL', size: 'Size', ext: 'Extension',
    originalName: 'Original filename', uploadedBy: 'Uploaded by', uploadedAt: 'Uploaded at',
    indexEntry: 'Was in index', fileExisted: 'File existed on disk',
    slot: 'Slot',
    pickedId: 'Picked CID', pickedName: 'Picked name', pickedRarity: 'Rarity', pickedType: 'Type',
    oldItemGrants: 'Was item grants', newItemGrants: 'Now item grants',
    oldPrice: 'Was price', newPrice: 'Now price',
    clearedItemGrants: 'Cleared item grants', clearedPrice: 'Cleared price',
};

// Fields we already display in the row header - don't repeat them.
const AUDIT_REDUNDANT = new Set(['scope', 'section', 'slot', 'filename', 'fileName', 'path']);

// Diff pairs: when we see one of these we render them as a single before-after row.
const AUDIT_DIFF_PAIRS = [
    ['oldValue', 'newValue'],
    ['oldRole', 'newRole'],
    ['oldPrice', 'newPrice'],
    ['oldItemGrants', 'newItemGrants'],
];

function formatAuditValue(v) {
    if (v == null) return '<span style="color:#555;">null</span>';
    if (typeof v === 'boolean') return v ? '<span style="color:#10b981;">yes</span>' : '<span style="color:#ef4444;">no</span>';
    if (typeof v === 'number') return `<code style="color:#fbbf24;">${v}</code>`;
    if (Array.isArray(v)) {
        if (v.length === 0) return '<span style="color:#555;">(empty)</span>';
        const items = v.slice(0, 12).map(x => typeof x === 'object'
            ? `<code style="background:#1e1e1e;padding:1px 5px;border-radius:3px;font-size:10px;">${escapeHtml(JSON.stringify(x))}</code>`
            : `<code style="background:#1e1e1e;padding:1px 5px;border-radius:3px;font-size:11px;">${escapeHtml(String(x))}</code>`).join(' ');
        return items + (v.length > 12 ? ` <span style="color:#555;">...+${v.length - 12}</span>` : '');
    }
    if (typeof v === 'object') {
        const json = JSON.stringify(v, null, 0);
        if (json.length <= 120) return `<code style="background:#1e1e1e;padding:1px 5px;border-radius:3px;font-size:10px;">${escapeHtml(json)}</code>`;
        return `<pre style="background:#1e1e1e;padding:6px 8px;border-radius:4px;font-size:10px;color:#aaa;max-height:160px;overflow:auto;margin:4px 0 0;white-space:pre-wrap;word-break:break-all;">${escapeHtml(JSON.stringify(v, null, 2))}</pre>`;
    }
    const s = String(v);
    return s.length > 200
        ? `<span style="color:#ccc;">${escapeHtml(s.slice(0, 200))}<span style="color:#555;">...+${s.length - 200}</span></span>`
        : `<span style="color:#ccc;">${escapeHtml(s)}</span>`;
}

function formatAuditDetails(log) {
    const d = log.details || {};
    const keys = Object.keys(d).filter(k => !AUDIT_REDUNDANT.has(k) && d[k] !== undefined);
    if (keys.length === 0) return '<span style="color:#555;">No additional details for this entry.</span>';

    // Collect diff pairs we can render side-by-side.
    const handled = new Set();
    const rows = [];

    for (const [oldKey, newKey] of AUDIT_DIFF_PAIRS) {
        if (keys.includes(oldKey) && keys.includes(newKey)) {
            handled.add(oldKey); handled.add(newKey);
            const oldLabel = AUDIT_FIELD_LABELS[oldKey] || oldKey;
            const newLabel = AUDIT_FIELD_LABELS[newKey] || newKey;
            rows.push(`
                <div style="display:grid;grid-template-columns:130px 1fr;gap:8px;margin-bottom:6px;">
                    <div style="color:#888;font-size:11px;">${escapeHtml(oldLabel.replace(/^Was /, ''))} change</div>
                    <div>
                        <span style="color:#ef4444;font-size:10px;font-weight:600;letter-spacing:.04em;">${escapeHtml(oldLabel.toUpperCase())}</span>
                        ${formatAuditValue(d[oldKey])}
                        <span style="color:#555;margin:0 6px;">-></span>
                        <span style="color:#10b981;font-size:10px;font-weight:600;letter-spacing:.04em;">${escapeHtml(newLabel.toUpperCase())}</span>
                        ${formatAuditValue(d[newKey])}
                    </div>
                </div>`);
        }
    }

    // Remaining fields - regular key/value rows.
    for (const k of keys) {
        if (handled.has(k)) continue;
        const label = AUDIT_FIELD_LABELS[k] || k;
        rows.push(`
            <div style="display:grid;grid-template-columns:130px 1fr;gap:8px;margin-bottom:6px;">
                <div style="color:#888;font-size:11px;">${escapeHtml(label)}</div>
                <div>${formatAuditValue(d[k])}</div>
            </div>`);
    }

    return rows.join('');
}


async function loadAuditLog() {
    try {
        const action   = document.getElementById('audit-action-filter')?.value || '';
        const search   = document.getElementById('audit-search')?.value        || '';
        const dateFrom = document.getElementById('audit-date-from')?.value     || '';
        const dateTo   = document.getElementById('audit-date-to')?.value       || '';

        let url = `/neodyme/api/admin/audit-log?page=${auditCurrentPage}&limit=25`;
        if (action)   url += `&action=${encodeURIComponent(action)}`;
        if (search)   url += `&search=${encodeURIComponent(search)}`;
        if (dateFrom) url += `&from=${encodeURIComponent(dateFrom)}`;
        if (dateTo)   url += `&to=${encodeURIComponent(dateTo)}`;

        const response = await fetch(url, { credentials: 'include' });
        const data     = await response.json();

        _auditLogsCache = data.logs || [];

        const summaryBar = document.getElementById('audit-summary-bar');
        if (summaryBar) {
            fetch('/neodyme/api/admin/audit-log/summary?hours=24', { credentials: 'include' })
                .then(r => r.json())
                .then(s => {
                    if (!s.success || !s.summary) return;
                    const items = Object.entries(s.summary).slice(0, 5)
                        .map(([action, count]) => {
                            const meta = auditActionMeta(action);
                            return `<span style="display:inline-flex;align-items:center;gap:5px;
                                          background:#1e1e1e;border:1px solid #2a2a2a;border-radius:20px;
                                          padding:4px 10px;font-size:11px;color:#aaa;">
                                <i class="fas ${meta.icon}" style="color:${meta.color};"></i>
                                <strong style="color:#fff;">${count}</strong> ${meta.label}
                            </span>`;
                        }).join('');
                    summaryBar.innerHTML = items
                        ? `<span style="color:#555;font-size:11px;align-self:center;white-space:nowrap;">Last 24h:</span>${items}`
                        : '';
                }).catch(() => {});
        }

        const container = document.getElementById('audit-log-list');

        if (!_auditLogsCache.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-history" style="font-size:40px;color:#333;"></i>
                <p style="color:#555;margin-top:12px;">No audit logs found</p></div>`;
            document.getElementById('audit-page-info').textContent = 'Page 1 of 1';
            document.getElementById('audit-prev').disabled = true;
            document.getElementById('audit-next').disabled = true;
            return;
        }

        let html = `<div style="display:flex;flex-direction:column;gap:6px;">`;

        _auditLogsCache.forEach((log, idx) => {
            const meta   = auditActionMeta(log.action);
            const target = log.targetType && log.targetId
                ? `<span style="color:#777;font-size:11px;">${escapeHtml(log.targetType)}</span>&nbsp;<code style="font-size:11px;color:#aaa;">${escapeHtml(log.targetId.slice(0, 24))}${log.targetId.length > 24 ? '...' : ''}</code>`
                : '<span style="color:#444;">-</span>';

            const ts = new Date(log.timestamp);
            const timeStr  = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr  = ts.toLocaleDateString([], { month: 'short', day: '2-digit' });
            const ipStr    = log.ipAddress ? `<span style="color:#444;font-size:10px;margin-left:6px;" title="IP">${escapeHtml(log.ipAddress)}</span>` : '';
            const detailId = `audit-detail-${idx}`;

            html += `
            <div style="background:#161616;border:1px solid #232323;border-radius:9px;padding:12px 14px;
                        display:flex;align-items:flex-start;gap:12px;cursor:pointer;"
                 onclick="toggleAuditDetail('${detailId}')">
                <!-- Icon -->
                <div style="width:36px;height:36px;border-radius:9px;background:${meta.color}18;
                            display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                    <i class="fas ${meta.icon}" style="color:${meta.color};font-size:15px;"></i>
                </div>
                <!-- Main -->
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;
                                     ${auditBadgeColor(log.action)}">${meta.label}</span>
                        <span style="color:#ccc;font-size:13px;font-weight:600;">${escapeHtml(log.performedByName || '-')}</span>
                        <span style="color:#555;font-size:12px;">-></span>
                        <span style="font-size:12px;">${target}</span>
                        ${ipStr}
                    </div>
                    <!-- Details (collapsed) -->
                    <div id="${detailId}" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #222;font-size:12px;">
                        ${formatAuditDetails(log)}
                    </div>
                </div>
                <!-- Time -->
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:12px;color:#aaa;font-weight:500;">${timeStr}</div>
                    <div style="font-size:11px;color:#555;">${dateStr}</div>
                </div>
            </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;

        const totalPages = data.totalPages || 1;
        document.getElementById('audit-page-info').textContent = `Page ${data.page || auditCurrentPage} / ${totalPages}`;
        document.getElementById('audit-prev').disabled = (data.page || auditCurrentPage) <= 1;
        document.getElementById('audit-next').disabled = (data.page || auditCurrentPage) >= totalPages;

    } catch (error) {
        console.error('Failed to load audit log:', error);
        document.getElementById('audit-log-list').innerHTML =
            '<div class="error-message"><i class="fas fa-exclamation-triangle"></i> Failed to load audit log</div>';
    }
}


function toggleAuditDetail(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}


function clearAuditFilters() {
    const ids = ['audit-action-filter', 'audit-search', 'audit-date-from', 'audit-date-to'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    auditCurrentPage = 1;
    loadAuditLog();
}


function exportAuditCsv() {
    if (!_auditLogsCache.length) { alert('No logs to export.'); return; }
    const headers = ['Timestamp', 'Action', 'PerformedBy', 'TargetType', 'TargetId', 'IP', 'Details'];
    const rows = _auditLogsCache.map(log => {
        const d = log.details || {};
        const details = [d.targetUserName, d.reason, d.configKey, d.note].filter(Boolean).join(' | ');
        return [
            new Date(log.timestamp).toISOString(),
            log.action,
            log.performedByName || '',
            log.targetType || '',
            log.targetId || '',
            log.ipAddress || '',
            details
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}


function loadAuditLogPage(delta) {
    auditCurrentPage += delta;
    if (auditCurrentPage < 1) auditCurrentPage = 1;
    loadAuditLog();
}


let chartPlayerStats = null;


async function loadPlayerStatsChart(range) {
    // Highlight the active button
    ['1h','24h','1w','1m','1y','all'].forEach(r => {
        const b = document.getElementById(`pstat-${r}`);
        if (b) b.style.opacity = r === range ? '1' : '0.5';
    });

    const emptyEl = document.getElementById('player-stats-empty');
    const ctx     = document.getElementById('chart-player-stats');
    if (!ctx) return;

    try {
        const res  = await fetch(`/neodyme/api/admin/stats/players?range=${range}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        const pts = data.points || [];

        if (pts.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            ctx.style.display = 'none';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        ctx.style.display = 'block';

        function fmtLabel(ts) {
            const d = new Date(ts);
            if (range === '1h' || range === '24h') {
                // e.g. "4:00 PM"
                return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
            if (range === '1w') {
                // e.g. "Mon 22"
                return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
            }
            if (range === '1m') {
                // e.g. "22 Feb"
                return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
            }
            // 1y / all - e.g. "Feb 25"
            return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
        }

        const maxTicks = range === '1h' ? 6 : range === '24h' ? 8 : range === '1w' ? 7 : range === '1m' ? 10 : 12;

        const labels   = pts.map(p => fmtLabel(p.t));
        const active   = pts.map(p => p.a);
        const total    = pts.map(p => p.c);
        const sessions = pts.map(p => p.s);

        if (chartPlayerStats) chartPlayerStats.destroy();
        chartPlayerStats = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Active Players',
                        data: active,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true, tension: 0.4
                    },
                    {
                        label: 'Total Accounts',
                        data: total,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'transparent',
                        fill: false, tension: 0.4
                    },
                    {
                        label: 'Active Sessions',
                        data: sessions,
                        borderColor: '#10b981',
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
                scales: {
                    x: {
                        display: true,
                        ticks: {
                            color: '#666',
                            font: { size: 10 },
                            maxTicksLimit: maxTicks,
                            autoSkip: true,
                            maxRotation: 0
                        },
                        grid: { color: '#1e1e1e' }
                    },
                    y: { min: 0, ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
                },
                elements: { point: { radius: 0 } }
            }
        });
    } catch (_) {}
}


async function loadAdminDetailedStats() {
    try {
        const response = await fetch('/neodyme/api/admin/stats/detailed', { credentials: 'include' });
        const data = await response.json();

        if (data.stats) {
            // User stats
            document.getElementById('admin-total-users').textContent = data.stats.users?.total || 0;
            document.getElementById('admin-banned-users').textContent = data.stats.users?.banned || 0;
            document.getElementById('admin-admin-count').textContent = (data.stats.users?.byRole?.admins || 0) + (data.stats.users?.byRole?.owners || 0);
            document.getElementById('admin-mod-count').textContent = data.stats.users?.byRole?.moderators || 0;

            // Activity stats
            document.getElementById('admin-active-24h').textContent = data.stats.activity?.activeLastDay || 0;
            document.getElementById('admin-active-7d').textContent = data.stats.activity?.activeLastWeek || 0;
            document.getElementById('admin-active-30d').textContent = data.stats.activity?.activeLastMonth || 0;
            document.getElementById('admin-new-today').textContent = data.stats.registrations?.lastDay || 0;

            // Ticket stats
            document.getElementById('admin-tickets-open').textContent = data.stats.tickets?.open || 0;
            document.getElementById('admin-tickets-progress').textContent = data.stats.tickets?.inProgress || 0;
            document.getElementById('admin-tickets-high').textContent = data.stats.tickets?.highPriority || 0;
            document.getElementById('admin-tickets-resolved').textContent = data.stats.tickets?.resolved || 0;
        }
    } catch (error) {
        console.error('Failed to load detailed stats:', error);
    }
}


async function saveAdminCommission() {
    const val = parseFloat(document.getElementById('admin-commission')?.value);
    if (isNaN(val) || val < 0 || val > 100) {
        showAlert('Commission must be between 0 and 100', 'error');
        return;
    }
    try {
        const res  = await secureFetch('/neodyme/api/admin/creator-codes/commission', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percent: val })
        });
        const data = await res.json();
        showAlert(data.message || (res.ok ? 'Saved' : 'Failed to save'), res.ok ? 'success' : 'error');
    } catch (err) {
        showAlert('Failed to save commission: ' + err.message, 'error');
    }
}


async function exportUsers() {
    try {
        const response = await fetch('/neodyme/api/admin/users', { credentials: 'include' });
        const data = await response.json();

        if (!data.users || data.users.length === 0) {
            showAlert('No users to export', 'error');
            return;
        }

        let csv = 'Display Name,Email,Role,Status,Created,Last Login\n';
        data.users.forEach(user => {
            csv += `"${user.displayName}","${user.email}","${user.role}","${user.banned ? 'Banned' : 'Active'}","${user.created}","${user.lastLogin || 'Never'}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'users_export.csv';
        a.click();
        window.URL.revokeObjectURL(url);

        showAlert('Users exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showAlert('Failed to export users', 'error');
    }
}

// Update showModTab to handle new tabs

async function loadModReports() {
    const search = document.getElementById('mod-report-search')?.value || '';
    const container = document.getElementById('mod-reports-list');
    const badge = document.getElementById('mod-reports-badge');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading reports...</div>';

    try {
        const [reportsRes, statsRes] = await Promise.all([
            fetch(`/neodyme/api/mod/reports${search ? '?search=' + encodeURIComponent(search) : ''}`, { credentials: 'include' }),
            fetch('/neodyme/api/mod/reports/stats', { credentials: 'include' })
        ]);

        const reportsData = await reportsRes.json();
        const statsData = await statsRes.json();

        if (statsData.success) {
            const s = statsData.stats;
            const total = s.total || 0;
            document.getElementById('mod-report-total').textContent = total;
            document.getElementById('mod-report-targets').textContent = s.uniqueTargets || 0;
            if (badge) {
                badge.textContent = total;
                badge.style.display = total > 0 ? 'inline' : 'none';
            }
        }

        if (!reportsData.success || !reportsData.reports?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-flag"></i><p>No reports found</p></div>';
            return;
        }

        const reports = reportsData.reports;
        const grouped = {};
        for (const r of reports) {
            if (!grouped[r.reportedAccountId]) {
                grouped[r.reportedAccountId] = {
                    displayName: r.reportedDisplayName,
                    accountId: r.reportedAccountId,
                    reports: []
                };
            }
            grouped[r.reportedAccountId].reports.push(r);
        }

        let html = '';
        for (const target of Object.values(grouped).sort((a, b) => b.reports.length - a.reports.length)) {
            const initials = target.displayName.substring(0, 2).toUpperCase();
            html += `
            <div class="ticket-item" style="margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#f87171;flex-shrink:0;">${escapeHtml(initials)}</div>
                    <div>
                        <strong>${escapeHtml(target.displayName)}</strong>
                        <span style="font-size:11px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:3px;padding:1px 6px;margin-left:6px;">${target.reports.length} report${target.reports.length > 1 ? 's' : ''}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="viewPlayerReports('${target.accountId}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
                <div id="reports-for-${target.accountId}" style="display:none;padding-left:46px;">
                    ${target.reports.map(r => `
                    <div style="border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:10px;margin-bottom:8px;background:rgba(0,0,0,0.15);">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                            <div style="flex:1;">
                                <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;">
                                    Reported by <strong>${escapeHtml(r.reporterDisplayName)}</strong> · ${new Date(r.createdAt).toLocaleString()}
                                </div>
                                <div style="font-size:13px;margin-bottom:2px;"><span style="color:rgba(255,255,255,0.6);">Reason:</span> ${escapeHtml(r.reason)}</div>
                                ${r.details && r.details !== 'No details provided' ? `<div style="font-size:12px;color:rgba(255,255,255,0.5);">${escapeHtml(r.details)}</div>` : ''}
                            </div>
                            <button class="btn btn-danger btn-sm" onclick="dismissReport('${r.reportId}')" title="Dismiss report">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>`).join('')}
                    <div style="display:flex;gap:8px;margin-top:4px;">
                        <button class="btn btn-danger btn-sm" onclick="showBanModal('${target.accountId}', '${escapeHtml(target.displayName)}')">
                            <i class="fas fa-ban"></i> Ban Player
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="dismissAllReportsForPlayer('${target.accountId}')">
                            <i class="fas fa-check"></i> Dismiss All
                        </button>
                    </div>
                </div>
            </div>`;
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="error-message">Failed to load reports</div>';
    }
}


function viewPlayerReports(accountId) {
    const el = document.getElementById('reports-for-' + accountId);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}


async function dismissReport(reportId) {
    if (!confirm('Dismiss this report?')) return;
    try {
        const res = await secureFetch(`/neodyme/api/mod/reports/${reportId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            loadModReports();
        } else {
            showAlert(apiError(data, 'Failed to dismiss report'), 'error');
        }
    } catch {
        showAlert('Failed to dismiss report', 'error');
    }
}


async function dismissAllReportsForPlayer(accountId) {
    if (!confirm('Dismiss all reports for this player?')) return;
    try {
        const res = await fetch(`/neodyme/api/mod/reports/player/${accountId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) return;

        // Each DELETE consumes a single-use CSRF token, so run them sequentially.
        for (const r of (data.reports || [])) {
            await secureFetch(`/neodyme/api/mod/reports/${r.reportId}`, { method: 'DELETE' });
        }

        loadModReports();
    } catch {
        showAlert('Failed to dismiss reports', 'error');
    }
}


async function loadModFeedback() {
    const search = (document.getElementById('mod-feedback-search')?.value || '').toLowerCase();
    const container = document.getElementById('mod-feedback-list');
    const badge = document.getElementById('mod-feedback-badge');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading feedback...</div>';

    try {
        const res = await fetch('/neodyme/api/mod/feedback', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('Failed to fetch feedback');

        let submissions = data.submissions || [];
        if (search) {
            submissions = submissions.filter(s =>
                s.displayName.toLowerCase().includes(search) ||
                s.type.toLowerCase().includes(search)
            );
        }

        badge.textContent = submissions.length;
        badge.style.display = submissions.length > 0 ? 'inline' : 'none';

        if (submissions.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-bug" style="font-size:32px;margin-bottom:12px;opacity:0.3;display:block;"></i>No feedback received yet</div>';
            return;
        }

        const typeColors = { Bug: '#ef4444', Suggestion: '#3b82f6', Complaint: '#f59e0b' };

        let html = '';
        for (const s of submissions) {
            const color = typeColors[s.type] || '#8b5cf6';
            const initials = (s.displayName || '?')[0].toUpperCase();
            const safeId = CSS.escape(s.id.replace(/\//g, '__'));
            const hasScreenshot = s.files.some(f => f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
            const screenshotFile = s.files.find(f => f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));

            html += `
<div class="ticket-item" style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#a78bfa;flex-shrink:0;">${escapeHtml(initials)}</div>
        <div>
            <strong>${escapeHtml(s.displayName)}</strong>
            <span style="font-size:11px;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:3px;padding:1px 6px;margin-left:6px;">${escapeHtml(s.type)}</span>
        </div>
        <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.4);">${escapeHtml(s.datetime)}</span>
        <button class="btn btn-primary btn-sm" onclick="toggleFeedbackDetail('${safeId}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteFeedbackSubmission('${escapeHtml(s.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
    <div id="feedback-detail-${safeId}" style="display:none;padding-left:46px;">
        ${hasScreenshot ? `
        <div style="margin-bottom:10px;">
            <img src="/neodyme/api/mod/feedback/file?path=${encodeURIComponent(screenshotFile.relPath)}" alt="Screenshot"
                 style="max-width:100%;max-height:300px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;"
                 onclick="window.open(this.src,'_blank')">
        </div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${s.files.map(f => {
                const isImg = f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                if (isImg) return '';
                return `<a href="/neodyme/api/mod/feedback/file?path=${encodeURIComponent(f.relPath)}" target="_blank"
                    style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;font-size:12px;color:rgba(255,255,255,0.7);text-decoration:none;">
                    <i class="fas fa-file-download"></i> ${escapeHtml(f.name)}
                </a>`;
            }).join('')}
        </div>
    </div>
</div>`;
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-circle"></i> Failed to load feedback</div>';
    }
}


function toggleFeedbackDetail(safeId) {
    const el = document.getElementById('feedback-detail-' + safeId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}


async function deleteFeedbackSubmission(submissionId) {
    if (!confirm('Delete this feedback submission and all its files?')) return;
    try {
        const res = await secureFetch(`/neodyme/api/mod/feedback/${encodeURIComponent(submissionId)}`, { method: 'DELETE' });
        if (res.ok) loadModFeedback();
        else showAlert('Failed to delete feedback', 'error');
    } catch {
        showAlert('Failed to delete feedback', 'error');
    }
}

// Helper function
// escapeHtml moved to common.js (shared with staff panel)
// --- Section router (staff panel page) ---
function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const target = document.getElementById(sectionName + '-section');
    if (target) target.classList.add('active');
    const navLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (navLink) navLink.classList.add('active');

    document.getElementById('user-dropdown')?.classList.remove('show');

    // Staff section data loaders.
    if (sectionName === 'moderation') { loadModPlayers(); loadModStats(); }
    else if (sectionName === 'developer') { loadDevOverview(); loadDevConfig(); }
    else if (sectionName === 'admin') { loadAdminUsers(); loadAdminDetailedStats(); loadPlayerStatsChart('24h'); }
}

// --- Moderation tab router ---
function showModTab(tabName) {
    document.querySelectorAll('.mod-tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.mod-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

    const targetEl = document.getElementById('mod-' + tabName);
    if (targetEl) targetEl.style.display = 'block';
    const activeBtn = document.querySelector(`.mod-tabs .tab-btn[onclick*="'${tabName}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabName === 'players') loadModPlayers();
    else if (tabName === 'tickets') loadModTickets();
    else if (tabName === 'reports') loadModReports();
    else if (tabName === 'feedback') loadModFeedback();
    else if (tabName === 'pending-codes') loadPendingRequests();
    else if (tabName === 'all-codes') loadAllCodes();
    else if (tabName === 'code-stats') loadModStats();
    else if (tabName === 'commands' && typeof loadModCommands === 'function') loadModCommands();
}

// showAdminTab is defined in admin-panel.js (loaded after this file), which provides
// the complete router including the audit/settings/commands tabs.
