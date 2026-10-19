-- Quindicesimo controllo (19/10/2026).
--
-- Fatture ricevute → costi
--  1. La seconda fattura sullo stesso ordine al fornitore (acconto + saldo) crea il suo costo: prima
--     sovrascriveva il costo dell'ordine con il proprio importo e il debito verso il fornitore spariva.
--  2. Una nota di credito del fornitore riduce il costo dell'ordine a cui è collegata (mai sotto zero);
--     se non è collegata a un ordine si chiede di collegarla: prima creava un costo positivo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.contabilizza_fattura_ricevuta(p_fattura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f                record;
  v_costo_esist_id uuid;
  v_costo_gia_fatt boolean := false;  -- il costo dell'ordine è già stato confermato da un'altra fattura
  v_nota_credito   boolean;
  v_supplier_id    uuid;
  v_order_id       uuid;   -- la commessa, presa dall'ODA collegato
  v_imponibile     numeric;
  v_vat            numeric;
  v_cost_id        uuid;
  v_esito          text;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then
    raise exception 'Fattura non trovata';
  end if;
  perform public.assert_company_access(f.company_id);

  if f.stato = 'contabilizzata' and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  v_nota_credito := coalesce(f.tipo_documento, '') in ('TD04', 'passive_credit_note');

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

  select s.id into v_supplier_id
  from public.suppliers s
  where s.company_id = f.company_id
    and s.vat_number is not null
    and regexp_replace(s.vat_number, '\D', '', 'g') = regexp_replace(coalesce(f.cedente_piva, ''), '\D', '', 'g')
    and regexp_replace(coalesce(f.cedente_piva, ''), '\D', '', 'g') <> ''
  limit 1;

  if f.purchase_order_id is not null then
    select po.order_id into v_order_id
    from public.purchase_orders po
    where po.id = f.purchase_order_id and po.company_id = f.company_id;

    -- il costo nato dall'ordine (non quello di un'altra fattura dello stesso ordine)
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
           and coalesce(fr.tipo_documento, '') not in ('TD04', 'passive_credit_note'));
    end if;
  end if;

  if v_nota_credito then
    -- La nota di credito toglie dal costo dell'ordine che rettifica; un costo non va sotto zero.
    if v_costo_esist_id is null then
      raise exception 'Una nota di credito riduce un costo: collegala prima all''ordine al fornitore della fattura che rettifica.';
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
       set amount      = v_imponibile,
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
    -- nuova fattura (anche la seconda sullo stesso ordine: acconto e saldo sono due costi)
    insert into public.company_costs (
      company_id, supplier_id, purchase_order_id, order_id,
      name, cost_type, amount, vat_rate, category, recurrence,
      due_date, is_paid, notes
    ) values (
      f.company_id, v_supplier_id, f.purchase_order_id, v_order_id,
      'Fattura ' || coalesce(f.numero_fattura, 's/n') || ' - ' || coalesce(f.cedente_ragione_sociale, 'Fornitore'),
      'variable', v_imponibile, v_vat,
      coalesce(nullif(f.categoria_ai, ''), 'materiali'), 'once',
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
    'imponibile', case when v_nota_credito then -v_imponibile else v_imponibile end,
    'aliquota', v_vat,
    'fornitore_riconosciuto', v_supplier_id is not null,
    'commessa_collegata', v_order_id is not null
  );
end $function$;
