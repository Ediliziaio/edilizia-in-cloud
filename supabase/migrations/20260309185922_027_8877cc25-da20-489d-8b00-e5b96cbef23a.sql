-- =============================================
-- 2F. FUNZIONE: Crea OdA da ordine cliente
-- =============================================
CREATE OR REPLACE FUNCTION public.create_oda_from_order(
  p_order_id UUID,
  p_supplier_id UUID,
  p_company_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oda_id UUID;
  v_oda_number TEXT;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND company_id = p_company_id)
     AND NOT has_role(p_user_id, 'super_admin') THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;
  
  -- Generate OdA number
  v_oda_number := generate_oda_number(p_company_id);
  
  -- Create purchase order
  INSERT INTO purchase_orders (
    company_id, supplier_id, oda_number, order_id, 
    payment_terms, created_by
  ) VALUES (
    p_company_id, p_supplier_id, v_oda_number, p_order_id,
    (SELECT payment_method FROM suppliers WHERE id = p_supplier_id),
    p_user_id
  ) RETURNING id INTO v_oda_id;
  
  -- Copy order items to purchase order items
  INSERT INTO purchase_order_items (
    company_id, purchase_order_id, description, sku, unit_of_measure,
    quantity, unit_price, vat_rate, sort_order, article_template_id
  )
  SELECT
    p_company_id,
    v_oda_id,
    oi.name,
    at.sku,
    COALESCE(oi.unit_of_measure, 'pz'),
    oi.quantity,
    COALESCE(at.standard_cost, oi.unit_price),
    COALESCE(oi.vat_rate, 22),
    oi.sort_order,
    oi.article_template_id
  FROM order_items oi
  LEFT JOIN article_templates at ON at.id = oi.article_template_id
  WHERE oi.order_id = p_order_id;
  
  RETURN v_oda_id;
END;
$$;
