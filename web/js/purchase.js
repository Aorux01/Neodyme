let selectedPackage = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async function() {
    try {
        currentUser = await checkAuth();

        if (currentUser) {
            await loadVbucksBalance();
        } else {
            document.getElementById('current-vbucks').textContent = '0';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        document.getElementById('current-vbucks').textContent = '0';
    }
});

async function loadVbucksBalance() {
    try {
        const response = await fetch('/api/user/vbucks', {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('current-vbucks').textContent = data.balance.toLocaleString();
        } else {
            document.getElementById('current-vbucks').textContent = '0';
        }
    } catch (error) {
        console.error('Failed to load V-Bucks balance:', error);
        document.getElementById('current-vbucks').textContent = '0';
    }
}

function getBonusAmount(amount) {
    switch(amount) {
        case 1000: return 0;
        case 2800: return 300;
        case 5000: return 800;
        case 13500: return 1500;
        default: return 0;
    }
}

function selectPackage(amount, price) {
    if (!currentUser) {
        showAlert('Please sign in to purchase V-Bucks', 'error');
        setTimeout(() => {
            window.location.href = 'login.html?redirect=purchase.html';
        }, 2000);
        return;
    }

    selectedPackage = { amount, price };

    const bonus = getBonusAmount(amount);
    const totalAmount = amount + bonus;

    document.getElementById('summary-amount').textContent = amount.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-bonus').textContent = '+' + bonus.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-total').textContent = totalAmount.toLocaleString() + ' V-Bucks';
    document.getElementById('summary-price').textContent = '$' + price.toFixed(2);
    document.getElementById('confirm-price').textContent = price.toFixed(2);

    document.getElementById('payment-section').style.display = 'block';

    document.getElementById('payment-section').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

function cancelPurchase() {
    selectedPackage = null;
    document.getElementById('payment-section').style.display = 'none';
    showAlert('Purchase cancelled', 'info');
}

async function confirmPurchase() {
    if (!selectedPackage) {
        showAlert('Please select a package first', 'error');
        return;
    }

    if (!currentUser) {
        showAlert('Please sign in to complete your purchase', 'error');
        setTimeout(() => {
            window.location.href = 'login.html?redirect=purchase.html';
        }, 2000);
        return;
    }

    const confirmBtn = document.getElementById('confirm-purchase-btn');
    const originalText = confirmBtn.innerHTML;

    try {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<div class="loading-spinner"></div> Processing...';

        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;

        const response = await fetch('/api/purchase/vbucks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                packageAmount: selectedPackage.amount,
                price: selectedPackage.price,
                paymentMethod: paymentMethod
            })
        });

        const data = await response.json();

        if (response.ok) {
            const totalAmount = selectedPackage.amount + getBonusAmount(selectedPackage.amount);

            showAlert(`Successfully purchased ${totalAmount.toLocaleString()} V-Bucks!`, 'success');

            document.getElementById('payment-section').style.display = 'none';
            selectedPackage = null;

            await loadVbucksBalance();

        } else {
            throw new Error(data.message || 'Purchase failed');
        }
    } catch (error) {
        console.error('Purchase error:', error);
        showAlert(error.message || 'An error occurred during purchase. Please try again.', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
    }
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function goToShop() {
    closeModal('success-modal');
    window.location.href = 'shop.html';
}

function showAlert(message, type = 'info') {
    const alert = document.getElementById('alert');
    const alertMessage = document.getElementById('alert-message');

    if (!alert || !alertMessage) return;

    alert.className = `alert alert-${type}`;
    alertMessage.textContent = message;
    alert.style.display = 'flex';

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});
