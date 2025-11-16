document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    
    loginBtn.setAttribute('data-original-text', loginBtn.innerHTML);
    
    // Get redirect URL from query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect') || 'dashboard.html';
    
    console.log('Redirect URL after login:', redirectUrl); // Debug log
    
    checkAuth().then(user => {
        if (user) {
            // If already logged in, redirect immediately
            window.location.href = redirectUrl;
        }
    });
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember-me').checked;
        
        if (!email || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        setLoading(loginBtn, true);
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    remember: remember
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showAlert('Login successful! Redirecting...', 'success');
                
                if (remember) {
                    localStorage.setItem('neodyme_token', data.token);
                    localStorage.setItem('neodyme_user', JSON.stringify(data.user));
                } else {
                    sessionStorage.setItem('neodyme_token', data.token);
                    sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
                }
                
                setTimeout(() => {
                    // Redirect to the page the user came from, or dashboard by default
                    window.location.href = redirectUrl;
                }, 1000);
            } else {
                throw new Error(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            showAlert(error.message || 'An error occurred during login', 'error');
        } finally {
            setLoading(loginBtn, false);
        }
    });
    
    document.getElementById('email').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('password').focus();
        }
    });
    
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});