-- Fatturazione e tesoreria allineate: nessuna fattura aperta senza scadenza di incasso (15/11/2026)
--
-- Controllo di quadratura del 15/11: dove una fattura emessa ha le sue scadenze,
-- residuo della fattura e scadenzario coincidono al centesimo (Demo 2: 497 su
-- 497). Ma 47 fatture aperte non avevano alcuna scadenza: lo Stato
-- patrimoniale le contava tra i crediti, la Tesoreria e la previsione di cassa
-- no. EDILIZIA SCAVOLO: 26 fatture, 2.018.443 €, arrivate il 09/11 col solo
-- totale e senza data di scadenza; il trigger che crea la scadenza usciva
-- subito se la data mancava. Demo 2: 21 fatture di prova inserite senza
-- passare dal trigger.
--
-- 1. auto_create_scadenza_from_invoice: senza data di scadenza usa la data
--    della fattura più 30 giorni (il termine di legge quando non è pattuito,
--    D.Lgs. 231/2002), invece di non creare niente.
-- 2. Le scadenze mancanti si creano adesso, una per fattura aperta (residuo
--    > 0, non storico, non annullata, non nota di credito), con l'incassato
--    già registrato sulla fattura. Sono segnate come già avvisate
--    (alert_sent_at): non devono partire decine di promemoria di scaduto in
--    un colpo.
-- 3. cg_ricavi_provenienza dice anche quante fatture del periodo hanno il
--    solo totale (imponibile e IVA vuoti): il conto economico le conta IVA
--    compresa. Impresa Vulcano 2025: 273 fatture, 3.289.028 €.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $p$
declare
  vecchio text := pg_get_functiondef('public.auto_create_scadenza_from_invoice()'::regprocedure);
  nuovo text := vecchio;
begin
  if position('NEW.issue_date + 30' in nuovo) > 0 then
    return;
  end if;
  nuovo := replace(nuovo, $a$  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;$a$, $b$  -- Senza data di scadenza: 30 giorni dalla fattura (termine di legge), non nessuna scadenza.
  IF COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;$b$);
  nuovo := replace(nuovo, $a$          due_date = NEW.due_date,$a$,
                          $b$          due_date = COALESCE(NEW.due_date, NEW.issue_date + 30, due_date),$b$);
  nuovo := replace(nuovo, $a$    COALESCE(NEW.total, 0), NEW.due_date,$a$,
                          $b$    COALESCE(NEW.total, 0), COALESCE(NEW.due_date, NEW.issue_date + 30, current_date + 30),$b$);
  if (length(nuovo) - length(replace(nuovo, 'NEW.issue_date + 30', ''))) / length('NEW.issue_date + 30') <> 2
     or position('IF NEW.due_date IS NULL OR' in nuovo) > 0 then
    raise exception 'auto_create_scadenza_from_invoice: blocchi da cambiare non trovati, la funzione è cambiata';
  end if;
  execute nuovo;
end $p$;

insert into public.scadenze (
  company_id, tipo, description, amount, due_date, invoice_id, order_id, status, paid_amount,
  is_auto_generated, auto_source, alert_days_before, alert_sent_at, notes)
select i.company_id, 'incasso_cliente',
       'Fattura ' || coalesce(i.invoice_number, '') || ' - ' || coalesce(i.client_company_name, ''),
       i.total, coalesce(i.due_date, i.issue_date + 30, current_date + 30), i.id, i.order_id,
       case when coalesce(i.paid_amount, 0) > 0 then 'parziale' else 'da_pagare' end,
       least(coalesce(i.paid_amount, 0), i.total),
       true, 'invoice', 7, now(),
       case when i.due_date is null then 'Scadenza non indicata sulla fattura: 30 giorni dalla data.' end
  from public.invoices i
 where i.deleted_at is null
   and i.document_type = 'invoice'
   and i.status not in ('cancelled', 'draft', 'paid', 'credited')
   and coalesce(i.storico_esterno, false) = false
   and coalesce(i.total, 0) > 0
   and i.total - coalesce(i.paid_amount, 0) > 0.5
   and not exists (select 1 from public.scadenze s where s.invoice_id = i.id);

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
  v_senza_imponibile_righe integer := 0;
  v_senza_imponibile_totale numeric(14,2) := 0;
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

  -- Fatture emesse arrivate col solo totale (imponibile e IVA vuoti): il ricavo
  -- è il totale, IVA compresa, perché l'aliquota non si conosce.
  select count(*), coalesce(sum(f.segno * f.imponibile), 0)
    into v_senza_imponibile_righe, v_senza_imponibile_totale
    from public.v_cg_fatture_emesse f
    join public.invoices i on i.id = f.id
   where f.company_id = v_company_id and f.origine = 'invoices'
     and extract(year from f.data) = p_anno
     and extract(month from f.data) between p_mese_da and p_mese_a
     and coalesce(i.subtotal, 0) = 0 and coalesce(i.tax_amount, 0) = 0 and coalesce(i.total, 0) <> 0;

  return jsonb_build_object(
    'anno', p_anno,
    'mese_da', p_mese_da,
    'mese_a', p_mese_a,
    'fatture_righe', v_fatture_righe,
    'fatture_imponibile', v_fatture_imponibile,
    'commesse_righe', v_commesse_righe,
    'commesse_valore', v_commesse_valore,
    'costi_da_registrare_righe', v_da_registrare_righe,
    'costi_da_registrare_imponibile', v_da_registrare_imponibile,
    'fatture_senza_imponibile_righe', v_senza_imponibile_righe,
    'fatture_senza_imponibile_totale', v_senza_imponibile_totale
  );
end;
$function$;
revoke all on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) from public, anon;
grant execute on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) to authenticated, service_role;
