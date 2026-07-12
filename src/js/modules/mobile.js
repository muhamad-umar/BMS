/**
 * mobile.js — BMS Mobile Interaction Layer
 * Handles: hamburger menu, sidebar backdrop, touch-friendly table card rendering.
 * NO data logic, calculations, or RLS changes.
 */

let mobileMenuToggle = null;
let sidebarBackdrop = null;
let sidebar = null;

export function initMobile() {
    // Inject mobile specific UI elements
    injectMobileHeaderLogo();
    injectBottomNavigation();
    
    // Inject other mobile controls
    injectMobileControls();
    observeViewChanges();
    applyMobileFormInputModes();
    injectMobileFilterToggles();
    
    // Bind the Movement History filter toggle button specifically
    const mvFilterBtn = document.getElementById('btn-movement-filter-mobile');
    const mvFilterPanel = document.getElementById('movement-type-filter-container');
    if (mvFilterBtn && mvFilterPanel) {
        mvFilterBtn.addEventListener('click', () => {
            if (mvFilterPanel.classList.contains('expanded')) {
                mvFilterPanel.classList.remove('expanded');
                mvFilterBtn.style.background = '#f8f9fa';
                mvFilterBtn.style.color = 'var(--text-secondary)';
            } else {
                mvFilterPanel.classList.add('expanded');
                mvFilterBtn.style.background = 'var(--primary-accent)';
                mvFilterBtn.style.color = 'white';
            }
        });
    }

    // Bind the Purchase History filter toggle button specifically
    const phFilterBtn = document.getElementById('btn-ph-filter-mobile');
    const phFilterPanel = document.getElementById('ph-date-filters-container');
    if (phFilterBtn && phFilterPanel) {
        phFilterBtn.addEventListener('click', () => {
            if (phFilterPanel.classList.contains('expanded')) {
                phFilterPanel.classList.remove('expanded');
                phFilterBtn.style.background = '#f8f9fa';
                phFilterBtn.style.color = 'var(--text-secondary)';
            } else {
                phFilterPanel.classList.add('expanded');
                phFilterBtn.style.background = 'var(--primary-accent)';
                phFilterBtn.style.color = 'white';
            }
        });
    }

    // Bind the Sales History filter toggle button
    const salesFilterBtn = document.getElementById('btn-sales-filter-mobile');
    const salesFilterPanel = document.getElementById('sales-filters-wrapper');
    if (salesFilterBtn && salesFilterPanel) {
        salesFilterBtn.addEventListener('click', () => {
            if (salesFilterPanel.classList.contains('expanded')) {
                salesFilterPanel.classList.remove('expanded');
                salesFilterBtn.style.background = '#f8f9fa';
                salesFilterBtn.style.color = 'var(--text-secondary)';
            } else {
                salesFilterPanel.classList.add('expanded');
                salesFilterBtn.style.background = 'var(--primary-accent)';
                salesFilterBtn.style.color = 'white';
            }
        });
    }

    // Bind the Payment History filter toggle button
    const paymentsFilterBtn = document.getElementById('btn-payments-filter-mobile');
    const paymentsFilterPanel = document.getElementById('payments-filters-wrapper');
    if (paymentsFilterBtn && paymentsFilterPanel) {
        paymentsFilterBtn.addEventListener('click', () => {
            if (paymentsFilterPanel.classList.contains('expanded')) {
                paymentsFilterPanel.classList.remove('expanded');
                paymentsFilterBtn.style.background = '#f8f9fa';
                paymentsFilterBtn.style.color = 'var(--text-secondary)';
            } else {
                paymentsFilterPanel.classList.add('expanded');
                paymentsFilterBtn.style.background = 'var(--primary-accent)';
                paymentsFilterBtn.style.color = 'white';
            }
        });
    }
}

function injectMobileControls() {
    // Hamburger toggle button
    mobileMenuToggle = document.createElement('button');
    mobileMenuToggle.className = 'mobile-menu-toggle';
    mobileMenuToggle.setAttribute('aria-label', 'Open navigation menu');
    mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.prepend(mobileMenuToggle);

    // Backdrop
    sidebarBackdrop = document.createElement('div');
    sidebarBackdrop.className = 'sidebar-backdrop';
    document.body.prepend(sidebarBackdrop);

    sidebar = document.querySelector('.sidebar');

    mobileMenuToggle.addEventListener('click', openSidebar);
    sidebarBackdrop.addEventListener('click', closeSidebar);

    // Close sidebar on nav link click (page change)
    if (sidebar) {
        sidebar.querySelectorAll('.nav-item a').forEach(link => {
            link.addEventListener('click', () => {
                closeSidebar();
            });
        });
    }
}

