-- =============================================================
-- RLS: accesso basato su sezione per ruoli company_staff,
--      employee e salesperson
--
-- Problema: il frontend usa usePermissions() per nascondere/mostrare
-- sezioni, ma il DB non applicava le stesse regole — staff con
-- can_view_orders otteneva risultati vuoti perché mancavano
-- policy RLS sulla tabella orders e su molte tabelle correlate.
--
-- Questo file aggiunge le policy mancanti mantenendo il principio:
--   company_admin / super_admin  → has_permission() ritorna sempre true
--   company_staff               → verifica la colonna in staff_permissions
--   salesperson                 → può vedere i propri ordini assegnati
--   employee                    → può vedere gli ordini a cui è assegnato
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- SEZIONE ORDINI  (can_view_orders / can_edit_orders)
-- ─────────────────────────────────────────────────────────────

-- 1. orders — il gap più critico: staff non vedeva nessun ordine
CREATE POLICY "Staff can view their company orders"
  ON public.orders FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
