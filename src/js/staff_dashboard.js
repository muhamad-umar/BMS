import { supabase } from './auth.js';

// Re-export needed modules to window so inline onclick handlers work
import * as mod_core from './modules/core.js';
Object.assign(window, mod_core);
import * as mod_api from './modules/api.js';
Object.assign(window, mod_api);
import * as mod_forms from './modules/forms.js';
Object.assign(window, mod_forms);
import * as mod_customers from './modules/customers.js';
Object.assign(window, mod_customers);
import * as mod_sales from './modules/sales.js';
Object.assign(window, mod_sales);
// forms.js imports init.js, which automatically adds a DOMContentLoaded listener
// to initialize modals, nav links, cache, forms, etc.

window.loadRecentSalesDashboard = loadStaffRecentSales;
window.showView = function(viewId) { /* no-op for staff */ };

document.addEventListener("DOMContentLoaded", async () => {
    loadStaffRecentSales();
});

async function loadStaffRecentSales() {
    const tbody = document.getElementById("staff-today-sales-body");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">Loading...</td></tr>';
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const { data, error } = await supabase
            .from('sales')
            .select(`
                id,
                created_at,
                grand_total,
                sale_code,
                discount,
                payment_method (
                    method_name
                ),
                customer:customer_id (
                    name
                )
            `)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: false });
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No sales today</td></tr>';
            return;
        }

        let html = '';
        data.forEach(sale => {
            const time = new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const custName = sale.customer ? sale.customer.name : 'Walk-in Customer';
            const method = sale.payment_method ? sale.payment_method.method_name : '-';
            const safeCustName = custName.replace(/'/g, "\\'");
            html += `
                <tr style="border-bottom: 1px solid #eaeaea; cursor: pointer;" onclick="openSaleDetails('${sale.id}', '${sale.sale_code || ''}', '${safeCustName}', '${time}', ${sale.grand_total}, ${sale.discount || 0}, 0)">
                    <td style="padding: 1rem;"><span style="background: var(--bg-light-purple); color: var(--primary-accent); padding: 0.3rem 0.6rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">${sale.sale_code || '-'}</span></td>
                    <td style="padding: 1rem;">${time}</td>
                    <td style="padding: 1rem; font-weight: 500;">${custName}</td>
                    <td style="padding: 1rem; font-weight: 700;">Rs ${sale.grand_total.toLocaleString()}</td>
                    <td style="padding: 1rem;">${method}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error("Error loading staff sales:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color:red;">Error loading sales</td></tr>';
    }
}
