let currentUser = null;
let currentSection = 'dashboard';

document.addEventListener('DOMContentLoaded', function() {
    checkAuth().then(user => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;
        updateUserInfo();
        loadDashboardData();
    });
});

function updateUserInfo() {
    if (currentUser) {
        const displayName = currentUser.displayName || currentUser.username || currentUser.email;
        document.getElementById('user-name').textContent = displayName;
        document.getElementById('welcome-name').textContent = displayName;
        document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();
        
        document.getElementById('profile-username').value = currentUser.username || '';
        document.getElementById('profile-email').value = currentUser.email || '';
        document.getElementById('profile-displayname').value = currentUser.displayName || '';
    }
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        //const response = await fetch('/api/user/stats', {
        //    headers: {
        //        'Authorization': `Bearer ${token}`
        //    }
        //});
        
        const data = await response.json();
        document.getElementById('victory-royales').textContent = data.victoryRoyales || '0';
        document.getElementById('total-eliminations').textContent = data.totalEliminations || '0';
        document.getElementById('friends-online').textContent = data.friendsOnline || '0';
        document.getElementById('play-time').textContent = data.playTime || '0h';
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

function toggleDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('show');
}

document.addEventListener('click', function(event) {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('user-dropdown');
    
    if (!userMenu.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    document.getElementById(sectionName + '-section').classList.add('active');
    document.querySelector(`[onclick="showSection('${sectionName}')"]`).classList.add('active');
    
    document.getElementById('user-dropdown').classList.remove('show');
    
    currentSection = sectionName;
}

function showFriendsTab(tabName) {
    document.querySelectorAll('.friends-list').forEach(list => {
        list.style.display = 'none';
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById('friends-' + tabName + '-list').style.display = 'block';
    event.target.classList.add('active');
}

// Profile Form
document.getElementById('profile-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('profile-username').value;
    const email = document.getElementById('profile-email').value;
    const displayName = document.getElementById('profile-displayname').value;
    
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                username: username,
                email: email,
                displayName: displayName
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            updateUserInfo();
            showAlert('Profile updated successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Profile update error:', error);
        showAlert('An error occurred while updating your profile', 'error');
    }
});

// Password Form
document.getElementById('password-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        const response = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('password-form').reset();
            showAlert('Password changed successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to change password', 'error');
        }
    } catch (error) {
        console.error('Password change error:', error);
        showAlert('An error occurred while changing your password', 'error');
    }
});

// Friends Search
function searchPlayers() {
    const query = document.getElementById('friend-search').value.trim();
    
    if (!query) {
        showAlert('Please enter a username to search', 'error');
        return;
    }
    
    showAlert('Searching for players...', 'info');
    
    // Simulate search
    setTimeout(() => {
        showAlert('Player search feature coming soon!', 'info');
    }, 1000);
}

// Settings Form
document.querySelector('.settings-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const language = document.getElementById('language').value;
    const region = document.getElementById('region').value;
    const showOnline = document.getElementById('show-online').checked;
    const allowFriendRequests = document.getElementById('allow-friend-requests').checked;
    const joinInProgress = document.getElementById('join-in-progress').checked;
    
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        const response = await fetch('/api/user/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                language: language,
                region: region,
                privacy: {
                    showOnline: showOnline,
                    allowFriendRequests: allowFriendRequests,
                    joinInProgress: joinInProgress
                }
            })
        });
        
        if (response.ok) {
            showAlert('Settings saved successfully!', 'success');
        } else {
            showAlert('Failed to save settings', 'error');
        }
    } catch (error) {
        console.error('Settings update error:', error);
        showAlert('An error occurred while saving settings', 'error');
    }
});

// Delete Account
function confirmDeleteAccount() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        if (confirm('This will permanently delete all your data. Are you absolutely sure?')) {
            deleteAccount();
        }
    }
}

async function deleteAccount() {
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        const response = await fetch('/api/auth/delete-account', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            showAlert('Account deleted successfully. Redirecting...', 'success');
            setTimeout(() => {
                logout();
            }, 2000);
        } else {
            showAlert('Failed to delete account', 'error');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showAlert('An error occurred while deleting your account', 'error');
    }
}

// Logout
async function logout() {
    try {
        const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
        
        if (token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        localStorage.removeItem('neodyme_token');
        localStorage.removeItem('neodyme_user');
        sessionStorage.removeItem('neodyme_token');
        sessionStorage.removeItem('neodyme_user');
        
        window.location.href = 'login.html';
    }
}

// Auto-refresh dashboard data
setInterval(loadDashboardData, 30000);