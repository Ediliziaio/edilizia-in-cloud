-- Quando l'automatismo sbaglia ad associare, la persona corregge — e la
-- correzione RESTA.
--
-- Il trigger che aggancia la fattura ricevuta all'ordine d'acquisto scatta
-- `when (new.purchase_order_id is null)`. Sembra prudente, ma ha un buco che
-- si apre proprio quando l'utente interviene: se scollega un aggancio
-- sbagliato, la riga torna "senza ordine" e al primo aggiornamento degli
-- importi (sync del gestionale, OCR che completa i totali) il trigger la
-- riaggancia allo STESSO ordine sbagliato. La persona corregge, il sistema
-- la smentisce, in silenzio.
--
-- Da qui in avanti: se un essere umano ha deciso — collegando o scollegando —
-- l'automatismo non ci mette più le mani. La decisione è reversibile: dalla
-- pagina si può restituire la fattura all'aggancio automatico.

alter table public.fatture_ricevute
  add column if not exists aggancio_oda_manuale boolean not null default false;

comment on column public.fatture_ricevute.aggancio_oda_manuale is
  'true = l''aggancio all''ordine d''acquisto l''ha deciso una persona (collegando o scollegando): il trigger automatico non tocca più questa riga. Si azzera dalla pagina con "riattiva aggancio automatico".';

-- Stessa funzione, nuova condizione: la mano dell'uomo ha la precedenza.
drop trigger if exists trg_fatture_ricevute_aggancia_oda on public.fatture_ricevute;
create trigger trg_fatture_ricevute_aggancia_oda
  before insert or update of cedente_piva, cedente_cf, totale_documento, imponibile_totale, tipo_documento
  on public.fatture_ricevute
  for each row
  when (new.purchase_order_id is null and coalesce(new.aggancio_oda_manuale, false) = false)
  execute function public.aggancia_fattura_a_oda();

-- ── Il costo deve atterrare sulla COMMESSA giusta ────────────────────────
-- Contabilizzando si creava un costo con l'ordine d'acquisto ma senza la
-- commessa: fuori dai conti del cantiere, che è esattamente il posto dove
-- quel costo deve tornare. La commessa non si indovina — si legge dall'ODA.
create or replace function public.contabilizza_fattura_ricevuta(p_fattura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  f                record;
  v_costo_esist_id uuid;
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

  v_imponibile := coalesce(
    f.imponibile_totale,
    case when f.totale_documento is not null and f.iva_totale is not null
         then f.totale_documento - f.iva_totale end
  );
  if v_imponibile is null or v_imponibile <= 0 then
    raise exception 'Questa fattura non ha importi: senza imponibile il costo sarebbe zero. Apri l''XML o completa i dati prima di contabilizzare.';
  end if;

  v_vat := case
             when f.iva_totale is not null and v_imponibile > 0
               then round(f.iva_totale / v_imponibile * 100)
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
           order_id    = coalesce(order_id, v_order_id),
           notes       = coalesce(notes || ' · ', '')
                         || 'Importo confermato dalla fattura ' || coalesce(f.numero_fattura, '')
                         || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at  = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_aggiornato';
  else
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
    'imponibile', v_imponibile,
    'aliquota', v_vat,
    'fornitore_riconosciuto', v_supplier_id is not null,
    'commessa_collegata', v_order_id is not null
  );
end $$;
