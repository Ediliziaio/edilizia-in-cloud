-- Arrivi merce: una regola sola per tutte le strade.
--
-- Fino al 22/10/2026 un arrivo si registrava in cinque modi (modulo DDT,
-- righe del DDT, bottone «Ricevuto» dell'ordine, lettura codici, carico da
-- email/WhatsApp) e ognuno muoveva l'ordine fornitore a modo suo. Il più
-- grave: il modulo «Nuovo DDT», lasciato su «Ricevuto», portava l'ordine a
-- ricevuto — e quindi l'intero costo sulla commessa — senza segnare una sola
-- quantità arrivata né caricare il magazzino.
--
-- La regola ora è: lo stato dell'ordine segue le quantità. Il modulo DDT
-- registra le quantità con la stessa funzione del foglio «arrivo merce»
-- (oda_registra_arrivo), agganciandole alla bolla appena scritta invece di
-- crearne una seconda. Questa migrazione cambia due funzioni:
--
-- oda_registra_arrivo
--   - nuovo parametro p_ddt_id: se la bolla c'è già, le righe si agganciano a
--     lei (prima ne nasceva sempre una nuova, «S/N gg/mm/aaaa»);
--   - un ordine già «ricevuto» non torna mai a «parziale»;
--   - se nessuna riga è entrata (tutte già complete o in errore) l'ordine non
--     si muove: prima una bozza diventava «parziale» senza merce;
--   - la quantità della bolla si somma invece di essere sovrascritta, e una
--     bolla «verificata» o «non conforme» tiene il suo stato.
--
-- receive_from_oda_via_scans (lettura codici in magazzino)
--   - «tutto arrivato» si calcola con coalesce: con quantity_received NULL il
--     confronto dava NULL e la riga risultava completa;
--   - non chiude un ordine annullato, né uno su cui non è entrato niente.
--
-- Le modifiche sono applicate sul corpo in produzione, con controllo che ogni
-- pezzo da sostituire compaia esattamente una volta: se il corpo è cambiato,
-- la migrazione si ferma invece di scrivere a metà.

do $$
declare
  v_def text;
  procedure_sost record;
begin
  -- ── oda_registra_arrivo ────────────────────────────────────────────────────
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'oda_registra_arrivo'
     and pg_get_function_identity_arguments(p.oid) = 'p_oda_id uuid, p_righe jsonb, p_ddt_number text, p_ddt_data date, p_warehouse_id uuid, p_note text, p_ddt_file_url text';

  if v_def is null then
    -- già applicata (la firma ha p_ddt_id): niente da fare
    if exists (select 1 from pg_proc where proname = 'oda_registra_arrivo'
                and pg_get_function_identity_arguments(oid) like '%p_ddt_id uuid') then
      raise notice 'oda_registra_arrivo già aggiornata';
    else
      raise exception 'oda_registra_arrivo: firma inattesa, migrazione da rivedere';
    end if;
  else
    for procedure_sost in
      select * from (values
        ('p_ddt_file_url text DEFAULT NULL::text)',
         'p_ddt_file_url text DEFAULT NULL::text, p_ddt_id uuid DEFAULT NULL::uuid)'),
        ('  INSERT INTO public.ddt_ricezione (',
         E'  IF p_ddt_id IS NOT NULL THEN\n'
         || E'    -- la bolla c''è già (scritta dal modulo DDT): le righe si agganciano a lei\n'
         || E'    SELECT id INTO v_ddt_id FROM public.ddt_ricezione\n'
         || E'     WHERE id = p_ddt_id AND purchase_order_id = p_oda_id AND company_id = v_company_id;\n'
         || E'    IF NOT FOUND THEN RAISE EXCEPTION ''Bolla non valida per questo ordine''; END IF;\n'
         || E'  ELSE\n'
         || '  INSERT INTO public.ddt_ricezione ('),
        ('  RETURNING id INTO v_ddt_id;',
         E'  RETURNING id INTO v_ddt_id;\n  END IF;'),
        ('AND status NOT IN (''annullato'');',
         E'AND status NOT IN (''annullato'')\n'
         || E'     -- mai indietro: un ordine ricevuto resta ricevuto\n'
         || E'     AND (v_completo OR status <> ''ricevuto'')\n'
         || E'     -- niente è entrato: l''ordine non si muove\n'
         || E'     AND (v_righe > 0 OR v_completo);'),
        ('SET quantita_ricevuta = v_tot,',
         'SET quantita_ricevuta = coalesce(quantita_ricevuta, 0) + v_tot,'),
        ('stato = CASE WHEN v_completo THEN ''ricevuto'' ELSE ''parziale'' END',
         'stato = CASE WHEN stato IN (''verificato'', ''non_conforme'') THEN stato WHEN v_completo THEN ''ricevuto'' ELSE ''parziale'' END')
      ) as t(da, a)
    loop
      if (length(v_def) - length(replace(v_def, procedure_sost.da, ''))) / length(procedure_sost.da) <> 1 then
        raise exception 'oda_registra_arrivo: il pezzo «%» non compare una volta sola', procedure_sost.da;
      end if;
      v_def := replace(v_def, procedure_sost.da, procedure_sost.a);
    end loop;

    drop function public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text);
    execute v_def;
  end if;

  -- ── receive_from_oda_via_scans ─────────────────────────────────────────────
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'receive_from_oda_via_scans';
  if v_def is null then
    raise exception 'receive_from_oda_via_scans non trovata';
  end if;

  if position('coalesce(quantity_received, 0) < coalesce(quantity, 0)' in v_def) > 0 then
    raise notice 'receive_from_oda_via_scans già aggiornata';
  else
    if regexp_count(v_def, 'AND\s+quantity_received\s*<\s*quantity\)') <> 1 then
      raise exception 'receive_from_oda_via_scans: confronto quantità inatteso';
    end if;
    v_def := regexp_replace(v_def, 'AND\s+quantity_received\s*<\s*quantity\)',
                            'AND coalesce(quantity_received, 0) < coalesce(quantity, 0))');

    if regexp_count(v_def, 'WHERE\s+id\s*=\s*p_oda_id\s*;') <> 1 then
      raise exception 'receive_from_oda_via_scans: chiusura ordine inattesa';
    end if;
    v_def := regexp_replace(v_def, 'WHERE\s+id\s*=\s*p_oda_id\s*;',
                            'WHERE id = p_oda_id AND status <> ''annullato'' AND (v_shipped > 0 OR status = ''ricevuto'');');
    execute v_def;
  end if;
end $$;

revoke all on function public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text, uuid) from public, anon;
grant execute on function public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text, uuid) to authenticated, service_role;
