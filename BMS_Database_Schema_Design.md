# Database Schema Design
## Business Management System — Gas Cylinder Filling & Flour Mill
### Normalized to 3NF | PostgreSQL (Supabase) / MySQL Compatible

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

**Flour Mill — Wheat Account**
12. wheat_deposits
13. flour_withdrawals

**Expenses**
14. expense_categories
15. expenses

> User authentication is handled by Supabase Auth (`auth.users`) and is not modeled in this schema.

---

## 2. Table Definitions

### 2.1 product_categories
| Column | Type | Constraints |
|---|---|---|
| category_id | INT | PK, AUTO_INCREMENT |
| category_name | VARCHAR(50) | UNIQUE, NOT NULL |
| description | VARCHAR(255) | |

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

---

### 2.3 inventory
| Column | Type | Constraints |
|---|---|---|
| inventory_id | INT | PK, AUTO_INCREMENT |
| product_id | INT | FK → products.product_id, UNIQUE |
| current_stock | DECIMAL(10,2) | NOT NULL, DEFAULT 0 |
| reorder_level | DECIMAL(10,2) | DEFAULT 0 |
| last_updated | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

### 2.4 stock_movements
| Column | Type | Constraints |
|---|---|---|
| movement_id | BIGINT | PK, AUTO_INCREMENT |
| product_id | INT | FK → products.product_id |
| movement_type | VARCHAR(10) | CHECK (movement_type IN ('IN','OUT')) |
| quantity | DECIMAL(10,2) | NOT NULL |
| reference_type | VARCHAR(20) | CHECK (reference_type IN ('PURCHASE','SALE','WHEAT_DEPOSIT','FLOUR_WITHDRAWAL','ADJUSTMENT')) |
| reference_id | BIGINT | Points to the related record's ID in the table indicated by reference_type |
| movement_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| notes | VARCHAR(255) | |

---

### 2.5 customers
| Column | Type | Constraints |
|---|---|---|
| customer_id | INT | PK, AUTO_INCREMENT |
| name | VARCHAR(100) | NOT NULL |
| address | VARCHAR(255) | |
| reference | VARCHAR(100) | NULLABLE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

### 2.6 customer_phones
| Column | Type | Constraints |
|---|---|---|
| phone_id | INT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id |
| phone_number | VARCHAR(20) | NOT NULL |
| is_primary | BOOLEAN | DEFAULT FALSE |

Constraint: UNIQUE (customer_id, phone_number)

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

---

### 2.9 payment_methods
| Column | Type | Constraints |
|---|---|---|
| method_id | INT | PK, AUTO_INCREMENT |
| method_name | VARCHAR(30) | UNIQUE, NOT NULL |

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

---

### 2.12 wheat_deposits
| Column | Type | Constraints |
|---|---|---|
| deposit_id | BIGINT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id |
| wheat_quantity_kg | DECIMAL(10,2) | NOT NULL |
| conversion_ratio | DECIMAL(5,2) | NOT NULL, DEFAULT 0.90 |
| deposit_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| notes | VARCHAR(255) | |

---

### 2.13 flour_withdrawals
| Column | Type | Constraints |
|---|---|---|
| withdrawal_id | BIGINT | PK, AUTO_INCREMENT |
| customer_id | INT | FK → customers.customer_id |
| flour_quantity_kg | DECIMAL(10,2) | NOT NULL |
| withdrawal_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| notes | VARCHAR(255) | |

---

### 2.14 expense_categories
| Column | Type | Constraints |
|---|---|---|
| category_id | INT | PK, AUTO_INCREMENT |
| category_name | VARCHAR(50) | UNIQUE, NOT NULL |

---

### 2.15 expenses
| Column | Type | Constraints |
|---|---|---|
| expense_id | BIGINT | PK, AUTO_INCREMENT |
| category_id | INT | FK → expense_categories.category_id |
| amount | DECIMAL(10,2) | NOT NULL |
| expense_date | DATE | NOT NULL |
| description | VARCHAR(255) | |
| created_by | UUID | FK → auth.users.id |

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
| wheat_deposits | deposit_id | customer_id → customers |
| flour_withdrawals | withdrawal_id | customer_id → customers |
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
customers (1) ──< wheat_deposits
customers (1) ──< flour_withdrawals

sales (1) ──< sale_items
products (1) ──< sale_items
    (sales ⋈ products, Many-to-Many, resolved via sale_items)

sales (1) ──< customer_payments

expense_categories (1) ──< expenses
```

**Relationship Types**
- One-to-One: products ↔ inventory
- One-to-Many: customers→customer_phones, customers→sales, customers→customer_payments, customers→wheat_deposits, customers→flour_withdrawals, product_categories→products, products→stock_movements, products→purchases, payment_methods→sales, payment_methods→customer_payments, sales→customer_payments, expense_categories→expenses, auth.users→sales/purchases/expenses
- Many-to-Many: sales ↔ products (via sale_items junction table)

---

## 5. Derived Values (Not Stored)

| Value | Formula |
|---|---|
| Customer outstanding balance | SUM(sales.grand_total) − SUM(customer_payments.amount) per customer |
| Customer flour balance | SUM(wheat_deposits.wheat_quantity_kg × conversion_ratio) − SUM(flour_withdrawals.flour_quantity_kg) per customer |
| Sale grand_total check | SUM(sale_items.line_total) − sales.discount |
| Daily/Monthly/Yearly sales | SUM(sale_items.line_total) grouped by sale_date |
| Profit | SUM(sales) − SUM(purchases.total_cost) − SUM(expenses.amount) |
| Current stock (cached in inventory) | Running total of stock_movements (IN − OUT) per product |
