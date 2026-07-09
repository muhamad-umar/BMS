import { supabase } from '../auth.js';

/**
 * CustomerAutocomplete — reusable searchable customer picker.
 *
 * States:
 *   SEARCH  — text input + live dropdown visible (no selection yet)
 *   SELECTED — input hidden, compact single-line "pill" shown in the same space
 *              Clicking the pill returns to SEARCH state.
 *
 * The pill occupies exactly the same height as the input, so the form
 * never gains or loses vertical space when a customer is selected.
 */
export class CustomerAutocomplete {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            placeholder: 'Search by name or phone…',
            required: false,
            onSelect: null,
            onClear: null,
            ...options
        };

        this._selectedCustomer = null;
        this._debounceTimer = null;
        this._open = false;

        this._render();
        this._attachEvents();
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    getValue()      { return this._selectedCustomer; }
    getCustomerId() { return this._selectedCustomer?.customer_id ?? null; }

    reset() {
        this._selectedCustomer = null;
        this._input.value = '';
        this._clearBtn.style.display = 'none';
        this._closeList();
        this._showSearch();
        if (this.options.onClear) this.options.onClear();
    }

    async presetCustomer(customer) {
        this._selectedCustomer = customer;
        this._showSelected(customer);
        if (this.options.onSelect) this.options.onSelect(customer);
    }

    // ─── DOM Construction ─────────────────────────────────────────────────────

    _render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // The wrapper keeps a fixed height equal to the input.
        // Only one of .cac-search-state or .cac-selected-pill is visible at a time.
        container.innerHTML = `
            <div class="cac-wrapper" style="position: relative;">

                <!-- ① SEARCH STATE: input + clear btn -->
                <div class="cac-search-state" style="position: relative;">
                    <input
                        type="text"
                        class="form-control cac-input"
                        placeholder="${this._escHtml(this.options.placeholder)}"
                        autocomplete="off"
                        spellcheck="false"
                        style="padding-right: 2.5rem;"
                    >
                    <span class="cac-clear-btn" title="Clear" style="
                        display: none;
                        position: absolute;
                        right: 0.9rem;
                        top: 50%;
                        transform: translateY(-50%);
                        cursor: pointer;
                        color: var(--text-secondary);
                        font-size: 0.85rem;
                        line-height: 1;
                        padding: 0.2rem;
                        border-radius: 50%;
                        transition: color 0.2s;
                        align-items: center;
                        justify-content: center;
                    "><i class="fas fa-times"></i></span>
                </div>

                <!-- ② SELECTED STATE: single-line pill, same height as the input -->
                <!-- Hidden initially; replaces the search state in-place -->
                <div class="cac-selected-pill" style="
                    display: none;
                    align-items: center;
                    gap: 0.65rem;
                    width: 100%;
                    padding: 0.8rem 1rem;
                    background: var(--bg-light-purple);
                    border: 1px solid rgba(93,59,178,0.2);
                    border-radius: 12px;
                    cursor: pointer;
                    min-width: 0;
                    box-sizing: border-box;
                    transition: background 0.15s, border-color 0.15s;
                " title="Click to change customer">
                    <i class="fas fa-check-circle" style="
                        color: var(--success);
                        flex-shrink: 0;
                        font-size: 1rem;
                    "></i>
                    <div style="flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 0.5rem; overflow: hidden;">
                        <span class="cac-pill-name" style="
                            font-weight: 600;
                            color: var(--text-primary);
                            font-size: 0.95rem;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            flex-shrink: 1;
                        "></span>
                        <span class="cac-pill-phone" style="
                            font-size: 0.8rem;
                            color: var(--text-secondary);
                            white-space: nowrap;
                            flex-shrink: 0;
                        "></span>
                    </div>
                    <i class="fas fa-pen" style="
                        font-size: 0.75rem;
                        color: var(--text-secondary);
                        flex-shrink: 0;
                        opacity: 0.6;
                    "></i>
                </div>

                <!-- Suggestions Dropdown (portals out of the search-state div) -->
                <div class="cac-list" style="
                    display: none;
                    position: absolute;
                    top: calc(100% + 6px);
                    left: 0; right: 0;
                    background: #ffffff;
                    border: 1px solid #eaeaea;
                    border-radius: 16px;
                    box-shadow: 0 8px 30px rgba(93,59,178,0.12);
                    z-index: 9999;
                    max-height: 300px;
                    overflow-y: auto;
                    animation: slideUp 0.18s ease;
                "></div>
            </div>
        `;

        this._wrapper    = container.querySelector('.cac-wrapper');
        this._searchState = container.querySelector('.cac-search-state');
        this._pill       = container.querySelector('.cac-selected-pill');
        this._pillName   = container.querySelector('.cac-pill-name');
        this._pillPhone  = container.querySelector('.cac-pill-phone');
        this._input      = container.querySelector('.cac-input');
        this._clearBtn   = container.querySelector('.cac-clear-btn');
        this._list       = container.querySelector('.cac-list');
    }

    // ─── State Switchers ──────────────────────────────────────────────────────

    _showSearch() {
        this._searchState.style.display = 'block';
        this._pill.style.display = 'none';
    }

    _showSelected(customer) {
        this._pillName.textContent = customer.name;
        this._pillPhone.textContent = customer.primary_phone
            ? `· ${customer.primary_phone}` : '';

        this._searchState.style.display = 'none';
        this._pill.style.display = 'flex';
    }

    // ─── Event Wiring ─────────────────────────────────────────────────────────

    _attachEvents() {
        // Typing — debounced search
        this._input.addEventListener('input', () => {
            const q = this._input.value.trim();

            clearTimeout(this._debounceTimer);

            if (q.length === 0) {
                this._closeList();
                this._clearBtn.style.display = 'none';
                return;
            }

            this._clearBtn.style.display = 'flex';
            this._debounceTimer = setTimeout(() => this._search(q), 300);
        });

        // Clear button (× inside the input)
        this._clearBtn.addEventListener('click', () => this.reset());

        // Pill click → revert to search state
        this._pill.addEventListener('click', () => {
            const prevName = this._selectedCustomer?.name || '';
            this._selectedCustomer = null;
            this._pill.style.display = 'none';
            this._searchState.style.display = 'block';
            this._input.value = prevName;  // pre-fill with name so user can refine
            this._clearBtn.style.display = prevName ? 'flex' : 'none';
            this._input.focus();
            if (this.options.onClear) this.options.onClear();
            // Trigger a fresh search for the pre-filled text
            if (prevName) this._search(prevName);
        });

        // Keyboard navigation
        this._input.addEventListener('keydown', (e) => {
            if (!this._open) return;
            const items = this._list.querySelectorAll('.cac-item');
            const active = this._list.querySelector('.cac-item.cac-active');
            let idx = [...items].indexOf(active);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                idx = Math.min(idx + 1, items.length - 1);
                items.forEach(el => el.classList.remove('cac-active'));
                items[idx]?.classList.add('cac-active');
                items[idx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                idx = Math.max(idx - 1, 0);
                items.forEach(el => el.classList.remove('cac-active'));
                items[idx]?.classList.add('cac-active');
                items[idx]?.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (active) active.click();
            } else if (e.key === 'Escape') {
                this._closeList();
            }
        });

        // Click outside → close dropdown
        document.addEventListener('click', (e) => {
            if (!this._wrapper?.contains(e.target)) {
                this._closeList();
            }
        });
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    async _search(query) {
        this._list.style.display = 'block';
        this._open = true;
        this._list.innerHTML = `
            <div style="padding: 1rem 1.2rem; color: var(--text-secondary); font-size: 0.9rem; display: flex; align-items: center; gap: 0.6rem;">
                <i class="fas fa-circle-notch fa-spin" style="color: var(--primary-accent);"></i> Searching…
            </div>`;

        const { data, error } = await supabase.rpc('search_customers', { p_query: query });

        if (error) {
            this._list.innerHTML = `
                <div style="padding: 1rem 1.2rem; color: var(--danger); font-size: 0.9rem;">
                    <i class="fas fa-exclamation-circle"></i> Error: ${this._escHtml(error.message)}
                </div>
                ${this._newCustomerRow()}`;
            this._bindNewCustomer();
            return;
        }

        this._renderList(data || []);
    }

    // ─── Render List ──────────────────────────────────────────────────────────

    _renderList(results) {
        if (results.length === 0) {
            this._list.innerHTML = `
                <div style="padding: 1rem 1.2rem; color: var(--text-secondary); font-size: 0.9rem; font-style: italic;">
                    No customers found
                </div>
                ${this._newCustomerRow()}`;
        } else {
            this._list.innerHTML = results.map((c, i) => `
                <div class="cac-item" data-id="${c.customer_id}" style="
                    padding: 0.75rem 1.2rem;
                    cursor: pointer;
                    border-bottom: 1px solid #f4f4f4;
                    transition: background 0.15s;
                    border-radius: ${i === 0 ? '16px 16px 0 0' : '0'};
                ">
                    <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${this._escHtml(c.name)}
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; gap: 0.6rem; align-items: center; margin-top: 0.1rem;">
                        <span><i class="fas fa-phone-alt" style="font-size: 0.65rem; opacity: 0.6; margin-right: 0.15rem;"></i>${this._escHtml(c.primary_phone || '—')}</span>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                            <i class="fas fa-map-marker-alt" style="font-size: 0.65rem; opacity: 0.6; margin-right: 0.15rem;"></i>${this._escHtml(c.address || '—')}
                        </span>
                    </div>
                </div>
            `).join('') + this._newCustomerRow(true);

            this._list.querySelectorAll('.cac-item[data-id]').forEach(el => {
                el.addEventListener('mouseenter', () => {
                    this._list.querySelectorAll('.cac-item').forEach(x => x.classList.remove('cac-active'));
                    el.classList.add('cac-active');
                });
                el.addEventListener('click', () => {
                    const id = parseInt(el.dataset.id);
                    const customer = results.find(c => c.customer_id === id);
                    if (customer) this._selectCustomer(customer);
                });
            });
        }

        this._bindNewCustomer();
    }

    _newCustomerRow(hasDivider = false) {
        return `
            <div class="cac-item cac-new-customer" style="
                padding: 0.75rem 1.2rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 0.6rem;
                font-weight: 600;
                font-size: 0.88rem;
                color: var(--primary-accent);
                border-top: ${hasDivider ? '1px solid #eaeaea' : 'none'};
                border-radius: 0 0 16px 16px;
                transition: background 0.15s;
            ">
                <i class="fas fa-user-plus" style="font-size: 0.82rem;"></i>
                + New Customer
            </div>`;
    }

    _bindNewCustomer() {
        this._list.querySelector('.cac-new-customer')?.addEventListener('click', () => {
            this._closeList();
            this._openNewCustomerModal();
        });
    }

    // ─── Selection ────────────────────────────────────────────────────────────

    _selectCustomer(customer) {
        this._selectedCustomer = customer;
        this._closeList();
        this._showSelected(customer);
        if (this.options.onSelect) this.options.onSelect(customer);
    }

    // ─── "+ New Customer" inline open ─────────────────────────────────────────

    _openNewCustomerModal() {
        const inputText = this._input.value.trim();
        const nameInput = document.getElementById('nc-name');
        if (nameInput && inputText) nameInput.value = inputText;

        window._pendingCustomerAutocomplete = this;

        document.querySelectorAll('.modal-content').forEach(m => m.style.display = 'none');
        document.getElementById('modal-overlay').style.display = 'flex';
        document.getElementById('modal-new-customer').style.display = 'block';
    }

    // ─── Preset by ID ─────────────────────────────────────────────────────────

    async _presetById(customerId) {
        if (!customerId) return;

        const { data: rows } = await supabase
            .from('customers')
            .select('customer_id, name, address')
            .eq('customer_id', customerId)
            .single();

        if (rows) {
            const { data: phone } = await supabase
                .from('customer_phones')
                .select('phone_number')
                .eq('customer_id', customerId)
                .order('is_primary', { ascending: false })
                .limit(1)
                .single();

            await this.presetCustomer({
                customer_id: rows.customer_id,
                name: rows.name,
                address: rows.address,
                primary_phone: phone?.phone_number || null
            });
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _closeList() {
        this._list.style.display = 'none';
        this._open = false;
    }

    _escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// ─── Styles injected once ─────────────────────────────────────────────────────
(function injectCacStyles() {
    if (document.getElementById('cac-styles')) return;
    const s = document.createElement('style');
    s.id = 'cac-styles';
    s.textContent = `
        .cac-item:hover,
        .cac-item.cac-active {
            background: var(--bg-light-purple) !important;
        }
        .cac-clear-btn:hover i { color: var(--danger); }
        .cac-selected-pill:hover {
            background: #e8dcf5 !important;
            border-color: rgba(93,59,178,0.35) !important;
        }
    `;
    document.head.appendChild(s);
})();
