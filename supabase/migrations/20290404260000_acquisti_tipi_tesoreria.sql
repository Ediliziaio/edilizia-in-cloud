-- La traccia comune dei collegamenti riconosce anche i documenti della tesoreria (richiesta del titolare,
-- 15/11/2026): così incassi, giroconti e scadenze passano dalla stessa porta (acquisti_collegamento_registra)
-- con la stessa storia e lo stesso interruttore. Documento: docs/automazioni-acquisti.md §3.
--
-- Tipi nuovi, sulle stesse tabelle che usa bank_reconciliations:
--   fattura_emessa      → invoices
--   documento_fiscale   → documenti_fiscali (fatture emesse native)
--   scadenza            → scadenze
--   movimento_cassa     → movimenti_cassa_native
--   prima_nota          → prima_nota_entries
--   rata_fornitore      → rate_fornitori
--   rata_commessa       → order_installments (senza company_id: l'azienda è quella della commessa)
-- Solo la funzione cambia: nessun dato, nessun lock su tabelle.

create or replace function public.acquisti_documento_dell_azienda(p_tipo text, p_id uuid, p_company uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_tabella text; v_ok boolean;
begin
  if p_id is null or p_company is null then return false; end if;
  if p_tipo = 'rata_commessa' then
    return exists (select 1 from public.order_installments i join public.orders o on o.id = i.order_id
                    where i.id = p_id and o.company_id = p_company);
  end if;
  v_tabella := case p_tipo
    when 'fattura_ricevuta' then 'fatture_ricevute'
    when 'ddt' then 'ddt_ricezione'
    when 'riga_ddt' then 'ddt_righe'
    when 'ordine' then 'purchase_orders'
    when 'riga_ordine' then 'purchase_order_items'
    when 'commessa' then 'orders'
    when 'fase' then 'order_work_phases'
    when 'magazzino' then 'warehouses'
    when 'anagrafica' then 'suppliers'
    when 'contratto' then 'contratti_subappalto'
    when 'sal' then 'sal_subappaltatori'
    when 'rapportino' then 'campo_rapportini'
    when 'movimento_banca' then 'bank_transactions'
    when 'costo' then 'company_costs'
    when 'fattura_emessa' then 'invoices'
    when 'documento_fiscale' then 'documenti_fiscali'
    when 'scadenza' then 'scadenze'
    when 'movimento_cassa' then 'movimenti_cassa_native'
    when 'prima_nota' then 'prima_nota_entries'
    when 'rata_fornitore' then 'rate_fornitori'
  end;
  if v_tabella is null then return false; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_tabella) into v_ok using p_id, p_company;
  return coalesce(v_ok, false);
end $$;
revoke all on function public.acquisti_documento_dell_azienda(text, uuid, uuid) from public, anon, authenticated;
