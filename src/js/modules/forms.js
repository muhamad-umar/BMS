import { supabase } from '../auth.js';
import { populateSelects, updateDashboardInventoryStats, loadCacheData } from './api.js';
import { loadPaymentsHistory, loadSalesList, loadSalesSummary } from './sales.js';
import { initAddCategoryForm, initAddProductForm, initEditProductForm, loadInventoryView } from './inventory.js';
import { loadMovementHistory } from './movements.js';
import { loadRecentSalesDashboard, loadEmployeeActivitySummary } from './core.js';
import { loadCustomerList, loadCustomerStats, showCustomerDetail, activeCustomerId } from './customers.js';
import { cache } from './init.js';

// --- FORMS LOGIC ---
export function initializeForms() {
    initNewSaleForm();
    initAddInventoryForm();
    initNewCustomerForm();
    initAddProductForm();
    initAddCategoryForm();
    initEditProductForm();
}

// 1. New Sale
export function initNewSaleForm() {
    const container = document.getElementById('ns-items-container');
    const addBtn = document.getElementById('btn-ns-add-item');
    const form = document.getElementById('form-new-sale');
    
    if (!form || !addBtn) return;

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
                    ${cache.products.map(p => {
                        const stock = cache.inventory ? (cache.inventory[p.product_id] || 0) : 0;
                        return `<option value="${p.product_id}" data-price="${p.selling_price || 0}" data-stock="${stock}">${p.product_name}</option>`;
                    }).join('')}
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

    // Live calc on input change and enforce max stock
    form.addEventListener('input', (e) => {
        if (e.target.classList.contains('ns-qty')) {
            const max = parseFloat(e.target.max);
            if (!isNaN(max) && parseFloat(e.target.value) > max) {
                e.target.value = '';
                alert(`Error: Only ${max} units available in stock.`);
            }
            calcGrandTotal();
        } else if (e.target.classList.contains('ns-price') || e.target.id === 'ns-discount') {
            calcGrandTotal();
        }
    });

    // Auto-populate price and stock limit when product selected
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('ns-product')) {
            const opt = e.target.options[e.target.selectedIndex];
            const price = opt.dataset.price;
            const stock = parseFloat(opt.dataset.stock) || 0;
            
            const row = e.target.closest('.ns-item-row');
            if (price) {
                row.querySelector('.ns-price').value = price;
            }
            
            const qtyInput = row.querySelector('.ns-qty');
            qtyInput.max = stock;
            qtyInput.placeholder = `Max: ${stock}`;
            
            if (parseFloat(qtyInput.value) > stock) {
                qtyInput.value = '';
                alert(`Error: Only ${stock} units available in stock.`);
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
        const discountPct = parseFloat(document.getElementById('ns-discount').value) || 0;
        const discountAmount = Math.max(0, total * (discountPct / 100));
        const grandTotal = Math.max(0, total - discountAmount);
        document.getElementById('ns-grand-total').textContent = Math.round(grandTotal).toLocaleString();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        
        // Build payload
        const customerIdStr = document.getElementById('ns-customer').value;
        const p_customer_id = customerIdStr ? parseInt(customerIdStr) : null;
        const p_discount_pct = parseFloat(document.getElementById('ns-discount').value) || 0;
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

        // Recompute Grand Total to validate walk-in amounts
        let total = 0;
        p_items.forEach(item => total += (item.quantity * item.unit_price));
        const p_discount = Math.max(0, total * (p_discount_pct / 100));
        const grandTotal = Math.max(0, total - p_discount);
        const roundedGrandTotal = Math.round(grandTotal);

        if (p_customer_id === null) {
            if (p_amount_paid !== roundedGrandTotal) {
                alert(`Walk-in customers must pay the exact grand total (Rs ${roundedGrandTotal.toLocaleString()}). Please adjust the Amount Paid.`);
                return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
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
                
                // Optimistic inventory deduction for New Sale
                p_items.forEach(item => {
                    if (cache.inventory && cache.inventory[item.product_id] !== undefined) {
                        cache.inventory[item.product_id] = Math.max(0, cache.inventory[item.product_id] - item.quantity);
                    }
                });
                
                // Update the dropdowns with new stock values
                document.querySelectorAll('.ns-product option').forEach(opt => {
                    if (opt.value && cache.inventory && cache.inventory[opt.value] !== undefined) {
                        opt.dataset.stock = cache.inventory[opt.value];
                    }
                });

                // Close new sale modal and open receipt
                if (window.openSaleDetailsById) {
                    window.openSaleDetailsById(data, true);
                } else {
                    document.getElementById('modal-overlay').style.display = 'none';
                    alert('Sale recorded successfully!');
                }
                
                // FIX #1: Targeted refresh — only re-fetch what the active tab needs.
                // Avoids firing 10+ simultaneous queries on every sale.
                setTimeout(async () => {
                    if (typeof window.resetCustomerStatsCache === 'function') window.resetCustomerStatsCache();
                    
                    // Unconditional background refreshes for global dashboard/summary stats
                    if (typeof loadRecentSalesDashboard === 'function') loadRecentSalesDashboard();
                    if (typeof loadEmployeeActivitySummary === 'function') loadEmployeeActivitySummary(true);
                    if (typeof loadSalesSummary === 'function') loadSalesSummary();
                    if (typeof window.loadRecentSalesDashboard === 'function') window.loadRecentSalesDashboard();
                    
                    const isCustomerDetailVisible = document.getElementById('view-customer-detail')?.style.display !== 'none';
                    const isCustomerListVisible = document.getElementById('view-customers')?.style.display !== 'none';
                    const isSalesVisible = document.getElementById('view-sales')?.style.display !== 'none';

                    if (isSalesVisible) {
                        if (typeof loadSalesList === 'function') loadSalesList();
                        if (typeof loadPaymentsHistory === 'function') loadPaymentsHistory();
                    }
                    
                    if (isCustomerDetailVisible && p_customer_id && activeCustomerId === p_customer_id) {
                        showCustomerDetail(activeCustomerId);
                    } else if (isCustomerListVisible && typeof loadCustomerList === 'function') {
                        loadCustomerList();
                    }

                    // Always update inventory stock from cache (optimistic, no network call)
                    if (typeof updateDashboardInventoryStats === 'function') updateDashboardInventoryStats();
                    
                    if (document.getElementById('purchase-history-panel')?.style.display === 'flex' && typeof window.loadPurchaseHistory === 'function') {
                        window.loadPurchaseHistory();
                    }
                }, 10);
            }
        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Sale';
        }
    });
}

