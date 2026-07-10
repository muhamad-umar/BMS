# Data Fetch Audit V2 (Follow-Up)

## Summary
In this follow-up audit, we found 2 newly flagged issues related to KPI toggles re-fetching data excessively, as well as a growing sequence scan issue on the `customers` table due to the new search logic. All previously fixed issues (V1) remain completely resolved and no new N+1 query patterns were introduced with the new Batch/FIFO features. The overall risk level is Medium, primarily due to unnecessary UI latency on the Profit and Expenses tabs.

## Regression Check (previously fixed issues)
| Issue (from V1 audit) | Status Now | Evidence |
|---|---|---|
| Re-fetch storm after Sale/Purchase insert | ✅ Still Fixed | `src/js/modules/forms.js` maintains the `setTimeout` active-tab targeted refresh logic. |
| Duplicate customers fetch (loadCacheData + get_customers_list) | ✅ Still Fixed | `customers` table is still absent from the initial `Promise.all` cache load. |
| Unbounded sales/payments/movements queries | ✅ Still Fixed | `.range()` and `count:'exact'` are fully intact. Purchase History also correctly uses a limit/offset. |
| Redundant payment_methods fetch | ✅ Still Fixed | Modals continue to read from `cache.paymentMethods` synchronously. |
| Search input debouncing | ✅ Still Fixed | `customer_autocomplete.js` correctly implements a 300ms `_debounceTimer` on every keystroke. |

## Fetch Inventory (every data-fetching point in the app, including new features)
| Page/Component | File Path | Trigger | Data Fetched | Frequency | Status |
|---|---|---|---|---|---|
| Global Init Cache | `src/js/modules/api.js` (L6) | On mount only | `products`, `payment_methods`, `inventory`, `product_categories` | Once on mount | ✅ OK |
| Sales List | `src/js/modules/sales.js` (L213) | Tab open + search/filter changes | `sales` (Paginated) + `customers` cross-search | Per page/search | ⚠️ Flagged (Table Scan) |
| Payments History | `src/js/modules/sales.js` (L468) | Tab open + search/filter changes | `customer_payments` (Paginated) + `customers` search | Per page/search | ⚠️ Flagged (Table Scan) |
| Sale Detail Drawer | `src/js/modules/sales.js` (L303) | Clicking "Eye" icon | `sale_items` | On demand only | ✅ OK |
| Sale Financial Drawer | `src/js/modules/sales.js` (L348) | Clicking "Chart" icon | `get_sale_cogs_detail` RPC | On demand only | ✅ OK |
| Sales Summary KPI | `src/js/modules/sales.js` (L35) | Once per tab visit | `get_sales_summary` RPC | Once per tab visit | ✅ OK |
| Inventory Grid | `src/js/modules/inventory.js` (L48) | Tab open + search/filter | `low_stock_view`, `inventory`, `product_categories` | Per search | ✅ OK |
| Purchase History | `src/js/modules/inventory.js` (L553) | Collapsible open + filter/page | `get_purchase_history` RPC | On demand/page | ✅ OK |
| Batch Detail Drawer | `src/js/modules/inventory.js` (L637) | Clicking "View Sales" | `get_batch_detail` RPC | On demand only | ✅ OK |
| Movement History | `src/js/modules/movements.js` (L14) | Inventory tab open + search | `stock_movements` (Paginated) | Per page/search | ✅ OK |
| Customer List | `src/js/modules/customers.js` (L44) | Customers tab open + search | `get_customers_list` RPC | Per tab visit | ✅ OK |
| Customer Autocomplete | `src/js/modules/customer_autocomplete.js` (L263) | Typing in input (debounced) | `search_customers` RPC | Debounced | ✅ OK |
| Expenses List | `src/js/modules/expenses.js` (L66) | Tab open + filters | `expenses` table | Per tab/filter | ✅ OK |
| Expenses KPI Toggle | `src/js/modules/expenses.js` (L116) | Clicking Today/Week/Month | `expenses` aggregate query | **Every toggle click** | 🔴 Problem |
| Profit Page Init | `src/js/modules/profit.js` (L101) | Authenticated unlock | `get_profit_summary` | Once per unlock | ✅ OK |
| Profit KPI Toggle | `src/js/modules/profit.js` (L453) | Clicking Today/Week/Month | 4 heavy RPCs (Trend, Chart, FIFO, Caveat) | **Every toggle click** | 🔴 Problem |

## Flagged Issues (detailed)

### Profit Page — KPI toggle triggers re-fetch storm
- **Location:** `src/js/modules/profit.js` lines 429-463 (`initProfitPage` toggle listener)
- **What's happening:** When the user clicks the "Today", "Week", or "Month" segment button inside the Profit tab, it fires four separate RPCs (`get_profit_trend_custom`, `get_profit_expense_categories_custom`, `get_product_fifo_summary`, and `get_recurring_expense_caveat`) every single time it is clicked.
- **Why it's a problem:** These are some of the heaviest analytical queries in the app. Rapidly toggling between Week and Month forces the database to recalculate FIFO margins and trends repeatedly. (Note: "Cash Collected" doesn't currently exist in the codebase, but the FIFO and Trend charts suffer heavily from this).
- **Recommended fix:** Cache the RPC results in JavaScript state variables per period (`today`, `week`, `month`) after the first fetch, and only execute the DB query if the cache for that specific period is empty.
- **Estimated impact:** High

