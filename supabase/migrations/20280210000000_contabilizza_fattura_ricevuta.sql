-- "Contabilizza" adesso contabilizza davvero.
--
-- Finora il bottone scriveva SOLO l'etichetta stato='contabilizzata': nessun
-- costo, nessuna scadenza, niente in tesoreria. Il KPI "Contabilizzate"
-- misurava un'etichetta, e la fattura del fornitore restava fuori dai conti.
--
-- Regola d'oro anti doppio-conteggio: se la fattura è agganciata a un ODA che
-- ha GIÀ prodotto un costo alla ricezione (trigger 20280117), NON se ne crea
-- un secondo — si CORREGGE quello, perché il costo da ricezione è una stima
-- presa dall'ordine mentre la fattura è il documento vero. Altrimenti il
-- costo nasce ora.
--
-- Convenzione rispettata: company_costs.amount è SEMPRE l'imponibile, l'IVA
-- sta in vat_rate (vedi Registro IVA e Prima Nota).

alter table public.fatture_ricevute
  add column if not exists company_cost_id uuid references public.company_costs(id) on delete set null;

comment on column public.fatture_ricevute.company_cost_id is
  'Costo generato (o corretto) contabilizzando questa fattura. Serve a rendere l''operazione ripetibile senza duplicare e a tornare indietro.';

create or replace function public.contabilizza_fattura_ricevuta(p_fattura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  f              record;
  v_costo_esist_id uuid;   -- niente record: leggerne un campo prima di assegnarlo fa esplodere PL/pgSQL
  v_supplier_id  uuid;
  v_imponibile   numeric;
  v_vat          numeric;
  v_cost_id      uuid;
  v_esito        text;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then
    raise exception 'Fattura non trovata';
  end if;
  perform public.assert_company_access(f.company_id);

  -- Già fatta: rispondere due volte la stessa cosa è meglio che raddoppiare i costi.
  if f.stato = 'contabilizzata' and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  -- L'imponibile: dal campo, oppure ricavato (totale - IVA). Mai inventato:
  -- le fatture importate dal cassetto SDI senza importi vanno completate prima.
  v_imponibile := coalesce(
    f.imponibile_totale,
    case when f.totale_documento is not null and f.iva_totale is not null
         then f.totale_documento - f.iva_totale end
  );
  if v_imponibile is null or v_imponibile <= 0 then
    raise exception 'Questa fattura non ha importi: senza imponibile il costo sarebbe zero. Apri l''XML o completa i dati prima di contabilizzare.';
  end if;

  -- Aliquota calcolata dai valori reali. Se l'IVA è zero (reverse charge,
  -- esente, fuori campo) l'aliquota è zero: nessun 22% di default.
  v_vat := case
             when f.iva_totale is not null and v_imponibile > 0
               then round(f.iva_totale / v_imponibile * 100)
             else null
           end;

  -- Fornitore per partita IVA, solo dentro l'azienda. Se non è in anagrafica
  -- il costo nasce comunque, senza fornitore: meglio un costo orfano che un
  -- fornitore sbagliato.
  select s.id into v_supplier_id
  from public.suppliers s
  where s.company_id = f.company_id
    and s.vat_number is not null
    and regexp_replace(s.vat_number, '\D', '', 'g') = regexp_replace(coalesce(f.cedente_piva, ''), '\D', '', 'g')
    and regexp_replace(coalesce(f.cedente_piva, ''), '\D', '', 'g') <> ''
  limit 1;

  -- C'è già il costo nato dalla ricezione dell'ordine? Allora si corregge.
  if f.purchase_order_id is not null then
    select id into v_costo_esist_id
    from public.company_costs
    where purchase_order_id = f.purchase_order_id
      and company_id = f.company_id
    limit 1;
  end if;

  if v_costo_esist_id is not null then
    update public.company_costs
       set amount      = v_imponibile,
           vat_rate    = coalesce(v_vat, vat_rate),
           supplier_id = coalesce(supplier_id, v_supplier_id),
           notes       = coalesce(notes || ' · ', '')
                         || 'Importo confermato dalla fattura ' || coalesce(f.numero_fattura, '')
                         || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at  = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_aggiornato';
  else
    insert into public.company_costs (
      company_id, supplier_id, purchase_order_id,
      name, cost_type, amount, vat_rate, category, recurrence,
      due_date, is_paid, notes
    ) values (
      f.company_id, v_supplier_id, f.purchase_order_id,
      'Fattura ' || coalesce(f.numero_fattura, 's/n') || ' - ' || coalesce(f.cedente_ragione_sociale, 'Fornitore'),
      'variable', v_imponibile, v_vat,
      coalesce(nullif(f.categoria_ai, ''), 'materiali'), 'once',
      -- Nessuna data di scadenza inventata: senza i termini di pagamento la
      -- scadenza è la data della fattura, dichiarata nelle note.
      f.data_fattura, false,
      'Generato contabilizzando la fattura ricevuta ' || coalesce(f.numero_fattura, '')
    )
    returning id into v_cost_id;
    v_esito := 'costo_creato';
  end if;

  update public.fatture_ricevute
     set stato           = 'contabilizzata',
         company_cost_id = v_cost_id,
         updated_at      = now()
   where id = f.id;

  return jsonb_build_object(
    'esito', v_esito,
    'company_cost_id', v_cost_id,
    'imponibile', v_imponibile,
    'aliquota', v_vat,
    'fornitore_riconosciuto', v_supplier_id is not null
  );
end $$;

revoke all on function public.contabilizza_fattura_ricevuta(uuid) from public;
grant execute on function public.contabilizza_fattura_ricevuta(uuid) to authenticated;

comment on function public.contabilizza_fattura_ricevuta(uuid) is
  'Contabilizza una fattura ricevuta: crea il costo (imponibile in amount, IVA in vat_rate) oppure CORREGGE quello già nato dalla ricezione dell''ODA collegato, senza mai duplicarlo. Idempotente.';
