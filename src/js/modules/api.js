import { supabase } from '../auth.js';
import { inventoryViewData, renderInventoryView } from './inventory.js';
import { cache } from './init.js';

// --- DATA CACHING ---
export async function loadCacheData() {
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

export function updateDashboardInventoryStats() {
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

export function populateSelects() {
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
