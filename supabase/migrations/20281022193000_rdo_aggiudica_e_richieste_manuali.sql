-- Richieste d'offerta: aggiudicazione in un colpo solo e richieste fatte fuori
-- dall'app.
--
-- 1. AGGIUDICAZIONE ATOMICA. Fino al 22/10/2026 il browser faceva tre scritture
--    separate: l'ordine fornitore, le sue righe, la chiusura della richiesta.
--    Se la seconda falliva restava un ordine vuoto e la richiesta aperta, e
--    ripremendo «Aggiudica» nasceva un secondo ordine. rdo_aggiudica() fa tutto
--    in una transazione e blocca la riga della richiesta: due clic, un ordine.
--    È SECURITY INVOKER: valgono le stesse regole (RLS) di prima, cambia solo
--    che o riesce tutto o non resta niente.
--
-- 2. RICHIESTE FATTE A VOCE. Non tutte le offerte si chiedono dall'app: si
--    telefona, si scrive su WhatsApp, si passa dal banco. La riga fornitore
--    ora dice COME è stata chiesta (inviata_via), così «In attesa da N giorni»
--    vale anche per quelle, e l'ordine che nasce ne porta l'origine.

alter table public.supplier_rfq_suppliers
  add column if not exists inviata_via text;

alter table public.supplier_rfq_suppliers
  drop constraint if exists rfq_suppliers_inviata_via_check;
alter table public.supplier_rfq_suppliers
  add constraint rfq_suppliers_inviata_via_check
  check (inviata_via is null or inviata_via in ('app', 'email', 'telefono', 'whatsapp', 'di_persona'));

comment on column public.supplier_rfq_suppliers.inviata_via is
  'Come è stata chiesta l''offerta: app (email dal compositore), email (la propria posta), telefono, whatsapp, di_persona.';

-- le righe già inviate prima di questa colonna sono partite dal compositore
update public.supplier_rfq_suppliers
   set inviata_via = 'app'
 where inviata_via is null and inviata_at is not null;

create or replace function public.rdo_aggiudica(p_rfq_supplier_id uuid, p_motivazione text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_fornitore record;
  v_rfq record;
  v_po_id uuid;
  v_oda text;
  v_righe int;
begin
  select rs.* into v_fornitore
    from public.supplier_rfq_suppliers rs
   where rs.id = p_rfq_supplier_id;
  if not found then
    raise exception 'Fornitore non trovato nella richiesta' using errcode = '42704';
  end if;

  -- la riga della richiesta resta bloccata fino alla fine: un secondo clic aspetta e poi trova «aggiudicata»
  select r.* into v_rfq
    from public.supplier_rfqs r
   where r.id = v_fornitore.rfq_id
   for update;
  if not found then
    raise exception 'Richiesta non trovata' using errcode = '42704';
  end if;
  if v_rfq.status = 'aggiudicata' then
    raise exception 'Richiesta già aggiudicata: l''ordine c''è già' using errcode = 'P0001';
  end if;
  if v_rfq.status = 'annullata' then
    raise exception 'Richiesta annullata: non si può aggiudicare' using errcode = 'P0001';
  end if;
  if v_fornitore.status <> 'risposta' then
    raise exception 'Questo fornitore non ha ancora un''offerta registrata' using errcode = 'P0001';
  end if;

  insert into public.purchase_orders (
    company_id, supplier_id, order_id, expected_delivery_date, payment_terms, origine, notes, created_by
  ) values (
    v_rfq.company_id,
    v_fornitore.supplier_id,
    v_rfq.order_id,
    v_rfq.data_fabbisogno,
    v_fornitore.condizioni_pagamento,
    case v_fornitore.inviata_via
      when 'telefono' then 'telefono'
      when 'whatsapp' then 'telefono'
      when 'di_persona' then 'negozio'
      else 'email'
    end,
    'Da richiesta d''offerta ' || v_rfq.rfq_number || ' — ' || v_rfq.titolo,
    auth.uid()
  )
  returning id, oda_number into v_po_id, v_oda;

  -- le righe portano i prezzi offerti; quelle non disponibili o senza prezzo
  -- restano fuori (a zero sembrerebbero regalate e il totale sarebbe falso).
  -- line_total e vat_amount sono generate dal database.
  insert into public.purchase_order_items (
    purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, 'pz'),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         -- coalesce e non nullif: l'IVA 0 è legittima (fornitore intra-UE)
         coalesce(q.aliquota_iva, 22), i.sku
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id
   where i.rfq_id = v_rfq.id
     and q.disponibile
     and q.prezzo_unitario is not null
   order by i.posizione;
  get diagnostics v_righe = row_count;

  update public.supplier_rfqs
     set status = 'aggiudicata',
         supplier_id_aggiudicato = v_fornitore.supplier_id,
         purchase_order_id = v_po_id,
         aggiudicata_at = now(),
         motivazione_scelta = nullif(btrim(coalesce(p_motivazione, '')), '')
   where id = v_rfq.id;

  return jsonb_build_object('purchase_order_id', v_po_id, 'oda_number', v_oda, 'righe', v_righe);
end;
$$;

revoke all on function public.rdo_aggiudica(uuid, text) from public, anon;
grant execute on function public.rdo_aggiudica(uuid, text) to authenticated;
