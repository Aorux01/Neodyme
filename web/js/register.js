document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('register-form');
    const registerBtn = document.getElementById('register-btn');
    
    registerBtn.setAttribute('data-original-text', registerBtn.innerHTML);
    
    checkAuth().then(user => {
        if (user) {
            window.location.href = 'dashboard.html';
        }
    });
    
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const terms = document.getElementById('terms').checked;
        
        if (!email || !username || !password || !confirmPassword) {
            showAlert('Please fill in all fields', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showAlert('Passwords do not match', 'error');
            return;
        }
        
        if (!terms) {
            showAlert('Please accept the Terms of Service', 'error');
            return;
        }
        
        if (password.length < 6) {
            showAlert('Password must be at least 6 characters', 'error');
            return;
        }
        
        setLoading(registerBtn, true);
        
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    username: username,
                    password: password
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showAlert('Account created successfully! Redirecting to login...', 'success');
                
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                throw new Error(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showAlert(error.message || 'An error occurred during registration', 'error');
        } finally {
            setLoading(registerBtn, false);
        }
    });
});