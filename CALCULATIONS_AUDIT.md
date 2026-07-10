# Calculations Audit

## 1. Every Page — Displayed Values Inventory

| Page | Displayed Value | Exact Formula/Query Used | Source Table(s)/Column(s) | File + Line |
|---|---|---|---|---|
| **Dashboard** | Flour Balance (Available stock) | `cache.inventory[product_id]` (direct lookup via API cache) | `inventory.current_stock` | `dashboard.html:L156`, `src/js/modules/api.js:L22` |
| **Sales** | Total Sales | `SUM(grand_total)` grouped by range | `sales.grand_total` | `01_bms_functions_views_triggers.sql` (get_sales_summary), `src/js/modules/sales.js:L75` |
| **Sales** | Transactions | `COUNT(*)` of sales grouped by range | `sales` | `01_bms_functions_views_triggers.sql` (get_sales_summary), `src/js/modules/sales.js:L76` |
| **Sales** | Avg Sale Value | `Total Sales / Transactions` | `sales.grand_total` | `src/js/modules/sales.js:L78` |
| **Sales** | Total Discount | `SUM(discount)` grouped by range | `sales.discount` | `01_bms_functions_views_triggers.sql` (get_sales_summary), `src/js/modules/sales.js:L80` |
| **Sales** | Outstanding Receivables | `SUM(current_balance) filter (where current_balance > 0)` | `customers.current_balance` | `01_bms_functions_views_triggers.sql` (get_sales_summary), `src/js/modules/sales.js:L42` |
| **Inventory** | Active Products | Javascript `count` where `is_active == true` | `products.is_active` | `src/js/modules/inventory.js:L161` |
| **Inventory** | Low Stock Items | Javascript `count` where `current_stock > 0 && current_stock <= reorder_level` | `inventory.current_stock`, `inventory.reorder_level` | `src/js/modules/inventory.js:L162` |
| **Inventory** | Out of Stock Items | Javascript `count` where `current_stock <= 0` | `inventory.current_stock` | `src/js/modules/inventory.js:L163` |
| **Inventory** | Product Price | Direct read | `products.selling_price` | `src/js/modules/inventory.js:L95` |
| **Customers** | Total Customers | `count(*)` of all customers | `customers` | `01_bms_functions_views_triggers.sql` (get_customer_stats), `src/js/modules/customers.js:L32` |
| **Customers** | Outstanding Customers| `count(*) filter (where current_balance > 0)` | `customers.current_balance` | `01_bms_functions_views_triggers.sql` (get_customer_stats), `src/js/modules/customers.js:L33` |
| **Customers** | Total Amount Due | `coalesce(sum(current_balance) filter (where current_balance > 0), 0)` | `customers.current_balance` | `01_bms_functions_views_triggers.sql` (get_customer_stats), `src/js/modules/customers.js:L34` |
| **Customers** | New This Month | `count(*) filter (where created_at >= date_trunc('month', current_date))` | `customers.created_at` | `01_bms_functions_views_triggers.sql` (get_customer_stats), `src/js/modules/customers.js:L35` |
| **Customers** | Current Balance | Direct read | `customers.current_balance` | `01_bms_functions_views_triggers.sql` (get_customers_list) |
| **Expenses** | Total Expenses | `sum(amount)` over selected date range | `expenses.amount` | `src/js/modules/expenses.js:L123` |
| **Expenses** | Expense Count | `data.length` of array returned | `expenses` | `src/js/modules/expenses.js:L124` |
| **Expenses** | Avg Daily Expense | `Total Expenses / (days between start and end)` | `expenses.amount` | `src/js/modules/expenses.js:L128` |
| **Expenses** | Top Category | Max `sum(amount)` grouped by category | `expenses.amount`, `expense_categories.category_name`| `src/js/modules/expenses.js:L133` |
| **Profit** | Total Sales (Revenue) | `COALESCE(SUM(grand_total), 0)` within date range | `sales.grand_total` | `01_bms_functions_views_triggers.sql` (get_profit_summary / get_profit_custom_range), `src/js/modules/profit.js:L218` |
| **Profit** | Total Cost (Purchases)| `COALESCE(SUM(total_cost), 0)` within date range | `purchases.total_cost` | `01_bms_functions_views_triggers.sql` (get_profit_summary / get_profit_custom_range), `src/js/modules/profit.js:L219` |
| **Profit** | Total Expenses | `COALESCE(SUM(amount), 0)` within date range | `expenses.amount` | `01_bms_functions_views_triggers.sql` (get_profit_summary / get_profit_custom_range), `src/js/modules/profit.js:L220` |
| **Profit** | Net Profit | `Total Sales - Total Cost - Total Expenses` (Calculated in JS) | `sales`, `purchases`, `expenses` | `src/js/modules/profit.js:L202` |
| **Profit** | Profit Margin | `(Net Profit / Total Sales) * 100` | `sales`, `purchases`, `expenses` | `src/js/modules/profit.js:L204` |


