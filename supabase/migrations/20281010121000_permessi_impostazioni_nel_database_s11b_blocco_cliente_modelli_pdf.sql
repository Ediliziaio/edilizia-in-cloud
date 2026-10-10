-- Permessi delle Impostazioni nel database — il cliente del portale non crea righe nelle tabelle interne (2/3: modelli PDF e impostazioni di modulo)
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Una policy RESTRICTIVE di sola INSERT (blocco_cliente_esterno_inserimento) vieta la creazione di righe al cliente del portale
-- (utente_e_cliente_esterno()) nelle tabelle interne. Le funzioni SECURITY DEFINER e il service role non passano dalla RLS.
-- Il portale clienti non scrive in queste tabelle (il test di contratto lo controlla).

set local lock_timeout = '3s';

do $b$
declare t text;
begin
  foreach t in array array[
    'bgn_template_pdf', 'clm_template_pdf', 'ele_template_pdf', 'fv_template_pdf', 'idr_template_pdf',
    'pav_template_pdf', 'pis_template_pdf', 'rst_template_pdf', 'tet_template_pdf', 'company_modulo_preferenze',
    'company_sales_profile', 'fv_progetti', 'warehouse_sections'
  ] loop
    execute format('drop policy if exists blocco_cliente_esterno_inserimento on public.%I', t);
    execute format('create policy blocco_cliente_esterno_inserimento on public.%I as restrictive for insert to authenticated with check (not (select public.utente_e_cliente_esterno()))', t);
  end loop;
end
$b$;
