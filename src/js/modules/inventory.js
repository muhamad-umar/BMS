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
            <td style="color: var(--text-secondary);">${m.reference_type} #${m.reference_id}</td>
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
