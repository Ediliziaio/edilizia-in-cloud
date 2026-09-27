-- Confermare un DDT carica davvero il magazzino (27/09/2026).
--
-- Prima «Conferma» cambiava solo lo stato della bozza (email_ddt_carico):
-- nessun movimento, giacenza ferma, ordine d'acquisto fermo — mentre la
-- schermata diceva «la giacenza si aggiorna». Ora una funzione sola, usata
-- dall'app e dal bot WhatsApp:
--  1) ordine collegato -> nasce la ricezione (ddt_ricezione, una per numero
--     DDT) e i trigger esistenti portano l'ordine almeno a «parziale»;
--  2) ogni riga con quantita intera > 0 che corrisponde a UN solo articolo di
--     magazzino (codice interno o a barre, poi nome identico) -> movimento di
--     carico + giacenza aumentata;
--  3) le righe senza articolo certo (o con decimali: la giacenza e intera)
--     tornano «da abbinare»: mai indovinare l'articolo, mai crearne uno.
-- Idempotente: una bozza gia confermata non ricarica niente.

set lock_timeout = '5s';

create or replace function public.conferma_carico_ddt(p_carico_id uuid, p_utente uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.email_ddt_carico%rowtype;
  v_utente uuid := coalesce(auth.uid(), p_utente);
  v_riga jsonb;
  v_testo_qta text;
  v_qta numeric;
  v_codice text;
  v_descr text;
  v_n int;
  v_art_id uuid;
  v_art_nome text;
  v_art_magazzino uuid;
  v_caricati jsonb := '[]'::jsonb;
  v_da_abbinare jsonb := '[]'::jsonb;
  v_ricezione uuid;
begin
  if v_utente is null then
    return jsonb_build_object('ok', false, 'errore', 'Serve una persona che confermi il carico.');
  end if;

  select * into v_c from public.email_ddt_carico where id = p_carico_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Carico non trovato.');
  end if;

  -- Dall'app: solo chi lavora in quell'azienda. Dal bot (chiave di servizio,
  -- nessun utente collegato) l'azienda l'ha gia verificata il bot.
  if auth.uid() is not null and not public.user_can_access_company(v_c.company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  if v_c.stato = 'scartato' then
    return jsonb_build_object('ok', false, 'errore', 'Questo carico e stato scartato.');
  end if;
  if v_c.stato = 'confermato' and coalesce(v_c.movimento_created, false) then
    return jsonb_build_object('ok', true, 'gia_confermato', true, 'caricati', '[]'::jsonb, 'da_abbinare', '[]'::jsonb);
  end if;

  -- 1) Ordine collegato: la ricezione (una sola per numero DDT).
  if v_c.purchase_order_id is not null then
    select id into v_ricezione from public.ddt_ricezione
     where purchase_order_id = v_c.purchase_order_id
       and numero_ddt = coalesce(v_c.ddt_numero, 's.n.')
     limit 1;
    if v_ricezione is null then
      insert into public.ddt_ricezione (company_id, purchase_order_id, numero_ddt, data_ricezione, stato, source, created_by, note)
      values (v_c.company_id, v_c.purchase_order_id, coalesce(v_c.ddt_numero, 's.n.'),
              coalesce(v_c.ddt_data, current_date), 'ricevuto',
              case when v_c.email_id is null then 'whatsapp' else 'manual' end,
              v_utente, 'Da DDT confermato')
      returning id into v_ricezione;
    end if;
  end if;

  -- 2) Righe -> magazzino.
  for v_riga in select value from jsonb_array_elements(coalesce(v_c.righe, '[]'::jsonb)) loop
    v_testo_qta := v_riga->>'qta_bolla';
    v_qta := case when v_testo_qta ~ '^[0-9]+(\.[0-9]+)?$' then v_testo_qta::numeric else null end;
    continue when v_qta is null or v_qta <= 0;
    v_codice := nullif(btrim(coalesce(v_riga->>'codice', '')), '');
    v_descr := nullif(btrim(coalesce(v_riga->>'descrizione', '')), '');

    if v_qta <> trunc(v_qta) then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'quantita con decimali');
      continue;
    end if;

    v_art_id := null;
    if v_codice is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and (lower(internal_code) = lower(v_codice) or lower(barcode) = lower(v_codice));
      if v_n <> 1 then v_art_id := null; end if;
    end if;
    if v_art_id is null and v_descr is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and lower(btrim(name)) = lower(v_descr);
      if v_n <> 1 then v_art_id := null; end if;
    end if;

    if v_art_id is null then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'articolo non trovato in magazzino');
      continue;
    end if;

    select name, warehouse_id into v_art_nome, v_art_magazzino
      from public.warehouse_stock where id = v_art_id for update;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id, company_id)
    values (v_art_id, 'carico', v_qta::int, 'DDT ' || coalesce(v_c.ddt_numero, 's.n.') || ' confermato',
            v_utente, v_art_magazzino, v_c.company_id);
    update public.warehouse_stock
       set quantity = coalesce(quantity, 0) + v_qta::int,
           last_delivery_date = coalesce(v_c.ddt_data, current_date)
     where id = v_art_id;
    v_caricati := v_caricati || jsonb_build_object('articolo', v_art_nome, 'quantita', v_qta::int);
  end loop;

  update public.email_ddt_carico
     set stato = 'confermato', confirmed_by = v_utente, confirmed_at = now(), movimento_created = true
   where id = p_carico_id;

  return jsonb_build_object('ok', true, 'ricezione_id', v_ricezione, 'caricati', v_caricati, 'da_abbinare', v_da_abbinare);
end;
$$;

revoke all on function public.conferma_carico_ddt(uuid, uuid) from public, anon;
grant execute on function public.conferma_carico_ddt(uuid, uuid) to authenticated, service_role;

comment on function public.conferma_carico_ddt(uuid, uuid) is
  'Conferma una bozza di carico DDT: ricezione sull''ordine collegato, movimenti di carico e giacenza per gli articoli certi, elenco delle righe da abbinare. Idempotente.';
