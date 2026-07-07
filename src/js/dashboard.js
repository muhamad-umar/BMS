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
    await loadInventoryView();
    initializeForms();
    if (typeof loadRecentSalesDashboard === 'function') loadRecentSalesDashboard();
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

// --- DATA CACHING ---
async function loadCacheData() {
    try {
        const [prodRes, payRes, custRes, invRes, catRes] = await Promise.all([
            supabase.from('products').select('product_id, product_name, selling_price').eq('is_active', true),
            supabase.from('payment_methods').select('method_id, method_name'),
            supabase.from('customers').select('customer_id, name'),
            supabase.from('inventory').select('product_id, current_stock'),
            supabase.from('product_categories').select('*')
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
        
        if (catRes && catRes.data) cache.categories = catRes.data;
        
        updateDashboardInventoryStats();
        populateSelects();
    } catch (error) {
        console.error("Error loading cache:", error);
    }
}

function updateDashboardInventoryStats() {
    // Optimistic update of Inventory View Grid & Table
    if (inventoryViewData && inventoryViewData.length > 0) {
        inventoryViewData.forEach(p => {
            if (cache.inventory[p.product_id] !== undefined) {
                if (!p.inventory) p.inventory = {};
                p.inventory.current_stock = cache.inventory[p.product_id];
            }
        });
        renderInventoryView();
    }
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
                cache.products.map(p => `<option value="${p.product_id}" data-price="${p.selling_price || 0}">${p.product_name}</option>`).join('');
        }
    });

    // Categories (Add Product)
    const apCatSelect = document.getElementById('ap-category');
    if (apCatSelect && cache.categories) {
        apCatSelect.innerHTML = '<option value="" disabled selected>Select a category...</option>' + 
            cache.categories.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
    }

    // Categories (Inventory Filter)
    const invCatFilter = document.getElementById('inv-filter-category');
    if (invCatFilter && cache.categories) {
        invCatFilter.innerHTML = '<option value="">All Categories</option>' + 
            cache.categories.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
    }
}

// --- FORMS LOGIC ---
function initializeForms() {
    initNewSaleForm();
    initAddInventoryForm();
    initNewCustomerForm();
    initAddProductForm();
    initAddCategoryForm();
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
                    ${cache.products.map(p => `<option value="${p.product_id}" data-price="${p.selling_price || 0}">${p.product_name}</option>`).join('')}
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

    // Auto-populate price when product selected
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('ns-product')) {
            const opt = e.target.options[e.target.selectedIndex];
            const price = opt.dataset.price;
            if (price) {
                e.target.closest('.ns-item-row').querySelector('.ns-price').value = price;
            }
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
            
            // Refresh views
            if (typeof loadSalesSummary === 'function') loadSalesSummary();
            if (typeof loadSalesList === 'function') loadSalesList();
            if (typeof loadPaymentsHistory === 'function') loadPaymentsHistory();
            if (typeof loadMovementHistory === 'function') loadMovementHistory();
            
            if (p_customer_id && activeCustomerId === p_customer_id) {
                showCustomerDetail(activeCustomerId);
            } else if (activeCustomerId) {
                // do nothing, unrelated customer
            } else {
                // global load
                if (typeof loadCustomerList === 'function') loadCustomerList();
                if (typeof loadCustomerStats === 'function') loadCustomerStats();
            }
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
    
    // Set default date and time
    const _now = new Date();
    _now.setMinutes(_now.getMinutes() - _now.getTimezoneOffset());
    document.getElementById('ai-date').value = _now.toISOString().slice(0, 16);

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
            const _resetNow = new Date();
            _resetNow.setMinutes(_resetNow.getMinutes() - _resetNow.getTimezoneOffset());
            document.getElementById('ai-date').value = _resetNow.toISOString().slice(0, 16);
            const rows = container.querySelectorAll('.ai-item-row');
            for(let i=1; i<rows.length; i++) rows[i].remove();
            
            calcAddInventoryTotal(); // Reset the UI display to Rs 0.00
            
            document.getElementById('modal-overlay').style.display = 'none';
            // Use toast notification ideally, but standard alert works for now.
            alert('Inventory batch added successfully!');
            if (typeof loadMovementHistory === 'function') loadMovementHistory();
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
    } else if (viewId === 'inventory') {
        if (titleEl) titleEl.textContent = 'Inventory Management';
        if (subtitleEl) subtitleEl.textContent = 'Track your products, stock levels, and movements.';
        if (typeof loadMovementHistory === 'function') loadMovementHistory();
    } else if (viewId === 'dashboard') {
        if (titleEl) titleEl.textContent = 'Hi, Admin User';
        if (subtitleEl) subtitleEl.textContent = "Let's manage your business today!";
        if (typeof loadRecentSalesDashboard === 'function') loadRecentSalesDashboard();
    } else if (viewId === 'sales') {
        if (titleEl) titleEl.textContent = 'Sales Management';
        if (subtitleEl) subtitleEl.textContent = 'Track your transactions, revenue, and customer dues.';
        if (typeof loadSalesSummary === 'function') loadSalesSummary();
        if (typeof loadSalesList === 'function') loadSalesList();
        if (typeof loadPaymentsHistory === 'function') loadPaymentsHistory();
    }
};

