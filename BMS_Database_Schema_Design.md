# Database Schema Design
## Business Management System — Gas Cylinder Filling & Flour Mill
### Normalized to 3NF | PostgreSQL (Supabase) / MySQL Compatible

> All examples across this document follow **one consistent scenario** so you can trace a single transaction end-to-end through every table: the owner stocks up on Gas Cylinders, Gas (KG), and Flour, then a customer named **Ali Raza** buys 1 gas cylinder + 20 KG flour, pays part of the bill in cash, and clears the rest later by bank transfer.

---

## 1. Modules and Tables

**Product Management**
1. product_categories
2. products

**Inventory**
3. inventory
4. stock_movements

**Customers**
5. customers
6. customer_phones

**Sales**
7. sales
8. sale_items

**Payments**
9. payment_methods
10. customer_payments

**Purchases**
11. purchases

**Expenses**
12. expense_categories
13. expenses

> User authentication is handled by Supabase Auth (`auth.users`) and is not modeled in this schema.

---

## 2. Table Definitions

### 2.1 product_categories
| Column | Type | Constraints |
|---|---|---|
| category_id | INT | PK, AUTO_INCREMENT |
| category_name | VARCHAR(50) | UNIQUE, NOT NULL |
| description | VARCHAR(255) | |

**Example rows:**
| category_id | category_name | description |
|---|---|---|
| 1 | Gas | Gas cylinder and loose gas filling |
| 2 | Flour | Flour milling and direct sale |

---

### 2.2 products
| Column | Type | Constraints |
|---|---|---|
| product_id | INT | PK, AUTO_INCREMENT |
| category_id | INT | FK → product_categories.category_id |
| product_name | VARCHAR(100) | NOT NULL |
| unit_type | VARCHAR(20) | NOT NULL, CHECK (unit_type IN ('KG','PIECE','LITER')) |
| description | TEXT | |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Example rows:**
| product_id | category_id | product_name | unit_type | is_active |
|---|---|---|---|---|
| 1 | 1 | Gas Cylinder (Full) | PIECE | TRUE |
| 2 | 1 | Gas (Loose, by KG) | KG | TRUE |
| 3 | 2 | Flour | KG | TRUE |

---

### 2.3 inventory
| Column | Type | Constraints |
|---|---|---|
| inventory_id | INT | PK, AUTO_INCREMENT |
| product_id | INT | FK → products.product_id, UNIQUE |
| current_stock | DECIMAL(10,2) | NOT NULL, DEFAULT 0 |
| reorder_level | DECIMAL(10,2) | DEFAULT 0 |
| last_updated | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Example rows (after the purchases and sale below have been processed):**
| inventory_id | product_id | current_stock | reorder_level | last_updated |
|---|---|---|---|---|
| 1 | 1 (Gas Cylinder) | 49 | 10 | 2026-07-03 |
| 2 | 2 (Gas Loose KG) | 100 | 20 | 2026-07-01 |
| 3 | 3 (Flour) | 480 | 50 | 2026-07-03 |

`current_stock` for product 1 is 49 because 50 were purchased and 1 was sold (see `stock_movements` below). Same logic for Flour: 500 purchased, 20 sold → 480.

---

### 2.4 stock_movements
| Column | Type | Constraints |
|---|---|---|
| movement_id | BIGINT | PK, AUTO_INCREMENT |
| product_id | INT | FK → products.product_id |
| movement_type | VARCHAR(10) | CHECK (movement_type IN ('IN','OUT')) |
| quantity | DECIMAL(10,2) | NOT NULL |
| reference_type | VARCHAR(20) | CHECK (reference_type IN ('PURCHASE','SALE','ADJUSTMENT')) |
| reference_id | BIGINT | Points to the related record's ID in the table indicated by reference_type |
| movement_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| notes | VARCHAR(255) | |

**Example rows:**
| movement_id | product_id | movement_type | quantity | reference_type | reference_id | movement_date |
|---|---|---|---|---|---|---|
| 501 | 1 | IN | 50 | PURCHASE | 101 | 2026-07-01 |
| 502 | 2 | IN | 100 | PURCHASE | 102 | 2026-07-01 |
| 503 | 3 | IN | 500 | PURCHASE | 103 | 2026-07-01 |
| 504 | 1 | OUT | 1 | SALE | 801 | 2026-07-03 |
| 505 | 3 | OUT | 20 | SALE | 802 | 2026-07-03 |

Notes on `reference_id`:
- When `reference_type = 'PURCHASE'`, `reference_id` points to `purchases.purchase_id`.
- When `reference_type = 'SALE'`, `reference_id` points to `sale_items.sale_item_id` (not `sales.sale_id`) — because one sale can contain multiple products, so the stock movement must trace back to the specific line item to know which product moved.