function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('visible');
    mobileMenuToggle.innerHTML = '<i class="fas fa-times"></i>';
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('visible');
    mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.style.overflow = '';
}

function injectMobileHeaderLogo() {
    if (window.innerWidth > 768) return;
    if (document.getElementById('mobile-header-logo')) return;

    const header = document.createElement('div');
    header.id = 'mobile-header-logo';
    header.className = 'mobile-header-logo';
    
    header.innerHTML = `
        <div class="logo-icon" style="width: 34px; height: 34px; font-size: 1rem; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--primary-accent); color: white;">
            <i class="fas fa-fire"></i>
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 700; color: #302058; margin: 0; letter-spacing: -0.5px;">SmartStock</h2>
    `;
    
    document.body.appendChild(header);
}

function injectBottomNavigation() {
    if (window.innerWidth > 768) return;

    const sidebarEl = document.querySelector('.sidebar');
    if (!sidebarEl) return;

    // Get all sidebar links that are actual nav items (ignore logo, etc.)
    const allLinks = Array.from(sidebarEl.querySelectorAll('.nav-links a'));
    if (allLinks.length === 0) return;
    
    // Create bottom nav container
    const bottomNav = document.createElement('div');
    bottomNav.className = 'bottom-nav';
    bottomNav.id = 'mobile-bottom-nav';

    // Split links into main and "more"
    let mainLinks = [];
    let moreLinks = [];

    if (allLinks.length <= 5) {
        mainLinks = allLinks;
    } else {
        mainLinks = allLinks.slice(0, 4);
        moreLinks = allLinks.slice(4);
    }

    // Build main items
    mainLinks.forEach(link => {
        const item = createBottomNavItem(link);
        bottomNav.appendChild(item);
    });

    if (moreLinks.length > 0) {
        // Create "More" button
        const moreBtn = document.createElement('a');
        moreBtn.className = 'bottom-nav-item';
        moreBtn.innerHTML = `
            <i class="fas fa-bars"></i>
            <span>More</span>
        `;
        moreBtn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('mobile-more-panel').classList.add('visible');
        };
        bottomNav.appendChild(moreBtn);

        // Create More Panel
        const morePanel = document.createElement('div');
        morePanel.className = 'more-panel';
        morePanel.id = 'mobile-more-panel';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-more-panel';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.onclick = () => morePanel.classList.remove('visible');
        morePanel.appendChild(closeBtn);

        const moreTitle = document.createElement('h3');
        moreTitle.textContent = 'More Options';
        moreTitle.style.marginBottom = '1.5rem';
        moreTitle.style.marginTop = '0';
        morePanel.appendChild(moreTitle);

        const moreList = document.createElement('div');
        moreList.className = 'more-links-list';
        moreLinks.forEach(link => {
            const row = document.createElement('a');
            row.className = 'more-link-row';
            row.innerHTML = link.innerHTML;
            row.onclick = (e) => {
                e.preventDefault();
                if (link.hasAttribute('onclick')) {
                    const clickCode = link.getAttribute('onclick');
                    new Function(clickCode)();
                }
                morePanel.classList.remove('visible');
                setTimeout(updateBottomNavActiveState, 50);
            };
            moreList.appendChild(row);
        });
        morePanel.appendChild(moreList);
        document.body.appendChild(morePanel);
    }

    document.body.appendChild(bottomNav);

    // Sync active state initially
    setTimeout(updateBottomNavActiveState, 100);
}

function createBottomNavItem(originalLink) {
    const item = document.createElement('a');
    item.className = 'bottom-nav-item';
    
    // Extract icon and text
    const iconHtml = originalLink.querySelector('i')?.outerHTML || '<i class="fas fa-circle"></i>';
    let clone = originalLink.cloneNode(true);
    let iNode = clone.querySelector('i');
    if (iNode) clone.removeChild(iNode);
    let text = clone.textContent.trim();

    item.innerHTML = `
        ${iconHtml}
        <span>${text}</span>
    `;

    item.onclick = (e) => {
        e.preventDefault();
        if (originalLink.hasAttribute('onclick')) {
            const clickCode = originalLink.getAttribute('onclick');
            new Function(clickCode)();
        }
        setTimeout(updateBottomNavActiveState, 50);
    };

    return item;
}

