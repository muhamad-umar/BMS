import { supabase } from '../auth.js';
import { cache } from './init.js';

// --- MOVEMENT HISTORY LOGIC ---
// FIX #3: Server-side pagination (50 per page for audit log view)
// RLS on 'stock_movements' applies automatically to every query.
let movementHistoryCache = [];
let movementPageOffset = 0;
const movementPageSize = 50; // FIX #3: 50 per page for scrollable audit log
let movementTotalRecords = 0;
let movementSearchTimer = null;

export const loadMovementHistory = async function() {
    const searchTerm = (document.getElementById('search-movement')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('filter-movement-type')?.value || 'all';

    try {
        let query = supabase.from('stock_movements')
            .select(`
                movement_id, movement_date, movement_type, quantity,
                reference_id, reference_type, reference_code, notes, product_id,
                products(product_name)
            `, { count: 'exact' })
            .order('movement_date', { ascending: false });

        // Server-side type filter
        if (typeFilter !== 'all') {
            query = query.eq('movement_type', typeFilter);
        }

        // Server-side search across full table (FIX #3 requirement)
        // Searches product_name via join and reference_code directly
        if (searchTerm) {
            query = query.or(`reference_code.ilike.%${searchTerm}%,reference_type.ilike.%${searchTerm}%`);
        }

        // Server-side pagination
        query = query.range(movementPageOffset, movementPageOffset + movementPageSize - 1);

        const { data, count, error } = await query;
        if (error) {
            console.error('Error loading movement history:', error);
            return;
        }

        // Enrich product names from cache (avoids N+1; join already included above)
        movementHistoryCache = (data || []).map(m => {
            m.product_name = m.products?.product_name
                || (cache.products ? (cache.products.find(p => p.product_id === m.product_id)?.product_name) : null)
                || 'Unknown Product';
            return m;
        });

        movementTotalRecords = count || 0;
        renderMovementHistory();
    } catch (err) {
        console.error('Error loading movement history:', err);
    }
};

export const renderMovementHistory = function() {
    const tbody = document.getElementById('movement-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (movementHistoryCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No movements found matching the filters.</td></tr>';
    }

    movementHistoryCache.forEach(m => {
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

    const start = movementTotalRecords === 0 ? 0 : movementPageOffset + 1;
    const end = Math.min(movementPageOffset + movementPageSize, movementTotalRecords);
    document.getElementById('movement-page-info').textContent = `Showing ${start}-${end} of ${movementTotalRecords}`;
    
    document.getElementById('btn-movement-prev').disabled = movementPageOffset === 0;
    document.getElementById('btn-movement-prev').style.opacity = movementPageOffset === 0 ? '0.5' : '1';
    
    const atEnd = end >= movementTotalRecords;
    document.getElementById('btn-movement-next').disabled = atEnd;
    document.getElementById('btn-movement-next').style.opacity = atEnd ? '0.5' : '1';
};

// Event Listeners for Movement History
document.getElementById('search-movement')?.addEventListener('input', () => {
    clearTimeout(movementSearchTimer);
    movementSearchTimer = setTimeout(() => {
        movementPageOffset = 0;
        loadMovementHistory(); // server-side search
    }, 300);
});

document.getElementById('filter-movement-type')?.addEventListener('change', () => {
    movementPageOffset = 0;
    loadMovementHistory(); // server-side filter
});

document.getElementById('btn-movement-prev')?.addEventListener('click', () => {
    if (movementPageOffset >= movementPageSize) {
        movementPageOffset -= movementPageSize;
        loadMovementHistory();
    }
});

document.getElementById('btn-movement-next')?.addEventListener('click', () => {
    if (movementPageOffset + movementPageSize < movementTotalRecords) {
        movementPageOffset += movementPageSize;
        loadMovementHistory();
    }
});
