// Only same-site paths are accepted; legacy "page.html" values are mapped to clean URLs.
function safeRedirect(value) {
    if (!value) return '/dashboard';
    const path = '/' + value.replace(/^(\.\/|html\/|\/)+/, '').replace(/\.html$/, '');
    return path.startsWith('//') || path.includes('\\') ? '/dashboard' : path;
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');

    loginBtn.setAttribute('data-original-text', loginBtn.innerHTML);

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = safeRedirect(urlParams.get('redirect'));

    const magicToken = urlParams.get('magic');
    if (magicToken) {
        signInWithMagicLink(magicToken, redirectUrl);
    } else {
        checkAuth().then(user => {
            if (user) {
                window.location.href = redirectUrl;
            }
        });
    }

    setupRecoveryOptions();
    handleOAuthReturn(urlParams, redirectUrl);

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
            const response = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: email,
                    password: password,
                    remember: remember
                })
            });

            const data = await response.json();

            if (response.ok && data.mfaRequired) {
                showMfaStep(data, redirectUrl);
                return;
            }

            if (response.ok) {
                showAlert('Login successful! Redirecting...', 'success');

                if (data.user) {
                    sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
                }

                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1000);
            } else if (response.status === 403 && data.error === 'FORBIDDEN') {
                showBannedNotice(email, data.message);
                return;
            } else if (data.error === 'EMAIL_NOT_VERIFIED') {
                showUnverifiedNotice(email, data.message);
                return;
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

async function signInWithMagicLink(token, redirectUrl) {
    history.replaceState(null, '', window.location.pathname);
    showAlert('Signing you in...', 'info');
    try {
        const response = await fetch(`${API}/auth/magic-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'This sign-in link is invalid or has expired.');

        if (data.mfaRequired) {
            showMfaStep(data, redirectUrl);
            return;
        }

        if (data.user) sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
        window.location.href = redirectUrl;
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function setupRecoveryOptions() {
    let features = {};
    try {
        features = await (await fetch(`${API}/auth/features`, { credentials: 'include' })).json();
    } catch {
        return;
    }

    window.recoveryFeatures = features;

    if (features.discord) {
        const discordButton = document.getElementById('discord-btn');
        discordButton.style.display = '';
        discordButton.addEventListener('click', () => {
            const target = safeRedirect(new URLSearchParams(window.location.search).get('redirect'));
            window.location.href = `${API}/auth/discord/login?redirect=${encodeURIComponent(target)}`;
        });
    }

    if (features.passwordReset) document.getElementById('forgot-link').style.display = '';

    if (features.magicLink) {
        const button = document.getElementById('magic-btn');
        button.style.display = '';
        button.addEventListener('click', async () => {
            const email = document.getElementById('email').value.trim();
            if (!email.includes('@')) {
                showAlert('Enter your email address above first', 'error');
                return;
            }

            setLoading(button, true);
            try {
                const response = await fetch(`${API}/auth/magic-link`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();
                showAlert(data.message || 'Request failed', response.ok ? 'success' : 'error');
            } catch {
                showAlert('Could not reach the server', 'error');
            } finally {
                setLoading(button, false);
            }
        });
    }
}

function showUnverifiedNotice(email, message) {
    const alert = document.getElementById('alert');
    alert.className = 'alert alert-error';
    alert.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escHtml(message)} <a href="#" id="resend-link" class="form-link">Send a new link</a>`;
    alert.style.display = 'block';

    document.getElementById('resend-link').addEventListener('click', async (event) => {
        event.preventDefault();
        const response = await fetch(`${API}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json().catch(() => ({}));
        showAlert(data.message || 'Request failed', response.ok ? 'success' : 'error');
    });
}

function showMfaStep(challenge, redirectUrl) {
    const loginForm = document.getElementById('login-form');
    const mfaForm = document.getElementById('mfa-form');
    const codeInput = document.getElementById('mfa-code');
    const button = document.getElementById('mfa-btn');
    const emailLink = document.getElementById('mfa-email-link');
    let method = 'code';

    document.getElementById('alert').style.display = 'none';
    loginForm.style.display = 'none';
    document.getElementById('magic-btn').style.display = 'none';
    document.querySelector('.divider').style.display = 'none';
    mfaForm.style.display = '';
    codeInput.focus();

    emailLink.style.display = challenge.methods && challenge.methods.email ? '' : 'none';

    emailLink.onclick = async (event) => {
        event.preventDefault();
        const response = await fetch(`${API}/auth/login/2fa/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mfaToken: challenge.mfaToken })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            method = 'email';
            document.getElementById('mfa-label').textContent = 'Code from your email';
            codeInput.placeholder = '6-digit code';
            showAlert(data.message, 'success');
        } else {
            showAlert(data.message || 'Could not send the code', 'error');
        }
    };

    document.getElementById('mfa-restart-link').onclick = (event) => {
        event.preventDefault();
        window.location.href = '/login';
    };

    mfaForm.onsubmit = async (event) => {
        event.preventDefault();
        setLoading(button, true);

        try {
            const response = await fetch(`${API}/auth/login/2fa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ mfaToken: challenge.mfaToken, method, code: codeInput.value.trim() })
            });
            const data = await response.json();

            if (!response.ok) {
                if (data.error === 'MFA_EXPIRED') {
                    showAlert(data.message, 'error');
                    setTimeout(() => { window.location.href = '/login'; }, 2500);
                    return;
                }
                throw new Error(data.message || 'That code is not correct.');
            }

            if (data.user) sessionStorage.setItem('neodyme_user', JSON.stringify(data.user));
            const lowCodes = typeof data.backupCodesRemaining === 'number' && data.backupCodesRemaining <= 2;
            showAlert(lowCodes ? 'Signed in. You are running low on backup codes: generate new ones from your Security page.' : 'Login successful! Redirecting...', 'success');
            setTimeout(() => { window.location.href = redirectUrl; }, lowCodes ? 2500 : 800);
        } catch (error) {
            showAlert(error.message, 'error');
            codeInput.select();
        } finally {
            setLoading(button, false);
        }
    };
}

function showBannedNotice(email, message) {
    const alert = document.getElementById('alert');
    const canAppeal = window.recoveryFeatures && window.recoveryFeatures.banAppeals;
    const link = canAppeal ? ` <a href="/appeal?email=${encodeURIComponent(email)}" class="form-link">Appeal this decision</a>` : '';

    alert.className = 'alert alert-error';
    alert.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escHtml(message)}${link}`;
    alert.style.display = 'block';
}

const OAUTH_MESSAGES = {
    not_linked: 'No account is linked to this Discord profile. Sign in with your password, then link Discord from your Security page.',
    banned: 'This account has been disabled.',
    denied: 'The Discord sign-in was cancelled.',
    state: 'The Discord sign-in expired. Please try again.',
    unavailable: 'Discord sign-in is not available on this server.',
    failed: 'The Discord sign-in failed. Please try again.'
};

function handleOAuthReturn(params, redirectUrl) {
    const error = params.get('oauth_error');
    const mfaToken = params.get('mfa');
    if (!error && !mfaToken) return;

    history.replaceState(null, '', window.location.pathname);

    if (error) {
        showAlert(OAUTH_MESSAGES[error] || OAUTH_MESSAGES.failed, 'error');
        return;
    }

    const methods = (params.get('m') || '').split(',');
    showMfaStep({ mfaToken, methods: { totp: true, backup: true, email: methods.includes('email') } }, redirectUrl);
}

