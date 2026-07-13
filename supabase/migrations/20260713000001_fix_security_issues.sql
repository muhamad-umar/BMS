-- FIX 1: Lock down sale_items cogs and isolate row access securely without breaking PostgREST relationships
-- We create a secure view that excludes 'cogs' and enforces row visibility, 
-- then revoke direct table access from authenticated users.

CREATE OR REPLACE VIEW public.sale_items_view AS 
SELECT sale_item_id, sale_id, product_id, quantity, unit_price, line_total 
FROM public.sale_items
WHERE 
  (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'owner'
  OR 
  (SELECT created_by FROM sales WHERE sales.sale_id = sale_items.sale_id) = auth.uid();

-- The view executes as security definer (postgres), bypassing base table restrictions.
ALTER VIEW public.sale_items_view SET (security_invoker = false);

-- Revoke all access to base table for authenticated users to protect 'cogs'
REVOKE SELECT ON public.sale_items FROM PUBLIC, authenticated, anon;

-- Grant access only to the secure view
GRANT SELECT ON public.sale_items_view TO authenticated;
GRANT SELECT ON public.sale_items_view TO anon;


-- FIX 2: Set search_path on get_employee_activity_summary to prevent search path injection
ALTER FUNCTION public.get_employee_activity_summary(p_start date, p_end date) SET search_path = public;
