-- 1.7 Extensions & Indexes
create extension if not exists pg_trgm;

create index if not exists idx_sales_customer on sales(customer_id);
create index if not exists idx_sales_date on sales(sale_date);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_product on sale_items(product_id);
create index if not exists idx_stock_movements_product_date on stock_movements(product_id, movement_date);
create index if not exists idx_customer_payments_customer on customer_payments(customer_id);
create index if not exists idx_customer_phones_customer on customer_phones(customer_id);
create index if not exists idx_purchases_product_date on purchases(product_id, purchase_date);
create index if not exists idx_customers_name_trgm on customers using gin (name gin_trgm_ops);

-- 1.1 Trigger: auto stock-out on sale
CREATE OR REPLACE FUNCTION trg_sale_items_stock_out()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, reference_code, movement_date)
    VALUES (NEW.product_id, 'OUT', NEW.quantity, 'SALE', NEW.sale_item_id, '#SL-' || NEW.sale_id, CURRENT_TIMESTAMP);
    
    UPDATE inventory 
    SET current_stock = current_stock - NEW.quantity,
        last_updated = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id;
    
    IF NOT FOUND THEN
        INSERT INTO inventory (product_id, current_stock, reorder_level)
        VALUES (NEW.product_id, -NEW.quantity, 0)
        ON CONFLICT (product_id) DO UPDATE 
        SET current_stock = inventory.current_stock - NEW.quantity,
            last_updated = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_insert ON sale_items;
CREATE TRIGGER trg_sale_items_insert
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION trg_sale_items_stock_out();

-- 1.2 Trigger: auto stock-in on purchase
CREATE OR REPLACE FUNCTION trg_purchases_before() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.total_cost IS NULL OR NEW.total_cost = 0 THEN
        NEW.total_cost := NEW.quantity * NEW.buying_price;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchases_before_insert ON purchases;
CREATE TRIGGER trg_purchases_before_insert
BEFORE INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION trg_purchases_before();

CREATE OR REPLACE FUNCTION trg_purchases_after() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, reference_code, movement_date)
    VALUES (NEW.product_id, 'IN', NEW.quantity, 'PURCHASE', NEW.purchase_id, '#PUR-' || NEW.purchase_id, NEW.purchase_date);
    
    INSERT INTO inventory (product_id, current_stock, reorder_level)
    VALUES (NEW.product_id, NEW.quantity, 0)
    ON CONFLICT (product_id) DO UPDATE 
    SET current_stock = inventory.current_stock + EXCLUDED.current_stock,
        last_updated = CURRENT_TIMESTAMP;
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchases_after_insert ON purchases;
CREATE TRIGGER trg_purchases_after_insert
AFTER INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION trg_purchases_after();

-- 1.3 Function: create_sale
CREATE OR REPLACE FUNCTION create_sale(
    p_customer_id INT,
    p_discount DECIMAL(10,2),
    p_payment_method_id INT,
    p_notes VARCHAR,
    p_items JSONB,
    p_amount_paid DECIMAL(10,2)
) RETURNS BIGINT AS $$
DECLARE
    v_sale_id BIGINT;
    v_grand_total DECIMAL(10,2) := 0;
    v_item JSONB;
    v_line_total DECIMAL(10,2);
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_grand_total := v_grand_total + ((v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL);
    END LOOP;
    
    v_grand_total := v_grand_total - COALESCE(p_discount, 0);

    INSERT INTO sales (customer_id, discount, grand_total, payment_method_id, notes, created_by)
    VALUES (p_customer_id, COALESCE(p_discount, 0), v_grand_total, p_payment_method_id, p_notes, auth.uid())
    RETURNING sale_id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL;
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total)
        VALUES (v_sale_id, (v_item->>'product_id')::INT, (v_item->>'quantity')::DECIMAL, (v_item->>'unit_price')::DECIMAL, v_line_total);
    END LOOP;

    IF p_amount_paid > 0 THEN
        INSERT INTO customer_payments (customer_id, sale_id, amount, method_id, notes)
        VALUES (p_customer_id, v_sale_id, p_amount_paid, p_payment_method_id, 'Initial payment for sale #SL-' || v_sale_id);
    END IF;

    RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.4 Function: create_customer
CREATE OR REPLACE FUNCTION create_customer(
    p_name VARCHAR,
    p_address VARCHAR,
    p_reference VARCHAR,
    p_phones JSONB
) RETURNS INT AS $$
DECLARE
    v_customer_id INT;
    v_phone JSONB;
BEGIN
    INSERT INTO customers (name, address, reference)
    VALUES (p_name, p_address, p_reference)
    RETURNING customer_id INTO v_customer_id;

    IF p_phones IS NOT NULL THEN
        FOR v_phone IN SELECT * FROM jsonb_array_elements(p_phones)
        LOOP
            INSERT INTO customer_phones (customer_id, phone_number, is_primary)
            VALUES (v_customer_id, v_phone->>'phone_number', (v_phone->>'is_primary')::BOOLEAN);
        END LOOP;
    END IF;

    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.5 View: customer_due_view
create or replace view customer_due_view as
select
  c.customer_id,
  c.name,
  coalesce(sum(s.grand_total), 0) as total_billed,
  coalesce((select sum(amount) from customer_payments cp where cp.customer_id = c.customer_id), 0) as total_paid,
  coalesce(sum(s.grand_total), 0) - coalesce((select sum(amount) from customer_payments cp where cp.customer_id = c.customer_id), 0) as balance_due
from customers c
left join sales s on s.customer_id = c.customer_id
group by c.customer_id, c.name;

-- 1.6 View: low_stock_view
create or replace view low_stock_view as
select i.*, p.product_name
from inventory i
join products p on p.product_id = i.product_id
where i.current_stock <= coalesce(i.reorder_level, 0);

-- 1.7 Function: get_customers_list
CREATE OR REPLACE FUNCTION get_customers_list()
RETURNS TABLE (
    customer_id INT,
    name VARCHAR,
    current_balance DECIMAL(10,2),
    primary_phone VARCHAR,
    last_purchase_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
AS $$
   select 
     c.customer_id,
     c.name,
     c.current_balance,
     (select phone_number from customer_phones cp 
      where cp.customer_id = c.customer_id and cp.is_primary = true limit 1) as primary_phone,
     (select max(sale_date) from sales s where s.customer_id = c.customer_id) as last_purchase_date
   from customers c;
$$;


-- 1.8 Function: get_customer_lifetime_sales
CREATE OR REPLACE FUNCTION get_customer_lifetime_sales(p_customer_id INT)
RETURNS DECIMAL
LANGUAGE sql
AS $$
   select coalesce(sum(grand_total), 0) as lifetime_sales
   from sales
   where customer_id = p_customer_id;
$$;


-- Constraint: Prevent negative stock
ALTER TABLE inventory ADD CONSTRAINT inventory_stock_check CHECK (current_stock >= 0);