## 2. Sale Lifecycle — How a Sale's Money Is Tracked

### a) A new sale is created (via `create_sale` RPC function)
- **Insert `sales` table**: `grand_total` is set to the sum of line items minus discount.
- **Insert `sale_items` table**: each product line is inserted.
- **Trigger `trg_update_balance_on_sale` fires**: Updates `customers.current_balance = current_balance + NEW.grand_total`.
- **Payment Handling**: If `p_amount_paid > 0` is passed to the function:
  - **Insert `customer_payments` table**: The amount paid upfront is inserted.
  - **Trigger `trg_update_balance_on_payment` fires**: Updates `customers.current_balance = current_balance - NEW.amount`.
- **Result**: The customer's net balance increases by exactly `grand_total - p_amount_paid`. The `sales.grand_total` explicitly records the full invoice value.

### b) A customer makes a partial payment on that sale (via "Record Payment")
- **Insert `customer_payments` table**: The newly paid amount is inserted.
- **Trigger `trg_update_balance_on_payment` fires**: Updates `customers.current_balance = current_balance - NEW.amount`.
- **CRITICALLY**: This action **DOES NOT** touch `sales.grand_total`, nor does it update any column in the `sales` table. The payment is entirely decoupled from the specific sale record in terms of aggregates. It ONLY affects `customers.current_balance`.

### c) A customer pays off the remaining balance later
- **Insert `customer_payments` table**: The remaining amount is inserted.
- **Trigger `trg_update_balance_on_payment` fires**: Updates `customers.current_balance = current_balance - NEW.amount` (bringing it to 0).
- Again, `sales.grand_total` and sales aggregates are completely untouched.

**Explicit Distinction Statement:**
Is there a distinction between "sales revenue recognized" (invoiced) and "cash actually collected" (paid)? 
**Yes, but only in the underlying data tables, not in the Profit/Sales reporting dashboards.** 
The data perfectly tracks *invoiced revenue* (`sales.grand_total`) versus *cash collected* (`customer_payments.amount`). However, the Sales and Profit dashboards currently use the *invoiced revenue* (`sales.grand_total`) for all their "Total Sales" and "Revenue" calculations, entirely ignoring the cash collection status. 

## 3. Profit Formula — Explicit Breakdown

The exact formula currently used for Net Profit (in `src/js/modules/profit.js` and `get_profit_summary` / `get_profit_custom_range`) is:
```
Net Profit = SUM(sales.grand_total) - SUM(purchases.total_cost) - SUM(expenses.amount)
```

**Which values feed into "Total Sales"?**
It is `SUM(sales.grand_total)`.
Every sale ever recorded is fully counted as revenue the moment the sale is created, **regardless of whether the customer has actually paid.** It is entirely based on the invoiced amount, not the collected amount.

**Code Reference:**
`01_bms_functions_views_triggers.sql`, `get_profit_summary` function:
`'total_sales', (SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE ...)`

## 4. Known Discrepancy to Investigate

**Scenario Traced:**
1. Sale made for `grand_total = 10,000`, customer pays `4,000` upfront. Balance is `6,000`.
   - **Profit Calculation:** Counts the full `10,000` as "Total Sales" revenue for today.
2. Later (e.g., next month), the customer pays the remaining `6,000`.
   - **Data Action:** A row is inserted into `customer_payments` for `6,000`. `customers.current_balance` drops by `6,000`.
   - **Profit Calculation:** The `6,000` payment is entirely invisible to the profit calculation. It is **not** added to sales revenue, which correctly prevents double-counting (since the full `10,000` was already recognized on day 1).

**Accounting Approach:**
The current profit calculation is strictly **accrual-based**. Revenue is recognized the moment the sale is made (`sales.grand_total`), and cash payments/collections are treated as purely balance sheet activities (reducing accounts receivable, `current_balance`), having zero impact on the P&L/Profit page.

## 5. Summary of Suspected Issues

- **Strict Accrual Basis:** The app works flawlessly if the business owner expects "Accrual Accounting" (I sold 10k today, so I made 10k today, even if they owe me). 
- **Disconnect from Cash Reality:** For a small business, "Profit" usually means "Cash in my pocket minus cash out of my pocket". Under the current accrual model, if a business sells 100,000 worth of goods on credit but collects 0 cash, the app will show a massive Net Profit, but the owner's bank account will be empty (and purchases/expenses will drain actual cash). 
- **Naming Confusion:** The dashboard says "Net Profit" and "Total Revenue", but nowhere does it clearly warn the user that this includes *unpaid credit sales*. 
- **Cash Flow Missing:** There is no metric on the dashboard or profit page that tells the user "Total Cash Collected Today" (which would be `SUM(customer_payments.amount)`). 
- **No Double Counting:** The system is actually mathematically sound—it does not double-count payments. The issue is purely a mismatch between the chosen accounting method (accrual via `grand_total`) and what a small business owner likely expects (cash basis via `payments`).
