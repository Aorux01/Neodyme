(function () {
    const NAV = [
        { href: '/', label: 'HOME', match: p => p === '/' },
        { href: 'https://github.com/Aorux01/Neodyme', label: 'GITHUB', external: true },
        { href: '/updates', label: 'UPDATES', match: p => p.startsWith('/updates') },
        { href: '/shop', label: 'SHOP', match: p => p.startsWith('/shop') },
        { href: '/status', label: 'STATUS', match: p => p.startsWith('/status') },
        { href: '/docs', label: 'DOCS', match: p => p.startsWith('/docs') }
    ];

    function linkHtml(item, path) {
        const active = item.match && item.match(path) ? ' class="active"' : '';
        const external = item.external ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${item.href}"${active}${external}>${item.label}</a>`;
    }

    function buildNav(header, path) {
        const list = header.querySelector('.nav-links');
        if (list) list.innerHTML = NAV.map(item => `<li>${linkHtml(item, path)}</li>`).join('');
    }

    function buildDrawer(header, path) {
        const container = header.querySelector('.header-container');
        if (!container || container.querySelector('.nav-burger')) return;

        const burger = document.createElement('button');
        burger.type = 'button';
        burger.className = 'nav-burger';
        burger.setAttribute('aria-label', 'Open menu');
        burger.setAttribute('aria-expanded', 'false');
        burger.innerHTML = '<i class="fas fa-bars"></i>';
        container.appendChild(burger);

        const backdrop = document.createElement('div');
        backdrop.className = 'nav-backdrop';

        const drawer = document.createElement('aside');
        drawer.className = 'nav-drawer';
        drawer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);

        function render() {
            const docsNav = document.querySelector('.docs-nav');
            const actions = header.querySelector('.header-actions');
            const guestLinks = actions && !actions.querySelector('.user-menu')
                ? Array.from(actions.querySelectorAll('a.btn')).map(a => a.outerHTML).join('')
                : '';

            drawer.innerHTML = `
                <div class="nav-drawer-head">
                    <span class="nav-drawer-title">Menu</span>
                    <button type="button" class="nav-drawer-close" aria-label="Close menu"><i class="fas fa-times"></i></button>
                </div>
                <nav class="nav-drawer-links">${NAV.map(item => linkHtml(item, path)).join('')}</nav>
                ${docsNav ? `<div class="nav-drawer-section">Documentation</div><nav class="nav-drawer-links nav-drawer-docs">${docsNav.innerHTML}</nav>` : ''}
                ${guestLinks ? `<div class="nav-drawer-actions">${guestLinks}</div>` : ''}
            `;
            drawer.querySelector('.nav-drawer-close').addEventListener('click', close);
            drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
        }

        function open() {
            render();
            document.body.classList.add('nav-open');
            burger.setAttribute('aria-expanded', 'true');
            drawer.setAttribute('aria-hidden', 'false');
        }

        function close() {
            document.body.classList.remove('nav-open');
            burger.setAttribute('aria-expanded', 'false');
            drawer.setAttribute('aria-hidden', 'true');
        }

        burger.addEventListener('click', () => {
            document.body.classList.contains('nav-open') ? close() : open();
        });
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        window.addEventListener('resize', () => { if (window.innerWidth > 768) close(); });
    }

    const TABS = [
        { href: '/account', icon: 'fa-home', label: 'Home', match: p => p === '/account' },
        { href: '/account/friends', icon: 'fa-users', label: 'Friends', match: p => p.startsWith('/account/friends') },
        { href: '/shop', icon: 'fa-shopping-bag', label: 'Shop', match: p => p.startsWith('/shop') || p.startsWith('/purchase') },
        { href: '/account/security', icon: 'fa-shield-alt', label: 'Security', match: p => p === '/account/security' || p === '/security' },
        { href: '/account/profile', icon: 'fa-user', label: 'Profile', match: p => p === '/account/profile' || p === '/account/settings' }
    ];
    const TAB_PAGES = [/^\/account/, /^\/shop/, /^\/purchase/, /^\/security$/];

    function buildTabBar(path) {
        if (!TAB_PAGES.some(re => re.test(path)) || typeof checkAuth !== 'function') return;
        checkAuth().then(user => {
            if (!user || document.querySelector('.account-tabbar')) return;
            const bar = document.createElement('nav');
            bar.className = 'account-tabbar';
            bar.setAttribute('aria-label', 'Account');
            bar.innerHTML = TABS.map(tab =>
                `<a href="${tab.href}" data-tab-path="${tab.href}"${tab.match(window.location.pathname.replace(/\/+$/, '')) ? ' class="active"' : ''}><i class="fas ${tab.icon}"></i>${tab.label}</a>`
            ).join('');
            document.body.appendChild(bar);
            document.body.classList.add('has-tabbar');

            document.addEventListener('account-section', () => {
                const current = window.location.pathname.replace(/\/+$/, '');
                bar.querySelectorAll('a').forEach((a, i) => a.classList.toggle('active', TABS[i].match(current)));
            });
            bar.addEventListener('click', (event) => {
                const link = event.target.closest('a');
                const section = link && { '/account': 'dashboard', '/account/friends': 'friends', '/account/security': 'sessions', '/account/profile': 'profile' }[link.getAttribute('href')];
                if (section && typeof goToSection === 'function' && !goToSection(section, event)) event.preventDefault();
            });
        });
    }

    function addVersionsLink(header, path) {
        fetch('/neodyme/api/site').then(r => r.json()).then(info => {
            if (!info || !info.gameVersionsUrl) return;
            NAV.splice(2, 0, { href: info.gameVersionsUrl, label: 'GAME VERSIONS', external: true });
            buildNav(header, path);
        }).catch(() => {});
    }

    function init() {
        const header = document.querySelector('.neodyme-header');
        if (!header) return;
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        buildNav(header, path);
        buildDrawer(header, path);
        addVersionsLink(header, path);
        buildTabBar(path);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
