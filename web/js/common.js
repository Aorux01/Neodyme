async function checkServerStatus() {
    try {
        const response = await fetch('/api/web/status', { credentials: 'include' });
        const data = await response.json();

        const statusElements = document.querySelectorAll('.server-status');
        statusElements.forEach(element => {
            const statusDot = element.querySelector('.status-dot');
            const statusText = element.querySelector('span');

            if (data.online) {
                statusDot.style.background = '#4CAF50';
                statusText.textContent = `SERVER STATUS: ONLINE`;
            } else {
                statusDot.style.background = '#f44336';
                statusText.textContent = 'SERVER STATUS: OFFLINE';
            }
        });
    } catch (error) {
        console.log('Server status check failed');
    }
}

function showAlert(message, type = 'info', elementId = 'alert') {
    const alert = document.getElementById(elementId);
    if (!alert) return;

    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
    alert.style.display = 'block';

    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<div class="loading-spinner"></div> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.getAttribute('data-original-text');
    }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/verify', {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();

            if (data.user) {
                sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
            }

            return data.user;
        } else {
            throw new Error('Token invalid');
        }
    } catch (error) {
        sessionStorage.removeItem('neodyme_user');

        if (window.location.pathname.includes('dashboard')) {
            window.location.href = '/html/login.html';
        }
        return null;
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.log('Logout request failed');
    }

    sessionStorage.removeItem('neodyme_user');
    window.location.href = '/html/login.html';
}

function getStoredUser() {
    const storedUser = sessionStorage.getItem('neodyme_user');
    if (storedUser) {
        try {
            return JSON.parse(storedUser);
        } catch (e) {
            return null;
        }
    }
    return null;
}

let csrfToken = null;

async function getCsrfToken() {
    if (csrfToken) return csrfToken;

    try {
        const response = await fetch('/api/auth/csrf-token', { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrfToken;
            return csrfToken;
        }
    } catch (error) {
        console.error('Failed to get CSRF token:', error);
    }
    return null;
}

async function secureFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const token = await getCsrfToken();

        if (token) {
            options.headers = {
                ...options.headers,
                'X-CSRF-Token': token
            };
        }

        csrfToken = null;
    }

    options.credentials = 'include';
    return fetch(url, options);
}

document.addEventListener('DOMContentLoaded', function() {
    checkServerStatus();
    setInterval(checkServerStatus, 30000);
});