window.loadRecentSalesDashboard = async function() {
    const tbody = document.getElementById('recent-sales-body');
    if (!tbody) return;
    
    try {
        const { data, error } = await supabase.from('sales')
            .select(`
                sale_id, sale_code, sale_date, grand_total,
                customers(name, current_balance)
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
            const isPaid = !sale.customers || sale.customers.current_balance <= 0;
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

let customersListCache = [];
let custFilteredCache = [];

window.loadCustomerList = async function() {
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

function renderCustomerList() {
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
let currentLedgerData = [];
let ledgerPage = 1;
const ledgerPageSize = 6;

async function loadCustomerLedger(customerId) {
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

function renderCustomerLedger() {
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
    btn.disabled = false;
});

window.openRecordPayment = async function(presetCustomerId = null) {
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

window.openNewSaleForCustomer = async function() {
    document.getElementById('form-new-sale').reset();
    document.getElementById('ns-discount').value = 0;
    document.getElementById('ns-amount-paid').value = 0;
    document.getElementById('ns-grand-total').textContent = '0';
    
    const rows = document.querySelectorAll('.ns-item-row');
    for(let i=1; i<rows.length; i++) rows[i].remove();
    
    const prodSelect = document.querySelector('.ns-product');
    const { data: prods } = await supabase.from('products').select('*');
    if (prods) {
        window.bmsProducts = prods;
        prodSelect.innerHTML = '<option value="">Select...</option>' + prods.map(p => `<option value="${p.product_id}" data-price="${p.selling_price || 0}">${p.product_name}</option>`).join('');
    }
    
    const custSelect = document.getElementById('ns-customer');
    const { data: custs } = await supabase.from('customers').select('*');
    if (custs) {
        custSelect.innerHTML = '<option value="">Select...</option>' + custs.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join('');
        custSelect.value = activeCustomerId || '';
    }
    
    const pmSelect = document.getElementById('ns-payment-method');
    const { data: pMethods } = await supabase.from('payment_methods').select('*');
    if (pMethods) {
        pmSelect.innerHTML = pMethods.map(pm => `<option value="${pm.method_id}">${pm.method_name}</option>`).join('');
    }

    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-new-sale').style.display = 'block';
};



// --- INVENTORY VIEW LOGIC ---
let inventoryViewData = [];
let isInvListView = false;

window.toggleInvView = function() {
    isInvListView = !isInvListView;
    const grid = document.getElementById('inv-grid-view');
    const table = document.getElementById('inv-table-view');
    const icon = document.getElementById('inv-view-icon');
    const text = document.getElementById('inv-view-text');
    
    if (isInvListView) {
        grid.style.display = 'none';
        table.style.display = 'block';
        icon.className = 'fas fa-th-large';
        text.textContent = 'Grid View';
    } else {
        grid.style.display = 'grid';
        table.style.display = 'none';
        icon.className = 'fas fa-list';
        text.textContent = 'List View';
    }
};

window.loadInventoryView = async function() {
    // Single joined query: products + inventory + categories
    const { data, error } = await supabase
        .from('products')
        .select('product_id, product_name, unit_type, is_active, category_id, product_categories(category_name), inventory(current_stock, reorder_level, last_updated)')
        .order('product_name');
        
    if (error) {
        console.error("Error loading inventory view:", error);
        return;
    }
    
    inventoryViewData = data;
    renderInventoryView();
}

function renderInventoryView() {
    const grid = document.getElementById('inv-grid-view');
    const tbody = document.getElementById('inv-table-body');
    const search = document.getElementById('inv-search').value.toLowerCase();
    const catFilter = document.getElementById('inv-filter-category').value;
    const statFilter = document.getElementById('inv-filter-status').value;
    
    if (!grid || !tbody) return;
    
    grid.innerHTML = '';
    tbody.innerHTML = '';
    
    let activeCnt = 0;
    let lowCnt = 0;
    let outCnt = 0;
    
    // Filter and compute stats
    inventoryViewData.forEach(p => {
        const catName = p.product_categories ? p.product_categories.category_name : 'Uncategorized';
        const inv = p.inventory || { current_stock: 0, reorder_level: 0, last_updated: null };
        const stock = Number(inv.current_stock);
        const reorder = Number(inv.reorder_level);
        
        let statusStr = "Out of Stock";
        let statusClass = "status-danger";
        let badgeColor = "var(--danger)";
        let badgeBg = "#fce8e8";
        
        if (stock > reorder) {
            statusStr = "In Stock";
            statusClass = "status-success";
            badgeColor = "var(--success)";
            badgeBg = "#e6f8ee";
        } else if (stock > 0 && stock <= reorder) {
            statusStr = "Low Stock";
            statusClass = "status-warning";
            badgeColor = "var(--warning)";
            badgeBg = "#fff5e6";
        }
        
        if (p.is_active) activeCnt++;
        if (statusStr === "Low Stock") lowCnt++;
        if (statusStr === "Out of Stock") outCnt++;
        
        // Filtering
        if (search && !p.product_name.toLowerCase().includes(search)) return;
        if (catFilter && p.category_id.toString() !== catFilter) return;
        if (statFilter && statusStr !== statFilter) return;
        
        // Card Grid
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cursor = 'pointer';
        card.onclick = () => openMovementLog(p.product_id, p.product_name);
        card.innerHTML = `
            <div class="stat-header" style="align-items: flex-start;">
                <div class="stat-title">
                    <h3 style="font-size: 1.1rem; color: #302058; font-weight: 700;">${p.product_name}</h3>
                    <p>${catName} · ${p.unit_type}</p>
                </div>
                <div style="background: ${badgeBg}; color: ${badgeColor}; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                    ${statusStr}
                </div>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #302058; margin: 1rem 0;">
                ${stock} <span style="font-size: 1rem; color: var(--text-secondary); font-weight: 500;">${p.unit_type}</span>
            </div>
            <div class="stat-footer" style="padding-top: 1rem; border-top: 1px solid #eaeaea;">
                <span style="color: var(--text-secondary); font-size: 0.8rem;">Reorder at: <strong style="color: var(--text-primary);">${reorder} ${p.unit_type}</strong></span>
            </div>
        `;
        grid.appendChild(card);
        
        // Table Row
        const tr = document.createElement('tr');
        if (statusStr !== 'In Stock') {
            tr.style.backgroundColor = badgeBg; // subtle tint
        }
        tr.innerHTML = `
            <td style="font-weight: 600;">${p.product_name}</td>
            <td>${catName}</td>
            <td style="font-weight: 700;">${stock} ${p.unit_type}</td>
            <td>${reorder}</td>
            <td style="text-align: center;"><span class="status-badge ${statusClass}">${statusStr}</span></td>
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${inv.last_updated ? new Date(inv.last_updated).toLocaleString() : 'Never'}</td>
            <td>
                <button class="btn" style="background: transparent; color: var(--primary-accent); padding: 0.4rem;" onclick="openMovementLog(${p.product_id}, '${p.product_name}')">
                    <i class="fas fa-history" style="margin-right: 0.5rem;"></i> History
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Update KPI Boxes
    document.getElementById('stat-inv-active').textContent = activeCnt;
    document.getElementById('stat-inv-low').textContent = lowCnt;
    document.getElementById('stat-inv-out').textContent = outCnt;
    
}

// Attach filters
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('inv-search')?.addEventListener('input', renderInventoryView);
    document.getElementById('inv-filter-category')?.addEventListener('change', renderInventoryView);
    document.getElementById('inv-filter-status')?.addEventListener('change', renderInventoryView);
});

