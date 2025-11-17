async function checkServerStatus() {
    try {
        const response = await fetch('/api/web/status');
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
    const token = localStorage.getItem('neodyme_token') || sessionStorage.getItem('neodyme_token');
    
    console.log('checkAuth: token exists?', !!token); // Debug log
    
    if (!token) {
        console.log('checkAuth: no token found'); // Debug log
        if (window.location.pathname.includes('dashboard')) {
            window.location.href = '/html/login.html';
        }
        return null;
    }

    try {
        // Try to verify token with the backend
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('checkAuth: verify response status', response.status); // Debug log

        if (response.ok) {
            const data = await response.json();
            console.log('checkAuth: user verified', data.user); // Debug log
            
            // Store user data for quick access
            if (data.user) {
                const userData = JSON.stringify(data.user);
                if (localStorage.getItem('neodyme_token')) {
                    localStorage.setItem('neodyme_user', userData);
                } else if (sessionStorage.getItem('neodyme_token')) {
                    sessionStorage.setItem('neodyme_user', userData);
                }
            }
            
            return data.user;
        } else {
            throw new Error('Token invalid');
        }
    } catch (error) {
        console.log('checkAuth: error', error.message); // Debug log
        
        // If verify endpoint doesn't exist, try to get user from stored data
        // This is a fallback for compatibility
        const storedUser = localStorage.getItem('neodyme_user') || sessionStorage.getItem('neodyme_user');
        
        if (storedUser && token) {
            try {
                const user = JSON.parse(storedUser);
                console.log('checkAuth: using stored user data', user); // Debug log
                return user;
            } catch (e) {
                console.log('checkAuth: failed to parse stored user'); // Debug log
            }
        }
        
        // If all else fails, clear everything
        localStorage.removeItem('neodyme_token');
        localStorage.removeItem('neodyme_user');
        sessionStorage.removeItem('neodyme_token');
        sessionStorage.removeItem('neodyme_user');
        
        if (window.location.pathname.includes('dashboard')) {
            window.location.href = '/html/login.html';
        }
        return null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    checkServerStatus();
    setInterval(checkServerStatus, 30000);
});