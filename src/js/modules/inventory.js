import { supabase } from '../auth.js';
import { loadCacheData } from './api.js';
import { cache } from './init.js';

// --- INVENTORY VIEW LOGIC ---
export let inventoryViewData = [];
export let isInvListView = false;

export const toggleInvView = function() {
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

export const loadInventoryView = async function() {
    // Single joined query: products + inventory (including selling_price) + categories
    const { data, error } = await supabase
        .from('products')
        .select('product_id, product_name, unit_type, selling_price, is_active, category_id, product_categories(category_name), inventory(inventory_id, current_stock, reorder_level, last_updated)')
        .order('product_name');
        
    if (error) {
        console.error("Error loading inventory view:", error);
        return;
    }
    
    inventoryViewData = data;
    renderInventoryView();
}

export function renderInventoryView() {
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
        const inv = p.inventory || { inventory_id: null, current_stock: 0, reorder_level: 0, last_updated: null };
        const stock = Number(inv.current_stock);
        const reorder = Number(inv.reorder_level);
        const sellingPrice = p.selling_price != null ? Number(p.selling_price) : null;
        
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
        
        const priceTag = sellingPrice != null
            ? `<span style="color: var(--primary-accent); font-weight: 600;">Rs ${Math.round(sellingPrice).toLocaleString()}</span>`
            : `<span style="color: var(--text-secondary); font-size: 0.8rem;">No price set</span>`;
        
        // ── Card Grid ──────────────────────────────────────────────────────────
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
            <div class="stat-header" style="align-items: flex-start;">
                <div class="stat-title">
                    <h3 style="font-size: 1.1rem; color: #302058; font-weight: 700;">${p.product_name}</h3>
                    <p>${catName} · ${p.unit_type}</p>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
                    <div style="background: ${badgeBg}; color: ${badgeColor}; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                        ${statusStr}
                    </div>
                </div>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #302058; margin: 0.75rem 0;">
                ${stock} <span style="font-size: 1rem; color: var(--text-secondary); font-weight: 500;">${p.unit_type}</span>
            </div>
            <div class="stat-footer" style="padding-top: 1rem; border-top: 1px solid #eaeaea; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--text-secondary); font-size: 0.8rem;">Reorder at: <strong style="color: var(--text-primary);">${reorder} ${p.unit_type}</strong></span>
                ${priceTag}
            </div>
            <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
                <button class="btn" style="flex: 1; background: var(--bg-light-purple); color: var(--primary-accent); padding: 0.45rem 0.5rem; font-size: 0.82rem; font-weight: 600;"
                    onclick="event.stopPropagation(); openEditProduct(${p.product_id})">
                    <i class="fas fa-edit" style="margin-right: 0.3rem;"></i>Edit
                </button>
                <button class="btn" style="flex: 1; background: #f3f3f3; color: var(--text-secondary); padding: 0.45rem 0.5rem; font-size: 0.82rem;"
                    onclick="event.stopPropagation(); openMovementLog(${p.product_id}, '${p.product_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-history" style="margin-right: 0.3rem;"></i>History
                </button>
            </div>
        `;
        grid.appendChild(card);
        
        // ── Table Row ──────────────────────────────────────────────────────────
        const tr = document.createElement('tr');
        if (statusStr !== 'In Stock') {
            tr.style.backgroundColor = badgeBg;
        }
        tr.innerHTML = `
            <td style="font-weight: 600;">${p.product_name}</td>
            <td>${catName}</td>
            <td style="font-weight: 700;">${stock} ${p.unit_type}</td>
            <td>${reorder}</td>
            <td>${sellingPrice != null ? 'Rs ' + Math.round(sellingPrice).toLocaleString() : '—'}</td>
            <td style="text-align: center;"><span class="status-badge ${statusClass}">${statusStr}</span></td>
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${inv.last_updated ? new Date(inv.last_updated).toLocaleString() : 'Never'}</td>
            <td style="white-space: nowrap;">
                <button class="btn" style="background: var(--bg-light-purple); color: var(--primary-accent); padding: 0.4rem 0.75rem; margin-right: 0.4rem; font-size: 0.82rem;" onclick="openEditProduct(${p.product_id})">
                    <i class="fas fa-edit" style="margin-right: 0.3rem;"></i>Edit
                </button>
                <button class="btn" style="background: transparent; color: var(--text-secondary); padding: 0.4rem 0.75rem; font-size: 0.82rem;" onclick="openMovementLog(${p.product_id}, '${p.product_name.replace(/'/g, "\\'")}')">
                    <i class="fas fa-history" style="margin-right: 0.3rem;"></i>History
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

// --- OPEN EDIT PRODUCT MODAL ---
export const openEditProduct = async function(productId) {
    const product = inventoryViewData.find(p => p.product_id === productId);
    if (!product) return;

    const inv = product.inventory || { inventory_id: null, reorder_level: 0 };

    // Populate category select from cache
    const catSelect = document.getElementById('ep-category');
    if (cache.categories) {
        catSelect.innerHTML = cache.categories.map(c =>
            `<option value="${c.category_id}" ${c.category_id === product.category_id ? 'selected' : ''}>${c.category_name}</option>`
        ).join('');
    }

    // Populate fields
    document.getElementById('ep-product-id').value = productId;
    document.getElementById('ep-inventory-id').value = inv.inventory_id || '';
    document.getElementById('ep-name').value = product.product_name;
    document.getElementById('ep-selling-price').value = product.selling_price != null ? product.selling_price : '';
    document.getElementById('ep-reorder-level').value = inv.reorder_level != null ? inv.reorder_level : 0;
    document.getElementById('ep-unit').value = product.unit_type;

    // Toggle-active button state
    const deactivateIcon = document.getElementById('ep-deactivate-icon');
    const deactivateBtn = document.getElementById('ep-deactivate-btn');
    if (product.is_active) {
        deactivateIcon.className = 'fas fa-toggle-on';
        deactivateBtn.title = 'Deactivate product';
        deactivateBtn.style.color = 'var(--success)';
    } else {
        deactivateIcon.className = 'fas fa-toggle-off';
        deactivateBtn.title = 'Activate product';
        deactivateBtn.style.color = 'var(--text-secondary)';
    }

    document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('modal-edit-product').style.display = 'block';
};

// --- INIT EDIT PRODUCT FORM ---
export function initEditProductForm() {
    const form = document.getElementById('form-edit-product');
    if (!form) return;

    // Save handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem;"></i>Saving…';

        const productId = parseInt(document.getElementById('ep-product-id').value);
        const inventoryId = document.getElementById('ep-inventory-id').value;
        const newSellingPrice = document.getElementById('ep-selling-price').value;
        const newReorderLevel = parseFloat(document.getElementById('ep-reorder-level').value) || 0;
        const newName = document.getElementById('ep-name').value.trim();
        const newCategoryId = parseInt(document.getElementById('ep-category').value);
        const newUnit = document.getElementById('ep-unit').value;

        try {
            // Update products table
            const { error: prodErr } = await supabase
                .from('products')
                .update({
                    product_name: newName,
                    category_id: newCategoryId,
                    unit_type: newUnit,
                    selling_price: newSellingPrice !== '' ? parseFloat(newSellingPrice) : null
                })
                .eq('product_id', productId);

            if (prodErr) throw prodErr;

            // Update inventory table (reorder_level)
            if (inventoryId) {
                const { error: invErr } = await supabase
                    .from('inventory')
                    .update({ reorder_level: newReorderLevel })
                    .eq('inventory_id', parseInt(inventoryId));
                if (invErr) throw invErr;
            } else {
                // No inventory row yet — upsert one
                const { error: upsertErr } = await supabase
                    .from('inventory')
                    .upsert({ product_id: productId, current_stock: 0, reorder_level: newReorderLevel });
                if (upsertErr) throw upsertErr;
            }

            // Update local cache (products cache) so New Sale dropdown reflects new price
            if (cache.products) {
                const cached = cache.products.find(p => p.product_id === productId);
                if (cached) {
                    cached.product_name = newName;
                    cached.selling_price = newSellingPrice !== '' ? parseFloat(newSellingPrice) : null;
                    cached.category_id = newCategoryId;
                    cached.unit_type = newUnit;
                }
            }

            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('modal-edit-product').style.display = 'none';

            // Reload inventory view to reflect changes
            await loadInventoryView();

            // Show success toast
            const toastContainer = document.getElementById('toast-container');
            if (toastContainer) {
                const toast = document.createElement('div');
                toast.className = 'toast success';
                toast.innerHTML = `<i class="fas fa-check-circle toast-icon"></i><span class="toast-message">Product updated successfully!</span>`;
                toastContainer.appendChild(toast);
                setTimeout(() => toast.classList.add('show'), 10);
                setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
            } else {
                alert('Product updated successfully!');
            }
        } catch (err) {
            console.error(err);
            alert('Error updating product: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save" style="margin-right: 0.5rem;"></i>Save Changes';
        }
    });

    // Toggle active/inactive
    document.getElementById('ep-deactivate-btn')?.addEventListener('click', async () => {
        const productId = parseInt(document.getElementById('ep-product-id').value);
        const product = inventoryViewData.find(p => p.product_id === productId);
        if (!product) return;

        const newActive = !product.is_active;
        const { error } = await supabase
            .from('products')
            .update({ is_active: newActive })
            .eq('product_id', productId);

        if (error) { alert('Error: ' + error.message); return; }

        // Update local state
        product.is_active = newActive;
        const icon = document.getElementById('ep-deactivate-icon');
        const btn = document.getElementById('ep-deactivate-btn');
        if (newActive) {
            icon.className = 'fas fa-toggle-on';
            btn.title = 'Deactivate product';
            btn.style.color = 'var(--success)';
        } else {
            icon.className = 'fas fa-toggle-off';
            btn.title = 'Activate product';
            btn.style.color = 'var(--text-secondary)';
        }

        renderInventoryView(); // refresh list in background
    });
}