window.openMovementLog = async function(productId, productName) {
    document.getElementById('ml-title').textContent = productName ? `Movement History: ${productName}` : 'Global Movement History';
    const tbody = document.getElementById('ml-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-movement-log').style.display = 'block';
    
    let query = supabase.from('stock_movements').select('*').order('movement_date', { ascending: false }).limit(100);
    if (productId) {
        query = query.eq('product_id', productId);
    }
    
    const { data, error } = await query;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No movements found.</td></tr>';
        return;
    }
    
    data.forEach(m => {
        const sign = m.movement_type === 'IN' ? '+' : '-';
        const color = m.movement_type === 'IN' ? 'var(--success)' : 'var(--danger)';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(m.movement_date).toLocaleString()}</td>
            <td><span class="status-badge" style="background: ${m.movement_type==='IN'?'#e6f8ee':'#fce8e8'}; color: ${color};">${m.movement_type}</span></td>
            <td style="font-weight: 700; color: ${color};">${sign}${Math.round(Number(m.quantity)).toLocaleString()}</td>
            <td style="color: var(--text-secondary);">${m.reference_type} #${m.reference_id}</td>
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${m.notes || ''}</td>
        `;
        tbody.appendChild(tr);
    });
};

window.openMovementLogGlobal = function() {
    openMovementLog(null, null);
};

// --- INIT ADD PRODUCT FORM ---
function initAddProductForm() {
    const form = document.getElementById('form-add-product');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        const { data, error } = await supabase.from('products').insert([{
            product_name: document.getElementById('ap-name').value,
            category_id: parseInt(document.getElementById('ap-category').value),
            unit_type: document.getElementById('ap-unit').value,
            is_active: true
        }]).select();
        
        if (error) {
            alert('Error adding product: ' + error.message);
        } else {
            await loadCacheData();
            await loadInventoryView();
            form.reset();
            document.getElementById('modal-overlay').style.display = 'none';
            alert('Product created successfully!');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Product';
    });
}

// --- INIT ADD CATEGORY FORM ---
function initAddCategoryForm() {
    const form = document.getElementById('form-add-category');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        const { data, error } = await supabase.from('product_categories').insert([{
            category_name: document.getElementById('ac-name').value
        }]).select();
        
        if (error) {
            alert('Error adding category: ' + error.message);
        } else {
            await loadCacheData();
            await loadInventoryView();
            form.reset();
            document.getElementById('modal-overlay').style.display = 'none';
            alert('Category created successfully!');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Category';
    });
}

// Attach View Categories Modal rendering
document.addEventListener("DOMContentLoaded", () => {
    const viewCatBtn = document.getElementById('btn-view-categories');
    if (viewCatBtn) {
        viewCatBtn.addEventListener('click', () => {
            const tbody = document.getElementById('vc-table-body');
            if (!tbody || !cache.categories) return;
            tbody.innerHTML = '';
            cache.categories.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: 600; color: var(--text-secondary);">#${c.category_id}</td>
                    <td style="font-weight: 700;">${c.category_name}</td>
                `;
                tbody.appendChild(tr);
            });
        });
    }
});

