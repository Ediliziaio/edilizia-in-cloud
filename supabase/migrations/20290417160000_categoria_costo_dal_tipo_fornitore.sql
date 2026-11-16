-- ════════════════════════════════════════════════════════════════════════════
-- La categoria del costo viene dal TIPO del fornitore
-- ════════════════════════════════════════════════════════════════════════════
-- Dal 30/10/2026 un fornitore ha un tipo fra otto (materiali, subappalto,
-- noli_servizi, professionisti, mezzi, agenti, generali, finanza_enti):
-- «TIM, il grossista di materiali e la ditta in subappalto non sono la stessa
-- cosa». Il tipo però non arrivava fino al costo: contabilizzare una fattura
-- scriveva `coalesce(categoria_ai, 'materiali')`, e siccome l'AI non classifica
-- quasi mai (17 fatture su 14.829 ancora da contabilizzare), in pratica
-- scriveva sempre «materiali».
--
-- Su Impresa Vulcano questo faceva 791.140,67 € di subappalti registrati come
-- merce da magazzino: il controllo di gestione vedeva un'impresa che compra
-- solo materiale e non dà via niente in subappalto.
--
-- Ordine nuovo: tipo del fornitore → categoria dell'AI → 'materiali'.
-- Il tipo lo sceglie una persona, la categoria dell'AI è una proposta; e il
-- tipo parla il vocabolario delle otto famiglie, mentre l'AI ne usa un altro
-- («subappalti», «consulenze_professionali», «trasporti»), che è il motivo per
-- cui `company_costs.category` era scritta in grafie diverse.
--
-- Cambia SOLO il ramo che CREA il costo. Il ramo che aggiorna un costo già
-- nato da un ordine non tocca la categoria, come prima: lì l'ha scelta chi ha
-- fatto l'ordine.
--
-- Idempotente: CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.contabilizza_fattura_ricevuta(p_fattura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f                record;
  v_costo_esist_id uuid;
  v_costo_gia_fatt boolean := false;
  v_nota_credito   boolean;
  v_supplier_id    uuid;
  v_tipo_forn      text;
  v_order_id       uuid;
  v_imponibile     numeric;
  v_vat            numeric;
  v_cost_id        uuid;
  v_esito          text;
  v_piano          jsonb;
  v_divisa         boolean;
  v_elenco         text;
  q                record;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then
    raise exception 'Fattura non trovata';
  end if;
  perform public.assert_company_access(f.company_id);

  if f.stato = 'contabilizzata' and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  v_nota_credito := coalesce(f.tipo_documento, '') in ('TD04', 'TD08', 'passive_credit_note');
  if v_nota_credito and (f.company_cost_id is not null or exists (select 1 from public.note_credito_storni s where s.nota_id = f.id)) then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  v_divisa := not v_nota_credito
              and exists (select 1 from public.fattura_ricevuta_ordini where fattura_id = f.id);

  v_imponibile := abs(coalesce(
    f.imponibile_totale,
    case when f.totale_documento is not null and f.iva_totale is not null
         then f.totale_documento - f.iva_totale end
  ));
  if v_imponibile is null or v_imponibile <= 0 then
    raise exception 'Questa fattura non ha importi: senza imponibile il costo sarebbe zero. Apri l''XML o completa i dati prima di contabilizzare.';
  end if;

  v_vat := case
             when f.iva_totale is not null and v_imponibile > 0
               then round(abs(f.iva_totale) / v_imponibile * 100)
             else null
           end;

  if f.fornitore_id is not null then
    select s.id into v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and s.id=f.fornitore_id
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    if not found then raise exception 'Il fornitore confermato non è più coerente con la fattura: verifica il collegamento';end if;
  else
    begin
      select s.id into strict v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and
        ((public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)=public.partner_tax_key(f.cedente_piva))
        or(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)=public.partner_tax_key(f.cedente_cf)))
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    exception when no_data_found then v_supplier_id:=null;
      when too_many_rows then raise exception 'Più fornitori hanno gli stessi identificativi: conferma il collegamento prima di contabilizzare';
    end;
  end if;

  -- Il tipo del fornitore e' la classificazione scelta da una persona: viene
  -- prima della categoria indovinata dall'AI, e soprattutto prima del vecchio
  -- 'materiali' fisso, che faceva risultare subappalti e noli come merce.
  if v_supplier_id is not null then
    select nullif(btrim(s.tipo), '') into v_tipo_forn
      from public.suppliers s where s.id = v_supplier_id;
  end if;

  if f.purchase_order_id is not null and not v_divisa then
    select po.order_id into v_order_id
    from public.purchase_orders po
    where po.id = f.purchase_order_id and po.company_id = f.company_id;

    select c.id into v_costo_esist_id
    from public.company_costs c
    where c.purchase_order_id = f.purchase_order_id
      and c.company_id = f.company_id
    order by c.created_at
    limit 1;

    if v_costo_esist_id is not null then
      v_costo_gia_fatt := exists (
        select 1 from public.fatture_ricevute fr
         where fr.company_cost_id = v_costo_esist_id and fr.id <> f.id
           and coalesce(fr.tipo_documento, '') not in ('TD04', 'TD08', 'passive_credit_note'));
    end if;
  end if;

  if v_nota_credito then
    if v_costo_esist_id is null then
      raise exception 'Una nota di credito riduce il debito di una fattura: scegli la fattura che storna con «Collega alla fattura» (o l''ordine che rettifica).';
    end if;
    if v_imponibile > (select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id) + 0.01 then
      raise exception 'La nota di credito (% € imponibile) supera il costo dell''ordine che rettifica (% €): controlla gli importi o l''ordine collegato.',
        replace(to_char(v_imponibile, 'FM999999990.00'), '.', ','),
        replace(to_char((select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id), 'FM999999990.00'), '.', ',');
    end if;
    update public.company_costs
       set amount     = greatest(0, coalesce(amount, 0) - v_imponibile),
           notes      = coalesce(notes || ' · ', '')
                        || 'Ridotto di ' || replace(to_char(v_imponibile, 'FM999999990.00'), '.', ',')
                        || ' € dalla nota di credito ' || coalesce(f.numero_fattura, '')
                        || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_ridotto';
  elsif v_costo_esist_id is not null and not v_costo_gia_fatt then
    update public.company_costs
       set amount      = greatest(0, v_imponibile - coalesce((
                           select sum(abs(coalesce(fr.imponibile_totale, fr.totale_documento - fr.iva_totale, 0)))
                             from public.fatture_ricevute fr
                            where fr.company_cost_id = v_costo_esist_id and fr.id <> f.id
                              and coalesce(fr.tipo_documento, '') in ('TD04', 'TD08', 'passive_credit_note')), 0)),
           vat_rate    = coalesce(v_vat, vat_rate),
           supplier_id = coalesce(supplier_id, v_supplier_id),
           order_id    = coalesce(order_id, v_order_id),
           notes       = coalesce(notes || ' · ', '')
                         || 'Importo confermato dalla fattura ' || coalesce(f.numero_fattura, '')
                         || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at  = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_aggiornato';
  else
    if v_divisa then
      select string_agg(po.oda_number || ' ' || replace(to_char(q2.importo, 'FM999999990.00'), '.', ',') || ' €', ', '
                        order by po.oda_number)
        into v_elenco
        from public.fattura_ricevuta_ordini q2
        join public.purchase_orders po on po.id = q2.purchase_order_id
       where q2.fattura_id = f.id;
    end if;
    v_piano := public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura);
    insert into public.company_costs (
      company_id, supplier_id, purchase_order_id, order_id,
      name, cost_type, amount, vat_rate, category, recurrence,
      due_date, is_paid, notes, payment_method
    ) values (
      f.company_id, v_supplier_id, case when v_divisa then null else f.purchase_order_id end, v_order_id,
      'Fattura ' || coalesce(f.numero_fattura, 's/n') || ' - ' || coalesce(f.cedente_ragione_sociale, 'Fornitore'),
      'variable', v_imponibile, v_vat,
      coalesce(v_tipo_forn, nullif(f.categoria_ai, ''), 'materiali'), 'once',
      (v_piano->>'scadenza')::date, false,
      'Generato contabilizzando la fattura ricevuta ' || coalesce(f.numero_fattura, '')
        || case when v_divisa then ' · divisa tra gli ordini ' || v_elenco else '' end
        || coalesce(v_piano->>'nota', ''),
      v_piano->>'metodo'
    )
    returning id into v_cost_id;
    v_esito := 'costo_creato';

    if v_divisa then
      for q in
        select q2.purchase_order_id, q2.importo, po.oda_number, po.order_id,
               (select c.id from public.company_costs c
                 where c.purchase_order_id = q2.purchase_order_id and c.company_id = f.company_id
                   and not exists (select 1 from public.fatture_ricevute fr
                                    where fr.company_cost_id = c.id
                                      and coalesce(fr.tipo_documento, '') not in ('TD04', 'TD08', 'passive_credit_note'))
                 order by c.created_at limit 1) as costo_ricezione
          from public.fattura_ricevuta_ordini q2
          join public.purchase_orders po on po.id = q2.purchase_order_id
         where q2.fattura_id = f.id
      loop
        if q.costo_ricezione is not null then
          update public.company_costs
             set amount = greatest(0, coalesce(amount, 0) - q.importo),
                 notes  = coalesce(notes || ' · ', '')
                          || 'Ridotto di ' || replace(to_char(q.importo, 'FM999999990.00'), '.', ',')
                          || ' € fatturati nella fattura ' || coalesce(f.numero_fattura, '')
                          || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY') || ' (divisa tra più ordini)',
                 updated_at = now()
           where id = q.costo_ricezione;
        end if;
      end loop;
    end if;
  end if;

  update public.fatture_ricevute
     set stato           = 'contabilizzata',
         company_cost_id = v_cost_id,
         updated_at      = now()
   where id = f.id;

  if v_divisa then
    for q in
      select distinct po.order_id
        from public.fattura_ricevuta_ordini q2
        join public.purchase_orders po on po.id = q2.purchase_order_id
       where q2.fattura_id = f.id and po.order_id is not null
    loop
      perform public.ordine_margine_valuta(q.order_id, 'una fattura divisa tra più ordini');
    end loop;
  end if;

  return jsonb_build_object(
    'esito', v_esito,
    'company_cost_id', v_cost_id,
    'imponibile', case when v_nota_credito then -v_imponibile else v_imponibile end,
    'aliquota', v_vat,
    'fornitore_riconosciuto', v_supplier_id is not null,
    'commessa_collegata', v_order_id is not null or v_divisa,
    'ordini', case when v_divisa then (select count(*) from public.fattura_ricevuta_ordini where fattura_id = f.id) end
  );
end $function$
