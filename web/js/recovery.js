async function postJson(path, body) {
    const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

async function loadFeatures() {
    try {
        const response = await fetch(`${API}/auth/features`, { credentials: 'include' });
        return (await response.json()) || {};
    } catch {
        return {};
    }
}

function showNotice(message, type = 'info') {
    const alert = document.getElementById('alert');
    if (!alert) return;
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${escHtml(message)}`;
    alert.style.display = 'block';
}

function bindSubmit(formId, handler) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('submit-btn');
        setLoading(button, true);
        try {
            await handler();
        } catch (error) {
            showNotice(error.message || 'Something went wrong. Please try again.', 'error');
        } finally {
            setLoading(button, false);
        }
    });
}

async function initForgotPassword() {
    const features = await loadFeatures();
    if (!features.passwordReset) {
        const notice = document.getElementById('feature-notice');
        notice.style.display = 'block';
        notice.textContent = 'Password reset by email is not enabled on this server. Please contact an administrator.';
        document.getElementById('submit-btn').disabled = true;
        return;
    }

    bindSubmit('forgot-form', async () => {
        const { ok, data } = await postJson('/auth/forgot-password', { email: document.getElementById('email').value.trim() });
        if (!ok) throw new Error(data.message || 'Request failed.');
        showNotice(data.message, 'success');
        document.getElementById('forgot-form').style.display = 'none';
    });
}

function initResetPassword() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
        showNotice('This reset link is incomplete. Please request a new one.', 'error');
        document.getElementById('reset-form').style.display = 'none';
        return;
    }

    bindSubmit('reset-form', async () => {
        const password = document.getElementById('password').value;
        if (password !== document.getElementById('confirm').value) {
            throw new Error('The two passwords do not match.');
        }

        const { ok, data } = await postJson('/auth/reset-password', { token, password });
        if (!ok) throw new Error(data.message || 'Could not update the password.');

        showNotice(data.message, 'success');
        document.getElementById('reset-form').style.display = 'none';
        setTimeout(() => { window.location.href = '/login'; }, 2500);
    });
}

async function initVerifyEmail() {
    const status = document.getElementById('verify-status');
    const resend = document.getElementById('resend-form');
    const token = new URLSearchParams(window.location.search).get('token');

    const showResend = async (message) => {
        status.className = 'alert alert-error';
        status.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escHtml(message)}`;
        const features = await loadFeatures();
        if (features.emailVerification) resend.style.display = 'block';
    };

    if (!token) {
        await showResend('This verification link is incomplete.');
    } else {
        try {
            const { ok, data } = await postJson('/auth/verify-email', { token });
            if (ok) {
                status.className = 'alert alert-success';
                status.innerHTML = `<i class="fas fa-check-circle"></i> ${escHtml(data.message)}`;
                setTimeout(() => { window.location.href = '/login'; }, 2500);
            } else {
                await showResend(data.message || 'This verification link is invalid or has expired.');
            }
        } catch {
            await showResend('Could not reach the server. Please try again.');
        }
    }

    bindSubmit('resend-form', async () => {
        const { ok, data } = await postJson('/auth/resend-verification', { email: document.getElementById('email').value.trim() });
        if (!ok) throw new Error(data.message || 'Request failed.');
        status.className = 'alert alert-success';
        status.innerHTML = `<i class="fas fa-check-circle"></i> ${escHtml(data.message)}`;
        resend.style.display = 'none';
    });
}

async function initAppeal() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('email')) document.getElementById('email').value = params.get('email');

    const features = await loadFeatures();
    if (!features.banAppeals) {
        const notice = document.getElementById('feature-notice');
        notice.style.display = 'block';
        notice.textContent = 'Ban appeals are not enabled on this server. Please contact an administrator.';
        document.getElementById('submit-btn').disabled = true;
        return;
    }

    bindSubmit('appeal-form', async () => {
        const { ok, data } = await postJson('/auth/appeal', {
            email: document.getElementById('email').value.trim(),
            message: document.getElementById('message').value.trim()
        });
        if (!ok) throw new Error(data.message || 'Request failed.');
        showNotice(data.message, 'success');
        document.getElementById('appeal-form').style.display = 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'forgot-password') initForgotPassword();
    if (page === 'reset-password') initResetPassword();
    if (page === 'verify-email') initVerifyEmail();
    if (page === 'appeal') initAppeal();
});
