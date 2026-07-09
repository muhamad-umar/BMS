import { supabase } from '../auth.js';
import { loadMovementHistory } from './movements.js';
import { loadPaymentsHistory, loadSalesList, loadSalesSummary } from './sales.js';
import { loadCustomerList, loadCustomerStats, openNewSaleForCustomer } from './customers.js';
import { loadInventoryView } from './inventory.js';

// --- MODAL LOGIC ---
export function initializeModals() {
    const overlay = document.getElementById('modal-overlay');
    const modals = {
        'btn-add-inventory': 'modal-add-inventory',
        'btn-new-customer': 'modal-new-customer',
        'btn-add-product': 'modal-add-product',
        'btn-add-category': 'modal-add-category',
        'btn-view-categories': 'modal-view-categories'
    };
    
    const btnNewSale = document.getElementById('btn-new-sale');
    if (btnNewSale) {
        btnNewSale.addEventListener('click', () => {
            if (typeof window.openNewSaleForCustomer === 'function') {
                window.openNewSaleForCustomer();
            }
        });
    }

    for (const [btnId, modalId] of Object.entries(modals)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
                const modalEl = document.getElementById(modalId);
                if (modalEl) {
                    const formEl = modalEl.querySelector('form');
                    if (formEl) formEl.reset();
                    modalEl.style.display = 'block';
                }
                overlay.style.display = 'flex';
            });
        }
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.display = 'none';
        }
    });
}

// --- GLOBAL TOAST OVERRIDE ---
// Overriding native alert to intercept all messages and show them as top-right toasts
export const alert = function(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // Auto-detect error vs success
    const msgLower = message.toLowerCase();
    let type = 'info';
    let icon = 'fa-info-circle';
    
    if (msgLower.includes('error') || msgLower.includes('fail') || msgLower.includes('please') || msgLower.includes('maximum') || msgLower.includes('must be')) {
        type = 'error';
        icon = 'fa-exclamation-circle';
    } else if (msgLower.includes('success')) {
        type = 'success';
        icon = 'fa-check-circle';
    }
    
    toast.classList.add(type);
    toast.innerHTML = `<i class="fas ${icon} toast-icon"></i><div class="toast-message">${message}</div>`;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

// --- VIEW ROUTER ---
export const showView = function(viewId) {
    document.querySelectorAll('.app-view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById('view-' + viewId).style.display = viewId === 'dashboard' ? 'flex' : 'flex';
    
    // Update active state
    const link = document.querySelector(`.nav-item a[onclick="showView('${viewId}')"]`);
    if (link) link.parentElement.classList.add('active');

    const titleEl = document.getElementById('topbar-title');
    const subtitleEl = document.getElementById('topbar-subtitle');

    if (viewId === 'customers') {
        if (titleEl) titleEl.textContent = 'Customers';
        if (subtitleEl) subtitleEl.textContent = 'Manage your clients and outstanding dues.';
        // FIX #6: Reset customer stats cache on each fresh tab visit
        if (typeof resetCustomerStatsCache === 'function') resetCustomerStatsCache();
        loadCustomerStats();
        loadCustomerList();
    } else if (viewId === 'inventory') {
        if (titleEl) titleEl.textContent = 'Inventory Management';
        if (subtitleEl) subtitleEl.textContent = 'Track your products, stock levels, and movements.';
        loadInventoryView();
        loadMovementHistory();
    } else if (viewId === 'dashboard') {
        if (titleEl) titleEl.textContent = 'Hi, Admin User';
        if (subtitleEl) subtitleEl.textContent = "Let's manage your business today!";
        loadRecentSalesDashboard();
    } else if (viewId === 'sales') {
        if (titleEl) titleEl.textContent = 'Sales Management';
        if (subtitleEl) subtitleEl.textContent = 'Track your transactions, revenue, and customer dues.';
        // FIX #6: Reset sales KPI cache on each fresh tab visit
        if (typeof resetSalesSummaryCache === 'function') resetSalesSummaryCache();
        loadSalesSummary();
        loadSalesList();
        loadPaymentsHistory();
    } else if (viewId === 'expenses') {
        if (titleEl) titleEl.textContent = 'Expenses Management';
        if (subtitleEl) subtitleEl.textContent = 'Track your spending, add expenses, and view category breakdowns.';
    }
};

export const loadRecentSalesDashboard = async function() {
    const tbody = document.getElementById('recent-sales-body');
    if (!tbody) return;
    
    try {
        const { data, error } = await supabase.from('sales')
            .select(`
                sale_id, sale_code, sale_date, grand_total,
                customers(name, current_balance),
                customer_payments(amount)
            `)
            .order('sale_date', { ascending: false })
            .limit(5);
            
        if (error) throw error;
        
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No recent sales found</td></tr>';
            return;
        }
        
        data.forEach(sale => {
            const amountPaid = sale.customer_payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
            const isPaid = amountPaid >= sale.grand_total;
            const statusColor = isPaid ? 'status-success' : 'status-warning';
            const statusText = isPaid ? 'Paid' : 'Pending';
            
            const dateObj = new Date(sale.sale_date);
            const dateStr = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ' ' + dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const custName = sale.customers?.name || 'Walk-in Customer';
            const custInitial = custName.substring(0, 2).toUpperCase();
            const saleCode = sale.sale_code || '#SL-' + sale.sale_id;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--primary-accent);">${saleCode}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${isPaid ? '#e6f8ee' : '#fff5e6'}; color: ${isPaid ? 'var(--success)' : 'var(--warning)'}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem;">${custInitial}</div>
                        <span>${custName}</span>
                    </div>
                </td>
                <td style="color: var(--text-secondary);">${dateStr}</td>
                <td style="font-weight: 600;">Rs ${Math.round(sale.grand_total).toLocaleString()}</td>
                <td><span class="status-badge ${statusColor}">${statusText}</span></td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error("Error loading recent sales:", error);
    }
};

