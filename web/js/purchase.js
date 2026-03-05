let selectedPackage  = null;
let currentUser      = null;
let currentStep      = 1;
let appliedCreatorCode = null;

document.addEventListener('DOMContentLoaded', async function() {
    try {
        currentUser = await checkAuth();
        if (currentUser) {
            await loadVbucksBalance();
        } else {
            document.getElementById('current-vbucks').textContent = '0';
        }

        const urlCode   = new URLSearchParams(window.location.search).get('creator');
        const localCode = localStorage.getItem('neodyme_creator_code');
        const preCode   = urlCode || localCode;
        if (preCode) {
            const input = document.getElementById('creator-code-input');
            if (input) {
                input.value = preCode;
                await applyCreatorCode();
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
        document.getElementById('current-vbucks').textContent = '0';
    }
});

async function loadVbucksBalance() {
    try {
        const response = await fetch('/api/user/vbucks', { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            document.getElementById('current-vbucks').textContent = data.balance.toLocaleString();
        } else {
            document.getElementById('current-vbucks').textContent = '0';
        }
    } catch (error) {
        document.getElementById('current-vbucks').textContent = '0';
    }
}

function getBonusAmount(total) {
    switch (total) {
        case 1000:  return 0;
        case 2800:  return 300;
        case 5000:  return 800;
        case 13500: return 1500;
        default:    return 0;
    }
}

function goToStep(n) {
    const curPage = document.getElementById('purchase-step-' + currentStep);
    if (curPage) curPage.style.display = 'none';

    currentStep = n;

    const newPage = document.getElementById('purchase-step-' + n);
    if (newPage) newPage.style.display = 'block';

    for (let i = 1; i <= 4; i++) {
        const ind = document.getElementById('pstep-' + i);
        if (!ind) continue;
        ind.classList.remove('active', 'completed');
        if (i < n)      ind.classList.add('completed');
        else if (i === n) ind.classList.add('active');
    }

    for (let i = 1; i <= 3; i++) {
        const conn = document.getElementById('pstep-conn-' + i);
        if (conn) conn.classList.toggle('filled', i < n);
    }

    const stepsEl = document.querySelector('.purchase-steps');
    if (stepsEl) {
        const top = stepsEl.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    if (n === 3) populateReview();
}

function onCreatorCodeInput() {
    const fb = document.getElementById('creator-code-feedback');
    if (fb) { fb.textContent = ''; fb.className = 'creator-code-feedback'; }
    if (!appliedCreatorCode) return;
    const input = document.getElementById('creator-code-input');
    if (input && input.value.trim().toLowerCase() !== appliedCreatorCode.code) {
        appliedCreatorCode = null;
    }
}

async function applyCreatorCode() {
    const input = document.getElementById('creator-code-input');
    const fb    = document.getElementById('creator-code-feedback');
    if (!input || !fb) return;

    const code = input.value.trim();
    if (!code) {
        appliedCreatorCode = null;
        localStorage.removeItem('neodyme_creator_code');
        fb.textContent = '';
        fb.className = 'creator-code-feedback';
        return;
    }

    fb.textContent = 'Checking…';
    fb.className = 'creator-code-feedback';

    try {
        const res  = await fetch(`/api/creator-code/validate/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.valid) {
            appliedCreatorCode = { code: code.toLowerCase(), creatorName: data.creatorName };
            localStorage.setItem('neodyme_creator_code', code.toLowerCase());
            fb.textContent = `✓ Supporting ${data.creatorName}`;
            fb.className = 'creator-code-feedback valid';
        } else {
            appliedCreatorCode = null;
            localStorage.removeItem('neodyme_creator_code');
            fb.textContent = '✗ Code not found or inactive';
            fb.className = 'creator-code-feedback invalid';
        }
    } catch {
        appliedCreatorCode = null;
        fb.textContent = '✗ Could not validate code';
        fb.className = 'creator-code-feedback invalid';
    }
}

function populateReview() {
    if (!selectedPackage) return;
    const method    = document.querySelector('input[name="payment-method"]:checked')?.value || 'paypal';
    const methNames = { paypal: 'PayPal', credit: 'Credit Card', crypto: 'Cryptocurrency' };

    document.getElementById('summary-amount').textContent = selectedPackage.base.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-bonus').textContent  = '+' + selectedPackage.bonus.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-total').textContent  = selectedPackage.total.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-price').textContent  = '$' + selectedPackage.price.toFixed(2);
    document.getElementById('summary-method').textContent = methNames[method] || method;
    document.getElementById('confirm-price').textContent  = selectedPackage.price.toFixed(2);

    const bonusRow = document.getElementById('summary-bonus-row');
    if (bonusRow) bonusRow.style.display = selectedPackage.bonus === 0 ? 'none' : '';

    const creatorRow = document.getElementById('summary-creator-row');
    const creatorEl  = document.getElementById('summary-creator');
    if (creatorRow && creatorEl) {
        if (appliedCreatorCode) {
            creatorEl.textContent = appliedCreatorCode.creatorName;
            creatorRow.style.display = '';
        } else {
            creatorRow.style.display = 'none';
        }
    }
}

function selectPackage(total, price, cardEl) {
    if (!currentUser) {
        showAlert('Please sign in to purchase V-Bucks', 'error');
        setTimeout(() => { window.location.href = 'login.html?redirect=purchase.html'; }, 2000);
        return;
    }

    document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');

    const bonus = getBonusAmount(total);
    const base  = total - bonus;

    selectedPackage = { total, base, bonus, price };
    goToStep(2);
}

async function confirmPurchase() {
    if (!selectedPackage || !currentUser) return;

    const btn      = document.getElementById('confirm-purchase-btn');
    const origHtml = btn.innerHTML;

    try {
        btn.disabled  = true;
        btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;margin-right:8px;"></div> Processing…';

        const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'paypal';

        const body = {
            packageAmount: selectedPackage.total,
            price:         selectedPackage.price,
            paymentMethod
        };
        if (appliedCreatorCode) body.creatorCode = appliedCreatorCode.code;

        const response = await secureFetch('/api/purchase/vbucks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('success-amount').textContent = selectedPackage.total.toLocaleString() + ' V-Bucks';
            selectedPackage = null;

            await loadVbucksBalance();
            const newBal = document.getElementById('current-vbucks').textContent;
            document.getElementById('success-new-balance').textContent = newBal;

            goToStep(4);
        } else {
            throw new Error(data.message || 'Purchase failed');
        }
    } catch (error) {
        showAlert(error.message || 'An error occurred during purchase. Please try again.', 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = origHtml;
    }
}

function cancelPurchase() {
    goToStep(1);
    showAlert('Purchase cancelled', 'info');
}

function showAlert(message, type = 'info') {
    const alertEl = document.getElementById('alert');
    const msgEl   = document.getElementById('alert-message');
    if (!alertEl || !msgEl) return;
    alertEl.className       = 'alert alert-' + type;
    msgEl.textContent       = message;
    alertEl.style.display   = 'flex';
    if (type === 'success' || type === 'info') {
        setTimeout(() => { alertEl.style.display = 'none'; }, 5000);
    }
}
