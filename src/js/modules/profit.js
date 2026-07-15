import { supabase } from '../auth.js';

// --- STATE ---
let profitData = null;          // { today, week, month } from get_profit_summary
let customData = null;          // result of get_profit_custom_range
let trendData = null;           // array of { day, total_sales, total_purchases, total_expenses }
let fifoData = null;            // result of get_product_fifo_summary
let profitRange = 'month';      // 'today' | 'week' | 'month' | 'custom'
let profitChartInstance = null;
let profitTrendChartInstance = null;
let profitUnlocked = false;
let profitPeriodCache = { today: null, week: null, month: null };

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function todayISO() { 
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getPresetDates(range) {
    const today = new Date();
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (range === 'today') return { start: fmt(today), end: fmt(today) };
    if (range === 'week') {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        return { start: fmt(start), end: fmt(today) };
    }
    // month
    return { start: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-01`, end: fmt(today) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CHECK
// ─────────────────────────────────────────────────────────────────────────────
export async function checkProfitRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
    return data?.role === 'owner';
}

// ─────────────────────────────────────────────────────────────────────────────
// RE-AUTH GATE
// ─────────────────────────────────────────────────────────────────────────────
export async function openProfitReauth() {
    const err = document.getElementById('profit-reauth-error');
    if (err) err.textContent = '';
    const pass = document.getElementById('profit-reauth-password');
    if (pass) pass.value = '';
}

export async function handleProfitReauth(e) {
    e.preventDefault();
    const password = document.getElementById('profit-reauth-password').value;
    const errorEl  = document.getElementById('profit-reauth-error');
    const btn      = document.getElementById('btn-profit-reauth-submit');

    btn.disabled = true;
    btn.textContent = 'Verifying...';
    errorEl.textContent = '';

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');

        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
        if (error) throw new Error('Incorrect password. Please try again.');

        const isOwner = await checkProfitRole();
        if (!isOwner) throw new Error('Access denied: Only owners can view profit.');

        profitUnlocked = true;
        document.getElementById('profit-locked-overlay').style.display = 'none';
        document.getElementById('profit-content').style.display = 'flex';

        // Initialise date inputs with current month range
        const { start, end } = getPresetDates('month');
        const startEl = document.getElementById('profit-date-start');
        const endEl   = document.getElementById('profit-date-end');
        if (startEl) startEl.value = start;
        if (endEl)   endEl.value   = end;

        await loadProfitPage();
    } catch (err) {
        errorEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'View Profit';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD PROFIT DATA
// ─────────────────────────────────────────────────────────────────────────────
export async function loadProfitPage() {
    try {
        // Always fetch preset summary (today/week/month in one call)
        const { data: summary, error: e1 } = await supabase.rpc('get_profit_summary');
        if (e1) throw e1;
        profitData = summary;

        // If in custom mode, fetch custom range too; else use preset
        if (profitRange === 'custom') {
            await loadCustomRange();
        } else {
            const { start, end } = getPresetDates(profitRange);
            updateRangeLabel(`${formatDate(start)} – ${formatDate(end)}`);
            await loadProfitPeriod(profitRange, start, end, true);
        }
    } catch (err) {
        console.error('Profit load error:', err);
        alert('Error loading profit data: ' + (err.message || err));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM RANGE LOAD
// ─────────────────────────────────────────────────────────────────────────────
async function loadCustomRange() {
    const start = document.getElementById('profit-date-start')?.value;
    const end   = document.getElementById('profit-date-end')?.value;
    if (!start || !end) { alert('Please select both a start and end date.'); return; }
    if (start > end)    { alert('Start date must be before end date.'); return; }

    setLoadingState(true);
    try {
        const { data, error: e1 } = await supabase.rpc('get_profit_custom_range', { p_start: start, p_end: end });
        if (e1) throw e1;
        customData = data;

        await loadTrendForRange(start, end);
        updateProfitKPICustom(customData);
        renderProfitBreakdownCustom(customData);
        await loadProfitCategoryChart(start, end);
        await checkRecurringCaveat('custom', start, end);
        await loadFifoProductTable(start, end);

        // Update the range label
        const label = document.getElementById('profit-range-label');
        if (label) label.textContent = `${formatDate(start)} – ${formatDate(end)}`;
    } catch (err) {
        console.error('Custom range error:', err);
        alert('Error loading custom range: ' + (err.message || err));
    } finally {
        setLoadingState(false);
    }
}

async function loadProfitPeriod(range, start, end, forceFetch = false) {
    if (forceFetch && range !== 'custom') {
        profitPeriodCache[range] = null;
    }

    let c = (range !== 'custom' && profitPeriodCache[range]) ? profitPeriodCache[range] : {};

    const tData = await loadTrendForRange(start, end, c.trendData);
    updateProfitKPI(range);
    renderProfitBreakdown(range);
    const catData = await loadProfitCategoryChart(start, end, c.categoryData);
    const cavData = await checkRecurringCaveat(range, start, end, c.caveatData);
    const fData = await loadFifoProductTable(start, end, c.fifoData);

    if (range !== 'custom' && !profitPeriodCache[range]) {
        profitPeriodCache[range] = {
            trendData: tData,
            categoryData: catData,
            caveatData: cavData,
            fifoData: fData
        };
    }
}

async function loadTrendForRange(start, end, cachedData = null) {
    if (cachedData) {
        trendData = cachedData;
    } else {
        const { data, error } = await supabase.rpc('get_profit_trend_custom', { p_start: start, p_end: end });
        if (!error) trendData = data || [];
    }
    renderProfitTrendChart(start, end);
    return trendData;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIFO PRODUCT TABLE
// ─────────────────────────────────────────────────────────────────────────────
async function loadFifoProductTable(start, end, cachedData = null) {
    const tbody   = document.getElementById('fifo-product-body');
    const spinner = document.getElementById('fifo-table-loading');
    if (!tbody) return null;

    if (spinner && !cachedData) spinner.style.display = 'inline';

    let data, error;
    if (cachedData) {
        data = cachedData;
    } else {
        const res = await supabase.rpc('get_product_fifo_summary', { p_start: start, p_end: end });
        data = res.data;
        error = res.error;
    }

    if (spinner && !cachedData) spinner.style.display = 'none';

    if (error) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--danger);">Error loading FIFO data: ${error.message}</td></tr>`;
        return;
    }

    fifoData = data || [];

    if (!fifoData.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-secondary);">No active products found.</td></tr>';
        return;
    }

    tbody.innerHTML = fifoData.map(r => {
        const profit    = Number(r.product_profit);
        const margin    = Number(r.margin_pct);
        const profitClr = profit >= 0 ? 'var(--success)' : 'var(--danger)';
        const marginClr = margin >= 20 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)';

        const oldestBatch = r.oldest_batch_date
            ? `${new Date(r.oldest_batch_date + 'T00:00:00').toLocaleDateString('en-US', { day:'numeric', month:'short', year:'2-digit' })} @ Rs ${Number(r.oldest_batch_cost).toLocaleString()}/unit`
            : '<span style="color:var(--text-secondary);font-size:0.8rem;">No batches</span>';

        return `
        <tr style="border-bottom:1px solid #f4f4f4;" onmouseenter="this.style.background='#fafafb'" onmouseleave="this.style.background=''">
            <td style="padding:0.8rem 1rem;font-weight:600;color:var(--text-primary);">${r.product_name}</td>
            <td style="padding:0.8rem 0.75rem;text-align:right;color:var(--text-secondary);">${Number(r.current_stock).toLocaleString()}</td>
            <td style="padding:0.8rem 0.75rem;text-align:center;">
                <span style="background:${Number(r.batches_remaining) > 0 ? '#e6f8ee' : '#fce8e8'};color:${Number(r.batches_remaining) > 0 ? 'var(--success)' : 'var(--danger)'};padding:0.2rem 0.65rem;border-radius:8px;font-size:0.82rem;font-weight:600;">${r.batches_remaining}</span>
            </td>
            <td style="padding:0.8rem 0.75rem;font-size:0.82rem;color:var(--text-secondary);">${oldestBatch}</td>
            <td style="padding:0.8rem 0.75rem;text-align:right;">${Number(r.quantity_sold).toLocaleString()}</td>
            <td style="padding:0.8rem 0.75rem;text-align:right;font-weight:600;">Rs ${Math.round(Number(r.revenue)).toLocaleString()}</td>
            <td style="padding:0.8rem 0.75rem;text-align:right;color:var(--danger);">Rs ${Math.round(Number(r.total_cogs)).toLocaleString()}</td>
            <td style="padding:0.8rem 0.75rem;text-align:right;font-weight:700;color:${profitClr};">Rs ${Math.round(profit).toLocaleString()}</td>
            <td style="padding:0.8rem 1rem;text-align:right;">
                <span style="background:${marginClr}18;color:${marginClr};padding:0.2rem 0.6rem;border-radius:8px;font-size:0.82rem;font-weight:600;">${margin.toFixed(1)}%</span>
            </td>
        </tr>`;
    }).join('');
    
    return fifoData;
}

