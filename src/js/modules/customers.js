import { supabase } from '../auth.js';
import { loadPaymentsHistory, loadSalesList, loadSalesSummary } from './sales.js';
import { showView } from './core.js';
import { cache } from './init.js';

// --- CUSTOMERS PAGE LOGIC ---
let custPageOffset = 0;
const custPageSize = 5;
let custSearchTimer = null;

export async function loadCustomerStats() {
    const { data, error } = await supabase.rpc('get_customer_stats');
    if (error) {
        console.error(error);
        return;
    }
    
    // Supabase returns an array for table-returning functions
    const stats = Array.isArray(data) ? data[0] : data;
    if (!stats) return;

    document.getElementById('stat-total-customers').textContent = stats.total_customers || 0;
    document.getElementById('stat-outstanding-customers').textContent = stats.outstanding_customers || 0;
    document.getElementById('stat-total-amount-due').textContent = 'Rs ' + (stats.total_amount_due ? Math.round(Number(stats.total_amount_due)).toLocaleString() : '0');
    document.getElementById('stat-new-this-month').textContent = stats.new_this_month || 0;
}

let customersListCache = [];
let custFilteredCache = [];

export const loadCustomerList = async function() {
    // Fetch all customers for client-side filtering/sorting
    const { data, error } = await supabase.rpc('get_customers_list');

    if (error) {
        alert("Error loading customers: " + error.message);
        return;
    }
    
    customersListCache = data || [];
    custPageOffset = 0;
    renderCustomerList();
}

export function renderCustomerList() {
    const searchTerm = (document.getElementById('search-customer').value || '').toLowerCase().trim();
    const duesOnly = document.getElementById('filter-dues-only').checked;
    const inactiveFilter = document.getElementById('filter-inactive')?.value || 'all';
    const sortVal = document.getElementById('sort-customers')?.value || 'balance-desc';
    
    custFilteredCache = customersListCache.filter(c => {
        if (searchTerm) {
            const nameMatch = c.name && c.name.toLowerCase().includes(searchTerm);
            const phoneMatch = c.primary_phone && c.primary_phone.includes(searchTerm);
            if (!nameMatch && !phoneMatch) return false;
        }
        if (duesOnly && (c.current_balance || 0) <= 0) return false;
        
        if (inactiveFilter !== 'all') {
            const days = parseInt(inactiveFilter.split('-')[1]);
            if (!c.last_purchase_date) return false; // Treat no purchase as not matching inactive N days
            const diffTime = Math.abs(new Date() - new Date(c.last_purchase_date));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < days) return false;
        }
        return true;
    });

    custFilteredCache.sort((a, b) => {
        if (sortVal === 'balance-desc') {
            return (b.current_balance || 0) - (a.current_balance || 0);
        } else if (sortVal === 'name-asc') {
            return (a.name || '').localeCompare(b.name || '');
        } else if (sortVal === 'recent-sale') {
            const dateA = a.last_purchase_date ? new Date(a.last_purchase_date) : new Date(0);
            const dateB = b.last_purchase_date ? new Date(b.last_purchase_date) : new Date(0);
            return dateB - dateA;
        } else if (sortVal === 'dormant-sale') {
            const dateA = a.last_purchase_date ? new Date(a.last_purchase_date) : new Date(0);
            const dateB = b.last_purchase_date ? new Date(b.last_purchase_date) : new Date(0);
            return dateA - dateB; // oldest first
        }
        return 0;
    });

    const tbody = document.getElementById('customers-table-body');
    tbody.innerHTML = '';
    
    const paginated = custFilteredCache.slice(custPageOffset, custPageOffset + custPageSize);
    
    paginated.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        tr.style.cursor = 'pointer';
        tr.onclick = () => showCustomerDetail(c.customer_id);
        
        let statusTag = '';
        const bal = Number(c.current_balance || 0);
        if (bal > 0) {
            statusTag = `<span class="badge" style="background: #fff5e6; color: var(--warning);">Owes Rs ${Math.round(bal).toLocaleString()}</span>`;
        } else if (bal === 0) {
            statusTag = `<span class="badge" style="background: #e6f8ee; color: var(--success);">Settled</span>`;
        } else {
            statusTag = `<span class="badge" style="background: #e0f2fe; color: #0284c7;">Credit Rs ${Math.round(Math.abs(bal)).toLocaleString()}</span>`;
        }

        let dateStr = '—';
        if (c.last_purchase_date) {
            dateStr = new Date(c.last_purchase_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        } else {
            dateStr = '<span style="color: var(--text-secondary); font-size: 0.85rem;">No purchases yet</span>';
        }
        
        tr.innerHTML = `
            <td style="padding: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #f3effb; color: var(--primary-accent); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem;">
                        ${(c.name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <span style="font-weight: 500;">${c.name}</span>
                </div>
            </td>
            <td style="padding: 1rem; color: var(--text-secondary);">${c.primary_phone || 'N/A'}</td>
            <td style="padding: 1rem; color: var(--text-secondary);">${dateStr}</td>
            <td style="padding: 1rem; font-weight: 600; color: ${bal > 0 ? 'var(--danger)' : 'var(--text-primary)'};">Rs ${Math.round(bal).toLocaleString()}</td>
            <td style="padding: 1rem;">${statusTag}</td>
        `;
        tbody.appendChild(tr);
    });

    const end = Math.min(custPageOffset + custPageSize, custFilteredCache.length);
    document.getElementById('customers-page-info').textContent = `Showing ${custFilteredCache.length === 0 ? 0 : custPageOffset + 1}-${end} of ${custFilteredCache.length}`;
    
    document.getElementById('btn-prev-page').disabled = custPageOffset === 0;
    document.getElementById('btn-prev-page').style.opacity = custPageOffset === 0 ? '0.5' : '1';
    
    document.getElementById('btn-next-page').disabled = end >= custFilteredCache.length;
    document.getElementById('btn-next-page').style.opacity = end >= custFilteredCache.length ? '0.5' : '1';
}

