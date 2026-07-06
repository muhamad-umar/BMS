import { supabase } from './auth.js';

let cache = {
    products: [],
    paymentMethods: [],
    customers: []
};

document.addEventListener("DOMContentLoaded", async () => {
    initializeNavLinks();
    initializeModals();
    await loadCacheData();
    initializeForms();
});

function initializeNavLinks() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// --- MODAL LOGIC ---
function initializeModals() {
    const overlay = document.getElementById('modal-overlay');
    const modals = {
        'btn-new-sale': 'modal-new-sale',
        'btn-add-inventory': 'modal-add-inventory',
        'btn-new-customer': 'modal-new-customer'
    };

    for (const [btnId, modalId] of Object.entries(modals)) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
                overlay.style.display = 'flex';
                document.getElementById(modalId).style.display = 'block';
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

// --- DATA CACHING ---
async function loadCacheData() {
    try {
        const [prodRes, payRes, custRes, invRes] = await Promise.all([
            supabase.from('products').select('product_id, product_name').eq('is_active', true),
            supabase.from('payment_methods').select('method_id, method_name'),
            supabase.from('customers').select('customer_id, name'),
            supabase.from('inventory').select('product_id, current_stock')
        ]);

        if (prodRes.data) cache.products = prodRes.data;
        if (payRes.data) cache.paymentMethods = payRes.data;
        if (custRes.data) cache.customers = custRes.data;
        if (invRes.data) {
            cache.inventory = {};
            invRes.data.forEach(inv => {
                cache.inventory[inv.product_id] = inv.current_stock;
            });
        }
        
        updateDashboardInventoryStats();
        populateSelects();
    } catch (error) {
        console.error("Error loading cache:", error);
    }
}

function updateDashboardInventoryStats() {
    // Basic dynamic update of any inventory displays.
    // If the frontend has specific cards mapped to products, update them.
    // E.g., assuming Flour is product 2 based on previous mocks.
    // For now, we simply console.log or fire an event if the cards don't have static IDs.
    console.log("Current cached inventory:", cache.inventory);
}

function populateSelects() {
    // Customers (New Sale)
    const custSelect = document.getElementById('ns-customer');
    if (custSelect) {
        custSelect.innerHTML = '<option value="">-- Walk-in Customer --</option>' + 
            cache.customers.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join('');
    }

    // Payment Methods (New Sale)
    const paySelect = document.getElementById('ns-payment-method');
    if (paySelect) {
        paySelect.innerHTML = cache.paymentMethods.map(p => `<option value="${p.method_id}">${p.method_name}</option>`).join('');
    }

    // Products (Add Inventory Initial Row)
    const invProdSelects = document.querySelectorAll('.ai-product');
    invProdSelects.forEach(select => {
        if(select.options.length === 0) {
            select.innerHTML = '<option value="" disabled selected>Select a product...</option>' + 
                cache.products.map(p => `<option value="${p.product_id}">${p.product_name}</option>`).join('');
        }
    });

    // Products (New Sale Initial Row)
    const nsProdSelects = document.querySelectorAll('.ns-product');
    nsProdSelects.forEach(select => {
        if(select.options.length === 0) {
            select.innerHTML = '<option value="" disabled selected>Select...</option>' + 
                cache.products.map(p => `<option value="${p.product_id}">${p.product_name}</option>`).join('');
        }
    });
}

// --- FORMS LOGIC ---
function initializeForms() {
    initNewSaleForm();
    initAddInventoryForm();
    initNewCustomerForm();
}

// 1. New Sale
function initNewSaleForm() {
    const container = document.getElementById('ns-items-container');
    const addBtn = document.getElementById('btn-ns-add-item');
    const form = document.getElementById('form-new-sale');
    
    // Add row
    addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'ns-item-row item-row-box';
        row.style.cssText = 'display: flex; gap: 1rem; align-items: flex-end;';
        row.innerHTML = `
            <div style="flex: 2;">
                <label class="form-label">Product</label>
                <select class="form-control ns-product" required>
                    <option value="" disabled selected>Select...</option>
                    ${cache.products.map(p => `<option value="${p.product_id}">${p.product_name}</option>`).join('')}
                </select>
            </div>
            <div style="flex: 1;">
                <label class="form-label">Qty</label>
                <input type="number" step="0.01" min="0.01" class="form-control ns-qty" required>
            </div>
            <div style="flex: 1;">
                <label class="form-label">Price</label>
                <input type="number" step="0.01" min="0" class="form-control ns-price" required>
            </div>
            <button type="button" class="btn btn-remove-item" style="background: #ffebee; color: var(--danger); padding: 0.8rem; border-radius: 12px;"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(row);
    });

    // Remove row & live calc
    container.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-item')) {
            const row = e.target.closest('.ns-item-row');
            if (container.children.length > 1) {
                row.remove();
                calcGrandTotal();
            } else {
                alert("You need at least one item.");
            }
        }
    });

    // Live calc on input change
    form.addEventListener('input', (e) => {
        if (e.target.classList.contains('ns-qty') || e.target.classList.contains('ns-price') || e.target.id === 'ns-discount') {
            calcGrandTotal();
        }
    });

    function calcGrandTotal() {
        let total = 0;
        document.querySelectorAll('.ns-item-row').forEach(row => {
            const qty = parseFloat(row.querySelector('.ns-qty').value) || 0;
            const price = parseFloat(row.querySelector('.ns-price').value) || 0;
            total += (qty * price);
        });
        const discount = parseFloat(document.getElementById('ns-discount').value) || 0;
        const grandTotal = Math.max(0, total - discount);
        document.getElementById('ns-grand-total').textContent = Math.round(grandTotal).toLocaleString();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Build payload
        const customerIdStr = document.getElementById('ns-customer').value;
        const p_customer_id = customerIdStr ? parseInt(customerIdStr) : null;
        const p_discount = parseFloat(document.getElementById('ns-discount').value) || 0;
        const p_payment_method_id = parseInt(document.getElementById('ns-payment-method').value);
        const p_amount_paid = parseFloat(document.getElementById('ns-amount-paid').value) || 0;
        const p_notes = document.getElementById('ns-notes').value;
        
        const p_items = [];
        let valid = true;
        document.querySelectorAll('.ns-item-row').forEach(row => {
            const prod = row.querySelector('.ns-product').value;
            const qty = parseFloat(row.querySelector('.ns-qty').value);
            const price = parseFloat(row.querySelector('.ns-price').value);
            if (!prod || qty <= 0 || price < 0) valid = false;
            p_items.push({ product_id: parseInt(prod), quantity: qty, unit_price: price });
        });

        if (!valid || p_items.length === 0) {
            alert("Please complete all item rows with valid quantities and prices.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        const { data, error } = await supabase.rpc('create_sale', {
            p_customer_id,
            p_discount,
            p_payment_method_id,
            p_notes,
            p_items,
            p_amount_paid
        });

        if (error) {
            alert('Error creating sale: ' + error.message);
        } else {
            // Optimistic UI Success
            form.reset();
            calcGrandTotal();
            document.getElementById('modal-overlay').style.display = 'none';
            alert('Sale recorded successfully!');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Sale';
    });
}

// 2. Add Inventory
function initAddInventoryForm() {
    const container = document.getElementById('ai-items-container');
    const addBtn = document.getElementById('btn-ai-add-item');
    const form = document.getElementById('form-add-inventory');
    
    // Add new row logic
    addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'ai-item-row item-row-box';
        row.style.display = 'flex';
        row.style.gap = '1rem';
        row.style.alignItems = 'flex-end';
        row.style.marginBottom = '0.5rem';
        
        row.innerHTML = `
            <div style="flex: 2;">
                <label class="form-label">Product</label>
                <select class="form-control ai-product" required>
                    <option value="" disabled selected>Select a product...</option>
                    ${cache.products.map(p => `<option value="${p.product_id}">${p.product_name}</option>`).join('')}
                </select>
            </div>
            <div style="flex: 1;">
                <label class="form-label">Qty</label>
                <input type="number" step="0.01" min="0.01" class="form-control ai-qty" required>
            </div>
            <div style="flex: 1;">
                <label class="form-label">Unit Price</label>
                <input type="number" step="0.01" min="0" class="form-control ai-price" required>
            </div>
            <button type="button" class="btn btn-remove-item" style="background: #ffebee; color: var(--danger); padding: 0.8rem; border-radius: 12px;"><i class="fas fa-trash"></i></button>
        `;
        
        row.querySelector('.btn-remove-item').addEventListener('click', () => row.remove());
        container.appendChild(row);
    });

    // Helper to calculate grand total
    function calcAddInventoryTotal() {
        let total = 0;
        document.querySelectorAll('.ai-item-row').forEach(row => {
            const qty = parseFloat(row.querySelector('.ai-qty').value) || 0;
            const price = parseFloat(row.querySelector('.ai-price').value) || 0;
            total += (qty * price);
        });
        document.getElementById('ai-grand-total').textContent = Math.round(total).toLocaleString();
    }

    // Live calc on input change
    form.addEventListener('input', (e) => {
        if (e.target.classList.contains('ai-qty') || e.target.classList.contains('ai-price')) {
            calcAddInventoryTotal();
        }
    });

    // Delegate remove logic for initial row
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove-item');
        if (btn) {
            const row = btn.closest('.ai-item-row');
            if (container.querySelectorAll('.ai-item-row').length > 1) {
                row.remove();
                calcAddInventoryTotal();
            } else {
                row.querySelector('.ai-product').value = '';
                row.querySelector('.ai-qty').value = '';
                row.querySelector('.ai-price').value = '';
                calcAddInventoryTotal();
            }
        }
    });
    
    // Set default date
    document.getElementById('ai-date').valueAsDate = new Date();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        const purchase_date = document.getElementById('ai-date').value;
        const notes = document.getElementById('ai-notes').value;
        
        const p_items = [];
        let valid = true;
        document.querySelectorAll('.ai-item-row').forEach(row => {
            const prod = row.querySelector('.ai-product').value;
            const qty = parseFloat(row.querySelector('.ai-qty').value);
            const price = parseFloat(row.querySelector('.ai-price').value);
            if (!prod || qty <= 0 || price < 0) valid = false;
            p_items.push({ 
                product_id: parseInt(prod), 
                quantity: qty, 
                buying_price: price,
                purchase_date: purchase_date,
                notes: notes || null
            });
        });

        if (!valid || p_items.length === 0) {
            alert("Please complete all item rows with valid quantities and prices.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Recording...';
        
        const userRes = await supabase.auth.getUser();
        const userId = userRes.data.user?.id;
        if (userId) {
            p_items.forEach(item => item.created_by = userId);
        }

        // Optimistic UI Update Before Network Response
        const previousInventoryState = { ...cache.inventory };
        p_items.forEach(item => {
            if (!cache.inventory[item.product_id]) cache.inventory[item.product_id] = 0;
            cache.inventory[item.product_id] += item.quantity;
        });
        updateDashboardInventoryStats();

        // Direct batch insert. total_cost and Stock are updated by Triggers.
        const { data, error } = await supabase.from('purchases').insert(p_items).select();

        if (error) {
            // Rollback optimistic update
            cache.inventory = previousInventoryState;
            updateDashboardInventoryStats();
            alert('Error recording purchase: ' + error.message);
        } else {
            // Reconcile if needed, but triggers handle it in DB.
            form.reset();
            document.getElementById('ai-date').valueAsDate = new Date();
            const rows = container.querySelectorAll('.ai-item-row');
            for(let i=1; i<rows.length; i++) rows[i].remove();
            
            calcAddInventoryTotal(); // Reset the UI display to Rs 0.00
            
            document.getElementById('modal-overlay').style.display = 'none';
            // Use toast notification ideally, but standard alert works for now.
            alert('Inventory batch added successfully!');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Purchase';
    });
}

// 3. New Customer
function initNewCustomerForm() {
    const container = document.getElementById('nc-phones-container');
    const addBtn = document.getElementById('btn-nc-add-phone');
    const form = document.getElementById('form-new-customer');

    addBtn.addEventListener('click', () => {
        if (container.children.length >= 4) {
            alert("A maximum of 4 phone numbers is allowed per customer.");
            return;
        }

        const row = document.createElement('div');
        row.className = 'nc-phone-row item-row-box';
        row.style.cssText = 'display: flex; gap: 1rem; margin-bottom: 0.5rem; align-items: center; padding: 1rem;';
        
        row.innerHTML = `
            <input type="radio" name="nc-primary" value="0" title="Set as Primary" style="transform: scale(1.2);">
            <input type="text" class="form-control nc-phone-input" placeholder="03001234567" required pattern="\\d{11}" maxlength="11" minlength="11" title="Phone number must be exactly 11 digits" style="flex: 1;">
            <button type="button" class="btn btn-remove-phone" style="background: none; color: var(--danger); border: none; cursor: pointer; padding: 0.5rem;"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(row);
        
        // Update radio values
        const radios = container.querySelectorAll('input[type="radio"]');
        radios.forEach((r, idx) => r.value = idx);
    });

    container.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-phone')) {
            if (container.children.length > 1) {
                e.target.closest('.nc-phone-row').remove();
                // Ensure at least one radio is checked if the deleted one was checked
                const radios = container.querySelectorAll('input[type="radio"]');
                radios.forEach((r, idx) => r.value = idx);
                if (!container.querySelector('input[type="radio"]:checked')) {
                    radios[0].checked = true;
                }
            } else {
                alert("You need at least one phone number.");
            }
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        const p_name = document.getElementById('nc-name').value.trim();
        const p_address = document.getElementById('nc-address').value.trim();
        const p_reference = document.getElementById('nc-reference').value.trim() || null;
        const p_current_balance = parseFloat(document.getElementById('nc-balance').value) || 0;
        
        const p_phones = [];
        let valid = true;
        const phoneRegex = /^\d{11}$/;
        const rows = container.querySelectorAll('.nc-phone-row');
        rows.forEach((row, idx) => {
            const num = row.querySelector('.nc-phone-input').value.trim();
            const isPrimary = row.querySelector('input[type="radio"]').checked;
            if (!phoneRegex.test(num)) valid = false;
            p_phones.push({ phone_number: num, is_primary: isPrimary });
        });

        if (!valid || p_phones.length === 0) {
            alert("Please provide valid 11-digit phone numbers (e.g., 03001234567).");
            return;
        }
        
        if (p_phones.length > 4) {
            alert("A maximum of 4 phone numbers is allowed per customer.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';

        const { data, error } = await supabase.rpc('create_customer', {
            p_name,
            p_address,
            p_reference,
            p_phones,
            p_current_balance
        });

        if (error) {
            alert('Error creating customer: ' + error.message);
        } else {
            // Add new customer to cache dynamically to avoid full refresh
            cache.customers.push({ customer_id: data, name: p_name });
            populateSelects(); // Re-render dropdowns
            
            if (typeof loadCustomerStats === 'function') {
                loadCustomerStats();
                loadCustomerList();
            }
            
            form.reset();
            // Reset phones to 1
            container.innerHTML = `
                <div class="nc-phone-row item-row-box" style="display: flex; gap: 1rem; margin-bottom: 0.5rem; align-items: center; padding: 1rem;">
                    <input type="radio" name="nc-primary" value="0" checked title="Set as Primary" style="transform: scale(1.2);">
                    <input type="text" class="form-control nc-phone-input" placeholder="03001234567" required pattern="\\d{11}" maxlength="11" minlength="11" title="Phone number must be exactly 11 digits" style="flex: 1;">
                </div>
            `;
            document.getElementById('modal-overlay').style.display = 'none';
            alert('Customer registered successfully!');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register Customer';
    });
}

