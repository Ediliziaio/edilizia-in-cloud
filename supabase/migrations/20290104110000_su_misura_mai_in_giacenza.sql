-- Il su misura va al cantiere, non in giacenza, su tutte le strade (8/11/2026). Piano, punto 2A.
--
-- Le funzioni toccate in produzione sono state già ritoccate più volte con patch nel database:
-- il loro testo non coincide con le vecchie migrazioni, quindi si modifica il testo vero.
-- Ogni patch si ferma con un errore se il punto da cambiare non c'è più.
-- Solo funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.arrivo_correggi(p_nome text, p_vecchio text, p_nuovo text)
 returns void
 language plpgsql
as $function$
declare
  v_def text;
  v_volte int;
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_nome;
  if position(p_nuovo in v_def) > 0 then
    return;
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_vecchio, ''))) / length(p_vecchio);
  if v_volte <> 1 then
    raise exception '%: il punto da correggere compare % volte', p_nome, v_volte;
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end;
$function$;

-- 1. Ricezione da magazzino: il trigger guarda anche il gruppo.
select pg_temp.arrivo_correggi('auto_carico_stock_on_receipt',
$v$oi.measure_status is not null
$v$,
$n$(oi.measure_status is not null or oi.gruppo_id is not null)
$n$);

-- 2. Ricezione da magazzino e bolla, articolo per articolo: una sola porta per il su misura.
select pg_temp.arrivo_correggi('insert_goods_receipt_atomic',
$v$  -- CHECK84_GUARDIA_RICEZIONI_V1
$v$,
$n$  -- Il su misura si spunta posizione per posizione: goods_receipts vuole un magazzino.
  IF public.riga_e_su_misura(p_order_item_id) THEN
    RAISE EXCEPTION 'Questa posizione è su misura: va al cantiere, non in magazzino. Registrala dall''arrivo merce, posizione per posizione.' USING errcode = 'P0001';
  END IF;

  -- CHECK84_GUARDIA_RICEZIONI_V1
$n$);

-- 3. Bolla in ufficio e foglio arrivo merce: la quantità entra, la giacenza no.
select pg_temp.arrivo_correggi('oda_registra_arrivo',
$v$      -- Mai oltre il residuo: se il fornitore manda di più, si ferma all'ordinato.
$v$,
$n$      -- Su misura: mai in giacenza, qualunque articolo arrivi dal chiamante.
      IF public.riga_e_su_misura(v_order_item_id) THEN
        v_stock_item_id := NULL;
      END IF;

      -- Mai oltre il residuo: se il fornitore manda di più, si ferma all'ordinato.
$n$);

-- 4. Scansioni: la riga su misura non si carica.
select pg_temp.arrivo_correggi('receive_from_oda_via_scans',
$v$      -- CAP (P1c):$v$,
$n$      IF v_oda_item_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.purchase_order_items p
            WHERE p.id = v_oda_item_id AND p.purchase_order_id = p_oda_id AND public.riga_e_su_misura(p.order_item_id)) THEN
        v_errors := v_errors || jsonb_build_object('oda_item_id', v_oda_item_id, 'error', 'su_misura_si_registra_per_posizione');
        CONTINUE;
      END IF;

      -- CAP (P1c):$n$);

-- 5. Email letta dall'AI e WhatsApp dell'ufficio: la riga resta da abbinare, col motivo giusto.
select pg_temp.arrivo_correggi('conferma_carico_ddt',
$v$    v_art_id := null;
    if v_codice is not null then$v$,
$n$    if v_c.purchase_order_id is not null and exists (
         select 1 from public.purchase_order_items i
          where i.purchase_order_id = v_c.purchase_order_id
            and public.riga_e_su_misura(i.order_item_id)
            and ((v_codice is not null and lower(btrim(coalesce(i.sku, ''))) = lower(v_codice))
                 or lower(btrim(coalesce(i.description, ''))) = lower(coalesce(v_descr, '')))) then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta,
        'motivo', 'su misura: va al cantiere e si spunta posizione per posizione');
      continue;
    end if;

    v_art_id := null;
    if v_codice is not null then$n$);

select pg_temp.arrivo_correggi('conferma_carico_ddt',
$v$           and i.quantity - coalesce(i.quantity_received, 0) >= 1
$v$,
$n$           and i.quantity - coalesce(i.quantity_received, 0) >= 1
           and not public.riga_e_su_misura(i.order_item_id)
$n$);

-- 6. Bolla senza ordine con una riga collegata a una posizione: niente carico.
select pg_temp.arrivo_correggi('bolla_carica_magazzino',
$v$    continue when r.movimento_id is not null;
$v$,
$n$    continue when r.movimento_id is not null;
    if public.riga_e_su_misura(r.order_item_id) then
      v_saltate := v_saltate || jsonb_build_object('riga_id', r.id, 'descrizione', r.descrizione,
        'motivo', 'su misura: va al cantiere, non in giacenza');
      continue;
    end if;
$n$);

-- Le quantità del su misura le scrive l'arrivo per posizione, non le ricezioni di magazzino.
select pg_temp.arrivo_correggi('ricalcola_ricezione_oda',
$v$     and poi.order_item_id = gr.order_item_id;$v$,
$n$     and poi.order_item_id = gr.order_item_id
     and not public.riga_e_su_misura(poi.order_item_id);$n$);
