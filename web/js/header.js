async function updateHeaderAuth() {
    try {
        const user = await checkAuth();
        const headerActions = document.querySelector('.header-actions');

        if (!headerActions) return;

        if (user) {
            headerActions.innerHTML = `
                <div class="user-menu">
                    <div class="user-info" onclick="toggleUserDropdown()">
                        <div class="user-avatar">${user.displayName.charAt(0).toUpperCase()}</div>
                        <span class="user-name">${user.displayName}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="user-dropdown" id="user-dropdown">
                        <div class="dropdown-header">
                            <div class="dropdown-avatar">${user.displayName.charAt(0).toUpperCase()}</div>
                            <div class="dropdown-info">
                                <span class="dropdown-name">${user.displayName}</span>
                                <span class="dropdown-email">${user.email}</span>
                            </div>
                        </div>
                        <div class="dropdown-divider"></div>
                        <a href="dashboard.html" class="dropdown-item">
                            <i class="fas fa-tachometer-alt"></i>
                            Dashboard
                        </a>
                        <a href="shop.html" class="dropdown-item">
                            <i class="fas fa-shopping-bag"></i>
                            Item Shop
                        </a>
                        <a href="purchase.html" class="dropdown-item">
                            <i class="fas fa-coins"></i>
                            Get V-Bucks
                        </a>
                        <div class="dropdown-divider"></div>
                        <a href="#" onclick="handleLogout(event)" class="dropdown-item logout">
                            <i class="fas fa-sign-out-alt"></i>
                            Sign Out
                        </a>
                    </div>
                </div>
            `;

            addHeaderStyles();
        } else {
            headerActions.innerHTML = `
                <a href="login.html" class="btn btn-secondary">SIGN IN</a>
                <a href="register.html" class="btn btn-primary">CREATE ACCOUNT</a>
            `;
        }
    } catch (error) {
        console.error('Error updating header auth:', error);
    }
}

function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

async function handleLogout(event) {
    event.preventDefault();

    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        sessionStorage.removeItem('neodyme_user');
        window.location.href = '../index.html';
    }
}

function addHeaderStyles() {
    if (document.getElementById('header-auth-styles')) return;

    const style = document.createElement('style');
    style.id = 'header-auth-styles';
    style.textContent = `
        .user-menu {
            position: relative;
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .user-info:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(139, 92, 246, 0.5);
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 14px;
            color: white;
        }

        .user-name {
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .user-info i {
            font-size: 12px;
            color: #b0b0b0;
            transition: transform 0.2s ease;
        }

        .user-info:hover i {
            color: #8b5cf6;
        }

        .user-dropdown {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            width: 280px;
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.2s ease;
            z-index: 1000;
        }

        .user-dropdown.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .dropdown-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: rgba(139, 92, 246, 0.1);
        }

        .dropdown-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 20px;
            color: white;
            flex-shrink: 0;
        }

        .dropdown-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }

        .dropdown-name {
            font-size: 16px;
            font-weight: 600;
            color: #ffffff;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .dropdown-email {
            font-size: 12px;
            color: #b0b0b0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .dropdown-divider {
            height: 1px;
            background: #333;
            margin: 8px 0;
        }

        .dropdown-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            color: #e6e6e6;
            text-decoration: none;
            font-size: 14px;
            transition: all 0.2s ease;
        }

        .dropdown-item:hover {
            background: rgba(139, 92, 246, 0.1);
            color: #8b5cf6;
        }

        .dropdown-item i {
            width: 20px;
            text-align: center;
            color: #b0b0b0;
        }

        .dropdown-item:hover i {
            color: #8b5cf6;
        }

        .dropdown-item.logout {
            color: #ff6b6b;
        }

        .dropdown-item.logout:hover {
            background: rgba(255, 107, 107, 0.1);
            color: #ff5252;
        }

        .dropdown-item.logout i {
            color: #ff6b6b;
        }

        .dropdown-item.logout:hover i {
            color: #ff5252;
        }

        @media (max-width: 768px) {
            .user-name {
                display: none;
            }

            .user-dropdown {
                width: 260px;
            }
        }
    `;

    document.head.appendChild(style);
}

document.addEventListener('click', function(event) {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('user-dropdown');

    if (dropdown && !userMenu?.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHeaderAuth);
} else {
    updateHeaderAuth();
}