function setLoadingState(loading) {
    const content = document.getElementById('profit-content');
    if (!content) return;
    content.style.opacity = loading ? '0.6' : '1';
    content.style.pointerEvents = loading ? 'none' : '';
}

function formatDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI UPDATE — preset ranges
// ─────────────────────────────────────────────────────────────────────────────
export function updateProfitKPI(range) {
    if (!profitData || !profitData[range]) return;
    _renderKPI(profitData[range]);
    renderProfitBreakdown(range);
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI UPDATE — custom range
// ─────────────────────────────────────────────────────────────────────────────
function updateProfitKPICustom(d) {
    if (!d) return;
    _renderKPI(d);
}

function _renderKPI(d) {
    const sales     = Number(d.total_sales)     || 0;
    const purchases = Number(d.total_purchases) || 0;
    const expenses  = Number(d.total_expenses)  || 0;
    const netProfit = sales - purchases - expenses;
    const totalCost = purchases + expenses;
    const margin    = sales > 0 ? (netProfit / sales * 100) : 0;

    document.getElementById('profit-kpi-net').textContent     = `Rs ${Math.round(netProfit).toLocaleString()}`;
    document.getElementById('profit-kpi-margin').textContent  = `${margin.toFixed(1)}%`;
    document.getElementById('profit-kpi-revenue').textContent = `Rs ${Math.round(sales).toLocaleString()}`;
    document.getElementById('profit-kpi-cost').textContent    = `Rs ${Math.round(totalCost).toLocaleString()}`;

    document.getElementById('profit-kpi-net').style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ─────────────────────────────────────────────────────────────────────────────
// BREAKDOWN TABLE — preset
// ─────────────────────────────────────────────────────────────────────────────
export function renderProfitBreakdown(range) {
    if (!profitData || !profitData[range]) return;
    _renderBreakdown(profitData[range]);
}

// ─────────────────────────────────────────────────────────────────────────────
// BREAKDOWN TABLE — custom
// ─────────────────────────────────────────────────────────────────────────────
function renderProfitBreakdownCustom(d) {
    if (!d) return;
    _renderBreakdown(d);
}

function _renderBreakdown(d) {
    const sales     = Number(d.total_sales)     || 0;
    const purchases = Number(d.total_purchases) || 0;
    const expenses  = Number(d.total_expenses)  || 0;
    const net       = sales - purchases - expenses;

    const rows = [
        { label: 'Total Sales (Revenue)', amount: sales,     color: 'var(--success)' },
        { label: '− Purchase Cost',        amount: purchases, color: 'var(--danger)'  },
        { label: '− Expenses',             amount: expenses,  color: 'var(--warning)' },
        { label: '= Net Profit',           amount: net,       color: net >= 0 ? 'var(--success)' : 'var(--danger)', bold: true }
    ];

    const tbody = document.getElementById('profit-breakdown-body');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
        <tr style="${r.bold ? 'border-top: 2px solid #eaeaea; background: #fafafb;' : ''}">
            <td style="padding: 1rem; font-weight: ${r.bold ? '700' : '500'}; color: var(--text-primary);">${r.label}</td>
            <td style="padding: 1rem; font-weight: ${r.bold ? '700' : '600'}; color: ${r.color}; text-align: right;">Rs ${Math.abs(Math.round(r.amount)).toLocaleString()}</td>
        </tr>
    `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND CHART
// ─────────────────────────────────────────────────────────────────────────────
export function renderProfitTrendChart(start, end) {
    const canvas = document.getElementById('profitTrendChart');
    if (!canvas || !trendData) return;

    const labels     = trendData.map(d => new Date(d.day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const netProfits = trendData.map(d => Number(d.total_sales) - Number(d.total_purchases) - Number(d.total_expenses));

    // Dynamic title
    const title = (start && end) ? `Daily Net Profit — ${formatDate(start)} to ${formatDate(end)}` : 'Daily Net Profit — Last 30 Days';
    const titleEl = document.getElementById('profit-trend-title');
    if (titleEl) titleEl.textContent = title;

    if (profitTrendChartInstance) profitTrendChartInstance.destroy();

    profitTrendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Net Profit',
                data: netProfits,
                backgroundColor: netProfits.map(v => v >= 0 ? 'rgba(56, 201, 118, 0.75)' : 'rgba(255, 77, 79, 0.65)'),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `Rs ${Math.round(ctx.raw).toLocaleString()}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
                y: { grid: { color: '#f4f4f4' }, ticks: { callback: v => `Rs ${Math.round(v).toLocaleString()}` } }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY CHART
// ─────────────────────────────────────────────────────────────────────────────
export async function loadProfitCategoryChart(start, end, cachedData = null) {
    const canvas = document.getElementById('profitCategoryChart');
    if (!canvas) return null;

    let data, error;
    if (cachedData) {
        data = cachedData;
    } else {
        const res = await supabase
            .from('expenses')
            .select('amount, expense_categories(category_name)')
            .gte('expense_date', start)
            .lte('expense_date', end);
        data = res.data;
        error = res.error;
    }

    const wrapper = canvas.parentElement;
    if (error || !data?.length) {
        if (profitChartInstance) { profitChartInstance.destroy(); profitChartInstance = null; }
        wrapper.innerHTML = '<canvas id="profitCategoryChart"></canvas><p style="color:var(--text-secondary);text-align:center;padding:1rem;font-size:0.9rem;">No expenses in this period.</p>';
        return data;
    }

    // Re-attach canvas if it was replaced
    let cv = document.getElementById('profitCategoryChart');
    if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'profitCategoryChart';
        wrapper.innerHTML = '';
        wrapper.appendChild(cv);
    }

    const cats = {};
    data.forEach(e => {
        const name = e.expense_categories?.category_name || 'Uncategorized';
        cats[name] = (cats[name] || 0) + Number(e.amount);
    });

    const colors = ['#5d3bb2','#38c976','#ffaf55','#ff4d4f','#1976d2','#9c27b0','#e65100'];

    if (profitChartInstance) profitChartInstance.destroy();
    profitChartInstance = new Chart(cv, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{ data: Object.values(cats), backgroundColor: colors, borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => `Rs ${Math.round(ctx.raw).toLocaleString()}` } }
            }
        }
    });
    
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING CAVEAT
// ─────────────────────────────────────────────────────────────────────────────
export async function checkRecurringCaveat(range, start, end, cachedData = null) {
    let data, error;
    if (cachedData) {
        data = cachedData;
    } else {
        if (range === 'custom') {
            ({ data, error } = await supabase.rpc('get_recurring_expense_caveat_range', { p_start: start, p_end: end }));
        } else {
            ({ data, error } = await supabase.rpc('get_recurring_expense_caveat', { p_range: range }));
        }
    }

    const el = document.getElementById('profit-recurring-caveat');
    if (!el) return null;
    if (error || !data?.length) { el.style.display = 'none'; return data; }

    el.style.display = 'flex';
    el.innerHTML = data.map(r =>
        `<div style="display:flex;align-items:center;gap:0.75rem;">
            <i class="fas fa-info-circle" style="color:var(--warning);flex-shrink:0;"></i>
            Includes recurring expense: <strong>${r.category}</strong> — Rs ${Math.round(r.amount).toLocaleString()} — this may affect this period's profit more than usual.
         </div>`
    ).join('');
    
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
export function initProfitPage() {
    // Preset segment buttons (today / week / month)
    document.querySelectorAll('#profit-kpi-toggle .segment-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!profitUnlocked) return;

            document.querySelectorAll('#profit-kpi-toggle .segment-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            profitRange = e.target.dataset.range;

            // Update range label
            const { start, end } = getPresetDates(profitRange);
            const labelMap = { today: 'Today', week: 'This Week', month: 'This Month' };
            updateRangeLabel(`${labelMap[profitRange]} (${formatDate(start)} – ${formatDate(end)})`);

            // Hide custom range panel when a preset is selected
            setCustomRangeVisible(false);
            document.getElementById('btn-profit-custom-range')?.classList.remove('active');

            // Update the date inputs to reflect preset range (informational)
            const startEl = document.getElementById('profit-date-start');
            const endEl   = document.getElementById('profit-date-end');
            if (startEl) startEl.value = start;
            if (endEl)   endEl.value   = end;

            setLoadingState(true);
            try {
                await loadProfitPeriod(profitRange, start, end, false);
            } finally {
                setLoadingState(false);
            }
        });
    });

    // Refresh button listener
    const refreshBtns = document.querySelectorAll('.btn-profit-refresh-action');
    refreshBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!profitUnlocked) return;
            const { start, end } = profitRange === 'custom' 
                ? { start: document.getElementById('profit-date-start')?.value, end: document.getElementById('profit-date-end')?.value }
                : getPresetDates(profitRange);
            
            if (profitRange === 'custom' && (!start || !end)) return;

            setLoadingState(true);
            try {
                // Force fetch true
                await loadProfitPeriod(profitRange, start, end, true);
            } finally {
                setLoadingState(false);
            }
        });
    });

    // Custom range toggle button
    const customBtn = document.getElementById('btn-profit-custom-range');
    if (customBtn) {
        customBtn.addEventListener('click', () => {
            if (!profitUnlocked) return;
            const isVisible = document.getElementById('profit-custom-range-panel')?.style.display !== 'none';
            setCustomRangeVisible(!isVisible);
            if (!isVisible) {
                // Remove active from all preset buttons when entering custom mode
                document.querySelectorAll('#profit-kpi-toggle .segment-btn').forEach(b => b.classList.remove('active'));
                customBtn.classList.add('active');
            } else {
                customBtn.classList.remove('active');
            }
        });
    }

    // Apply custom range button
    const applyBtn = document.getElementById('btn-profit-apply-range');
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            if (!profitUnlocked) return;
            profitRange = 'custom';
            await loadCustomRange();
        });
    }

    // Re-auth form
    const form = document.getElementById('form-profit-reauth');
    if (form) form.addEventListener('submit', handleProfitReauth);

    // Re-auth modal removed so no backdrop click needed
}

function setCustomRangeVisible(visible) {
    const panel = document.getElementById('profit-custom-range-panel');
    if (panel) panel.style.display = visible ? 'flex' : 'none';
}

function updateRangeLabel(text) {
    const el = document.getElementById('profit-range-label');
    if (el) el.textContent = text;
}
