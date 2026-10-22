-- Correzioni dalla rilettura del 23/10 su arrivi merce, aggiudica e riepilogo
-- del magazzino. Le funzioni si modificano sul testo live (pg_get_functiondef),
-- e ogni sostituzione deve trovare il suo punto una volta sola: se il testo è
-- cambiato nel frattempo la migrazione si ferma invece di applicarsi a metà.
--
-- oda_registra_arrivo
--   1. L'ordine si blocca (FOR UPDATE) prima di leggere le righe: due arrivi
--      nello stesso momento (due schede, scheda + modulo DDT) leggevano entrambi
--      «0 di 10» e scrivevano +10 ciascuno → 20 ricevuti e due carichi.
--   2. Chi è bloccato o entra come cliente esterno non registra arrivi: la
--      funzione è SECURITY DEFINER e controllava solo l'azienda, mentre per
--      cambiare un ordine la RLS chiede proprio questo.
--   3. Il movimento si registra nel magazzino dell'articolo, dove sale la
--      giacenza: prima andava in quello della bolla, e i conti per magazzino
--      non tornavano (movimento su A, merce su B).
-- rdo_aggiudica
--   4. Niente ordine da 0 €: senza un prezzo per voce né un totale offerto la
--      richiesta si chiudeva «aggiudicata» per sempre con un ordine vuoto.
-- magazzino_riepilogo
--   5. «In arrivo» conta solo le righe con un residuo (come la nota per riga).
--   6. «In ritardo» sul giorno italiano, non UTC (tra 00:00 e 02:00 le righe di
--      ieri mancavano dal riquadro ma c'erano nella lista).

do $$
declare
  v_def text;
  v_nuovo text;
begin
  -- ── oda_registra_arrivo ───────────────────────────────────────────────────
  select pg_get_functiondef('public.oda_registra_arrivo(uuid,jsonb,text,date,uuid,text,text,uuid)'::regprocedure) into v_def;
  -- idempotente: già corretta, non si tocca
  if position('utente_e_cliente_esterno' in v_def) = 0 then
  v_nuovo := v_def;

  if (length(v_nuovo) - length(replace(v_nuovo, '   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION ''Ordine non valido per questa azienda''; END IF;', ''))) = 0 then
    raise exception 'oda_registra_arrivo: punto del blocco non trovato';
  end if;
  v_nuovo := replace(v_nuovo,
'   WHERE id = p_oda_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION ''Ordine non valido per questa azienda''; END IF;',
'   WHERE id = p_oda_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION ''Ordine non valido per questa azienda''; END IF;');

  if position('IF v_company_id IS NULL THEN RAISE EXCEPTION ''Nessuna azienda attiva''; END IF;' in v_nuovo) = 0 then
    raise exception 'oda_registra_arrivo: controllo azienda non trovato';
  end if;
  v_nuovo := replace(v_nuovo,
'IF v_company_id IS NULL THEN RAISE EXCEPTION ''Nessuna azienda attiva''; END IF;',
'IF v_company_id IS NULL THEN RAISE EXCEPTION ''Nessuna azienda attiva''; END IF;
  IF public.utente_bloccato() OR public.utente_e_cliente_esterno() THEN
    RAISE EXCEPTION ''Non puoi registrare arrivi merce'' USING errcode = ''42501'';
  END IF;');

  if position('coalesce(p_warehouse_id, (select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = v_stock_item_id))' in v_nuovo) = 0 then
    raise exception 'oda_registra_arrivo: magazzino del movimento non trovato';
  end if;
  v_nuovo := replace(v_nuovo,
'coalesce(p_warehouse_id, (select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = v_stock_item_id))',
'coalesce((select ws2.warehouse_id from public.warehouse_stock ws2 where ws2.id = v_stock_item_id), p_warehouse_id)');

  -- le tre sostituzioni sono uniche: il testo nuovo è più lungo di quello vecchio
  if v_nuovo = v_def then raise exception 'oda_registra_arrivo: nessuna modifica'; end if;
  execute v_nuovo;
  end if;

  -- ── rdo_aggiudica ─────────────────────────────────────────────────────────
  select pg_get_functiondef('public.rdo_aggiudica(uuid,text)'::regprocedure) into v_def;
  if position('Nessun prezzo in questa offerta' in v_def) = 0 then
  if position('  insert into public.purchase_orders (' in v_def) = 0
     or (length(v_def) - length(replace(v_def, '  insert into public.purchase_orders (', ''))) <> length('  insert into public.purchase_orders (') then
    raise exception 'rdo_aggiudica: punto dell''ordine non trovato una volta sola';
  end if;
  v_nuovo := replace(v_def, '  insert into public.purchase_orders (',
'  if coalesce(v_fornitore.totale_offerto, 0) <= 0 and not exists (
       select 1 from public.supplier_rfq_quotes q
         join public.supplier_rfq_items i on i.id = q.rfq_item_id
        where q.rfq_supplier_id = v_fornitore.id and i.rfq_id = v_rfq.id
          and q.disponibile and q.prezzo_unitario is not null) then
    raise exception ''Nessun prezzo in questa offerta: scrivi i prezzi delle voci o il totale offerto prima di scegliere'' using errcode = ''P0001'';
  end if;
  insert into public.purchase_orders (');
  execute v_nuovo;
  end if;

  -- ── magazzino_riepilogo ───────────────────────────────────────────────────
  select pg_get_functiondef('public.magazzino_riepilogo(uuid,uuid)'::regprocedure) into v_def;
  if position('Europe/Rome' in v_def) = 0 then
  if position('     where po.status in (''inviato'', ''confermato'', ''parziale'')' in v_def) = 0
     or position('and posa < current_date' in v_def) = 0 then
    raise exception 'magazzino_riepilogo: testo cambiato';
  end if;
  v_nuovo := replace(v_def,
'     where po.status in (''inviato'', ''confermato'', ''parziale'')',
'     where po.status in (''inviato'', ''confermato'', ''parziale'')
       and coalesce(poi.quantity, 0) > coalesce(poi.quantity_received, 0)');
  v_nuovo := replace(v_nuovo, 'and posa < current_date', 'and posa < (now() at time zone ''Europe/Rome'')::date');
  execute v_nuovo;
  end if;
end $$;
