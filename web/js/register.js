document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('register-form');
    const registerBtn = document.getElementById('register-btn');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    registerBtn.setAttribute('data-original-text', registerBtn.innerHTML);

    const passwordRequirements = {
        minLength: 8,
        hasUppercase: /[A-Z]/,
        hasLowercase: /[a-z]/,
        hasNumber: /[0-9]/,
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
    };

    const passwordStrengthContainer = document.createElement('div');
    passwordStrengthContainer.className = 'password-strength';
    passwordStrengthContainer.innerHTML = `
        <div class="strength-bar">
            <div class="strength-fill" id="strength-fill"></div>
        </div>
        <ul class="password-requirements" id="password-requirements">
            <li id="req-length"><i class="fas fa-times"></i> At least 8 characters</li>
            <li id="req-uppercase"><i class="fas fa-times"></i> One uppercase letter</li>
            <li id="req-lowercase"><i class="fas fa-times"></i> One lowercase letter</li>
            <li id="req-number"><i class="fas fa-times"></i> One number</li>
            <li id="req-special"><i class="fas fa-times"></i> One special character (!@#$%^&*)</li>
        </ul>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .password-strength {
            margin-top: 8px;
        }
        .strength-bar {
            height: 4px;
            background: #333;
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .strength-fill {
            height: 100%;
            width: 0%;
            transition: all 0.3s ease;
            border-radius: 2px;
        }
        .strength-fill.weak { width: 20%; background: #ff4444; }
        .strength-fill.fair { width: 40%; background: #ffaa00; }
        .strength-fill.good { width: 60%; background: #ffdd00; }
        .strength-fill.strong { width: 80%; background: #88cc00; }
        .strength-fill.excellent { width: 100%; background: #00cc44; }
        .password-requirements {
            list-style: none;
            padding: 0;
            margin: 0;
            font-size: 12px;
            color: #888;
        }
        .password-requirements li {
            margin: 4px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .password-requirements li i {
            font-size: 10px;
        }
        .password-requirements li.valid {
            color: #00cc44;
        }
        .password-requirements li.valid i:before {
            content: "\\f00c";
        }
        .password-requirements li.invalid {
            color: #888;
        }
        .password-requirements li.invalid i:before {
            content: "\\f00d";
        }
    `;
    document.head.appendChild(style);

    passwordInput.parentNode.appendChild(passwordStrengthContainer);

    function validatePassword(password) {
        const results = {
            length: password.length >= passwordRequirements.minLength,
            uppercase: passwordRequirements.hasUppercase.test(password),
            lowercase: passwordRequirements.hasLowercase.test(password),
            number: passwordRequirements.hasNumber.test(password),
            special: passwordRequirements.hasSpecial.test(password)
        };

        document.getElementById('req-length').className = results.length ? 'valid' : 'invalid';
        document.getElementById('req-uppercase').className = results.uppercase ? 'valid' : 'invalid';
        document.getElementById('req-lowercase').className = results.lowercase ? 'valid' : 'invalid';
        document.getElementById('req-number').className = results.number ? 'valid' : 'invalid';
        document.getElementById('req-special').className = results.special ? 'valid' : 'invalid';

        const passed = Object.values(results).filter(Boolean).length;
        const strengthFill = document.getElementById('strength-fill');
        strengthFill.className = 'strength-fill';

        if (passed === 0) {
            strengthFill.className = 'strength-fill';
        } else if (passed === 1) {
            strengthFill.className = 'strength-fill weak';
        } else if (passed === 2) {
            strengthFill.className = 'strength-fill fair';
        } else if (passed === 3) {
            strengthFill.className = 'strength-fill good';
        } else if (passed === 4) {
            strengthFill.className = 'strength-fill strong';
        } else {
            strengthFill.className = 'strength-fill excellent';
        }

        return Object.values(results).every(Boolean);
    }

    passwordInput.addEventListener('input', function() {
        validatePassword(this.value);
    });

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

        if (username.length < 3 || username.length > 20) {
            showAlert('Username must be between 3 and 20 characters', 'error');
            return;
        }

        if (!/^[a-zA-Z]/.test(username)) {
            showAlert('Username must start with a letter', 'error');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showAlert('Username can only contain letters, numbers, and underscores', 'error');
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

        if (!validatePassword(password)) {
            showAlert('Password does not meet the security requirements', 'error');
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