export const openMovementLog = async function(productId, productName) {
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
            <td style="color: var(--text-secondary);">${(m.reference_type === 'SALE' || m.reference_type === 'PURCHASE') ? '' : (m.reference_type ? m.reference_type + ' ' : '')}${m.reference_code ? m.reference_code : (m.reference_id ? '#' + m.reference_id : '')}</td>
            <td style="color: var(--text-secondary); font-size: 0.85rem;">${m.notes || ''}</td>
        `;
        tbody.appendChild(tr);
    });
};

export const openMovementLogGlobal = function() {
    openMovementLog(null, null);
};

// --- INIT ADD PRODUCT FORM ---
export function initAddProductForm() {
    const form = document.getElementById('form-add-product');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
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
        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Product';
        }
    });
}

// --- INIT ADD CATEGORY FORM ---
export function initAddCategoryForm() {
    const form = document.getElementById('form-add-category');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
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
        } catch (err) {
            console.error(err);
            alert('An unexpected error occurred: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Category';
        }
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

// ==========================================
// Purchase History & Batch Detail Logic
// ==========================================
let phOffset = 0;
const PH_LIMIT = 25;
let phIsVisible = false;

document.addEventListener('DOMContentLoaded', () => {
    // Purchase History Toggle
    const toggleBtn = document.getElementById('btn-toggle-purchase-history');
    const panel = document.getElementById('purchase-history-panel');
    const icon = document.getElementById('ph-toggle-icon');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            phIsVisible = !phIsVisible;
            if (phIsVisible) {
                panel.style.display = 'flex';
                icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
                toggleBtn.innerHTML = `<i class="fas fa-chevron-up" id="ph-toggle-icon" style="margin-right: 0.5rem;"></i> Hide Purchase History`;
                populatePhFilterProducts();
                loadPurchaseHistory();
            } else {
                panel.style.display = 'none';
                icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
                toggleBtn.innerHTML = `<i class="fas fa-chevron-down" id="ph-toggle-icon" style="margin-right: 0.5rem;"></i> Show Purchase History`;
            }
        });
    }

    // Purchase History Filters
    document.getElementById('btn-ph-apply')?.addEventListener('click', () => {
        phOffset = 0;
        loadPurchaseHistory();
    });

    document.getElementById('btn-ph-reset')?.addEventListener('click', () => {
        document.getElementById('ph-filter-product').value = '';
        document.getElementById('ph-filter-start').value = '';
        document.getElementById('ph-filter-end').value = '';
        phOffset = 0;
        loadPurchaseHistory();
    });

    // Purchase History Pagination
    document.getElementById('btn-ph-prev')?.addEventListener('click', () => {
        if (phOffset >= PH_LIMIT) {
            phOffset -= PH_LIMIT;
            loadPurchaseHistory();
        }
    });

    document.getElementById('btn-ph-next')?.addEventListener('click', () => {
        phOffset += PH_LIMIT;
        loadPurchaseHistory();
    });
});

async function populatePhFilterProducts() {
    const select = document.getElementById('ph-filter-product');
    if (!select || select.options.length > 1) return; // Already populated
    try {
        const { data, error } = await supabase.from('products').select('product_id, product_name').order('product_name');
        if (error) throw error;
        data.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.product_id;
            opt.textContent = p.product_name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Error loading products for filter:", e);
    }
}

async function loadPurchaseHistory() {
    const tbody = document.getElementById('ph-table-body');
    const productId = document.getElementById('ph-filter-product').value || null;
    const dateStart = document.getElementById('ph-filter-start').value || null;
    const dateEnd = document.getElementById('ph-filter-end').value || null;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-secondary);">Loading...</td></tr>';
    
    try {
        const { data, error } = await supabase.rpc('get_purchase_history', {
            p_product_id: productId ? parseInt(productId) : null,
            p_date_start: dateStart,
            p_date_end: dateEnd,
            p_limit: PH_LIMIT,
            p_offset: phOffset
        });
        
        if (error) {
            if (error.code === '42501') {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--danger);"><i class="fas fa-lock"></i> Access Denied: Owner role required.</td></tr>';
                return;
            }
            throw error;
        }
        
        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No purchase history found for this range.</td></tr>';
            document.getElementById('ph-page-info').textContent = 'Showing 0-0';
            document.getElementById('btn-ph-prev').disabled = true;
            document.getElementById('btn-ph-next').disabled = true;
            return;
        }

        const totalCount = data[0].total_count;
        
        data.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; font-weight: 600;">${p.purchase_code || `#PR-${p.purchase_id}`}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; color: var(--text-secondary);">${p.purchase_date}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; color: var(--text-primary);">${p.product_name}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right; color: var(--text-secondary);">${p.quantity}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right; color: var(--text-secondary);">Rs ${Math.round(p.buying_price).toLocaleString()}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right; font-weight: 600; color: var(--text-primary);">Rs ${Math.round(p.total_cost).toLocaleString()}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right;">
                    <span style="background: var(--bg-solid-purple); color: var(--primary-accent); padding: 0.2rem 0.6rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">${p.remaining} left</span>
                </td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; text-align: center;">
                    <button class="btn btn-primary btn-view-sales" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        <i class="fas fa-list-ul"></i> View Sales
                    </button>
                </td>
            `;
            tr.querySelector('.btn-view-sales').addEventListener('click', () => {
                window.viewBatchDetail(p.purchase_id, p.purchase_code || 'PR-' + p.purchase_id);
            });
            tbody.appendChild(tr);
        });
        
        document.getElementById('ph-page-info').textContent = `Showing ${phOffset + 1}-${Math.min(phOffset + data.length, totalCount)} of ${totalCount}`;
        document.getElementById('btn-ph-prev').disabled = phOffset === 0;
        document.getElementById('btn-ph-next').disabled = (phOffset + data.length) >= totalCount;
        
    } catch (e) {
        console.error("Error loading purchase history:", e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: red;">Failed to load data.</td></tr>';
    }
}

window.viewBatchDetail = async function(purchase_id, purchase_code) {
    const overlay = document.getElementById('modal-batch-detail-overlay');
    overlay.style.display = 'flex';
    overlay.querySelector('.modal-content').style.display = 'block';
    
    document.getElementById('bd-title').textContent = `Batch Sales Detail`;
    document.getElementById('bd-subtitle').textContent = `Purchase Ref: ${purchase_code}`;
    
    const tbody = document.getElementById('bd-table-body');
    const totalsDiv = document.getElementById('bd-totals');
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-secondary);">Loading...</td></tr>';
    totalsDiv.innerHTML = '';
    
    try {
        const { data: batchData, error: batchError } = await supabase.from('inventory_batches').select('batch_id').eq('purchase_id', purchase_id).single();
        if (batchError) throw batchError;
        
        if (!batchData) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No batch data found.</td></tr>';
            return;
        }

        const { data, error } = await supabase.rpc('get_batch_detail', { p_batch_id: batchData.batch_id });
        if (error) {
            if (error.code === '42501') {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--danger);"><i class="fas fa-lock"></i> Access Denied: Owner role required.</td></tr>';
                return;
            }
            throw error;
        }
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No sales recorded for this batch yet.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        let totQty = 0, totCost = 0, totRev = 0;
        
        data.forEach(r => {
            const cost = Number(r.cost_consumed);
            const rev = Number(r.proportional_revenue);
            const profit = rev - cost;
            const marginPct = rev > 0 ? (profit / rev) * 100 : 0;
            const marginClr = marginPct >= 20 ? 'var(--success)' : marginPct >= 10 ? 'var(--warning)' : 'var(--danger)';
            const profitClr = profit >= 0 ? 'var(--success)' : 'var(--danger)';

            totQty += Number(r.quantity_consumed);
            totCost += cost;
            totRev += rev;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="batch-sale-link" style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; font-weight: 600; color: var(--primary-accent); cursor: pointer;">${r.sale_code}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; color: var(--text-secondary);">${r.sale_date}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right; color: var(--text-secondary);">${r.quantity_consumed}</td>
                <td style="padding: 0.75rem 0.75rem; border-bottom: 1px solid #f5f5f5; text-align: right; color: var(--danger);">Rs ${Math.round(cost).toLocaleString()}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; text-align: right; font-weight: 600; color: var(--text-primary);">Rs ${Math.round(rev).toLocaleString()}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; text-align: right; font-weight: 600; color: ${profitClr};">Rs ${Math.round(profit).toLocaleString()}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #f5f5f5; text-align: right;">
                    <span style="background:${marginClr}18;color:${marginClr};padding:0.2rem 0.6rem;border-radius:8px;font-size:0.85rem;font-weight:600;">${marginPct.toFixed(1)}%</span>
                </td>
            `;
            tr.querySelector('.batch-sale-link').addEventListener('click', () => {
                document.getElementById('modal-batch-detail-overlay').style.display = 'none';
                document.getElementById('sales-nav').click();
                setTimeout(() => window.searchSale(r.sale_code), 500);
            });
            tbody.appendChild(tr);
        });
        
        const totProfit = totRev - totCost;
        const overallMarginPct = totRev > 0 ? (totProfit / totRev) * 100 : 0;
        const overallMarginClr = overallMarginPct >= 20 ? 'var(--success)' : overallMarginPct >= 10 ? 'var(--warning)' : 'var(--danger)';
        const overallProfitClr = totProfit >= 0 ? 'var(--success)' : 'var(--danger)';

        const trTotal = document.createElement('tr');
        trTotal.style.backgroundColor = '#fafafb';
        trTotal.style.fontWeight = '700';
        trTotal.style.borderTop = '2px solid #eaeaea';
        trTotal.innerHTML = `
            <td colspan="2" style="padding: 1rem; text-align: right; color: var(--text-secondary);">Totals:</td>
            <td style="padding: 1rem 0.75rem; text-align: right; color: var(--text-primary);">${totQty}</td>
            <td style="padding: 1rem 0.75rem; text-align: right; color: var(--danger);">Rs ${Math.round(totCost).toLocaleString()}</td>
            <td style="padding: 1rem 1rem; text-align: right; color: var(--primary-accent);">Rs ${Math.round(totRev).toLocaleString()}</td>
            <td style="padding: 1rem 1rem; text-align: right; color: ${overallProfitClr};">Rs ${Math.round(totProfit).toLocaleString()}</td>
            <td style="padding: 1rem 1rem; text-align: right; color: ${overallMarginClr};">${overallMarginPct.toFixed(1)}%</td>
        `;
        tbody.appendChild(trTotal);
        
        totalsDiv.innerHTML = ''; // Clear it out as we use the table row now
        
    } catch (e) {
        console.error("Error loading batch detail:", e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: red;">Failed to load data.</td></tr>';
    }
}

window.searchSale = function(code) {
    const searchInput = document.getElementById('sales-filter-search');
    if (searchInput) {
        searchInput.value = code;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