Every insert here also updates `inventory.current_stock` for that product (add on `IN`, subtract on `OUT`).

---

### 2.5 customers
| Column | Type | Constraints |
|---|---|---|
| customer_id | INT | PK, AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| address | VARCHAR(255) | |
| reference | VARCHAR(100) | NULLABLE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Example row:**
| customer_id | name | address | reference | created_at |
|---|---|---|---|---|
| 1 | Ali Raza | Street 12, Chiniot | Referred by Zainab | 2026-06-15 |

---

### 2.6 customer_phones
| Column | Type | Constraints |
|---|---|---|
| phone_id | INT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id |
| phone_number | VARCHAR(20) | NOT NULL |
| is_primary | BOOLEAN | DEFAULT FALSE |

Constraint: UNIQUE (customer_id, phone_number)

**Example rows:**
| phone_id | customer_id | phone_number | is_primary |
|---|---|---|---|
| 1 | 1 | 0300-1234567 | TRUE |
| 2 | 1 | 0423-6781234 | FALSE |

---

### 2.7 sales
| Column | Type | Constraints |
|---|---|---|
| sale_id | BIGINT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id, NULLABLE |
| sale_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| discount | DECIMAL(10,2) | DEFAULT 0 |
| grand_total | DECIMAL(10,2) | NOT NULL |
| payment_method_id | INT | FK → payment_methods.method_id, NULLABLE |
| notes | VARCHAR(255) | |
| created_by | UUID | FK → auth.users.id |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Example row:**
| sale_id | customer_id | sale_date | discount | grand_total | payment_method_id | notes |
|---|---|---|---|---|---|---|
| 601 | 1 (Ali Raza) | 2026-07-03 | 100.00 | 5500.00 | 2 (Credit) | 1 cylinder + 20kg flour |

`grand_total` = 5600 (sum of `sale_items.line_total`, see below) − 100 (discount) = **5500**. `payment_method_id = 2 (Credit)` because Ali didn't pay in full at the time of sale.

---

### 2.8 sale_items
| Column | Type | Constraints |
|---|---|---|
| sale_item_id | BIGINT | PK, AUTO_INCREMENT |
| sale_id | BIGINT | FK → sales.sale_id |
| product_id | INT | FK → products.product_id |
| quantity | DECIMAL(10,2) | NOT NULL |
| unit_price | DECIMAL(10,2) | NOT NULL |
| line_total | DECIMAL(10,2) | NOT NULL — quantity × unit_price |

**Example rows (both lines belong to sale_id 601):**
| sale_item_id | sale_id | product_id | quantity | unit_price | line_total |
|---|---|---|---|---|---|
| 801 | 601 | 1 (Gas Cylinder) | 1 | 3000.00 | 3000.00 |
| 802 | 601 | 3 (Flour) | 20 | 130.00 | 2600.00 |

Sum of `line_total` = 3000 + 2600 = 5600, which feeds into `sales.grand_total` (5600 − 100 discount = 5500).

---

### 2.9 payment_methods
| Column | Type | Constraints |
|---|---|---|
| method_id | INT | PK, AUTO_INCREMENT |
| method_name | VARCHAR(30) | UNIQUE, NOT NULL |

**Example rows:**
| method_id | method_name |
|---|---|
| 1 | Cash |
| 2 | Credit |
| 3 | Bank Transfer |

---

### 2.10 customer_payments
| Column | Type | Constraints |
|---|---|---|
| payment_id | BIGINT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id |
| sale_id | BIGINT | FK → sales.sale_id, NULLABLE |
| amount | DECIMAL(10,2) | NOT NULL |
| payment_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| method_id | INT | FK → payment_methods.method_id |
| notes | VARCHAR(255) | |

**Example rows:**
| payment_id | customer_id | sale_id | amount | payment_date | method_id | notes |
|---|---|---|---|---|---|---|
| 901 | 1 | 601 | 3000.00 | 2026-07-03 | 1 (Cash) | Partial payment at time of sale |
| 902 | 1 | NULL | 2500.00 | 2026-07-10 | 3 (Bank Transfer) | Cleared remaining dues |

`sale_id = NULL` on the second payment because Ali paid off his overall balance rather than paying against one specific invoice — the payment still reduces his total outstanding balance (see Section 5).

---

### 2.11 purchases
| Column | Type | Constraints |
|---|---|---|
| purchase_id | BIGINT | PK, AUTO_INCREMENT |
| product_id | INT | FK → products.product_id |
| quantity | DECIMAL(10,2) | NOT NULL |
| buying_price | DECIMAL(10,2) | NOT NULL |
| total_cost | DECIMAL(10,2) | NOT NULL — quantity × buying_price |
| purchase_date | DATE | NOT NULL |
| notes | VARCHAR(255) | |
| created_by | UUID | FK → auth.users.id |

