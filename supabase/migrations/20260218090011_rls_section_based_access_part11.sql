-- ─────────────────────────────────────────────────────────────
-- SEZIONE CLIENTI  (can_view_customers / can_edit_customers)
-- ─────────────────────────────────────────────────────────────

-- profiles — lo staff che vede ordini deve poter leggere i profili
-- cliente (nome, telefono, indirizzo) collegati agli ordini
DROP POLICY IF EXISTS "Staff can view company profiles if permitted" ON public.profiles;
CREATE POLICY "Staff can view company profiles if permitted"
  ON public.profiles FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
