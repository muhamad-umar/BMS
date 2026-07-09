import { supabase } from '../auth.js';

// --- SALES VIEW LOGIC ---

export let salesSummaryData = null;
export let currentSalesRange = 'today';

// --- Server-Side Pagination State (FIX #3) ---
// Sales List
let salesListCache = [];
let currentSalesPage = 1;
let totalSalesRecords = 0;
let salesPerPage = 25; // FIX #3: 25 per page
let salesFilters = { search: '', date: '', status: '', sort: 'newest' };
let salesSearchTimer = null; // FIX #5: debounce

// Payments History
let paymentsHistoryCache = [];
let currentPaymentsPage = 1;
let totalPaymentsRecords = 0;
let paymentsPerPage = 25; // FIX #3: 25 per page
let paymentsFilters = { search: '', date: '', sort: 'newest' };
let paymentsSearchTimer = null; // FIX #5: debounce

// --- FIX #6: KPI cached per tab visit, not re-fetched on every mutation ---
let salesSummaryFetchedThisVisit = false;

export const loadSalesSummary = async function(forceRefresh = false) {
    if (salesSummaryFetchedThisVisit && !forceRefresh) {
        // Already loaded this tab visit — just re-render from cached data
        updateSalesSummaryUI(currentSalesRange);
        return;
    }
    try {
        const { data, error } = await supabase.rpc('get_sales_summary');
        if (error) throw error;
        
        salesSummaryData = data;
        salesSummaryFetchedThisVisit = true;
        updateSalesSummaryUI(currentSalesRange);
        
        document.getElementById('sales-stat-receivables').textContent = `Rs ${Math.round(data.outstanding_receivables || 0).toLocaleString()}`;
    } catch (error) {
        console.error("Error loading sales summary:", error);
    }
}

// Reset the "fetched this visit" flag so next tab click re-fetches fresh data
export function resetSalesSummaryCache() {
    salesSummaryFetchedThisVisit = false;
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
    // Sales KPI Toggle — client-side only, uses already-cached data (FIX #6)
    const kpiBtns = document.querySelectorAll('#sales-kpi-toggle .segment-btn');
    kpiBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            kpiBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSalesRange = e.target.dataset.range;
            updateSalesSummaryUI(currentSalesRange); // no DB call — just switch display
        });
    });

    // --- FIX #5: Debounced search + FIX #3: server-side search ---
    ['sales-filter-search', 'sales-filter-date', 'sales-filter-status', 'sales-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                salesFilters = {
                    search: document.getElementById('sales-filter-search')?.value.toLowerCase().trim() || '',
                    date: document.getElementById('sales-filter-date')?.value || '',
                    status: document.getElementById('sales-filter-status')?.value || '',
                    sort: document.getElementById('sales-sort')?.value || 'newest'
                };
                clearTimeout(salesSearchTimer);
                salesSearchTimer = setTimeout(() => {
                    currentSalesPage = 1;
                    loadSalesList(); // server-side search
                }, 300);
            });
        }
    });

    ['payments-filter-search', 'payments-filter-date', 'payments-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                paymentsFilters = {
                    search: document.getElementById('payments-filter-search')?.value.toLowerCase().trim() || '',
                    date: document.getElementById('payments-filter-date')?.value || '',
                    sort: document.getElementById('payments-sort')?.value || 'newest'
                };
                clearTimeout(paymentsSearchTimer);
                paymentsSearchTimer = setTimeout(() => {
                    currentPaymentsPage = 1;
                    loadPaymentsHistory(); // server-side search
                }, 300);
            });
        }
    });

    // --- FIX #3: Page-size selector ---
    document.getElementById('sales-page-size')?.addEventListener('change', (e) => {
        salesPerPage = parseInt(e.target.value);
        currentSalesPage = 1;
        loadSalesList();
    });
    document.getElementById('payments-page-size')?.addEventListener('change', (e) => {
        paymentsPerPage = parseInt(e.target.value);
        currentPaymentsPage = 1;
        loadPaymentsHistory();
    });
    
    // Pagination buttons — now server-driven
    document.getElementById('btn-sales-prev')?.addEventListener('click', () => {
        if (currentSalesPage > 1) { currentSalesPage--; loadSalesList(); }
    });
    document.getElementById('btn-sales-next')?.addEventListener('click', () => {
        const maxPages = Math.ceil(totalSalesRecords / salesPerPage);
        if (currentSalesPage < maxPages) { currentSalesPage++; loadSalesList(); }
    });
    
    document.getElementById('btn-payments-prev')?.addEventListener('click', () => {
        if (currentPaymentsPage > 1) { currentPaymentsPage--; loadPaymentsHistory(); }
    });
    document.getElementById('btn-payments-next')?.addEventListener('click', () => {
        const maxPages = Math.ceil(totalPaymentsRecords / paymentsPerPage);
        if (currentPaymentsPage < maxPages) { currentPaymentsPage++; loadPaymentsHistory(); }
    });
});

