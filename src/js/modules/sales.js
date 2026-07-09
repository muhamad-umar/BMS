import { supabase } from '../auth.js';

// --- SALES VIEW LOGIC ---

export let salesSummaryData = null;
export let currentSalesRange = 'today';
let salesListCache = [];
let currentSalesPage = 1;
const salesPerPage = 5;
let salesFilters = { search: '', date: '', status: '', sort: 'newest' };

let paymentsHistoryCache = [];
let currentPaymentsPage = 1;
const paymentsPerPage = 5;
let paymentsFilters = { search: '', date: '' };

export const loadSalesSummary = async function() {
    try {
        const { data, error } = await supabase.rpc('get_sales_summary');
        if (error) throw error;
        
        salesSummaryData = data;
        updateSalesSummaryUI(currentSalesRange);
        
        document.getElementById('sales-stat-receivables').textContent = `Rs ${Math.round(data.outstanding_receivables || 0).toLocaleString()}`;
    } catch (error) {
        console.error("Error loading sales summary:", error);
    }
}

export function updateSalesSummaryUI(range) {
    if (!salesSummaryData || !salesSummaryData[range]) return;
    const d = salesSummaryData[range];
    
    document.getElementById('sales-stat-total').textContent = `Rs ${Math.round(d.total_sales || 0).toLocaleString()}`;
    document.getElementById('sales-stat-count').textContent = d.transactions || 0;
    
    const avg = d.transactions > 0 ? (d.total_sales / d.transactions) : 0;
    document.getElementById('sales-stat-avg').textContent = `Rs ${Math.round(avg).toLocaleString()}`;
    document.getElementById('sales-stat-discount').textContent = `Rs ${Math.round(d.discount || 0).toLocaleString()}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Sales KPI Toggle
    const kpiBtns = document.querySelectorAll('#sales-kpi-toggle .segment-btn');
    kpiBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            kpiBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSalesRange = e.target.dataset.range;
            updateSalesSummaryUI(currentSalesRange);
        });
    });


    // Attach Event Listeners to Filters
    ['sales-filter-search', 'sales-filter-date', 'sales-filter-status', 'sales-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                salesFilters = {
                    search: document.getElementById('sales-filter-search')?.value.toLowerCase() || '',
                    date: document.getElementById('sales-filter-date')?.value || '',
                    status: document.getElementById('sales-filter-status')?.value || '',
                    sort: document.getElementById('sales-sort')?.value || 'newest'
                };
                currentSalesPage = 1;
                renderSalesList();
            });
        }
    });

    ['payments-filter-search', 'payments-filter-date', 'payments-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                paymentsFilters = {
                    search: document.getElementById('payments-filter-search')?.value.toLowerCase() || '',
                    date: document.getElementById('payments-filter-date')?.value || '',
                    sort: document.getElementById('payments-sort')?.value || 'newest'
                };
                currentPaymentsPage = 1;
                renderPaymentsHistory();
            });
        }
    });
    
    // Pagination
    document.getElementById('btn-sales-prev')?.addEventListener('click', () => {
        if (currentSalesPage > 1) { currentSalesPage--; renderSalesList(); }
    });
    document.getElementById('btn-sales-next')?.addEventListener('click', () => {
        const filtered = getFilteredSales();
        const maxPages = Math.ceil(filtered.length / salesPerPage);
        if (currentSalesPage < maxPages) { currentSalesPage++; renderSalesList(); }
    });
    
    // Payments Pagination
    document.getElementById('btn-payments-prev')?.addEventListener('click', () => {
        if (currentPaymentsPage > 1) { currentPaymentsPage--; renderPaymentsHistory(); }
    });
    document.getElementById('btn-payments-next')?.addEventListener('click', () => {
        const filtered = getFilteredPayments();
        const maxPages = Math.ceil(filtered.length / paymentsPerPage);
        if (currentPaymentsPage < maxPages) { currentPaymentsPage++; renderPaymentsHistory(); }
    });
});

export const loadSalesList = async function() {
    try {
        const { data, error } = await supabase.from('sales')
            .select(`
                sale_id, sale_code, sale_date, grand_total, discount, notes,
                customers(name, current_balance),
                payment_methods(method_id, method_name),
                sale_items(count)
            `)
            .order('sale_date', { ascending: false });
            
        if (error) throw error;
        salesListCache = data;
        currentSalesPage = 1;
        renderSalesList();
    } catch (error) {
        console.error("Error loading sales:", error);
    }
}

export function getFilteredSales() {
    return salesListCache.filter(s => {
        if (salesFilters.search) {
            const matchName = s.customers && s.customers.name.toLowerCase().includes(salesFilters.search);
            const matchCode = s.sale_code && s.sale_code.toLowerCase().includes(salesFilters.search);
            const matchId = ('#sl-' + s.sale_id).includes(salesFilters.search);
            if (!matchName && !matchCode && !matchId) return false;
        }
        if (salesFilters.date && !s.sale_date.startsWith(salesFilters.date)) return false;
        if (salesFilters.status === 'FULLY_PAID' && s.customers && s.customers.current_balance > 0) return false;
        if (salesFilters.status === 'OUTSTANDING' && (!s.customers || s.customers.current_balance <= 0)) return false;
        if (salesFilters.sort === 'walkin' && s.customers) return false;
        
        return true;
    }).sort((a, b) => {
        if (salesFilters.sort === 'highest') return b.grand_total - a.grand_total;
        return new Date(b.sale_date) - new Date(a.sale_date);
    });
}

export function renderSalesList() {
    const tbody = document.getElementById('sales-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filtered = getFilteredSales();
    const startIdx = (currentSalesPage - 1) * salesPerPage;
    const endIdx = startIdx + salesPerPage;
    const paginated = filtered.slice(startIdx, endIdx);
    
    paginated.forEach(s => {
        const dateStr = new Date(s.sale_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
        const tr = document.createElement('tr');
        
        // s.sale_items[0].count works when aggregating correctly with Supabase select count,
        // but it comes back as an array with count property for `sale_items(count)`
        const itemsCount = (s.sale_items && s.sale_items.length > 0 && s.sale_items[0].count !== undefined) ? s.sale_items[0].count : (s.sale_items ? s.sale_items.length : 0);
        
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--primary-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.sale_code || ('#SL-' + s.sale_id)}</td>
            <td style="color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dateStr}</td>
            <td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #f3effb; color: var(--primary-accent); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem; flex-shrink: 0;">
                        ${s.customers?.name?.substring(0, 2).toUpperCase() || 'W'}
                    </div>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.customers?.name || 'Walk-in'}</span>
                </div>
            </td>
            <td style="white-space: nowrap;">${itemsCount}</td>
            <td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Rs ${Math.round(s.discount).toLocaleString()}</td>
            <td style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Rs ${Math.round(s.grand_total).toLocaleString()}</td>
            <td style="white-space: nowrap;">
                <button class="btn" style="background: var(--bg-light-purple); color: var(--primary-accent); padding: 0.5rem 0.8rem; margin-right: 0.5rem;" onclick="openSaleDetails(${s.sale_id}, '${s.sale_code}', '${s.customers?.name ? s.customers.name.replace(/'/g, "\\'") : 'Walk-in'}', '${dateStr}', ${s.grand_total}, ${s.discount})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn" style="border: 1px solid #eaeaea; color: var(--text-secondary); padding: 0.5rem 0.8rem;">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('sales-page-info').textContent = `Showing ${filtered.length > 0 ? startIdx + 1 : 0}-${Math.min(endIdx, filtered.length)} of ${filtered.length}`;
    document.getElementById('btn-sales-prev').style.opacity = currentSalesPage === 1 ? '0.5' : '1';
    document.getElementById('btn-sales-next').style.opacity = endIdx >= filtered.length ? '0.5' : '1';
}

export const openSaleDetails = async function(sale_id, sale_code, custName, dateStr, grandTotal, discount) {
    document.getElementById('sd-sale-id').textContent = sale_code || `#SL-${sale_id}`;
    document.getElementById('sd-customer-name').textContent = custName;
    document.getElementById('sd-date').textContent = dateStr;
    
    const tbody = document.getElementById('sd-items-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading...</td></tr>';
    
    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-sale-details').style.display = 'block';
    
    try {
        const { data, error } = await supabase.from('sale_items')
            .select('quantity, unit_price, line_total, products(product_name)')
            .eq('sale_id', sale_id);
            
        if (error) throw error;
        
        tbody.innerHTML = '';
        let subtotal = 0;
        
        data.forEach(item => {
            subtotal += item.line_total;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 0.75rem 0; border-bottom: 1px solid #f5f5f5; color: var(--text-primary);">${item.products?.product_name || 'Unknown'}</td>
                <td style="padding: 0.75rem 0; border-bottom: 1px solid #f5f5f5; text-align: center; color: var(--text-secondary);">${item.quantity}</td>
                <td style="padding: 0.75rem 0; border-bottom: 1px solid #f5f5f5; text-align: right; color: var(--text-secondary);">Rs ${Math.round(item.unit_price).toLocaleString()}</td>
                <td style="padding: 0.75rem 0; border-bottom: 1px solid #f5f5f5; text-align: right; font-weight: 600; color: var(--text-primary);">Rs ${Math.round(item.line_total).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('sd-subtotal').textContent = `Rs ${Math.round(subtotal).toLocaleString()}`;
        document.getElementById('sd-discount').textContent = `Rs ${Math.round(discount).toLocaleString()}`;
        document.getElementById('sd-grand-total').textContent = `Rs ${Math.round(grandTotal).toLocaleString()}`;

    } catch (error) {
        console.error("Error loading sale details:", error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load items.</td></tr>';
    }
}

export const loadPaymentsHistory = async function() {
    try {
        const { data, error } = await supabase.from('customer_payments')
            .select(`
                payment_id, payment_code, payment_date, amount, notes, method_id,
                customers(name),
                payment_methods(method_id, method_name)
            `)
            .order('payment_date', { ascending: false });
            
        if (error) throw error;
        
        paymentsHistoryCache = data || [];
        currentPaymentsPage = 1;
        renderPaymentsHistory();
    } catch (error) {
        console.error("Error loading payments history:", error);
    }
}

export function getFilteredPayments() {
    return paymentsHistoryCache.filter(p => {
        if (paymentsFilters.search) {
            const matchName = p.customers && p.customers.name.toLowerCase().includes(paymentsFilters.search);
            const matchCode = p.payment_code && p.payment_code.toLowerCase().includes(paymentsFilters.search);
            const matchId = ('#pay-' + p.payment_id).includes(paymentsFilters.search);
            if (!matchName && !matchCode && !matchId) return false;
        }
        if (paymentsFilters.date && !p.payment_date.startsWith(paymentsFilters.date)) return false;
        if (paymentsFilters.sort === 'walkin' && p.customers) return false;

        return true;
    }).sort((a, b) => {
        if (paymentsFilters.sort === 'highest') return b.amount - a.amount;
        return new Date(b.payment_date) - new Date(a.payment_date);
    });
}

export const renderPaymentsHistory = function() {
    const tbody = document.getElementById('payments-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filtered = getFilteredPayments();
    
    const startIdx = (currentPaymentsPage - 1) * paymentsPerPage;
    const endIdx = startIdx + paymentsPerPage;
    const paginated = filtered.slice(startIdx, endIdx);
    
    paginated.forEach(p => {
        const dateStr = new Date(p.payment_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--primary-accent);">${p.payment_code || ('#PAY-' + p.payment_id)}</td>
            <td style="color: var(--text-secondary);">${dateStr}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #e6f8ee; color: var(--success); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem;">
                        ${p.customers?.name?.substring(0, 2).toUpperCase() || 'W'}
                    </div>
                    <span>${p.customers?.name || 'Walk-in'}</span>
                </div>
            </td>
            <td style="font-weight: 600; color: var(--success);">Rs ${Math.round(p.amount).toLocaleString()}</td>
            <td>
                <button class="btn" style="border: 1px solid #eaeaea; color: var(--text-secondary); padding: 0.5rem 0.8rem;">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    const pageInfo = document.getElementById('payments-page-info');
    if(pageInfo) pageInfo.textContent = `Showing ${filtered.length > 0 ? startIdx + 1 : 0}-${Math.min(endIdx, filtered.length)} of ${filtered.length}`;
    
    const prevBtn = document.getElementById('btn-payments-prev');
    const nextBtn = document.getElementById('btn-payments-next');
    if(prevBtn) prevBtn.style.opacity = currentPaymentsPage === 1 ? '0.5' : '1';
    if(nextBtn) nextBtn.style.opacity = endIdx >= filtered.length ? '0.5' : '1';
}