// Event Listeners
document.getElementById('search-customer').addEventListener('input', (e) => {
    clearTimeout(custSearchTimer);
    custSearchTimer = setTimeout(() => {
        custPageOffset = 0;
        renderCustomerList();
    }, 300);
});

document.getElementById('filter-dues-only').addEventListener('change', () => {
    custPageOffset = 0;
    renderCustomerList();
});

document.getElementById('filter-inactive')?.addEventListener('change', () => {
    custPageOffset = 0;
    renderCustomerList();
});

document.getElementById('sort-customers')?.addEventListener('change', () => {
    custPageOffset = 0;
    renderCustomerList();
});

document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (custPageOffset >= custPageSize) {
        custPageOffset -= custPageSize;
        renderCustomerList();
    }
});

document.getElementById('btn-next-page').addEventListener('click', () => {
    if (custPageOffset + custPageSize < custFilteredCache.length) {
        custPageOffset += custPageSize;
        renderCustomerList();
    }
});

// --- CUSTOMER DETAIL LOGIC ---
export let activeCustomerId = null;

export const showCustomerDetail = async function(customerId) {
    activeCustomerId = customerId;
    showView('customer-detail');
    
    document.getElementById('cd-edit-container').style.display = 'none';
    
    // Fetch customer data
    const { data: customer, error: cErr } = await supabase
        .from('customers')
        .select('*, customer_phones(*)')
        .eq('customer_id', customerId)
        .single();
        
    const { data: dueInfo } = await supabase
        .from('customer_due_view')
        .select('balance_due')
        .eq('customer_id', customerId)
        .single();

    if (cErr) {
        alert("Failed to load customer details");
        showView('customers');
        return;
    }

    const { data: lifetimeSales } = await supabase.rpc('get_customer_lifetime_sales', { p_customer_id: customerId });

    // Populate display
    document.getElementById('cd-avatar').textContent = (customer.name || 'U').substring(0, 2).toUpperCase();
    document.getElementById('cd-name-display').textContent = customer.name;
    document.getElementById('cd-address-display').innerHTML = `<i class="fas fa-map-marker-alt" style="color: var(--primary-accent);"></i> <span>${customer.address}</span>`;
    document.getElementById('cd-reference-display').innerHTML = `<i class="fas fa-tag" style="color: var(--primary-accent);"></i> <span>Ref: ${customer.reference || 'None'}</span>`;
    
    if (customer.created_at) {
        const d = new Date(customer.created_at);
        document.getElementById('cd-created-at').textContent = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
        document.getElementById('cd-created-at').textContent = '-';
    }
    
    document.getElementById('cd-lifetime-sales').textContent = `Rs ${Math.round(lifetimeSales || 0).toLocaleString()}`;

    const bal = dueInfo ? Number(dueInfo.balance_due) : 0;
    const balanceEl = document.getElementById('cd-balance-display');
    balanceEl.style.color = bal < 0 ? 'var(--success)' : 'var(--danger)';
    balanceEl.textContent = `Rs ${Math.round(bal).toLocaleString()}`;
    
    const phonesContainer = document.getElementById('cd-phones-display');
    phonesContainer.innerHTML = '';
    customer.customer_phones.forEach(p => {
        phonesContainer.innerHTML += `
            <div style="background: ${p.is_primary ? '#e6f8ee' : '#f3effb'}; color: ${p.is_primary ? 'var(--success)' : 'var(--primary-accent)'}; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 500;">
                <i class="fas fa-phone-alt"></i> ${p.phone_number} ${p.is_primary ? '(Primary)' : ''}
            </div>
        `;
    });

    // Populate Edit forms
    document.getElementById('edit-cd-name').value = customer.name;
    document.getElementById('edit-cd-address').value = customer.address;
    document.getElementById('edit-cd-reference').value = customer.reference || '';
    
    const editPhonesContainer = document.getElementById('edit-phones-container');
    editPhonesContainer.innerHTML = '';
    customer.customer_phones.forEach(p => {
        addEditPhoneRow(p.phone_id, p.phone_number, p.is_primary);
    });

    // Populate payment methods if empty
    const pmSelect = document.getElementById('rp-method');
    if (pmSelect && pmSelect.options.length <= 1) {
        const { data: pMethods } = await supabase.from('payment_methods').select('*');
        if (pMethods) {
            pmSelect.innerHTML = pMethods.map(pm => `<option value="${pm.method_id}">${pm.method_name}</option>`).join('');
        }
    }

    loadCustomerLedger(customerId);
};

