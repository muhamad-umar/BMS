import { loadCacheData } from './api.js';
import { initializeForms } from './forms.js';
import { initializeModals, loadRecentSalesDashboard } from './core.js';
import { loadInventoryView } from './inventory.js';
import { initProfitPage } from './profit.js';
import { initExpensesPage } from './expenses.js';

import { supabase } from '../auth.js';

export let cache = {
    products: [],
    paymentMethods: [],
    customers: []
};

document.addEventListener("DOMContentLoaded", async () => {
    initializeNavLinks();
    initializeModals();
    await loadCacheData();
    await loadInventoryView();
    initializeForms();
    initProfitPage();
    initExpensesPage();
    if (typeof loadRecentSalesDashboard === 'function') loadRecentSalesDashboard();
});

export function initializeNavLinks() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });
}
