-- Conto economico: quante fatture ricevute non sono registrate come costo (15/11/2026)
--
-- I costi del conto economico arrivano dalle fatture ricevute solo dopo la
-- registrazione («Contabilizza»: nasce il costo in company_costs). Le altre non
-- ci sono, e la pagina non lo diceva. Nel 2025: Best Infissi 1.246.766 € di
-- imponibile su 1.512 fatture, costi del conto economico a zero e utile pari ai
-- ricavi; Innovasol 1.824.464 €; Dimora Torino 352.436 €.
--
-- `cg_ricavi_provenienza` (la nota sulla provenienza dei numeri del periodo)
-- restituisce adesso anche le fatture ricevute del periodo ancora da
-- registrare: numero e imponibile (le note di credito in meno). Non entrano
-- nei costi: una fattura può essere già stata inserita a mano come costo senza
-- collegarla, e contarla qui la conterebbe due volte. La pagina lo dice e
-- porta all'elenco da registrare.
-- Fuori dal conto: rifiutate, storico del gestionale di prima, autofatture e
-- integrazioni (reverse charge, TD16–TD21, TD26–TD28), che ripetono una
-- fattura già contata.
--
-- E il DPO degli Indici avanzati: quando lo Stato patrimoniale ha i debiti
-- verso fornitori a zero, ricalcolava dallo scadenzario contando anche i
-- rimborsi delle note di credito ai clienti (Innovasol 925.732 €), che dal
-- 20290330190000 stanno nei crediti. Ora li esclude.

create or replace function public.cg_ricavi_provenienza(
  p_company_id uuid default null,
  p_anno integer default (extract(year from current_date))::integer,
  p_mese_da integer default 1,
  p_mese_a integer default 12)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_company_id uuid;
  v_fatture_righe integer := 0;
  v_fatture_imponibile numeric(14,2) := 0;
  v_commesse_righe integer := 0;
  v_commesse_valore numeric(14,2) := 0;
  v_da_registrare_righe integer := 0;
  v_da_registrare_imponibile numeric(14,2) := 0;
begin
  perform public._cg_assert_lettura(p_company_id);
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if v_company_id is distinct from public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato: company_id non autorizzato';
  end if;

  select count(*), coalesce(sum(importo_imponibile), 0)
    into v_fatture_righe, v_fatture_imponibile
    from public.v_cg_ricavi_classificati
   where company_id = v_company_id
     and anno = p_anno
     and mese between p_mese_da and p_mese_a;

  select count(*), coalesce(sum(valore), 0)
    into v_commesse_righe, v_commesse_valore
    from public.v_cg_portafoglio_commesse
   where company_id = v_company_id
     and anno = p_anno
     and mese between p_mese_da and p_mese_a;

  -- Fatture ricevute del periodo non ancora registrate come costo.
  select count(*),
         coalesce(sum(case when fr.tipo_documento in ('TD04', 'passive_credit_note')
                           then -abs(coalesce(fr.imponibile_totale, 0))
                           else coalesce(fr.imponibile_totale, 0) end), 0)
    into v_da_registrare_righe, v_da_registrare_imponibile
    from public.fatture_ricevute fr
   where fr.company_id = v_company_id
     and fr.company_cost_id is null
     and coalesce(fr.stato, '') <> 'rifiutata'
     and coalesce(fr.storico_esterno, false) = false
     and fr.data_fattura >= make_date(p_anno, p_mese_da, 1)
     and fr.data_fattura < (make_date(p_anno, p_mese_a, 1) + interval '1 month')::date
     and coalesce(fr.tipo_documento, '') not in
         ('self_invoice', 'TD16', 'TD17', 'TD18', 'TD19', 'TD20', 'TD21', 'TD26', 'TD27', 'TD28');

  return jsonb_build_object(
    'anno', p_anno,
    'mese_da', p_mese_da,
    'mese_a', p_mese_a,
    'fatture_righe', v_fatture_righe,
    'fatture_imponibile', v_fatture_imponibile,
    'commesse_righe', v_commesse_righe,
    'commesse_valore', v_commesse_valore,
    'costi_da_registrare_righe', v_da_registrare_righe,
    'costi_da_registrare_imponibile', v_da_registrare_imponibile
  );
end;
$function$;
revoke all on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) from public, anon;
grant execute on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) to authenticated, service_role;

create or replace function public.cg_debiti_fornitori_aperti(p_company_id uuid)
returns numeric language sql stable security definer set search_path to 'public' as $function$
  select coalesce(sum(greatest(s.amount - coalesce(s.paid_amount, 0), 0)), 0)
  from public.scadenze s
  where s.company_id = p_company_id
    and s.direction = 'uscita'
    and s.tipo in ('pagamento_fornitore', 'costo_aziendale')
    and coalesce(s.is_previsionale, false) = false
    -- Rimborsi di note di credito ai clienti: non sono debiti verso fornitori.
    and s.invoice_id is null
    and lower(coalesce(s.status, '')) in ('da_pagare', 'parziale', 'scaduta', 'pending', 'partial', 'unpaid', 'overdue');
$function$;
revoke all on function public.cg_debiti_fornitori_aperti(uuid) from public, anon, authenticated;
grant execute on function public.cg_debiti_fornitori_aperti(uuid) to service_role;
