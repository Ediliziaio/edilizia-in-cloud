-- ─────────────────────────────────────────────────────────────
-- SEZIONE SQUADRE ESTERNE  (visibile via can_view_orders)
-- ─────────────────────────────────────────────────────────────

-- external_teams — lista squadre (necessaria nei dettagli ordine)
CREATE POLICY "Staff can view external teams if permitted"
  ON public.external_teams FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
