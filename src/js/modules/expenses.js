import { supabase } from '../auth.js';

// ─── STATE ────────────────────────────────────────────────────────────────────
let allExpenses   = [];      // full dataset from DB (after filters applied)
let categories    = [];      // expense_categories list
let kpiRange      = 'today'; // today | week | month
let expPage       = 1;
const PAGE_SIZE   = 8;
let expChartInst  = null;
let kpiPeriodCache = { today: null, week: null, month: null };

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — called by showView('expenses')
// ─────────────────────────────────────────────────────────────────────────────
export async function loadExpensesView() {
    kpiPeriodCache = { today: null, week: null, month: null };
    await loadCategories();
    await loadExpenses();
    updateKPI();
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────
async function loadCategories() {
    const { data, error } = await supabase
        .from('expense_categories')
        .select('category_id, category_name')
        .order('category_name');
    if (error) { console.error('Categories load error:', error); return; }
    categories = data || [];

    // Populate filter dropdown
    const select = document.getElementById('exp-filter-category');
    if (select) {
        select.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.category_id;
            opt.textContent = c.category_name;
            select.appendChild(opt);
        });
    }

    // Populate Add Expense form dropdown
    const formSelect = document.getElementById('exp-form-category');
    if (formSelect) {
        formSelect.innerHTML = '<option value="">— Select Category —</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.category_id;
            opt.textContent = c.category_name;
            formSelect.appendChild(opt);
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD EXPENSES — fetches with active filters applied
// ─────────────────────────────────────────────────────────────────────────────
async function loadExpenses() {
    const catId     = document.getElementById('exp-filter-category')?.value;
    const dateStart = document.getElementById('exp-filter-date-start')?.value;
    const dateEnd   = document.getElementById('exp-filter-date-end')?.value;
    const search    = document.getElementById('exp-filter-search')?.value.trim().toLowerCase();
    const sort      = document.getElementById('exp-sort')?.value || 'newest';

    let query = supabase
        .from('expenses')
        .select('expense_id, amount, expense_date, description, repeats, category_id, expense_categories(category_name)');

    if (catId)     query = query.eq('category_id', catId);
    if (dateStart) query = query.gte('expense_date', dateStart);
    if (dateEnd)   query = query.lte('expense_date', dateEnd);

    if (sort === 'amount-desc') {
        query = query.order('amount', { ascending: false });
    } else {
        query = query.order('expense_date', { ascending: false }).order('expense_id', { ascending: false });
    }

    const { data, error } = await query;
    if (error) { console.error('Expenses load error:', error); return; }

    // Client-side search on description
    allExpenses = (data || []).filter(e =>
        !search || (e.description || '').toLowerCase().includes(search)
    );

    expPage = 1;
    renderExpensesTable();
    renderExpensesChart();
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function updateKPI(forceFetch = false) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Week start (Sunday)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekStr = weekStart.toISOString().slice(0, 10);

    // Month start
    const monthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;

    const startMap = { today: todayStr, week: weekStr, month: monthStr };
    const start = startMap[kpiRange];

    loadKPIFromDB(start, todayStr, kpiRange, forceFetch);
}

async function loadKPIFromDB(start, end, range, forceFetch = false) {
    if (forceFetch) {
        kpiPeriodCache[range] = null;
    }

    let data;
    if (kpiPeriodCache[range]) {
        data = kpiPeriodCache[range];
    } else {
        const { data: dbData, error } = await supabase
            .from('expenses')
            .select('amount, expense_date, expense_categories(category_name)')
            .gte('expense_date', start)
            .lte('expense_date', end);

        if (error || !dbData) return;
        data = dbData;
        kpiPeriodCache[range] = data;
    }

    const total = data.reduce((s, e) => s + Number(e.amount), 0);
    const count = data.length;

    // Days between start and end
    const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
    const avg  = total / days;

    // Top category
    const catTotals = {};
    data.forEach(e => {
        const name = e.expense_categories?.category_name || 'Uncategorized';
        catTotals[name] = (catTotals[name] || 0) + Number(e.amount);
    });
    const topCat = Object.entries(catTotals).sort((a,b) => b[1]-a[1])[0];

    document.getElementById('exp-stat-total').textContent   = `Rs ${Math.round(total).toLocaleString()}`;
    document.getElementById('exp-stat-count').textContent   = count;
    document.getElementById('exp-stat-avg').textContent     = `Rs ${Math.round(avg).toLocaleString()}`;
    document.getElementById('exp-stat-top-cat').textContent = topCat ? topCat[0] : '—';
    document.getElementById('exp-stat-top-amount').textContent = topCat ? `Rs ${Math.round(topCat[1]).toLocaleString()}` : 'Rs 0';
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE RENDER + PAGINATION
// ─────────────────────────────────────────────────────────────────────────────
function renderExpensesTable() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    const totalPages = Math.ceil(allExpenses.length / PAGE_SIZE) || 1;
    expPage = Math.min(expPage, totalPages);
    const start = (expPage - 1) * PAGE_SIZE;
    const slice = allExpenses.slice(start, start + PAGE_SIZE);

    const pageInfo = document.getElementById('exp-page-info');
    if (pageInfo) {
        pageInfo.textContent = allExpenses.length === 0
            ? 'No expenses found'
            : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, allExpenses.length)} of ${allExpenses.length}`;
    }

    const prevBtn = document.getElementById('btn-exp-prev');
    const nextBtn = document.getElementById('btn-exp-next');
    if (prevBtn) prevBtn.disabled = expPage <= 1;
    if (nextBtn) nextBtn.disabled = expPage >= totalPages;

    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:3rem; color:var(--text-secondary);">
            <i class="fas fa-receipt" style="font-size:2rem;margin-bottom:0.75rem;display:block;opacity:0.3;"></i>
            No expenses found. Adjust your filters or add a new expense.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = slice.map(e => {
        const catName = e.expense_categories?.category_name || '—';
        const date    = new Date(e.expense_date + 'T00:00:00').toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
        const repeatsTag = e.repeats
            ? `<span style="font-size:0.75rem;background:#fff5e6;color:var(--warning);padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;margin-left:0.4rem;">↻ ${capitalize(e.repeats)}</span>`
            : '';
        return `
        <tr style="border-bottom:1px solid #f4f4f4; transition:background 0.15s;" onmouseenter="this.style.background='#fafafb'" onmouseleave="this.style.background=''">
            <td style="padding:0.9rem 1rem; color:var(--text-secondary); font-size:0.9rem;">${date}</td>
            <td style="padding:0.9rem 1rem;">
                <span style="background:#f3effb;color:var(--primary-accent);padding:0.2rem 0.65rem;border-radius:8px;font-size:0.82rem;font-weight:600;">${catName}</span>
            </td>
            <td style="padding:0.9rem 1rem; color:var(--text-primary); font-size:0.9rem;">
                ${e.description || '<span style="color:var(--text-secondary);font-style:italic;">No description</span>'}
                ${repeatsTag}
            </td>
            <td style="padding:0.9rem 1rem; font-weight:700; color:var(--danger);">Rs ${Number(e.amount).toLocaleString()}</td>
            <td style="padding:0.9rem 1rem; text-align:right;">
                <button class="btn" onclick="openEditExpense(${e.expense_id})"
                    style="background:var(--bg-light-purple);color:var(--primary-accent);padding:0.4rem 0.8rem;font-size:0.8rem;margin-right:0.3rem;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn" onclick="deleteExpense(${e.expense_id})"
                    style="background:#fff0f0;color:var(--danger);padding:0.4rem 0.8rem;font-size:0.8rem;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY BREAKDOWN DOUGHNUT
// ─────────────────────────────────────────────────────────────────────────────
function renderExpensesChart() {
    const canvas = document.getElementById('expensesChart');
    if (!canvas) return;

    const catTotals = {};
    allExpenses.forEach(e => {
        const name = e.expense_categories?.category_name || 'Uncategorized';
        catTotals[name] = (catTotals[name] || 0) + Number(e.amount);
    });

    const labels = Object.keys(catTotals);
    const values = Object.values(catTotals);

    if (expChartInst) expChartInst.destroy();

    if (!labels.length) {
        canvas.parentElement.innerHTML = `<canvas id="expensesChart"></canvas>
            <p style="color:var(--text-secondary);text-align:center;font-size:0.85rem;padding-top:1rem;">No data for chart.</p>`;
        return;
    }

    const colors = ['#5d3bb2','#38c976','#ffaf55','#ff4d4f','#1976d2','#9c27b0','#e65100','#00bcd4'];
    expChartInst = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => `Rs ${Math.round(ctx.raw).toLocaleString()}` } }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD EXPENSE