// --- SALES VIEW LOGIC ---

let salesSummaryData = null;
let currentSalesRange = 'today';
let salesListCache = [];
let currentSalesPage = 1;
const salesPerPage = 5;
let salesFilters = { search: '', date: '', status: '', sort: 'newest' };

let paymentsHistoryCache = [];
let currentPaymentsPage = 1;
const paymentsPerPage = 5;
let paymentsFilters = { search: '', date: '' };

window.loadSalesSummary = async function() {
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

function updateSalesSummaryUI(range) {
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

    ['payments-filter-search', 'payments-filter-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                paymentsFilters = {
                    search: document.getElementById('payments-filter-search')?.value.toLowerCase() || '',
                    date: document.getElementById('payments-filter-date')?.value || ''
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

window.loadSalesList = async function() {
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

function getFilteredSales() {
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
        
        return true;
    }).sort((a, b) => {
        if (salesFilters.sort === 'highest') return b.grand_total - a.grand_total;
        return new Date(b.sale_date) - new Date(a.sale_date);
    });
}

function renderSalesList() {
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
            <td style="font-weight: 600; color: var(--primary-accent);">${s.sale_code || ('#SL-' + s.sale_id)}</td>
            <td style="color: var(--text-secondary);">${dateStr}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #f3effb; color: var(--primary-accent); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem;">
                        ${s.customers?.name?.substring(0, 2).toUpperCase() || 'W'}
                    </div>
                    <span>${s.customers?.name || 'Walk-in'}</span>
                </div>
            </td>
            <td>${itemsCount}</td>
            <td>Rs ${Math.round(s.discount).toLocaleString()}</td>
            <td style="font-weight: 600;">Rs ${Math.round(s.grand_total).toLocaleString()}</td>
            <td>
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

window.openSaleDetails = async function(sale_id, sale_code, custName, dateStr, grandTotal, discount) {
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

window.loadPaymentsHistory = async function() {
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

function getFilteredPayments() {
    return paymentsHistoryCache.filter(p => {
        if (paymentsFilters.search) {
            const matchName = p.customers && p.customers.name.toLowerCase().includes(paymentsFilters.search);
            const matchCode = p.payment_code && p.payment_code.toLowerCase().includes(paymentsFilters.search);
            const matchId = ('#pay-' + p.payment_id).includes(paymentsFilters.search);
            if (!matchName && !matchCode && !matchId) return false;
        }
        if (paymentsFilters.date && !p.payment_date.startsWith(paymentsFilters.date)) return false;

        return true;
    });
}

window.renderPaymentsHistory = function() {
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

// --- MOVEMENT HISTORY LOGIC ---
let movementHistoryCache = [];
let movementPageOffset = 0;
const movementPageSize = 10;
let movementSearchTimer = null;

window.loadMovementHistory = async function() {
    // query from stock_movements table
    const { data, error } = await supabase.from('stock_movements')
        .select('*')
        .order('movement_date', { ascending: false });
        
    if (error) {
        console.error('Error loading movement history:', error);
        return;
    }
    
    movementHistoryCache = (data || []).map(m => {
        const prod = cache.products ? cache.products.find(p => p.product_id === m.product_id) : null;
        m.product_name = prod ? prod.product_name : 'Unknown Product';
        return m;
    });
    
    movementPageOffset = 0;
    renderMovementHistory();
};

window.renderMovementHistory = function() {
    const searchTerm = (document.getElementById('search-movement').value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('filter-movement-type').value;

    const filtered = movementHistoryCache.filter(m => {
        if (typeFilter !== 'all' && m.movement_type !== typeFilter) return false;
        
        if (searchTerm) {
            const prodMatch = (m.product_name || '').toLowerCase().includes(searchTerm);
            const refMatch = (m.reference_id || '').toString().toLowerCase().includes(searchTerm) || 
                             (m.reference_type || '').toLowerCase().includes(searchTerm) ||
                             (m.reference_code || '').toLowerCase().includes(searchTerm);
            if (!prodMatch && !refMatch) return false;
        }
        return true;
    });

    const tbody = document.getElementById('movement-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const paginated = filtered.slice(movementPageOffset, movementPageOffset + movementPageSize);
    
    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No movements found matching the filters.</td></tr>';
    }

    paginated.forEach(m => {
        const sign = m.movement_type === 'IN' ? '+' : '-';
        const color = m.movement_type === 'IN' ? 'var(--success)' : 'var(--danger)';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eaeaea';
        
        const dateObj = new Date(m.movement_date);
        
        tr.innerHTML = `
            <td style="padding: 1rem; color: var(--text-secondary);">${dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} ${dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
            <td style="padding: 1rem; font-weight: 500;">${m.product_name || 'Unknown Product'}</td>
            <td style="padding: 1rem;">
                <span style="display: inline-flex; align-items: center; gap: 0.4rem; background: ${m.movement_type === 'IN' ? '#e6f8ee' : '#fce8e8'}; color: ${color}; padding: 0.35rem 0.75rem; border-radius: 8px; font-weight: 600; font-size: 0.8rem; letter-spacing: 0.3px;">
                    <i class="fas ${m.movement_type === 'IN' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    ${m.movement_type === 'IN' ? 'STOCK IN' : 'STOCK OUT'}
                </span>
            </td>
            <td style="padding: 1rem; font-weight: 700; color: ${color};">${sign}${Math.round(Number(m.quantity)).toLocaleString()}</td>
            <td style="padding: 1rem; color: var(--text-secondary);">${(m.reference_type === 'SALE' || m.reference_type === 'PURCHASE') ? '' : (m.reference_type ? m.reference_type + ' ' : '')}${m.reference_code ? m.reference_code : (m.reference_id ? '#' + m.reference_id : '')}</td>
        `;
        tbody.appendChild(tr);
    });

    const end = Math.min(movementPageOffset + movementPageSize, filtered.length);
    document.getElementById('movement-page-info').textContent = `Showing ${filtered.length === 0 ? 0 : movementPageOffset + 1}-${end} of ${filtered.length}`;
    
    document.getElementById('btn-movement-prev').disabled = movementPageOffset === 0;
    document.getElementById('btn-movement-prev').style.opacity = movementPageOffset === 0 ? '0.5' : '1';
    
    document.getElementById('btn-movement-next').disabled = end >= filtered.length;
    document.getElementById('btn-movement-next').style.opacity = end >= filtered.length ? '0.5' : '1';
};

// Event Listeners for Movement History
document.getElementById('search-movement')?.addEventListener('input', () => {
    clearTimeout(movementSearchTimer);
    movementSearchTimer = setTimeout(() => {
        movementPageOffset = 0;
        renderMovementHistory();
    }, 300);
});

document.getElementById('filter-movement-type')?.addEventListener('change', () => {
    movementPageOffset = 0;
    renderMovementHistory();
});

document.getElementById('btn-movement-prev')?.addEventListener('click', () => {
    if (movementPageOffset >= movementPageSize) {
        movementPageOffset -= movementPageSize;
        renderMovementHistory();
    }
});

document.getElementById('btn-movement-next')?.addEventListener('click', () => {
    if (movementPageOffset + movementPageSize < movementHistoryCache.length) {
        movementPageOffset += movementPageSize;
        renderMovementHistory();
    }
});