window.updateBottomNavActiveState = function() {
    const activeSidebarLink = document.querySelector('.sidebar .nav-item.active a');
    if (!activeSidebarLink) return;
    
    let clone = activeSidebarLink.cloneNode(true);
    let iNode = clone.querySelector('i');
    if (iNode) clone.removeChild(iNode);
    const activeText = clone.textContent.trim();

    document.querySelectorAll('.bottom-nav-item').forEach(nav => {
        const span = nav.querySelector('span');
        if (span && span.textContent.trim() === activeText) {
            nav.classList.add('active');
        } else {
            nav.classList.remove('active');
        }
    });
};

function injectMobileFilterToggles() {
    if (window.innerWidth > 768) return;

    // Identify filter containers by their specific IDs (search inputs or specific selects)
    const filterInputs = [
        'inv-search',
        'sales-filter-search',
        'payments-filter-search',
        'search-customer',
        'mv-search',
        'exp-filter-search'
    ];

    filterInputs.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;

        // The filter panel is usually the closest .card-panel or a styled div
        let panel = input.closest('.card-panel') || input.closest('div[style*="border-radius: 14px"]');
        if (!panel) return;

        // Prevent double injection
        if (panel.previousElementSibling && panel.previousElementSibling.classList.contains('mobile-filter-toggle')) return;

        // Add a class to hide it by default in mobile.css
        panel.classList.add('mobile-filter-panel');

        const btn = document.createElement('button');
        btn.className = 'btn mobile-filter-toggle';
        btn.style.background = '#f3effb';
        btn.style.color = 'var(--primary-accent)';
        btn.style.width = '100%';
        btn.style.marginBottom = '1rem';
        btn.style.justifyContent = 'center';
        btn.innerHTML = '<i class="fas fa-filter" style="margin-right:0.5rem;"></i> Search & Filters';
        
        btn.onclick = () => {
            if (panel.classList.contains('expanded')) {
                panel.classList.remove('expanded');
                btn.style.background = '#f3effb';
                btn.style.color = 'var(--primary-accent)';
            } else {
                panel.classList.add('expanded');
                btn.style.background = 'var(--primary-accent)';
                btn.style.color = 'white';
            }
        };

        panel.parentNode.insertBefore(btn, panel);
    });
}


/**
 * Watch for view changes and apply mobile table card rendering.
 * We observe tbody elements for mutation changes — when JS populates
 * a table, we post-process it on mobile to render card rows.
 */
function observeViewChanges() {
    // Only run on mobile
    if (window.innerWidth > 768) return;

    // Disabled JS-based card conversion per user request:
    // "try to print one record in one row correctly" -> Native horizontal scrolling tables.
    const tablesToCard = [];

    tablesToCard.forEach(({ tbodyId, converter }) => {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        const observer = new MutationObserver(() => {
            convertTableToCards(tbody, converter);
        });

        observer.observe(tbody, { childList: true });
    });
}

/**
 * Convert a populated <tbody> into mobile card rows.
 * We hide the HEADER ROW of the table and replace tbody with card divs.
 */
function convertTableToCards(tbody, converter) {
    if (window.innerWidth > 768) return;

    // Remove previously generated card wrappers
    const existingCards = tbody.parentElement.parentElement.querySelectorAll('.mobile-cards-wrapper');
    existingCards.forEach(el => el.remove());

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Don't convert "Loading..." / empty-state rows
    const firstTd = rows[0]?.querySelector('td');
    if (firstTd && firstTd.colSpan > 2) return;

    // Hide the original table and thead
    const table = tbody.closest('table');
    if (!table) return;

    // Create a card container div
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'mobile-cards-wrapper';

    rows.forEach(row => {
        const card = converter(row);
        if (card) cardWrapper.appendChild(card);
    });

    // Insert after the table's scrollable container
    const scrollContainer = table.closest('div[style*="overflow"]') || table.parentElement;
    scrollContainer.style.display = 'none';
    scrollContainer.parentElement.insertBefore(cardWrapper, scrollContainer.nextSibling);
}