### Expenses Page — KPI toggle ignores local data and hits DB
- **Location:** `src/js/modules/expenses.js` lines 112-121 (`loadKPIFromDB`)
- **What's happening:** Clicking the KPI toggle on the Expenses page fires a brand new `supabase.from('expenses').select(...)` query directly to the database.
- **Why it's a problem:** The toggle switches between periods frequently. Instead of reading from a cached state, it hits the network and the DB on every single click, causing UI latency.
- **Recommended fix:** Pre-fetch or cache the KPI data for preset periods, similar to how the Sales page `get_sales_summary` handles it.
- **Estimated impact:** Medium

### Cross-Table Search — Customer table missing trigram index
- **Location:** `src/js/modules/sales.js` line 192 (loadSalesList) and line 448 (loadPaymentsHistory)
- **What's happening:** In order to allow searching Sales and Payments by customer name, the system fires an `.ilike('name', ...)` query on the `customers` table prior to filtering the main table. Live DB checks reveal this is causing full sequential scans (`seq_scan: 16881` vs `idx_scan: 654`).
- **Why it's a problem:** As the customer base grows, running a sequential scan on every debounced keystroke across the entire `customers` table will become a massive performance bottleneck.
- **Recommended fix:** Add a `pg_trgm` GIN index on `customers.name` to ensure `.ilike` queries are properly indexed.
- **Estimated impact:** Medium

## Live Database Evidence — Unexplained Write/Scan Patterns

### 1. Why is `customers` scanned 16,881 times?
- **Location:** `src/js/modules/sales.js` (L191 & L446)
- **What's happening:** The original audit recommended replacing multiple customer queries with a single joined query, which was successfully implemented via the `get_customers_list` RPC. However, the *new* cross-table search logic implemented recently introduced a completely new query: `supabase.from('customers').select('customer_id').ilike('name', ...)` whenever the user types in the Sales or Payments search boxes. Because the `name` column has no GIN index for text search, it performs a sequential scan every time the search input is evaluated (which happens repeatedly as the user types, despite the 300ms debounce).
- **Recommended fix:** Add a `pg_trgm` GIN index on `customers.name` to prevent sequential scanning during text searches.

### 2. Why is `customer_phones` doing almost all seq scans (2,846) with barely any index scans (8)?
- **Location:** `01_bms_functions_views_triggers.sql` (L171 `get_customers_list` and `search_customers` RPCs)
- **What's happening:** The primary-phone lookup (`where cp.customer_id = c.customer_id and cp.is_primary = true limit 1`) is executed as a subquery/join in these RPCs. While there is a supporting index on `customer_id` (`idx_customer_phones_customer`), Postgres' query planner intentionally ignores it and opts for sequential scans because the `customer_phones` table is so tiny (10 rows). Loading a single page of table data into memory sequentially is faster than traversing the index tree. 
- **Recommended fix:** No action needed immediately. As the table grows beyond a few data pages, the query planner will naturally shift to using the existing `idx_customer_phones_customer` index.

### 3. Why is `customers` being UPDATEd 371 times when only ~113 updates are expected?
- **Location:** `01_bms_functions_views_triggers.sql` (L598 `update_balance_on_sale` and L578 `update_balance_on_payment`)
- **What's happening:** The `trg_update_balance_on_sale` and `trg_update_balance_on_payment` triggers are configured to fire `AFTER INSERT OR DELETE OR UPDATE`. If a `sales` or `customer_payments` row is updated (even if the amount doesn't change), the trigger blindly executes an `UPDATE` on the `customers` table to recalculate the balance (`update customers set current_balance = current_balance - OLD.grand_total + NEW.grand_total`). Since the `sales` table experienced 219 unexpected updates, this triggered 219 completely redundant updates to the `customers` table.
- **Recommended fix:** Modify the triggers to exit early if the relevant amount hasn't changed. E.g., `IF TG_OP = 'UPDATE' AND OLD.grand_total = NEW.grand_total AND OLD.customer_id = NEW.customer_id THEN RETURN NULL; END IF;`.

### 4. Why is `sales` being UPDATEd 219 times when sales rows should generally be write-once?
- **Location:** N/A (Codebase exhaustive search)
- **What's happening:** After exhaustively tracing every code path (both client-side JS `.update()` calls and server-side RPCs/triggers in `01_bms_functions_views_triggers.sql`), there is **zero code** in the current application that issues an `UPDATE` statement against the `sales` table.
- **Recommended fix:** Since the application itself is not generating these updates, they must have originated externally. The most likely causes are manual data modifications made directly within Supabase Studio during development/testing, or a previously existing trigger/client function that was executed heavily but has since been deleted. Monitor this stat; if it continues to climb without manual intervention, a strict row-level security (RLS) policy should be enforced to prevent unexpected writes.

## Priority Fix List
1. **Profit Page Cache** (High): Prevent heavy RPCs from re-firing on every single toggle click.
2. **Customer Trigram Index** (Medium): Fix the sequential scanning caused by the new search features in Sales/Payments.
3. **Expenses KPI Cache** (Medium): Prevent the Expenses page from hitting the database on every toggle click.
4. **Trigger Optimization** (Low): Add early exits in the `update_balance_on_sale` and `update_balance_on_payment` triggers so they don't fire redundant customer balance updates when sales/payments are updated without amount changes.
