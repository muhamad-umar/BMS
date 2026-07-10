import { supabase } from '../auth.js';

// --- STATE ---
let profitData = null;          // { today, week, month } from get_profit_summary
let customData = null;          // result of get_profit_custom_range
let trendData = null;           // array of { day, total_sales, total_purchases, total_expenses }
let profitRange = 'month';      // 'today' | 'week' | 'month' | 'custom'
let profitChartInstance = null;
let profitTrendChartInstance = null;
let profitUnlocked = false;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function getPresetDates(range) {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
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
    const modal = document.getElementById('modal-profit-reauth');
    if (!modal) return;
    document.getElementById('profit-reauth-error').textContent = '';
    document.getElementById('profit-reauth-password').value = '';
    modal.style.display = 'flex';
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
        if (!isOwner) throw new Error('Access denied: your account does not have Profit access.');

        profitUnlocked = true;
        document.getElementById('modal-profit-reauth').style.display = 'none';
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
        btn.textContent = 'Confirm';
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
            await loadTrendForRange(start, end);
            updateProfitKPI(profitRange);
            renderProfitBreakdown(profitRange);
            await loadProfitCategoryChart(start, end);
            await checkRecurringCaveat(profitRange, start, end);
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

async function loadTrendForRange(start, end) {
    const { data, error } = await supabase.rpc('get_profit_trend_custom', { p_start: start, p_end: end });
    if (!error) trendData = data || [];
    renderProfitTrendChart(start, end);
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
export async function loadProfitCategoryChart(start, end) {
    const canvas = document.getElementById('profitCategoryChart');
    if (!canvas) return;

    const { data, error } = await supabase
        .from('expenses')
        .select('amount, expense_categories(name)')
        .gte('expense_date', start)
        .lte('expense_date', end);

    const wrapper = canvas.parentElement;
    if (error || !data?.length) {
        if (profitChartInstance) { profitChartInstance.destroy(); profitChartInstance = null; }
        wrapper.innerHTML = '<canvas id="profitCategoryChart"></canvas><p style="color:var(--text-secondary);text-align:center;padding:1rem;font-size:0.9rem;">No expenses in this period.</p>';
        return;
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
        const name = e.expense_categories?.name || 'Uncategorized';
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
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING CAVEAT
// ─────────────────────────────────────────────────────────────────────────────
export async function checkRecurringCaveat(range, start, end) {
    let data, error;
    if (range === 'custom') {
        ({ data, error } = await supabase.rpc('get_recurring_expense_caveat_range', { p_start: start, p_end: end }));
    } else {
        ({ data, error } = await supabase.rpc('get_recurring_expense_caveat', { p_range: range }));
    }

    const el = document.getElementById('profit-recurring-caveat');
    if (!el) return;
    if (error || !data?.length) { el.style.display = 'none'; return; }

    el.style.display = 'flex';
    el.innerHTML = data.map(r =>
        `<div style="display:flex;align-items:center;gap:0.75rem;">
            <i class="fas fa-info-circle" style="color:var(--warning);flex-shrink:0;"></i>
            Includes recurring expense: <strong>${r.category}</strong> — Rs ${Math.round(r.amount).toLocaleString()} — this may affect this period's profit more than usual.
         </div>`
    ).join('');
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
                await loadTrendForRange(start, end);
                updateProfitKPI(profitRange);
                await loadProfitCategoryChart(start, end);
                await checkRecurringCaveat(profitRange, start, end);
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

    // Close re-auth modal on backdrop click
    const reauthModal = document.getElementById('modal-profit-reauth');
    if (reauthModal) {
        reauthModal.addEventListener('click', (e) => {
            if (e.target === reauthModal) reauthModal.style.display = 'none';
        });
    }
}

function setCustomRangeVisible(visible) {
    const panel = document.getElementById('profit-custom-range-panel');
    if (panel) panel.style.display = visible ? 'flex' : 'none';
}

function updateRangeLabel(text) {
    const el = document.getElementById('profit-range-label');
    if (el) el.textContent = text;
}
