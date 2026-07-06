/**
 * dashboard.js
 * Handles UI interactions for the dashboard.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Add simple hover interactions or dynamic data loading here
    initializeNavLinks();
});

function initializeNavLinks() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked
            this.classList.add('active');
        });
    });
}

// In the future, you can integrate Supabase data fetching here:
/*
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL_FROM_ENV'
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY_FROM_ENV'
const supabase = createClient(supabaseUrl, supabaseKey)

async function fetchRecentSales() {
    let { data: sales, error } = await supabase
        .from('sales')
        .select('*')
        .limit(5)
        .order('sale_date', { ascending: false })
    
    if (error) console.error("Error fetching sales:", error);
    else renderSales(sales);
}
*/
