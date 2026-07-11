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
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const [salesRes, paymentsRes] = await Promise.all([
            supabase
                .from('sales')
                .select(`
                    sale_id,
                    created_at,
                    grand_total,
                    sale_code,
                    discount,
                    customer:customers(name)
                `)
                .gte('created_at', startOfDay.toISOString())
                .order('created_at', { ascending: false }),
                
            supabase
                .from('customer_payments')
                .select(`
                    payment_id,
                    payment_date,
                    amount,
                    payment_code,
                    customer:customers(name)
                `)
                .gte('payment_date', startOfDay.toISOString().split('T')[0])
                .order('payment_date', { ascending: false })
                .order('payment_id', { ascending: false })
        ]);

        if (salesRes.error) throw salesRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        
        // Render Sales
        const salesData = salesRes.data;
        if (!salesData || salesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No sales recorded today</td></tr>';
        } else {
            let html = '';
            salesData.forEach(sale => {
                const time = new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const custName = sale.customer ? sale.customer.name : 'Walk-in Customer';
                const safeCustName = custName.replace(/'/g, "\\'");
                html += `
                    <tr style="border-bottom: 1px solid #eaeaea; cursor: pointer;" onclick="openSaleDetails('${sale.sale_id}', '${sale.sale_code || ''}', '${safeCustName}', '${time}', ${sale.grand_total}, ${sale.discount || 0}, 0)">
                        <td style="padding: 1rem;"><span style="background: var(--bg-light-purple); color: var(--primary-accent); padding: 0.3rem 0.6rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">${sale.sale_code || '-'}</span></td>
                        <td style="padding: 1rem;">${time}</td>
                        <td style="padding: 1rem; font-weight: 500;">${custName}</td>
                        <td style="padding: 1rem; font-weight: 700;">Rs ${sale.grand_total.toLocaleString()}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }

        // Render Payments
        const pBody = document.getElementById("staff-today-payments-body");
        if (pBody) {
            const paymentsData = paymentsRes.data;
            if (!paymentsData || paymentsData.length === 0) {
                pBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No payments recorded today</td></tr>';
            } else {
                let phtml = '';
                paymentsData.forEach(payment => {
                    const time = new Date(payment.payment_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const custName = payment.customer ? payment.customer.name : 'Unknown Customer';
                    phtml += `
                        <tr style="border-bottom: 1px solid #eaeaea;">
                            <td style="padding: 1rem;"><span style="background: #e6f8ee; color: var(--success); padding: 0.3rem 0.6rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">${payment.payment_code || '-'}</span></td>
                            <td style="padding: 1rem;">${time}</td>
                            <td style="padding: 1rem; font-weight: 500;">${custName}</td>
                            <td style="padding: 1rem; font-weight: 700; color: var(--success);">Rs ${Number(payment.amount).toLocaleString()}</td>
                        </tr>
                    `;
                });
                pBody.innerHTML = phtml;
            }
        }
    } catch (err) {
        console.error("Error loading staff sales:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color:red;">Error loading sales</td></tr>';
    }
}
