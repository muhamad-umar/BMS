import { supabase } from '../auth.js';
import { cache } from './init.js';

// --- MOVEMENT HISTORY LOGIC ---
let movementHistoryCache = [];
let movementPageOffset = 0;
const movementPageSize = 10;
let movementSearchTimer = null;

export const loadMovementHistory = async function() {
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

export const renderMovementHistory = function() {
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
        // approximate check, we rely on render logic to cap it visually, 
        // but we can strictly limit:
        movementPageOffset += movementPageSize;
        renderMovementHistory();
    });