/* ─── ROW CONVERTERS ─────────────────────────── */

function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
}

function makeCard(children) {
    const card = el('div', 'mobile-card-row');
    children.forEach(c => c && card.appendChild(c));
    return card;
}

function convertSaleRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 6) return null;
    const saleId = tds[0]?.textContent?.trim();
    const date = tds[1]?.textContent?.trim();
    const customer = tds[2]?.textContent?.trim();
    const amount = tds[4]?.textContent?.trim();
    const recordedBy = tds[5]?.textContent?.trim();
    const actionsHtml = tds[6]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', customer || 'Walk-in'));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${saleId}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-clock"></i> ${date}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-user"></i> ${recordedBy}`));

    const actions = el('div', 'mc-actions', actionsHtml);

    return makeCard([primary, secondary, actions]);
}

function convertPaymentRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 5) return null;
    const payId = tds[0]?.textContent?.trim();
    const date = tds[1]?.textContent?.trim();
    const customer = tds[2]?.textContent?.trim();
    const amount = tds[3]?.textContent?.trim();
    const recordedBy = tds[4]?.textContent?.trim();
    const actionsHtml = tds[5]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', customer || 'Walk-in'));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${payId}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-clock"></i> ${date}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-user"></i> ${recordedBy}`));

    const actions = el('div', 'mc-actions', actionsHtml);
    return makeCard([primary, secondary, actions]);
}

function convertCustomerRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 4) return null;
    const name = tds[0]?.textContent?.trim();
    const phone = tds[1]?.textContent?.trim();
    const lastOrder = tds[2]?.textContent?.trim();
    const balance = tds[3]?.textContent?.trim();
    const statusHtml = tds[4]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', name));
    primary.appendChild(el('span', 'mc-amount', balance));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-phone"></i> ${phone}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-calendar"></i> ${lastOrder}`));
    secondary.appendChild(el('span', 'mc-meta', statusHtml));

    return makeCard([primary, secondary]);
}

function convertExpenseRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 4) return null;
    const date = tds[0]?.textContent?.trim();
    const category = tds[1]?.textContent?.trim();
    const desc = tds[2]?.textContent?.trim();
    const amount = tds[3]?.textContent?.trim();
    const actionsHtml = tds[4]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', category));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-calendar"></i> ${date}`));
    if (desc) secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-info-circle"></i> ${desc}`));

    const actions = el('div', 'mc-actions', actionsHtml);
    return makeCard([primary, secondary, actions]);
}

function convertMovementRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 5) return null;
    const date = tds[0]?.textContent?.trim();
    const product = tds[1]?.textContent?.trim();
    const typeHtml = tds[2]?.innerHTML || tds[2]?.textContent?.trim();
    const qty = tds[3]?.textContent?.trim();
    const ref = tds[4]?.textContent?.trim();

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', product));
    primary.appendChild(el('span', 'mc-amount', `Qty: ${qty}`));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-calendar"></i> ${date}`));
    secondary.appendChild(el('span', 'mc-meta', typeHtml));
    if (ref) secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-tag"></i> ${ref}`));

    return makeCard([primary, secondary]);
}

function convertEmployeeRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 5) return null;
    const name = tds[0]?.textContent?.trim();
    const salesCount = tds[1]?.textContent?.trim();
    const salesTotal = tds[2]?.textContent?.trim();
    const payCount = tds[3]?.textContent?.trim();
    const payTotal = tds[4]?.textContent?.trim();

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', name));
    primary.appendChild(el('span', 'mc-amount', salesTotal));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-shopping-cart"></i> ${salesCount} sales`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-money-bill-wave"></i> ${payCount} pmts · ${payTotal}`));

    return makeCard([primary, secondary]);
}

function convertRecentSaleRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 5) return null;
    const saleId = tds[0]?.textContent?.trim();
    const customer = tds[1]?.textContent?.trim();
    const time = tds[2]?.textContent?.trim();
    const amount = tds[3]?.textContent?.trim();
    const recordedBy = tds[4]?.textContent?.trim();
    const actionsHtml = tds[5]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', customer || 'Walk-in'));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${saleId}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-clock"></i> ${time}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-user"></i> ${recordedBy}`));

    const actions = el('div', 'mc-actions', actionsHtml);
    return makeCard([primary, secondary, actions]);
}

function convertPurchaseRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 6) return null;
    const code = tds[0]?.textContent?.trim();
    const date = tds[1]?.textContent?.trim();
    const product = tds[2]?.textContent?.trim();
    const qty = tds[3]?.textContent?.trim();
    const buyPrice = tds[4]?.textContent?.trim();
    const total = tds[5]?.textContent?.trim();
    const remaining = tds[6]?.textContent?.trim();
    const actionsHtml = tds[7]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', product));
    primary.appendChild(el('span', 'mc-amount', total));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${code}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-calendar"></i> ${date}`));
    secondary.appendChild(el('span', 'mc-meta', `Qty: ${qty} @ ${buyPrice}`));
    if (remaining) secondary.appendChild(el('span', 'mc-meta', `FIFO Remaining: ${remaining}`));

    const actions = el('div', 'mc-actions', actionsHtml);
    return makeCard([primary, secondary, actions]);
}

function convertStaffSaleRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 4) return null;
    const code = tds[0]?.textContent?.trim();
    const time = tds[1]?.textContent?.trim();
    const customer = tds[2]?.textContent?.trim();
    const total = tds[3]?.textContent?.trim();

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', customer || 'Walk-in'));
    primary.appendChild(el('span', 'mc-amount', total));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${code}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-clock"></i> ${time}`));

    return makeCard([primary, secondary]);
}

function convertStaffPaymentRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 4) return null;
    const code = tds[0]?.textContent?.trim();
    const time = tds[1]?.textContent?.trim();
    const customer = tds[2]?.textContent?.trim();
    const amount = tds[3]?.textContent?.trim();

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', customer || 'Walk-in'));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-hashtag"></i> ${code}`));
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-clock"></i> ${time}`));

    return makeCard([primary, secondary]);
}

function convertFifoRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 7) return null;
    const product = tds[0]?.textContent?.trim();
    const stock = tds[1]?.textContent?.trim();
    const revenue = tds[5]?.textContent?.trim();
    const cogs = tds[6]?.textContent?.trim();
    const profit = tds[7]?.textContent?.trim();
    const margin = tds[8]?.textContent?.trim();
    const actionsHtml = tds[9]?.innerHTML || '';

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-name', product));
    primary.appendChild(el('span', 'mc-amount', profit));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `Stock: ${stock}`));
    secondary.appendChild(el('span', 'mc-meta', `Rev: ${revenue}`));
    secondary.appendChild(el('span', 'mc-meta', `COGS: ${cogs}`));
    if (margin) secondary.appendChild(el('span', 'mc-meta', `Margin: ${margin}`));

    const actions = el('div', 'mc-actions', actionsHtml);
    return makeCard([primary, secondary, actions]);
}

function convertLedgerRow(row) {
    const tds = row.querySelectorAll('td');
    if (tds.length < 3) return null;
    const date = tds[0]?.textContent?.trim();
    const typeHtml = tds[1]?.innerHTML || '';
    const amount = tds[2]?.textContent?.trim();
    const balance = tds[3]?.textContent?.trim();

    const primary = el('div', 'mc-primary');
    primary.appendChild(el('span', 'mc-meta', typeHtml));
    primary.appendChild(el('span', 'mc-amount', amount));

    const secondary = el('div', 'mc-secondary');
    secondary.appendChild(el('span', 'mc-meta', `<i class="fas fa-calendar"></i> ${date}`));
    if (balance) secondary.appendChild(el('span', 'mc-meta', `Balance: ${balance}`));

    return makeCard([primary, secondary]);
}

/**
 * Apply appropriate inputmode attributes on number inputs so mobile
 * keyboards show numeric pad automatically.
 */
function applyMobileFormInputModes() {
    document.querySelectorAll('input[type="number"]').forEach(input => {
        if (!input.hasAttribute('inputmode')) {
            input.setAttribute('inputmode', 'decimal');
        }
    });
}

// Auto-rerun card conversion on window resize (edge case: rotate from desktop)
window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
        // Reapply inputmode
        applyMobileFormInputModes();
    }
});