// --- GLOBAL TOAST OVERRIDE ---
// Overriding native alert to intercept all messages and show them as top-right toasts
window.alert = function(message) {
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
window.showView = function(viewId) {
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
        loadCustomerStats();
        loadCustomerList();
    } else if (viewId === 'dashboard') {
        if (titleEl) titleEl.textContent = 'Hi, Admin User';
        if (subtitleEl) subtitleEl.textContent = "Let's manage your business today!";
    }
};

// --- CUSTOMERS PAGE LOGIC ---
let custPageOffset = 0;
const custPageSize = 5;
let custSearchTimer = null;

async function loadCustomerStats() {
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

async function loadCustomerList() {
    const searchTerm = document.getElementById('search-customer').value.trim() || null;
    const duesOnly = document.getElementById('filter-dues-only').checked;
    
    const { data, error } = await supabase.rpc('get_customers_list', {
        search_term: searchTerm,
        dues_only: duesOnly,
        page_size: custPageSize,
        page_offset: custPageOffset
    });

    if (error) {
        alert("Error loading customers: " + error.message);
        return;
    }

    const tbody = document.getElementById('customers-table-body');
    tbody.innerHTML = '';
    
    data.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        tr.style.cursor = 'pointer';
        tr.onclick = () => showCustomerDetail(c.customer_id);
        
        tr.innerHTML = `
            <td style="padding: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #f3effb; color: var(--primary-accent); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem;">
                        ${c.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span style="font-weight: 500;">${c.name}</span>
                </div>
            </td>
            <td style="padding: 1rem; color: var(--text-secondary);">${c.primary_phone || 'N/A'}</td>
            <td style="padding: 1rem; font-weight: 600; color: ${c.balance_due > 0 ? 'var(--danger)' : 'var(--text-primary)'};">Rs ${Math.round(Number(c.balance_due)).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });

    const end = custPageOffset + data.length;
    document.getElementById('customers-page-info').textContent = `Showing ${data.length === 0 ? 0 : custPageOffset + 1}-${end}`;
    
    document.getElementById('btn-prev-page').disabled = custPageOffset === 0;
    document.getElementById('btn-prev-page').style.opacity = custPageOffset === 0 ? '0.5' : '1';
    
    document.getElementById('btn-next-page').disabled = data.length < custPageSize;
    document.getElementById('btn-next-page').style.opacity = data.length < custPageSize ? '0.5' : '1';
}

// Event Listeners
document.getElementById('search-customer').addEventListener('input', (e) => {
    clearTimeout(custSearchTimer);
    custSearchTimer = setTimeout(() => {
        custPageOffset = 0;
        loadCustomerList();
    }, 300);
});

document.getElementById('filter-dues-only').addEventListener('change', () => {
    custPageOffset = 0;
    loadCustomerList();
});

document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (custPageOffset >= custPageSize) {
        custPageOffset -= custPageSize;
        loadCustomerList();
    }
});

document.getElementById('btn-next-page').addEventListener('click', () => {
    custPageOffset += custPageSize;
    loadCustomerList();
});

// --- CUSTOMER DETAIL LOGIC ---
let activeCustomerId = null;

window.showCustomerDetail = async function(customerId) {
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

    // Populate display
    document.getElementById('cd-name-display').textContent = customer.name;
    document.getElementById('cd-address-display').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${customer.address}`;
    document.getElementById('cd-reference-display').textContent = `Ref: ${customer.reference || 'None'}`;
    
    const bal = dueInfo ? Number(dueInfo.balance_due) : 0;
    document.getElementById('cd-balance-display').textContent = `Rs ${Math.round(bal).toLocaleString()}`;
    
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

function addEditPhoneRow(id, number, isPrimary) {
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
    btn.disabled = false;
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
    
    const { error } = await supabase.rpc('update_customer_phones', {
        p_customer_id: activeCustomerId,
        p_phones: phones
    });
    
    if (error) alert("Error updating phones: " + error.message);
    else {
        alert("Phones updated successfully");
        showCustomerDetail(activeCustomerId);
    }
    btn.disabled = false;
});

// Ledger
async function loadCustomerLedger(customerId) {
    const { data, error } = await supabase
        .from('customer_ledger_view')
        .select('*')
        .eq('customer_id', customerId)
        .order('txn_date')
        .order('reference_id');
        
    if (error) return;
    
    const tbody = document.getElementById('cd-ledger-body');
    tbody.innerHTML = '';
    
    let runningBalance = 0;
    
    data.forEach(txn => {
        runningBalance += Number(txn.amount);
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        
        const isSale = txn.txn_type === 'SALE';
        const color = isSale ? 'var(--danger)' : 'var(--success)';
        const sign = isSale ? '+' : '';
        
        tr.innerHTML = `
            <td style="padding: 1rem; color: var(--text-secondary);">${new Date(txn.txn_date).toLocaleDateString()}</td>
            <td style="padding: 1rem;">
                <span class="status-badge" style="background: ${isSale ? '#fce8e8' : '#e6f8ee'}; color: ${color};">${txn.txn_type} #${txn.reference_id}</span>
            </td>
            <td style="padding: 1rem; font-weight: 600; color: ${color};">${sign}Rs ${Math.round(Math.abs(txn.amount)).toLocaleString()}</td>
            <td style="padding: 1rem; font-weight: 700;">Rs ${Math.round(runningBalance).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Record Payment
document.getElementById('form-record-payment').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeCustomerId) return;
    
    const amount = parseFloat(document.getElementById('rp-amount').value);
    const date = document.getElementById('rp-date').value;
    const method = document.getElementById('rp-method').value;
    const notes = document.getElementById('rp-notes').value.trim() || null;
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    const { error } = await supabase
        .from('customer_payments')
        .insert({
            customer_id: activeCustomerId,
            amount: amount,
            payment_date: date,
            method_id: method,
            notes: notes
        });
        
    if (error) alert("Error recording payment: " + error.message);
    else {
        alert("Payment recorded successfully!");
        document.getElementById('modal-record-payment').style.display = 'none';
        document.getElementById('form-record-payment').reset();
        showCustomerDetail(activeCustomerId);
    }
    btn.disabled = false;
});

window.openNewSaleForCustomer = function() {
    alert("New Sale module is pending implementation. Customer ID: " + activeCustomerId);
};