// ─────────────────────────────────────────────────────────────────────────────
export async function submitAddExpense(e) {
    e.preventDefault();
    const catId  = document.getElementById('exp-form-category').value;
    const amount = parseFloat(document.getElementById('exp-form-amount').value);
    const date   = document.getElementById('exp-form-date').value;
    const desc   = document.getElementById('exp-form-description').value.trim();
    const repeats = document.getElementById('exp-form-repeats').value || null;

    if (!catId || !amount || !date) { alert('Please fill in all required fields.'); return; }

    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('expenses').insert({
        category_id: parseInt(catId),
        amount,
        expense_date: date,
        description: desc || null,
        repeats,
        created_by: user.id
    });

    btn.disabled = false; btn.textContent = 'Add Expense';

    if (error) { alert('Error adding expense: ' + error.message); return; }

    closeExpenseModal();
    await loadExpenses();
    updateKPI(true);
    showToast('Expense updated successfully.', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT EXPENSE
// ─────────────────────────────────────────────────────────────────────────────
export async function openEditExpense(id) {
    const exp = allExpenses.find(e => e.expense_id === id);
    if (!exp) return;

    // Populate form
    document.getElementById('exp-form-category').value    = exp.category_id;
    document.getElementById('exp-form-amount').value      = exp.amount;
    document.getElementById('exp-form-date').value        = exp.expense_date;
    document.getElementById('exp-form-description').value = exp.description || '';
    document.getElementById('exp-form-repeats').value     = exp.repeats || '';

    // Set editing ID on the form
    const form = document.getElementById('form-add-expense');
    form.dataset.editingId = id;

    // Update modal title & button
    document.getElementById('expense-modal-title').textContent = 'Edit Expense';
    document.querySelector('#form-add-expense [type="submit"]').textContent = 'Save Changes';

    openExpenseModal();
}

export async function submitEditExpense(id) {
    const catId   = document.getElementById('exp-form-category').value;
    const amount  = parseFloat(document.getElementById('exp-form-amount').value);
    const date    = document.getElementById('exp-form-date').value;
    const desc    = document.getElementById('exp-form-description').value.trim();
    const repeats = document.getElementById('exp-form-repeats').value || null;

    const { error } = await supabase.from('expenses').update({
        category_id: parseInt(catId), amount, expense_date: date,
        description: desc || null, repeats
    }).eq('expense_id', id);

    if (error) { alert('Error updating expense: ' + error.message); return; }

    closeExpenseModal();
    await loadExpenses();
    updateKPI(true);
    showToast('Expense updated.', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE EXPENSE
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteExpense(id) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    const { error } = await supabase.from('expenses').delete().eq('expense_id', id);
    if (error) { alert('Error deleting expense: ' + error.message); return; }
    await loadExpenses();
    updateKPI(true);
    showToast('Expense deleted.', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD CATEGORY
// ─────────────────────────────────────────────────────────────────────────────
export async function submitAddCategory(e) {
    e.preventDefault();
    const name = document.getElementById('exp-cat-name').value.trim();
    if (!name) return;

    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';

    const { error } = await supabase.from('expense_categories').insert({ category_name: name });

    btn.disabled = false; btn.textContent = 'Add Category';

    if (error) { alert('Error adding category: ' + error.message); return; }

    document.getElementById('exp-cat-name').value = '';
    closeCategoryModal();
    await loadCategories();
    showToast(`Category "${name}" added.`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function openExpenseModal() {
    document.getElementById('modal-expenses-overlay').style.display = 'flex';
    document.getElementById('modal-add-expense').style.display = 'block';
    document.getElementById('modal-add-category').style.display = 'none';
}

function closeCategoryModal() {
    document.getElementById('modal-expenses-overlay').style.display = 'none';
}

export function closeExpenseModal() {
    const overlay = document.getElementById('modal-expenses-overlay');
    overlay.style.display = 'none';
    const form = document.getElementById('form-add-expense');
    form.reset();
    delete form.dataset.editingId;
    document.getElementById('expense-modal-title').textContent = 'Add Expense';
    document.querySelector('#form-add-expense [type="submit"]').textContent = 'Add Expense';
    // Reset date to today
    document.getElementById('exp-form-date').value = new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST (reuse existing or fallback)
// ─────────────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:${type==='success'?'#38c976':'#ff4d4f'};color:#fff;padding:0.85rem 1.5rem;border-radius:12px;font-weight:600;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.15);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

// ─────────────────────────────────────────────────────────────────────────────
// INIT — wire all controls on DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────
export function initExpensesPage() {
    // KPI Range Toggle
    document.querySelectorAll('#expenses-kpi-toggle .segment-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('#expenses-kpi-toggle .segment-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            kpiRange = e.target.dataset.range;
            updateKPI();
        });
    });

    // Filters — reload on change/input
    ['exp-filter-category', 'exp-filter-date-start', 'exp-filter-date-end', 'exp-sort'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => loadExpenses());
    });

    let searchDebounce;
    document.getElementById('exp-filter-search')?.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => loadExpenses(), 350);
    });

    // Pagination
    document.getElementById('btn-exp-prev')?.addEventListener('click', () => {
        if (expPage > 1) { expPage--; renderExpensesTable(); }
    });
    document.getElementById('btn-exp-next')?.addEventListener('click', () => {
        if (expPage < Math.ceil(allExpenses.length / PAGE_SIZE)) { expPage++; renderExpensesTable(); }
    });

    // Add Expense modal open
    document.getElementById('btn-add-expense-modal')?.addEventListener('click', () => {
        const form = document.getElementById('form-add-expense');
        form.reset();
        delete form.dataset.editingId;
        document.getElementById('expense-modal-title').textContent = 'Add Expense';
        document.querySelector('#form-add-expense [type="submit"]').textContent = 'Add Expense';
        document.getElementById('exp-form-date').value = new Date().toISOString().slice(0, 10);
        openExpenseModal();
    });

    // Add Category modal open
    document.getElementById('btn-add-expense-category-modal')?.addEventListener('click', () => {
        document.getElementById('modal-expenses-overlay').style.display = 'flex';
        document.getElementById('modal-add-expense').style.display = 'none';
        document.getElementById('modal-add-category').style.display = 'block';
    });

    // Form submissions
    document.getElementById('form-add-expense')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        if (form.dataset.editingId) {
            await submitEditExpense(parseInt(form.dataset.editingId));
        } else {
            await submitAddExpense(e);
        }
    });
    document.getElementById('form-add-category')?.addEventListener('submit', submitAddCategory);

    // Close overlays
    document.getElementById('modal-expenses-overlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-expenses-overlay')) {
            closeCategoryModal();
        }
    });
    document.querySelectorAll('.close-exp-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modal-expenses-overlay').style.display = 'none';
        });
    });
}