export function addEditPhoneRow(id, number, isPrimary) {
    const container = document.getElementById('edit-phones-container');
    const div = document.createElement('div');
    div.className = 'form-row edit-phone-row';
    div.dataset.id = id || '';
    div.style.marginBottom = '0.5rem';
    div.innerHTML = `
        <div class="form-group" style="margin-bottom: 0; width: 40px; display: flex; align-items: center; justify-content: center;">
            <input type="radio" name="edit-phone-primary" ${isPrimary ? 'checked' : ''} style="transform: scale(1.2);">
        </div>
        <div class="form-group" style="margin-bottom: 0; flex: 1;">
            <input type="text" class="form-control edit-phone-num" value="${number || ''}" required pattern="\\d{11}" placeholder="03001234567">
        </div>
        <button type="button" class="btn" onclick="this.parentElement.remove()" style="background: transparent; color: var(--danger);"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

document.getElementById('btn-edit-add-phone').addEventListener('click', () => {
    addEditPhoneRow(null, '', false);
});

document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('cd-edit-container').style.display = 'block';
});
document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    document.getElementById('cd-edit-container').style.display = 'none';
});

// Profile Edit Submission
document.getElementById('form-edit-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    try {
        const { error } = await supabase.rpc('update_customer_profile', {
            p_customer_id: activeCustomerId,
            p_name: document.getElementById('edit-cd-name').value.trim(),
            p_address: document.getElementById('edit-cd-address').value.trim(),
            p_reference: document.getElementById('edit-cd-reference').value.trim() || null
        });
        
        if (error) alert("Error updating profile: " + error.message);
        else {
            alert("Profile updated successfully");
            showCustomerDetail(activeCustomerId);
        }
    } catch (err) {
        console.error(err);
        alert('An unexpected error occurred: ' + err.message);
    } finally {
        btn.disabled = false;
    }
});

// Phones Edit Submission
document.getElementById('form-edit-phones').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = document.querySelectorAll('.edit-phone-row');
    if (rows.length === 0) {
        alert("At least one phone number is required.");
        return;
    }
    
    const phones = [];
    rows.forEach(r => {
        const id = r.dataset.id ? parseInt(r.dataset.id) : null;
        const num = r.querySelector('.edit-phone-num').value.trim();
        const prim = r.querySelector('input[type="radio"]').checked;
        phones.push({ phone_id: id, phone_number: num, is_primary: prim });
    });
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    try {
        const { error } = await supabase.rpc('update_customer_phones', {
            p_customer_id: activeCustomerId,
            p_phones: phones
        });
        
        if (error) alert("Error updating phones: " + error.message);
        else {
            alert("Phones updated successfully");
            showCustomerDetail(activeCustomerId);
        }
    } catch (err) {
        console.error(err);
        alert('An unexpected error occurred: ' + err.message);
    } finally {
        btn.disabled = false;
    }
});

// Ledger
let currentLedgerData = [];
let ledgerPage = 1;
const ledgerPageSize = 6;

export async function loadCustomerLedger(customerId) {
    const { data, error } = await supabase
        .from('customer_ledger_view')
        .select('*')
        .eq('customer_id', customerId)
        .order('txn_date')
        .order('reference_id');
        
    if (error) return;
    
    let runningBalance = 0;
    currentLedgerData = data.map(txn => {
        runningBalance += Number(txn.amount);
        return { ...txn, runningBalance };
    });
    
    ledgerPage = 1;
    renderCustomerLedger();
}

export function renderCustomerLedger() {
    const filter = document.getElementById('cd-ledger-filter').value;
    
    let filteredData = currentLedgerData;
    if (filter) {
        filteredData = currentLedgerData.filter(txn => txn.txn_type === filter);
    }
    
    // We want descending order (newest first)
    const displayData = [...filteredData].reverse();
    
    const totalPages = Math.ceil(displayData.length / ledgerPageSize) || 1;
    if (ledgerPage > totalPages) ledgerPage = totalPages;
    if (ledgerPage < 1) ledgerPage = 1;
    
    const startIndex = (ledgerPage - 1) * ledgerPageSize;
    const pageData = displayData.slice(startIndex, startIndex + ledgerPageSize);
    
    const tbody = document.getElementById('cd-ledger-body');
    tbody.innerHTML = '';
    
    pageData.forEach(txn => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        
        const isSale = txn.txn_type === 'SALE';
        const color = isSale ? 'var(--danger)' : 'var(--success)';
        const sign = isSale ? '+' : '';
        
        const refDisplay = txn.reference_code ? txn.reference_code : (isSale ? '#SL-' + txn.reference_id : '#PAY-' + txn.reference_id);
        
        tr.innerHTML = `
            <td style="padding: 1rem; color: var(--text-secondary);">${new Date(txn.txn_date).toLocaleDateString()}</td>
            <td style="padding: 1rem;">
                <span class="status-badge" style="background: ${isSale ? '#fce8e8' : '#e6f8ee'}; color: ${color};">${refDisplay}</span>
            </td>
            <td style="padding: 1rem; font-weight: 600; color: ${color};">${sign}Rs ${Math.round(Math.abs(txn.amount)).toLocaleString()}</td>
            <td style="padding: 1rem; font-weight: 700;">Rs ${Math.round(txn.runningBalance).toLocaleString()}</td>
        `;
        tbody.appendChild(tr); // displayData is already reversed
    });
    
    const end = startIndex + pageData.length;
    document.getElementById('ledger-page-info').textContent = `Showing ${pageData.length === 0 ? 0 : startIndex + 1}-${end}`;
    
    document.getElementById('btn-ledger-prev').disabled = ledgerPage === 1;
    document.getElementById('btn-ledger-prev').style.opacity = ledgerPage === 1 ? '0.5' : '1';
    
    document.getElementById('btn-ledger-next').disabled = ledgerPage === totalPages || totalPages === 0;
    document.getElementById('btn-ledger-next').style.opacity = (ledgerPage === totalPages || totalPages === 0) ? '0.5' : '1';
}

document.getElementById('cd-ledger-filter').addEventListener('change', () => {
    ledgerPage = 1;
    renderCustomerLedger();
});

document.getElementById('btn-ledger-prev').addEventListener('click', () => {
    if (ledgerPage > 1) {
        ledgerPage--;
        renderCustomerLedger();
    }
});

document.getElementById('btn-ledger-next').addEventListener('click', () => {
    ledgerPage++;
    renderCustomerLedger();
});

// Record Payment
document.getElementById('form-record-payment').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const rpCustomerVal = document.getElementById('rp-customer').value;
    const targetCustomerId = rpCustomerVal ? parseInt(rpCustomerVal) : null;
    
    if (!targetCustomerId) {
        alert("Please select a customer.");
        return;
    }
    
    const amount = parseFloat(document.getElementById('rp-amount').value);
    const date = document.getElementById('rp-date').value;
    const method = document.getElementById('rp-method').value;
    const notes = document.getElementById('rp-notes').value.trim() || null;
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    try {
        const { data, error } = await supabase
            .from('customer_payments')
            .insert({
                customer_id: targetCustomerId,
                amount: amount,
                payment_date: date,
                method_id: method,
                notes: notes
            })
            .select('payment_code')
            .single();
            
        if (error) alert("Error recording payment: " + error.message);
        else {
            alert(`Payment ${data?.payment_code || 'recorded'} successfully!`);
            document.getElementById('modal-record-payment').style.display = 'none';
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('form-record-payment').reset();
            
            // Optimistic refresh
            if (activeCustomerId === targetCustomerId) {
                showCustomerDetail(targetCustomerId);
            } else {
                if (typeof loadSalesSummary === 'function') loadSalesSummary();
                if (typeof loadSalesList === 'function') loadSalesList();
                if (typeof loadPaymentsHistory === 'function') loadPaymentsHistory();
            }
        }
    } catch (err) {
        console.error(err);
        alert('An unexpected error occurred: ' + err.message);
    } finally {
        btn.disabled = false;
    }
});

export const openRecordPayment = async function(presetCustomerId = null) {
    document.getElementById('form-record-payment').reset();
    const tzDate = new Date();
    tzDate.setMinutes(tzDate.getMinutes() - tzDate.getTimezoneOffset());
    document.getElementById('rp-date').value = tzDate.toISOString().slice(0, 16);
    
    let targetId = presetCustomerId || activeCustomerId;
    const custGroup = document.getElementById('rp-customer-group');
    custGroup.style.display = 'block';
    
    const select = document.getElementById('rp-customer');
    if (cache.customers) {
        select.innerHTML = '<option value="" disabled>Select a customer...</option>' + 
            cache.customers.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join('');
        if (targetId) {
            select.value = targetId;
        } else {
            select.value = '';
        }
    }

    // Populate payment methods if empty
    const pmSelect = document.getElementById('rp-method');
    if (pmSelect.options.length === 0 && cache.paymentMethods) {
        pmSelect.innerHTML = cache.paymentMethods.map(pm => `<option value="${pm.method_id}">${pm.method_name}</option>`).join('');
    }

    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-record-payment').style.display = 'block';
};

export const openNewSaleForCustomer = async function() {
    document.getElementById('form-new-sale').reset();
    document.getElementById('ns-discount').value = 0;
    document.getElementById('ns-amount-paid').value = 0;
    document.getElementById('ns-grand-total').textContent = '0';
    
    const rows = document.querySelectorAll('.ns-item-row');
    for(let i=1; i<rows.length; i++) rows[i].remove();
    
    // Clear dynamic attributes from the first row
    if (rows.length > 0) {
        const firstQty = rows[0].querySelector('.ns-qty');
        if (firstQty) {
            firstQty.removeAttribute('max');
            firstQty.placeholder = '';
        }
    }
    
    const prodSelect = document.querySelector('.ns-product');
    if (cache.products) {
        window.bmsProducts = cache.products;
        prodSelect.innerHTML = '<option value="">Select...</option>' + cache.products.map(p => {
            const stock = cache.inventory ? (cache.inventory[p.product_id] || 0) : 0;
            return `<option value="${p.product_id}" data-price="${p.selling_price || 0}" data-stock="${stock}">${p.product_name}</option>`;
        }).join('');
    }
    
    const custSelect = document.getElementById('ns-customer');
    if (cache.customers) {
        custSelect.innerHTML = '<option value="">Select...</option>' + cache.customers.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join('');
        custSelect.value = activeCustomerId || '';
    }
    
    const pmSelect = document.getElementById('ns-payment-method');
    if (cache.paymentMethods) {
        pmSelect.innerHTML = cache.paymentMethods.map(pm => `<option value="${pm.method_id}">${pm.method_name}</option>`).join('');
    }

    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-new-sale').style.display = 'block';
};