**Example rows:**
| purchase_id | product_id | quantity | buying_price | total_cost | purchase_date |
|---|---|---|---|---|---|
| 101 | 1 (Gas Cylinder) | 50 | 2500.00 | 125000.00 | 2026-07-01 |
| 102 | 2 (Gas Loose KG) | 100 | 280.00 | 28000.00 | 2026-07-01 |
| 103 | 3 (Flour) | 500 | 90.00 | 45000.00 | 2026-07-01 |

Each of these rows triggers a corresponding `IN` row in `stock_movements` (see 2.4) and increases `inventory.current_stock` for that product.

---

### 2.12 expense_categories
| Column | Type | Constraints |
|---|---|---|
| category_id | INT | PK, AUTO_INCREMENT |
| category_name | VARCHAR(50) | UNIQUE, NOT NULL |

**Example rows:**
| category_id | category_name |
|---|---|
| 1 | Electricity |
| 2 | Vehicle Fuel |
| 3 | Maintenance |

---

### 2.13 expenses
| Column | Type | Constraints |
|---|---|---|
| expense_id | BIGINT | PK, AUTO_INCREMENT |
| category_id | INT | FK → expense_categories.category_id |
| amount | DECIMAL(10,2) | NOT NULL |
| expense_date | DATE | NOT NULL |
| description | VARCHAR(255) | |
| created_by | UUID | FK → auth.users.id |

**Example row:**
| expense_id | category_id | amount | expense_date | description |
|---|---|---|---|---|
| 301 | 1 (Electricity) | 3500.00 | 2026-07-05 | July electricity bill |

---

## 3. Primary & Foreign Key Summary

| Table | Primary Key | Foreign Keys |
|---|---|---|
| product_categories | category_id | — |
| products | product_id | category_id → product_categories |
| inventory | inventory_id | product_id → products |
| stock_movements | movement_id | product_id → products |
| customers | customer_id | — |
| customer_phones | phone_id | customer_id → customers |
| payment_methods | method_id | — |
| sales | sale_id | customer_id → customers, payment_method_id → payment_methods, created_by → auth.users |
| sale_items | sale_item_id | sale_id → sales, product_id → products |
| customer_payments | payment_id | customer_id → customers, sale_id → sales, method_id → payment_methods |
| purchases | purchase_id | product_id → products, created_by → auth.users |
| expense_categories | category_id | — |
| expenses | expense_id | category_id → expense_categories, created_by → auth.users |

---

## 4. Relationships (Entity Relationship Diagram — Text Format)

```
auth.users (1) ──< sales
auth.users (1) ──< purchases
auth.users (1) ──< expenses

product_categories (1) ──< products

products (1) ──1 inventory
products (1) ──< stock_movements
products (1) ──< purchases
products (1) ──< sale_items

payment_methods (1) ──< sales
payment_methods (1) ──< customer_payments

customers (1) ──< customer_phones
customers (1) ──< sales
customers (1) ──< customer_payments

sales (1) ──< sale_items
products (1) ──< sale_items
    (sales ⋈ products, Many-to-Many, resolved via sale_items)

sales (1) ──< customer_payments

expense_categories (1) ──< expenses
```

**Relationship Types**
- One-to-One: products ↔ inventory
- One-to-Many: customers→customer_phones, customers→sales, customers→customer_payments, product_categories→products, products→stock_movements, products→purchases, payment_methods→sales, payment_methods→customer_payments, sales→customer_payments, expense_categories→expenses, auth.users→sales/purchases/expenses
- Many-to-Many: sales ↔ products (via sale_items junction table)

---

## 5. Derived Values (Not Stored) — Worked with the Example Data

| Value | Formula | Result using example data |
|---|---|---|
| Customer outstanding balance | SUM(sales.grand_total) − SUM(customer_payments.amount), per customer | Ali Raza: 5500 − (3000 + 2500) = **0** (fully paid) |
| Sale grand_total check | SUM(sale_items.line_total) − sales.discount | 3000 + 2600 − 100 = **5500** |
| Daily sales (2026-07-03) | SUM(sale_items.line_total) where sale_date = that day | 3000 + 2600 = **5600** |
| Profit (2026-07-01 to 2026-07-05) | SUM(sales.grand_total) − SUM(purchases.total_cost) − SUM(expenses.amount) | 5500 − (125000+28000+45000) − 3500 = **−196000** (expected: heavy stock-up day) |
| Current stock (cached in inventory) | Running total of stock_movements (IN − OUT), per product | Gas Cylinder: 50 − 1 = **49** ; Flour: 500 − 20 = **480** |