// --- FIX #3: Server-Side Paginated Sales List ---
// Uses .range() + count:'exact' so the DB does the filtering/pagination work.
// Search uses .ilike() against the whole table — not a client-side filter.
// RLS on 'sales' and 'customers' tables still applies automatically to every query.
export const loadSalesList = async function() {
    try {
        let query = supabase.from('sales')
            .select(`
                sale_id, sale_code, sale_date, grand_total, discount, notes,
                customers(name, current_balance),
                payment_methods(method_id, method_name),
                sale_items(count)
            `, { count: 'exact' });

        // Server-side search across full table (FIX #3 requirement)
        if (salesFilters.search) {
            // Search sale_code via ilike; customer name requires a join filter approach
            query = query.or(`sale_code.ilike.%${salesFilters.search}%`);
        }
        if (salesFilters.date) {
            query = query.gte('sale_date', salesFilters.date + 'T00:00:00')
                         .lte('sale_date', salesFilters.date + 'T23:59:59');
        }
        if (salesFilters.sort === 'walkin') {
            query = query.is('customer_id', null);
        }
        if (salesFilters.sort === 'highest') {
            query = query.order('grand_total', { ascending: false });
        } else {
            query = query.order('sale_date', { ascending: false });
        }

        // Server-side pagination
        const startIdx = (currentSalesPage - 1) * salesPerPage;
        query = query.range(startIdx, startIdx + salesPerPage - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        salesListCache = data || [];
        totalSalesRecords = count || 0;
        renderSalesList();
    } catch (error) {
        console.error("Error loading sales:", error);
    }
}

export function getFilteredSales() {
    // With server-side pagination, filtering already happened in the query.
    // This function is kept for backward compatibility but returns the already-filtered page.
    return salesListCache;
}

export function renderSalesList() {
    const tbody = document.getElementById('sales-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const startIdx = (currentSalesPage - 1) * salesPerPage;
    
    salesListCache.forEach(s => {
        const dateStr = new Date(s.sale_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
        const tr = document.createElement('tr');
        
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
    
    const endIdx = startIdx + salesListCache.length;
    document.getElementById('sales-page-info').textContent = `Showing ${totalSalesRecords > 0 ? startIdx + 1 : 0}-${endIdx} of ${totalSalesRecords}`;
    document.getElementById('btn-sales-prev').style.opacity = currentSalesPage === 1 ? '0.5' : '1';
    const maxSalesPages = Math.ceil(totalSalesRecords / salesPerPage);
    document.getElementById('btn-sales-next').style.opacity = currentSalesPage >= maxSalesPages ? '0.5' : '1';
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

// --- FIX #3: Server-Side Paginated Payments History ---
// Uses .range() + count:'exact'. Search uses .ilike() on payment_code.
// RLS on 'customer_payments' still applies to every query automatically.
export const loadPaymentsHistory = async function() {
    try {
        let query = supabase.from('customer_payments')
            .select(`
                payment_id, payment_code, payment_date, amount, notes, method_id,
                customers(name),
                payment_methods(method_id, method_name)
            `, { count: 'exact' });

        // Server-side search across full table (FIX #3 requirement)
        if (paymentsFilters.search) {
            query = query.or(`payment_code.ilike.%${paymentsFilters.search}%`);
        }
        if (paymentsFilters.date) {
            query = query.gte('payment_date', paymentsFilters.date + 'T00:00:00')
                         .lte('payment_date', paymentsFilters.date + 'T23:59:59');
        }
        if (paymentsFilters.sort === 'walkin') {
            query = query.is('customer_id', null);
        }
        if (paymentsFilters.sort === 'highest') {
            query = query.order('amount', { ascending: false });
        } else {
            query = query.order('payment_date', { ascending: false });
        }

        // Server-side pagination
        const startIdx = (currentPaymentsPage - 1) * paymentsPerPage;
        query = query.range(startIdx, startIdx + paymentsPerPage - 1);
            
        const { data, count, error } = await query;
        if (error) throw error;
        
        paymentsHistoryCache = data || [];
        totalPaymentsRecords = count || 0;
        renderPaymentsHistory();
    } catch (error) {
        console.error("Error loading payments history:", error);
    }
}

export function getFilteredPayments() {
    // With server-side pagination, filtering already happened in the query.
    return paymentsHistoryCache;
}

export const renderPaymentsHistory = function() {
    const tbody = document.getElementById('payments-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const startIdx = (currentPaymentsPage - 1) * paymentsPerPage;
    
    paymentsHistoryCache.forEach(p => {
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
    
    const endIdx = startIdx + paymentsHistoryCache.length;
    const pageInfo = document.getElementById('payments-page-info');
    if(pageInfo) pageInfo.textContent = `Showing ${totalPaymentsRecords > 0 ? startIdx + 1 : 0}-${endIdx} of ${totalPaymentsRecords}`;
    
    const prevBtn = document.getElementById('btn-payments-prev');
    const nextBtn = document.getElementById('btn-payments-next');
    if(prevBtn) prevBtn.style.opacity = currentPaymentsPage === 1 ? '0.5' : '1';
    const maxPayPages = Math.ceil(totalPaymentsRecords / paymentsPerPage);
    if(nextBtn) nextBtn.style.opacity = currentPaymentsPage >= maxPayPages ? '0.5' : '1';
}
