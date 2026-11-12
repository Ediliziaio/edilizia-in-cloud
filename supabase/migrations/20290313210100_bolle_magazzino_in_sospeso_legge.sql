-- Bolle dal telefono: chi registra una bolla «magazzino senza magazzino» la rilegge (12/11/2026).
-- Separata da 20290313210000 perché CREATE POLICY blocca le tabelle di auth (supautils):
-- si applica fuori dalla fascia 07:00-09:30 UTC, breve e con lock_timeout.
set local lock_timeout = '3s';

-- ─── 4. Chi registra una bolla «magazzino senza magazzino» la rilegge ─────────
drop policy if exists ddt_ricezione_magazzino_in_sospeso_legge on public.ddt_ricezione;
create policy ddt_ricezione_magazzino_in_sospeso_legge on public.ddt_ricezione
  for select to authenticated
  using (
    warehouse_id is null and destinazione = 'magazzino'
    and company_id = public.get_my_company_id()
    and not public.utente_e_cliente_esterno()
    and (created_by = (select auth.uid())
         or company_id = any(public.aziende_con_permesso('can_edit_warehouse'::text)))
  );
