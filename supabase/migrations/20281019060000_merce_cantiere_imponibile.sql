-- Merce presa dal cantiere: il totale dello scontrino è IVA inclusa (19/10/2026).
-- company_costs.amount è l'imponibile (l'IVA si aggiunge con vat_rate), quindi lo si
-- scorpora: uno scontrino da 122 € diventa 100 € + IVA 22%, non 122 € + IVA.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_acquisto_verifica(p_id uuid, p_azione text, p_totale numeric DEFAULT NULL::numeric, p_purchase_order_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.campo_acquisti;
  v_uid uuid := auth.uid();
  v_importo numeric;
  v_po uuid;
  v_cost uuid;
  v_nome_op text;
  v_codice text;
  v_msg text;
  v_forn text;
begin
  select * into a from public.campo_acquisti where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Acquisto non trovato.';
  end if;
  if v_uid is null or not public.campo_e_ufficio(a.company_id) then
    raise exception using errcode = 'P0001', message = 'Solo l''ufficio può verificare la merce presa in negozio.';
  end if;
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome_op from public.profiles where id = a.user_id;
  select order_code into v_codice from public.orders where id = a.order_id;
  v_forn := coalesce(nullif(btrim(coalesce(a.fornitore, '')), ''), 'negozio');

  if p_azione = 'rifiuta' then
    if a.stato <> 'da_verificare' then
      raise exception using errcode = 'P0001', message = 'Questo acquisto è già stato verificato.';
    end if;
    update public.campo_acquisti
       set stato = 'rifiutato', rimborso_stato = 'non_dovuto', verificato_da = v_uid, verificato_at = now(),
           motivo_rifiuto = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
     where id = p_id;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Merce non accettata',
      'L''ufficio non ha accettato il documento di ' || v_forn || coalesce(' del cantiere ' || v_codice, '') || '.'
        || coalesce(' Motivo: ' || nullif(btrim(coalesce(p_motivo, '')), ''), ''),
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'rifiutato');

  elsif p_azione = 'registra' then
    if a.stato <> 'da_verificare' then
      raise exception using errcode = 'P0001', message = 'Questo acquisto è già stato verificato.';
    end if;
    v_importo := coalesce(p_totale, a.totale);
    v_po := coalesce(p_purchase_order_id, a.purchase_order_id);
    if v_po is not null and not exists (select 1 from public.purchase_orders where id = v_po and company_id = a.company_id) then
      raise exception using errcode = 'P0001', message = 'L''ordine d''acquisto scelto non è di questa azienda.';
    end if;

    if v_po is not null then
      update public.campo_acquisti
         set stato = 'registrato', purchase_order_id = v_po, verificato_da = v_uid, verificato_at = now(),
             totale = coalesce(p_totale, totale)
       where id = p_id;
      v_msg := 'Collegata all''ordine d''acquisto: il costo è già lì. Registra l''arrivo della merce dall''ordine per caricarla a magazzino.';
    else
      if coalesce(v_importo, 0) <= 0 then
        raise exception using errcode = 'P0001', message = 'Indica il totale per registrare la spesa.';
      end if;
      insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date, is_paid, category,
                                        notes, order_id, vat_rate, supplier_id, trigger_evento)
      values (a.company_id,
              case when a.modalita = 'pagato_da_me'
                   then 'Rimborso a ' || coalesce(v_nome_op, 'operaio') || ' — acquisto ' || v_forn
                   else 'Acquisto ' || v_forn end
                || coalesce(' n. ' || nullif(btrim(coalesce(a.numero_documento, '')), ''), ''),
              -- Il totale del documento è IVA inclusa: amount è l'imponibile.
              'variable', round(v_importo / 1.22, 2), 'once',
              case when a.modalita = 'pagato_da_me' then (now() at time zone 'Europe/Rome')::date
                   else coalesce(a.data_documento, a.giorno) + 30 end,
              false, 'materiali_edili',
              'Merce presa in negozio da ' || coalesce(v_nome_op, 'un operaio') || ' per ' || coalesce(v_codice, 'il cantiere')
                || ' · totale del documento ' || replace(to_char(v_importo, 'FM9999990.00'), '.', ',') || ' € IVA inclusa'
                || case a.modalita when 'pagato_da_me' then ' · pagata dall''operaio, da rimborsare'
                                   when 'conto_azienda' then ' · addebitata sul conto aziendale'
                                   else ' · ritiro senza ordine d''acquisto collegato' end,
              a.order_id, 22, a.supplier_id, 'data_fissa')
      returning id into v_cost;
      update public.campo_acquisti
         set stato = 'registrato', company_cost_id = v_cost, verificato_da = v_uid, verificato_at = now(),
             totale = v_importo
       where id = p_id;
      v_msg := case a.modalita
                 when 'pagato_da_me' then 'Registrato come costo del cantiere. Il rimborso a ' || coalesce(v_nome_op, 'l''operaio') || ' è nello scadenzario.'
                 when 'conto_azienda' then 'Registrato come costo del cantiere, da pagare entro 30 giorni.'
                 else 'Nessun ordine d''acquisto collegato: registrato come costo diretto del cantiere.' end;
    end if;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Merce registrata',
      'L''ufficio ha registrato il documento di ' || v_forn || coalesce(' del cantiere ' || v_codice, '') || '.'
        || case when a.modalita = 'pagato_da_me' then ' Il rimborso è in programma.' else '' end,
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'registrato', 'messaggio', v_msg, 'company_cost_id', v_cost, 'purchase_order_id', v_po);

  elsif p_azione = 'rimborsato' then
    if a.stato <> 'registrato' or a.rimborso_stato <> 'da_rimborsare' then
      raise exception using errcode = 'P0001', message = 'Non c''è un rimborso da segnare per questo acquisto.';
    end if;
    update public.campo_acquisti set rimborso_stato = 'rimborsato' where id = p_id;
    if a.company_cost_id is not null then
      update public.company_costs set is_paid = true, paid_date = (now() at time zone 'Europe/Rome')::date where id = a.company_cost_id;
    end if;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Rimborso fatto',
      'Ti hanno rimborsato la spesa da ' || v_forn || coalesce(' (' || replace(to_char(a.totale, 'FM9999990.00'), '.', ',') || ' €)', '') || '.',
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'registrato', 'rimborso', 'rimborsato');
  end if;

  raise exception using errcode = 'P0001', message = 'Azione non riconosciuta.';
end;
$function$;