// 2. Add Inventory
export function initAddInventoryForm() {
    const container = document.getElementById('ai-items-container');
    const addBtn = document.getElementById('btn-ai-add-item');
    const form = document.getElementById('form-add-inventory');
    
    if (!form || !addBtn) return;

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
        
        try {
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
                alert('Inventory batch added successfully!');
                
                // FIX #1: Targeted refresh — only update inventory-related views.
                // The optimistic update above already patched the stock numbers in cache.
                // We only need a server-reconcile of the inventory view + movement log,
                // since DB triggers may have computed values we cannot replicate client-side.
                setTimeout(async () => {
                    if (typeof loadInventoryView === 'function') loadInventoryView();
                    // Only refresh movement log if inventory tab is the active view
                    const activeView = document.querySelector('.app-view[style*="flex"]')?.id || '';
                    if (activeView.includes('inventory') && typeof loadMovementHistory === 'function') {
                        loadMovementHistory();
                    }
                    if (document.getElementById('purchase-history-panel')?.style.display === 'flex' && typeof window.loadPurchaseHistory === 'function') {
                        window.loadPurchaseHistory();
                    }
                }, 10);
            }
        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Record Purchase';
        }
    });
}

// 3. New Customer
export function initNewCustomerForm() {
    const container = document.getElementById('nc-phones-container');
    const addBtn = document.getElementById('btn-nc-add-phone');
    const form = document.getElementById('form-new-customer');
    
    if (!form || !addBtn || !container) return;

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

        try {
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
                // Update cache with new customer entry
                if (!cache.customers) cache.customers = [];
                cache.customers.push({ customer_id: data, name: p_name });
                
                if (typeof loadCustomerStats === 'function') {
                    loadCustomerStats(true); // force refresh stats
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

                // Auto-select the new customer in the autocomplete that opened this modal
                if (window._pendingCustomerAutocomplete) {
                    const newCustomer = {
                        customer_id: data,
                        name: p_name,
                        address: p_address || '',
                        primary_phone: p_phones.length > 0 ? p_phones[0].phone_number : null
                    };
                    await window._pendingCustomerAutocomplete.presetCustomer(newCustomer);
                    window._pendingCustomerAutocomplete = null;
                    // Re-open the original modal (new sale or record payment)
                    const targetModal = document.getElementById('modal-new-sale')?.style.display === 'none'
                        ? document.getElementById('modal-record-payment')
                        : document.getElementById('modal-new-sale');
                    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
                    document.getElementById('modal-overlay').style.display = 'flex';
                    if (targetModal) targetModal.style.display = 'block';
                } else {
                    document.getElementById('modal-overlay').style.display = 'none';
                }

                alert('Customer registered successfully!');
            }
        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register Customer';
        }
    });
}
